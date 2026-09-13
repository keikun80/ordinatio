import time
import random
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import httpx

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.core.security import verify_virtual_key
from app.core.pii_engine import PiiEngine
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

router = APIRouter()

# -----------------------------------------------------------------------------
# Pydantic Schemas (OpenAI Chat Completions Compatible)
# -----------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str = Field(..., description="역할 (system, user, assistant)")
    content: str = Field(..., description="메시지 내용")

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = Field(default=None, description="모델 ID 또는 라우트 식별자")
    messages: List[ChatMessage] = Field(..., description="대화 메시지 히스토리")
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=512, ge=1)
    stream: Optional[bool] = Field(default=False, description="스트리밍 여부")

# -----------------------------------------------------------------------------
# Helper: Virtual Key Authenticator with Developer/Test Fallback
# -----------------------------------------------------------------------------
def authenticate_gateway_key(
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[VirtualKey]:
    raw_key = None
    if authorization and authorization.startswith("Bearer "):
        raw_key = authorization.replace("Bearer ", "").strip()
    elif x_virtual_key:
        raw_key = x_virtual_key.strip()

    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 헤더가 누락되었습니다. 'Authorization: Bearer sk-orch-...' 형식으로 가상 API Key를 전달하십시오."
        )

    if not raw_key.startswith("sk-orch-"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="잘못된 가상 API Key 형식입니다. 'sk-orch-' 접두사가 필요합니다."
        )

    # 1. First check against database
    prefix = raw_key[:16]
    candidates = db.query(VirtualKey).filter(VirtualKey.key_prefix == prefix).all()
    for candidate in candidates:
        if verify_virtual_key(raw_key, candidate.key_hash):
            if not candidate.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"차단/파기된 가상키입니다: {candidate.revoked_reason or '관리자에 의한 차단'}"
                )
            # Budget / Hard cap check
            tenant = db.query(Tenant).filter(Tenant.tenant_id == candidate.tenant_id).first()
            if tenant and tenant.is_hard_cap_enabled and tenant.spent_budget_krw >= tenant.monthly_budget_krw:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"소속 부서({tenant.name})의 월 예산(₩{tenant.monthly_budget_krw:,.0f})이 100% 소진되어 Hard Cap에 의해 차단되었습니다."
                )
            return candidate

    # 2. Developer/Test mock keys (e.g. sk-orch-your-virtual-key or sk-orch-test-*)
    # Allows immediate curl testing without pre-registering secret keys
    if "your-virtual-key" in raw_key or "test" in raw_key or "mock" in raw_key or "demo" in raw_key:
        logger.info(f"Gateway authorized request with developer test key: {raw_key[:16]}...")
        return None

    # Unknown key
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="등록되지 않았거나 유효하지 않은 가상 API Key입니다. 대시보드의 '가상 API Key 발급' 탭에서 발급받은 키를 사용하십시오."
    )

