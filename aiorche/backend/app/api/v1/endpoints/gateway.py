import time
import random
import logging
import ipaddress
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import httpx

from app.core.config import settings

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.core.security import verify_virtual_key
from app.core.pii_engine import PiiEngine
from app.models.audit_log import AuditLog
from app.core.telemetry_hub import telemetry_hub

# Phase 0.1: AgentRouter & Envoy AI Gateway Core Modules
from app.core.agent_router import (
    AgentRouter,
    classify_prompt,
    ComplexityLevel,
    RoutingPolicyType,
    SessionAffinityManager,
    DEFAULT_FAST_MODEL,
    DEFAULT_REASONING_MODEL
)
from app.core.token_limiter import token_rate_limiter
from app.core.ext_proc_server import ext_processor, ExtProcRequest, ExtProcResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# -----------------------------------------------------------------------------
# Pydantic Schemas (OpenAI Chat Completions Compatible)
# -----------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str = Field(..., description="역할 (system, user, assistant)")
    content: str = Field(..., description="메시지 내용")

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = Field(default=None, description="모델 ID 또는 라우트 식별자 (예: auto, agent-auto, financial-advisor-v1)")
    messages: List[ChatMessage] = Field(..., description="대화 메시지 히스토리")
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=512, ge=1)
    stream: Optional[bool] = Field(default=False, description="스트리밍 여부")
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, description="도구/함수 호출 스키마")
    functions: Optional[List[Dict[str, Any]]] = Field(default=None, description="레거시 함수 호출 스키마")

# -----------------------------------------------------------------------------
# Helper: IP Address / CIDR Matcher
# -----------------------------------------------------------------------------
def is_ip_allowed(client_ip: str, allowed_cidrs: List[str]) -> bool:
    if not allowed_cidrs:
        return True
    try:
        ip_obj = ipaddress.ip_address(client_ip)
        for cidr in allowed_cidrs:
            if not cidr or not str(cidr).strip():
                continue
            cidr_str = str(cidr).strip()
            if "/" in cidr_str:
                network = ipaddress.ip_network(cidr_str, strict=False)
                if ip_obj in network:
                    return True
            else:
                if ip_obj == ipaddress.ip_address(cidr_str):
                    return True
        return False
    except ValueError:
        return False

# -----------------------------------------------------------------------------
# Helper: Virtual Key Authenticator with Developer/Test Fallback
# -----------------------------------------------------------------------------
def authenticate_gateway_key(
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    request: Optional[Request] = None
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

    # Extract client IP for IP CIDR validation
    client_ip = "127.0.0.1"
    if request:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        elif request.client and request.client.host:
            client_ip = request.client.host

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

            # Check expiration date
            if candidate.expires_at:
                exp = candidate.expires_at
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp < datetime.now(timezone.utc):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="유효기간이 만료된 가상 API Key입니다."
                    )

            # Check IP CIDR whitelist
            allowed_cidrs = candidate.allowed_ip_cidrs or []
            if allowed_cidrs and len(allowed_cidrs) > 0:
                if not is_ip_allowed(client_ip, allowed_cidrs):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"접속이 허용되지 않은 클라이언트 IP 대역입니다: {client_ip}"
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
    # STRICT SECURITY: 개발/테스트 환경에서 명시적으로 허용된 경우(settings.ALLOW_DEV_MOCK_KEYS=True)에만 우회 허용
    if settings.ALLOW_DEV_MOCK_KEYS and any(k in raw_key for k in ["your-virtual-key", "test", "mock", "demo", "gateway-live-check"]):
        logger.info(f"Gateway authorized request with developer test key: {raw_key[:16]}... (ALLOW_DEV_MOCK_KEYS=True)")
        return None

    # Unknown key
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="등록되지 않았거나 유효하지 않은 가상 API Key입니다. 대시보드의 '가상 API Key 발급' 탭에서 발급받은 키를 사용하십시오."
    )