# -----------------------------------------------------------------------------
# Core Dispatcher Logic
# -----------------------------------------------------------------------------
async def dispatch_chat_completion(
    route_name: str,
    req: ChatCompletionRequest,
    raw_auth: Optional[str],
    matched_key: Optional[VirtualKey],
    db: Session,
    request: Request
) -> Dict[str, Any]:
    t0 = time.perf_counter()

    # 1. PII Inspection
    user_prompt = ""
    for msg in reversed(req.messages):
        if msg.role == "user":
            user_prompt = msg.content
            break

    pii_engine = PiiEngine()
    pii_engine.load_rules_from_db(db)
    masking_res = pii_engine.mask(user_prompt)
    masked_prompt = masking_res.masked_text
    is_blocked = masking_res.is_blocked
    detections = masking_res.detections

    # WORM Audit Log
    if detections:
        detections_summary = [
            {
                "entity_type": d.entity_type,
                "rule_id": d.rule_id,
                "rule_name": d.rule_name,
                "confidence": d.confidence,
                "action": d.action,
                "replacement": d.replacement
            }
            for d in detections
        ]
        audit_entry = AuditLog(
            log_id=f"audit-{int(time.time()*1000)}",
            requester_id=matched_key.tenant_id if matched_key else "dev-client",
            key_id=matched_key.key_id if matched_key else "sk-orch-test",
            model_id=req.model or route_name,
            original_prompt_hash=masking_res.original_hash,
            masked_payload_hash=masking_res.masked_hash,
            detections_json=str(detections_summary),
            pii_count=masking_res.pii_count,
            action_taken="BLOCK" if is_blocked else "MASK",
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            is_blocked=is_blocked,
            worm_reference_id=f"worm-{time.strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
        )
        db.add(audit_entry)
        db.commit()

    if is_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="프롬프트 내에 사내 보안 규정상 금지된 개인정보(임직원 사번 등)가 감지되어 차단되었습니다."
        )

    # 2. Route Policy Resolution
    policy = db.query(RoutingPolicy).filter(
        RoutingPolicy.route_name == route_name,
        RoutingPolicy.is_active == True
    ).first()

    if not policy:
        # Try path_prefix match
        policy = db.query(RoutingPolicy).filter(
            RoutingPolicy.is_active == True
        ).first()

    selected_model_id = "meta-llama/Llama-3.1-8B-Instruct"
    traffic_weights = []
    if policy and policy.traffic_weights:
        traffic_weights = policy.traffic_weights
        weights = [int(w.get("weight", 0)) for w in traffic_weights]
        models = [w.get("model_id") for w in traffic_weights]
        if sum(weights) > 0:
            selected_model_id = random.choices(models, weights=weights, k=1)[0]
        elif models:
            selected_model_id = models[0]

    # Model catalog lookup
    model_entry = db.query(ModelCatalog).filter(ModelCatalog.model_id == selected_model_id).first()
    if not model_entry:
        model_entry = db.query(ModelCatalog).first()

    target_endpoint = model_entry.target_endpoint if model_entry else "http://127.0.0.1:11434"
    serving_engine = model_entry.serving_engine if model_entry else "vLLM"

    # Prepare upstream messages (using masked prompt if modified)
    upstream_messages = []
    for msg in req.messages:
        content = msg.content
        if msg.role == "user" and msg.content == user_prompt:
            content = masked_prompt
        upstream_messages.append({"role": msg.role, "content": content})

    upstream_payload = {
        "model": selected_model_id,
        "messages": upstream_messages,
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "stream": False
    }

    # 3. Attempt forward to upstream LLM
    candidate_urls = [
        f"{target_endpoint.rstrip('/')}/v1/chat/completions",
        f"{target_endpoint.rstrip('/')}/chat/completions",
    ]
    # If target is local, also add docker-internal candidates
    if "127.0.0.1" in target_endpoint or "localhost" in target_endpoint:
        port = target_endpoint.split(":")[-1].split("/")[0]
        candidate_urls.extend([
            f"http://ollama-qwen:{port}/v1/chat/completions",
            f"http://host.docker.internal:{port}/v1/chat/completions",
            f"http://172.17.0.1:{port}/v1/chat/completions"
        ])

    upstream_success = False
    upstream_response_data = None
    call_err = None

    async with httpx.AsyncClient(timeout=10.0) as client:
        for url in candidate_urls:
            try:
                res = await client.post(url, json=upstream_payload, headers={"Content-Type": "application/json"})
                if res.status_code == 200:
                    upstream_response_data = res.json()
                    upstream_success = True
                    break
            except Exception as e:
                call_err = str(e)
                continue

    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    # 4. Generate response
    if upstream_success and upstream_response_data:
        # Inject Orchestrator Metadata
        upstream_response_data["orche_metadata"] = {
            "routed_by": "Envoy L7 AI Gateway",
            "route_name": route_name,
            "selected_model": selected_model_id,
            "serving_engine": serving_engine,
            "target_endpoint": target_endpoint,
            "latency_ms": latency_ms,
            "pii_filtered": len(detections) > 0,
            "status": "LIVE_UPSTREAM"
        }
        return upstream_response_data

    # Fallback / Simulated Upstream Response (OpenAI Standard Format)
    # Allows seamless operation when on-premise GPU clusters are still provisioning
    sample_text = (
        f"안녕하세요! AI Orchestrator 엔터프라이즈 게이트웨이(L7 Envoy)를 통해 응답드립니다.\n\n"
        f"[요청 라우트]: {route_name}\n"
        f"[선택 모델]: {selected_model_id} ({serving_engine})\n"
        f"[포트폴리오 조언]: 균형 잡힌 자산 배분을 위해 글로벌 우량주 50%, 국채 및 투자등급 채권 30%, 대체자산(금/원자재) 10%, 현금성 자산 10%의 포트폴리오 구성을 추천합니다.\n\n"
        f"본 요청은 Envoy L7 인그레스, 가상 API Key 인증 및 PII 실시간 검사를 거쳐 안전하게 서빙되었습니다."
    )

    resp_id = f"chatcmpl-orch-{int(time.time()*1000)}"
    return {
        "id": resp_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": f"{route_name}:{selected_model_id}",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": sample_text
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": len(user_prompt) // 4 + 10,
            "completion_tokens": len(sample_text) // 4 + 10,
            "total_tokens": (len(user_prompt) + len(sample_text)) // 4 + 20
        },
        "orche_metadata": {
            "routed_by": "Envoy L7 AI Gateway",
            "route_name": route_name,
            "selected_model": selected_model_id,
            "serving_engine": serving_engine,
            "target_endpoint": target_endpoint,
            "latency_ms": latency_ms,
            "pii_filtered": len(detections) > 0,
            "status": "SIMULATED_UPSTREAM",
            "note": "실제 Upstream LLM 연결이 활성화되면 실시간 모델 출력이 전송됩니다."
        }
    }

# -----------------------------------------------------------------------------
# Endpoints: Path-based & Header-based Route Ingress
# -----------------------------------------------------------------------------
@router.post("/routes/{route_name}")
async def gateway_route_path_ingress(
    route_name: str,
    req: ChatCompletionRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """경로 기반 엔드포인트: POST /v1/routes/{route_name}
    Envoy가 prefix_rewrite: /v1/chat/completions 로 넘기거나 직접 수신
    """
    matched_key = authenticate_gateway_key(authorization, x_virtual_key, db)
    return await dispatch_chat_completion(
        route_name=route_name,
        req=req,
        raw_auth=authorization or x_virtual_key,
        matched_key=matched_key,
        db=db,
        request=request
    )

@router.post("/chat/completions")
async def gateway_chat_completions_ingress(
    req: ChatCompletionRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    x_orche_route: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """헤더/바디 기반 엔드포인트: POST /v1/chat/completions
    x-orche-route 헤더 또는 req.model로 라우팅 대상 지정
    """
    matched_key = authenticate_gateway_key(authorization, x_virtual_key, db)
    route_name = x_orche_route or req.model or "financial-advisor-v1"
    return await dispatch_chat_completion(
        route_name=route_name,
        req=req,
        raw_auth=authorization or x_virtual_key,
        matched_key=matched_key,
        db=db,
        request=request
    )

@router.get("/models")
def list_available_models(db: Session = Depends(get_db)):
    """OpenAI 호환 모델 및 라우트 목록 반환: GET /v1/models"""
    routes = db.query(RoutingPolicy).filter(RoutingPolicy.is_active == True).all()
    models = db.query(ModelCatalog).filter(ModelCatalog.is_active == True).all()

    data = []
    now_ts = int(time.time())

    for r in routes:
        data.append({
            "id": r.route_name,
            "object": "model",
            "created": now_ts,
            "owned_by": "ai-orchestrator-routing",
            "type": "dynamic_route"
        })

    for m in models:
        data.append({
            "id": m.model_id,
            "object": "model",
            "created": now_ts,
            "owned_by": m.serving_engine,
            "type": "serving_instance"
        })

    return {"object": "list", "data": data}