# -----------------------------------------------------------------------------
# Core Dispatcher Logic (Phase 0.1 AgentRouter & Envoy AI Gateway Integration)
# -----------------------------------------------------------------------------
async def dispatch_chat_completion(
    route_name: str,
    req: ChatCompletionRequest,
    raw_auth: Optional[str],
    matched_key: Optional[VirtualKey],
    db: Session,
    request: Request,
    response: Optional[Response] = None
) -> Dict[str, Any]:
    t0 = time.perf_counter()

    # 1. PII Inspection & WORM Audit
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

    # 2. AgentRouter Classification & Intelligence Engine
    raw_messages_dict = [{"role": m.role, "content": m.content} for m in req.messages]
    classification = classify_prompt(
        messages=raw_messages_dict,
        tools=req.tools,
        functions=req.functions
    )

    # Token Rate Limiting (TPM)
    key_id = matched_key.key_id if matched_key else (raw_auth[:16] if raw_auth else "dev-client")
    tpm_limit = matched_key.tpm_limit if (matched_key and matched_key.tpm_limit) else 200000
    estimated_req_tokens = max(classification.estimated_tokens, 10)
    allowed, current_usage, remaining_tokens = token_rate_limiter.check_and_consume(
        key_id=key_id,
        requested_tokens=estimated_req_tokens,
        tpm_limit=tpm_limit
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"TPM(분당 토큰 소비 한도: {tpm_limit:,} tokens)을 초과하였습니다. 현재 소비: {current_usage:,} tokens. 잠시 후 재시도하십시오."
        )

    # Determine Tenant Budget Spent Ratio
    tenant_budget_ratio = 0.0
    if matched_key:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == matched_key.tenant_id).first()
        if tenant and tenant.monthly_budget_krw > 0:
            tenant_budget_ratio = float(tenant.spent_budget_krw / tenant.monthly_budget_krw)

    # Route Policy from DB (if configured)
    db_policy = db.query(RoutingPolicy).filter(
        RoutingPolicy.route_name == route_name,
        RoutingPolicy.is_active == True
    ).first()

    selected_policy_type = RoutingPolicyType.QUALITY_FIRST
    if db_policy:
        strat = getattr(db_policy, 'load_balancing_strategy', '') or getattr(db_policy, 'strategy', '')
        if strat:
            strat_lower = str(strat).lower()
            if "cost" in strat_lower:
                selected_policy_type = RoutingPolicyType.LEAST_COST
            elif "latency" in strat_lower or "queue" in strat_lower:
                selected_policy_type = RoutingPolicyType.LATENCY_OPTIMIZED

    # Resolve target model from route's traffic_weights if configured
    selected_from_route = None
    if db_policy and db_policy.traffic_weights:
        weights = db_policy.traffic_weights
        total_w = sum(w.get("weight", 0) for w in weights)
        if total_w > 0:
            r = random.uniform(0, total_w)
            cum = 0
            for item in weights:
                cum += item.get("weight", 0)
                if r <= cum:
                    selected_from_route = item.get("model_id")
                    break

    # Determine explicit model: prioritize known ModelCatalog model_ids
    is_catalog_model = db.query(ModelCatalog).filter(ModelCatalog.model_id == req.model).first() is not None
    explicit_model = None
    if is_catalog_model:
        explicit_model = req.model
    elif req.model and req.model not in ["auto", "agent-auto", "default", None]:
        if req.model != route_name or not db.query(RoutingPolicy).filter(RoutingPolicy.route_name == req.model).first():
            explicit_model = req.model
    elif selected_from_route:
        explicit_model = selected_from_route

    agent_router = AgentRouter(default_policy=selected_policy_type)
    routing_decision = agent_router.evaluate_route(
        classification=classification,
        policy=selected_policy_type,
        tenant_budget_spent_ratio=tenant_budget_ratio,
        explicit_model_request=explicit_model
    )

    selected_model_id = routing_decision.selected_model
    target_cluster = routing_decision.target_cluster

    # Model authorization check against matched_key.allowed_models
    if matched_key and matched_key.allowed_models and len(matched_key.allowed_models) > 0:
        req_or_selected = explicit_model or selected_model_id
        if selected_model_id not in matched_key.allowed_models and (not explicit_model or explicit_model not in matched_key.allowed_models):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"가상 API Key에 부여된 권한으로는 요청 모델({req_or_selected})을 호출할 수 없습니다. 허용 모델: {matched_key.allowed_models}"
            )

    # Lookup model catalog info if present in DB
    model_entry = db.query(ModelCatalog).filter(ModelCatalog.model_id == selected_model_id).first()
    if not model_entry:
        model_entry = db.query(ModelCatalog).first()

    target_endpoint = model_entry.target_endpoint if model_entry else "http://127.0.0.1:11434"
    serving_engine = model_entry.serving_engine if model_entry else "vLLM"

    # 3. Session Affinity
    session_id = request.headers.get("x-session-id")
    affinity_mgr = SessionAffinityManager()
    affinity_headers = affinity_mgr.get_affinity_headers(session_id=session_id, prompt_prefix=user_prompt[:50])

    # 4. Attempt Upstream Forwarding to vLLM
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

    candidate_urls = [
        f"{target_endpoint.rstrip('/')}/v1/chat/completions",
        f"{target_endpoint.rstrip('/')}/chat/completions",
    ]
    if any(k in target_endpoint for k in ["127.0.0.1", "localhost", "ollama-qwen", "host.docker.internal"]):
        port = target_endpoint.split(":")[-1].split("/")[0]
        candidate_urls.extend([
            f"http://ollama-qwen:{port}/v1/chat/completions",
            f"http://host.docker.internal:{port}/v1/chat/completions",
            f"http://172.17.0.1:{port}/v1/chat/completions",
            f"http://127.0.0.1:{port}/v1/chat/completions"
        ])

    # De-duplicate candidate URLs preserving order
    candidate_urls = list(dict.fromkeys(candidate_urls))

    upstream_success = False
    upstream_response_data = None

    client_timeout = httpx.Timeout(90.0, connect=3.0)
    async with httpx.AsyncClient(timeout=client_timeout) as client:
        for url in candidate_urls:
            try:
                res = await client.post(url, json=upstream_payload, headers={"Content-Type": "application/json"})
                if res.status_code == 200:
                    upstream_response_data = res.json()
                    upstream_success = True
                    break
                else:
                    logger.warning(f"Upstream returned HTTP {res.status_code} for URL {url}: {res.text[:100]}")
            except Exception as e:
                logger.warning(f"Failed connecting to upstream candidate URL {url}: {e}")
                continue

    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    # Inject HTTP response headers if response object available
    if response:
        response.headers["x-agent-router-decision"] = routing_decision.policy_applied.value
        response.headers["x-agent-complexity"] = routing_decision.complexity.value
        response.headers["x-agent-route-tier"] = routing_decision.tier
        response.headers["x-orche-upstream-cluster"] = target_cluster
        response.headers["x-ratelimit-remaining-tokens"] = str(remaining_tokens)
        for hk, hv in affinity_headers.items():
            response.headers[hk] = hv

    # Metrics extraction
    prompt_toks = max(len(user_prompt) // 4 + 10, 5)
    compl_toks = 40

    # 5. Format Return Payload
    if upstream_success and upstream_response_data:
        upstream_response_data["orche_metadata"] = {
            "routed_by": "Envoy AI Gateway + AgentRouter",
            "route_name": route_name,
            "selected_model": selected_model_id,
            "serving_engine": serving_engine,
            "target_endpoint": target_endpoint,
            "target_cluster": target_cluster,
            "latency_ms": latency_ms,
            "complexity": routing_decision.complexity.value,
            "tier": routing_decision.tier,
            "policy_applied": routing_decision.policy_applied.value,
            "reasons": routing_decision.reasons,
            "pii_filtered": len(detections) > 0,
            "status": "LIVE_UPSTREAM"
        }
        return upstream_response_data

    # Developer unit-test simulation check (only for local unit-testing with explicit test key)
    is_strict = request.headers.get("x-strict-upstream") == "true"
    is_dev_test = raw_auth and any(k in raw_auth for k in ["sk-orch-test-key-developer", "sk-orch-your-virtual-key"])

    if not is_strict and is_dev_test:
        tier_desc = "Fast 8B Tier (초저지연 경량 모델)" if routing_decision.tier == "fast_8b" else "Reasoning 72B Tier (심층 추론·코딩 모델)"
        sample_text = (
            f"안녕하세요! Envoy AI Gateway와 AgentRouter를 통해 최적 라우팅되어 응답드립니다.\n\n"
            f"• [지능형 분기 판정]: {tier_desc}\n"
            f"• [프롬프트 복잡도]: {routing_decision.complexity.value}\n"
            f"• [적용 정책]: {routing_decision.policy_applied.value}\n"
            f"• [선택 모델]: {selected_model_id} (Cluster: {target_cluster})\n"
            f"• [사유]: {', '.join(routing_decision.reasons)}\n\n"
            f"본 요청은 Envoy AI Gateway L7 ext_proc 및 AgentRouter의 실시간 인텐트 분류를 거쳐 안전하게 디스패치되었습니다."
        )
        resp_id = f"chatcmpl-agentrouter-{int(time.time()*1000)}"
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
                "prompt_tokens": prompt_toks,
                "completion_tokens": len(sample_text) // 4 + 10,
                "total_tokens": prompt_toks + len(sample_text) // 4 + 10
            },
            "orche_metadata": {
                "routed_by": "Envoy AI Gateway + AgentRouter",
                "route_name": route_name,
                "selected_model": selected_model_id,
                "serving_engine": serving_engine,
                "target_endpoint": target_endpoint,
                "target_cluster": target_cluster,
                "latency_ms": latency_ms,
                "complexity": routing_decision.complexity.value,
                "tier": routing_decision.tier,
                "policy_applied": routing_decision.policy_applied.value,
                "reasons": routing_decision.reasons,
                "pii_filtered": len(detections) > 0,
                "status": "SIMULATED_TEST",
                "note": "개발자 단위 테스트 모드"
            }
        }

    # Strict Production Standard: Raise HTTP 502 Bad Gateway when upstream LLM server is unreachable
    logger.warning(f"Upstream model server unreachable: model={selected_model_id}, endpoint={target_endpoint}")
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={
            "error": "Upstream LLM Server Unreachable (HTTP 502 Bad Gateway)",
            "message": f"라우트 '{route_name}'에 연결된 모델 '{selected_model_id}'의 업스트림 서빙 엔드포인트({target_endpoint})에 연결할 수 없습니다. 서빙 노드(vLLM/Ollama) 가동 상태를 확인하십시오.",
            "selected_model": selected_model_id,
            "target_endpoint": target_endpoint,
            "serving_engine": serving_engine,
            "route_name": route_name
        }
    )

# -----------------------------------------------------------------------------
# Endpoints: Path-based & Header-based Route Ingress
# -----------------------------------------------------------------------------
@router.post("/routes/{route_name}")
async def gateway_route_path_ingress(
    route_name: str,
    req: ChatCompletionRequest,
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """경로 기반 엔드포인트: POST /v1/routes/{route_name}
    Envoy AI Gateway가 prefix_rewrite 로 넘기거나 직접 수신
    """
    matched_key = authenticate_gateway_key(authorization, x_virtual_key, db, request)
    return await dispatch_chat_completion(
        route_name=route_name,
        req=req,
        raw_auth=authorization or x_virtual_key,
        matched_key=matched_key,
        db=db,
        request=request,
        response=response
    )

@router.post("/chat/completions")
async def gateway_chat_completions_ingress(
    req: ChatCompletionRequest,
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    x_orche_route: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """헤더/바디 기반 엔드포인트: POST /v1/chat/completions
    AgentRouter 지능형 분기 디스패처
    """
    matched_key = authenticate_gateway_key(authorization, x_virtual_key, db, request)
    route_name = x_orche_route or req.model or "financial-advisor-v1"
    return await dispatch_chat_completion(
        route_name=route_name,
        req=req,
        raw_auth=authorization or x_virtual_key,
        matched_key=matched_key,
        db=db,
        request=request,
        response=response
    )

@router.post("/ext-proc/process", response_model=ExtProcResponse)
def envoy_ext_proc_webhook_endpoint(req: ExtProcRequest):
    """Envoy AI Gateway ext_proc Webhook 엔드포인트: POST /api/v1/ext-proc/process"""
    return ext_processor.process_request(
        headers=req.headers,
        body=req.body,
        tpm_limit=200000,
        budget_spent_ratio=0.0
    )

@router.get("/models")
def list_available_models(db: Session = Depends(get_db)):
    """OpenAI 호환 모델 및 라우트 목록 반환: GET /v1/models"""
    routes = db.query(RoutingPolicy).filter(RoutingPolicy.is_active == True).all()
    models = db.query(ModelCatalog).filter(ModelCatalog.is_active == True).all()

    data = []
    now_ts = int(time.time())

    # AgentRouter Tiers
    data.append({
        "id": "agent-auto",
        "object": "model",
        "created": now_ts,
        "owned_by": "AgentRouter (Autonomous Dispatch)",
        "type": "agent_router"
    })
    data.append({
        "id": DEFAULT_FAST_MODEL,
        "object": "model",
        "created": now_ts,
        "owned_by": "Envoy AI Gateway (Fast 8B Tier)",
        "type": "fast_tier"
    })
    data.append({
        "id": DEFAULT_REASONING_MODEL,
        "object": "model",
        "created": now_ts,
        "owned_by": "Envoy AI Gateway (Reasoning 72B Tier)",
        "type": "reasoning_tier"
    })

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
