import time
import random
import logging
import ipaddress
import json
import uuid
from typing import List, Dict, Any, Optional, Union
from datetime import datetime, timezone

from decimal import Decimal
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session
import httpx

from app.core.config import settings

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.models.user import User, UserSession
from app.models.role import Role
from app.core.security import (
    verify_virtual_key,
    decrypt_upstream_key,
    decode_access_token,
    validate_upstream_endpoint_url,
    SYSTEM_DIAGNOSTICS_KEY_ID,
    INTERNAL_DIAGNOSTICS_CIDRS,
    is_trusted_proxy_ip,
    get_client_real_ip,
)
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
from app.core.semantic_cache import semantic_cache

logger = logging.getLogger(__name__)

router = APIRouter()

# -----------------------------------------------------------------------------
# Pydantic Schemas (OpenAI Chat Completions & Anthropic Multi-modal Compatible)
# -----------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str = Field(..., description="역할 (system, user, assistant)")
    content: Union[str, List[Union[Dict[str, Any], str]]] = Field(
        ..., description="메시지 내용 (단일 문자열 또는 멀티모달/구조화 블록 배열)"
    )

    def get_text_content(self) -> str:
        """단일 문자열 또는 블록 배열에서 순수 텍스트를 추출하는 헬퍼"""
        if isinstance(self.content, str):
            return self.content
        if isinstance(self.content, list):
            texts = []
            for item in self.content:
                if isinstance(item, str):
                    texts.append(item)
                elif isinstance(item, dict):
                    if item.get("type") == "text" and "text" in item:
                        texts.append(str(item["text"]))
                    elif "content" in item:
                        texts.append(str(item["content"]))
            return "\n".join(texts)
        return str(self.content) if self.content is not None else ""

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = Field(default=None, description="모델 ID 또는 라우트 식별자 (예: auto, agent-auto, financial-advisor-v1)")
    messages: List[ChatMessage] = Field(default_factory=list, description="대화 메시지 히스토리")
    system: Optional[Union[str, List[Union[Dict[str, Any], str]]]] = Field(
        default=None, description="Anthropic 규격 최상위 시스템 프롬프트 (있는 경우 messages 선두에 자동 합성)"
    )
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=512, ge=1)
    stream: Optional[bool] = Field(default=False, description="스트리밍 여부")
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, description="도구/함수 호출 스키마")
    functions: Optional[List[Dict[str, Any]]] = Field(default=None, description="레거시 함수 호출 스키마")
    tool_choice: Optional[Union[str, Dict[str, Any]]] = Field(default=None, description="도구 선택 모드")

# -----------------------------------------------------------------------------
# Helper: Anthropic <-> OpenAI Tool Schema and Message Converters
# -----------------------------------------------------------------------------
def convert_anthropic_tools_to_openai(tools: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
    if not tools:
        return None
    converted = []
    for t in tools:
        if not isinstance(t, dict):
            continue
        if t.get("type") == "function" and "function" in t:
            converted.append(t)
        elif "input_schema" in t:
            converted.append({
                "type": "function",
                "function": {
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema", {"type": "object", "properties": {}})
                }
            })
        elif "parameters" in t and "name" in t:
            converted.append({
                "type": "function",
                "function": {
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "parameters": t.get("parameters", {})
                }
            })
        else:
            converted.append(t)
    return converted if converted else None

def convert_anthropic_tool_choice_to_openai(tool_choice: Optional[Union[str, Dict[str, Any]]]) -> Optional[Union[str, Dict[str, Any]]]:
    if not tool_choice:
        return None
    if isinstance(tool_choice, str):
        return tool_choice
    if isinstance(tool_choice, dict):
        tc_type = tool_choice.get("type")
        if tc_type == "auto":
            return "auto"
        elif tc_type == "any":
            return "required"
        elif tc_type == "tool" and "name" in tool_choice:
            return {"type": "function", "function": {"name": tool_choice["name"]}}
        elif tc_type == "function" and "function" in tool_choice:
            return tool_choice
    return tool_choice

# -----------------------------------------------------------------------------
# Helper: IP Address / CIDR Matcher
# -----------------------------------------------------------------------------
def is_ip_allowed(client_ip: str, allowed_cidrs: List[str]) -> bool:
    valid_cidrs = [
        part.strip()
        for raw in (allowed_cidrs or [])
        if raw
        for part in str(raw).split(",")
        if part.strip()
    ]
    if not valid_cidrs or "0.0.0.0/0" in valid_cidrs or "*" in valid_cidrs:
        return True
    try:
        ip_obj = ipaddress.ip_address(client_ip)
        for cidr_str in valid_cidrs:
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
# Helper: FinOps Real-time Token & Cost Metering
# -----------------------------------------------------------------------------
def record_token_and_cost_metering(
    db: Session,
    matched_key: Optional[VirtualKey],
    model_entry: Optional[ModelCatalog],
    prompt_tokens: int,
    completion_tokens: int,
    target_tenant_hint: Optional[str] = None
) -> Dict[str, Any]:
    """가상 API Key 및 부서(Tenant)에 실제 추론 토큰 소비량 및 비용(KRW)을 실시간으로 누적 반영"""
    total_tokens = prompt_tokens + completion_tokens
    input_price = float(model_entry.input_price_per_1k) if (model_entry and model_entry.input_price_per_1k) else 0.80
    output_price = float(model_entry.output_price_per_1k) if (model_entry and model_entry.output_price_per_1k) else 2.40
    cost_krw = round((prompt_tokens * input_price / 1000.0) + (completion_tokens * output_price / 1000.0), 2)
    cost_decimal = Decimal(str(cost_krw))

    target_key = matched_key
    target_tenant = None

    if target_tenant_hint:
        hint_clean = str(target_tenant_hint).strip()
        found_tenant = db.query(Tenant).filter(
            or_(Tenant.department_code == hint_clean, Tenant.tenant_id == hint_clean, Tenant.name == hint_clean)
        ).first()
        if found_tenant:
            target_tenant = found_tenant
            if not target_key or target_key.tenant_id != found_tenant.tenant_id:
                t_key = db.query(VirtualKey).filter(
                    VirtualKey.tenant_id == found_tenant.tenant_id,
                    VirtualKey.is_active == True
                ).first()
                if t_key:
                    target_key = t_key

    if not target_tenant and target_key:
        target_tenant = db.query(Tenant).filter(Tenant.tenant_id == target_key.tenant_id).first()

    if target_key:
        target_key.total_tokens = (target_key.total_tokens or 0) + total_tokens
        target_key.spent_krw = (target_key.spent_krw or Decimal("0.00")) + cost_decimal

    if target_tenant:
        target_tenant.spent_budget_krw = (target_tenant.spent_budget_krw or Decimal("0.00")) + cost_decimal

    try:
        db.commit()
        if target_key:
            db.refresh(target_key)
        if target_tenant:
            db.refresh(target_tenant)
    except Exception as e:
        logger.warning(f"FinOps metering commit failed: {e}")
        db.rollback()

    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_krw": cost_krw,
        "tenant_id": target_tenant.tenant_id if target_tenant else None,
        "tenant_name": target_tenant.name if target_tenant else None
    }

def _extract_client_ip(request: Optional[Request]) -> str:
    """
    Extract client IP safely (H-1):
    Only trust X-Forwarded-For when the immediate TCP peer is a trusted proxy
    (loopback / container network / testclient / AWS ALB CIDR), and take the rightmost hop
    appended by Envoy (use_remote_address: true) or originating client IP.
    """
    if not request:
        return "127.0.0.1"
    peer_host = request.client.host if (request.client and request.client.host) else "127.0.0.1"
    is_trusted_proxy = (peer_host == "testclient") or is_trusted_proxy_ip(peer_host) or is_ip_allowed(peer_host, INTERNAL_DIAGNOSTICS_CIDRS)
    if is_trusted_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            hops = [h.strip() for h in forwarded.split(",") if h.strip()]
            if hops:
                # If behind Envoy, the rightmost is appended by Envoy. If direct from ALB, the leftmost is the client.
                # When hops > 1 and rightmost is an internal envoy/alb proxy, use hops[0].
                if len(hops) > 1 and is_trusted_proxy_ip(hops[-1]):
                    return hops[0]
                return hops[-1]
    return "127.0.0.1" if peer_host == "testclient" else peer_host


def _try_authenticate_console_jwt(token: str, db: Session) -> bool:
    """
    Allow authenticated Web Console users (Prompt Studio / Admin Diagnostics)
    to call the gateway using their session JWT without needing a static virtual key.
    """
    payload = decode_access_token(token)
    if not payload:
        return False
    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        return False
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        return False
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == user.id,
        UserSession.is_revoked == False
    ).first()
    if not session:
        return False
    if user.role == "SUPER_ADMIN":
        return True
    role = db.query(Role).filter(Role.name == user.role).first()
    perms = role.permissions if (role and role.permissions) else []
    if "*" in perms or "prompt_studio:execute" in perms or "routing:write" in perms:
        return True
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"접근 권한이 없습니다. (필요 권한: 'prompt_studio:execute', 현재 역할: '{user.role}')"
    )


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
            detail="인증 헤더가 누락되었습니다. 'Authorization: Bearer sk-ord-...' 형식으로 가상 API Key를 전달하십시오."
        )

    if not raw_key.startswith("sk-ord-"):
        if request and request.headers.get("x-console-prompt-studio") == "true" and _try_authenticate_console_jwt(raw_key, db):
            return None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="잘못된 가상 API Key 형식입니다. 'sk-ord-' 접두사가 필요합니다."
        )

    # Extract client IP for IP CIDR validation (resistant to X-Forwarded-For spoofing)
    client_ip = _extract_client_ip(request)

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

            # Check IP CIDR whitelist (System Diagnostics Key is strictly bound to internal CIDRs)
            allowed_cidrs = candidate.allowed_ip_cidrs or (
                INTERNAL_DIAGNOSTICS_CIDRS if candidate.key_id == SYSTEM_DIAGNOSTICS_KEY_ID else []
            )
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

    # 2. Developer/Test mock keys (e.g. sk-ord-your-virtual-key or sk-ord-test-*)
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

    # 0. Anthropic/OpenAI System Prompt 정규화 및 선두 통합
    # vLLM/OpenAI 엄격 규칙: "System message must be at the beginning."
    system_texts = []
    if req.system:
        if isinstance(req.system, str):
            system_texts.append(req.system)
        elif isinstance(req.system, list):
            for item in req.system:
                if isinstance(item, str):
                    system_texts.append(item)
                elif isinstance(item, dict) and item.get("type") == "text":
                    system_texts.append(str(item.get("text", "")))

    normalized_req_messages = []
    for m in req.messages:
        if m.role == "system":
            sys_t = m.get_text_content()
            if sys_t:
                system_texts.append(sys_t)
        else:
            normalized_req_messages.append(m)

    if system_texts:
        combined_sys = "\n\n".join(filter(None, system_texts))
        normalized_req_messages.insert(0, ChatMessage(role="system", content=combined_sys))

    req.messages = normalized_req_messages

    # 1. PII Inspection & WORM Audit
    user_prompt = ""
    for msg in reversed(req.messages):
        if msg.role == "user":
            user_prompt = msg.get_text_content()
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
            key_id=matched_key.key_id if matched_key else "sk-ord-test",
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
    is_catalog_model = db.query(ModelCatalog).filter((ModelCatalog.model_id == req.model) | (ModelCatalog.alias == req.model)).first() is not None
    explicit_model = None
    if is_catalog_model:
        explicit_model = req.model
    elif req.model and req.model not in ["auto", "agent-auto", "default", None]:
        if req.model == route_name or db.query(RoutingPolicy).filter(RoutingPolicy.route_name == req.model).first():
            explicit_model = selected_from_route or req.model
        else:
            explicit_model = req.model
    elif selected_from_route:
        explicit_model = selected_from_route

    if not explicit_model and selected_from_route:
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
        if "*" not in matched_key.allowed_models:
            req_or_selected = explicit_model or selected_model_id
            if selected_model_id not in matched_key.allowed_models and (not explicit_model or explicit_model not in matched_key.allowed_models):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"가상 API Key에 부여된 권한으로는 요청 모델({req_or_selected})을 호출할 수 없습니다. 허용 모델: {matched_key.allowed_models}"
                )

    # Lookup model catalog info if present in DB
    model_entry = db.query(ModelCatalog).filter((ModelCatalog.model_id == selected_model_id) | (ModelCatalog.alias == selected_model_id)).first()
    if not model_entry and selected_from_route:
        model_entry = db.query(ModelCatalog).filter((ModelCatalog.model_id == selected_from_route) | (ModelCatalog.alias == selected_from_route)).first()
    if not model_entry:
        model_entry = db.query(ModelCatalog).first()

    if model_entry:
        selected_model_id = model_entry.model_id

    target_endpoint = model_entry.target_endpoint if model_entry else "http://127.0.0.1:11434"
    serving_engine = model_entry.serving_engine if model_entry else "vLLM"

    try:
        validate_upstream_endpoint_url(target_endpoint)
    except ValueError as ssrf_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"비인가 업스트림 엔드포인트 차단 (SSRF 보호): {ssrf_err}"
        )

    # 3. Session Affinity
    session_id = request.headers.get("x-session-id")
    affinity_mgr = SessionAffinityManager()
    affinity_headers = affinity_mgr.get_affinity_headers(session_id=session_id, prompt_prefix=user_prompt[:50])

    # 4. Attempt Upstream Forwarding to vLLM (Multi-Turn Anthropic <-> OpenAI Conversion)
    upstream_messages = []
    for msg in req.messages:
        content = msg.content
        role = msg.role
        msg_text = msg.get_text_content()

        # Apply PII masking to the active user prompt
        if role == "user" and msg_text == user_prompt:
            if isinstance(content, str):
                content = masked_prompt
            elif isinstance(content, list):
                new_blocks = []
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "text":
                        b_text = b.get("text", "")
                        masked_b_text = pii_engine.mask(b_text).masked_text if b_text else ""
                        new_blocks.append({**b, "text": masked_b_text})
                    else:
                        new_blocks.append(b)
                content = new_blocks

        # Convert Anthropic assistant tool_use blocks into OpenAI tool_calls
        if isinstance(content, list) and role == "assistant":
            text_parts = []
            tool_calls = []
            for block in content:
                if not isinstance(block, dict):
                    continue
                b_type = block.get("type")
                if b_type == "text":
                    text_parts.append(block.get("text", ""))
                elif b_type == "tool_use":
                    args = block.get("input", {})
                    args_str = json.dumps(args, ensure_ascii=False) if isinstance(args, (dict, list)) else str(args)
                    tool_calls.append({
                        "id": block.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                        "type": "function",
                        "function": {
                            "name": block.get("name", ""),
                            "arguments": args_str
                        }
                    })
            entry = {"role": "assistant", "content": "\n".join(text_parts) if text_parts else None}
            if tool_calls:
                entry["tool_calls"] = tool_calls
            upstream_messages.append(entry)
            continue

        # Convert Anthropic user tool_result blocks into OpenAI role: "tool"
        if isinstance(content, list) and role == "user":
            has_tool_results = any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
            if has_tool_results:
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        res_content = block.get("content", "")
                        if isinstance(res_content, list):
                            res_content = "\n".join(
                                sub.get("text", "") for sub in res_content if isinstance(sub, dict) and "text" in sub
                            )
                        elif isinstance(res_content, (dict, list)):
                            res_content = json.dumps(res_content, ensure_ascii=False)
                        upstream_messages.append({
                            "role": "tool",
                            "tool_call_id": block.get("tool_use_id", ""),
                            "content": str(res_content)
                        })
                    elif isinstance(block, dict) and block.get("type") == "text":
                        upstream_messages.append({"role": "user", "content": block.get("text", "")})
                continue

        upstream_messages.append({"role": role, "content": content})

    is_anthropic_messages = (
        "/messages" in request.url.path
        or req.system is not None
        or bool(request.headers.get("anthropic-version"))
        or bool(request.headers.get("x-api-key"))
    )
    wants_stream = bool(req.stream) or ("text/event-stream" in request.headers.get("accept", "").lower())
    model_supports_stream = getattr(model_entry, "supports_streaming", True) if model_entry else True
    is_streaming = wants_stream and model_supports_stream

    upstream_model_name = getattr(model_entry, 'alias', None) or selected_model_id
    converted_tools = convert_anthropic_tools_to_openai(req.tools or req.functions)
    converted_tool_choice = convert_anthropic_tool_choice_to_openai(req.tool_choice)

    upstream_payload = {
        "model": upstream_model_name,
        "messages": upstream_messages,
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "stream": is_streaming
    }
    if converted_tools:
        upstream_payload["tools"] = converted_tools
    if converted_tool_choice:
        upstream_payload["tool_choice"] = converted_tool_choice
    prompt_toks = max(len(user_prompt) // 4 + 10, 5)
    compl_toks = 40

    # Cache is scoped to a tenant/key and covers the whole normalized conversation.
    # Tool calls and streaming are deliberately excluded to avoid caching side effects.
    cacheable = not is_streaming and not req.tools and not req.functions
    cache_scope = (
        matched_key.tenant_id
        if (matched_key and matched_key.tenant_id)
        else (f"key:{matched_key.key_id}" if matched_key else f"console:{key_id}")
    )
    semantic_hit = semantic_cache.lookup(cache_scope, selected_model_id, upstream_messages) if cacheable else None
    if semantic_hit:
        cached_response = semantic_hit.response
        cached_usage = cached_response.get("usage", {}) if isinstance(cached_response, dict) else {}
        saved_prompt_tokens = int(cached_usage.get("prompt_tokens", prompt_toks))
        saved_completion_tokens = int(cached_usage.get("completion_tokens", compl_toks))
        input_price = float(model_entry.input_price_per_1k) if model_entry else 0.80
        output_price = float(model_entry.output_price_per_1k) if model_entry else 2.40
        saved_cost = round((saved_prompt_tokens * input_price + saved_completion_tokens * output_price) / 1000.0, 2)
        semantic_cache.record_savings(saved_prompt_tokens + saved_completion_tokens, saved_cost)
        cached_response["orche_metadata"] = {
            **cached_response.get("orche_metadata", {}),
            "status": "SEMANTIC_CACHE_HIT",
            "semantic_cache": {"hit": True, "similarity": semantic_hit.similarity, "saved_cost_krw": saved_cost},
        }
        if response:
            response.headers["x-orche-semantic-cache"] = "HIT"
            response.headers["x-orche-semantic-similarity"] = str(semantic_hit.similarity)
        return cached_response

    # 3번 자동 정규화 조치 롤백: 사용자가 완성하여 저장한 target_endpoint URL을 직접 최우선 호출
    endpoint_clean = target_endpoint.rstrip('/')
    candidate_urls = [endpoint_clean]
    
    # 만약 완성된 경로(/chat/completions, /messages, /chat 등)가 없는 단순 도메인인 경우 호환성 보완
    if not any(endpoint_clean.endswith(ext) for ext in ['/chat/completions', '/messages', '/chat', ':generateContent']):
        candidate_urls.append(f"{endpoint_clean}/v1/chat/completions")
        candidate_urls.append(f"{endpoint_clean}/chat/completions")

    if any(k in target_endpoint for k in ["127.0.0.1", "localhost", "ollama-qwen", "host.docker.internal"]):
        port = target_endpoint.split(":")[-1].split("/")[0]
        candidate_urls.extend([
            f"http://ollama-qwen:{port}/v1/chat/completions",
            f"http://host.docker.internal:{port}/v1/chat/completions",
            f"http://172.20.0.1:{port}/v1/chat/completions",
            f"http://172.17.0.1:{port}/v1/chat/completions",
            f"http://127.0.0.1:{port}/v1/chat/completions"
        ])

    # De-duplicate candidate URLs preserving order
    candidate_urls = list(dict.fromkeys(candidate_urls))

    upstream_success = False
    upstream_response_data = None

    # Build upstream request headers including API key auth if configured
    upstream_headers = {"Content-Type": "application/json"}
    model_provider = getattr(model_entry, 'provider', 'openai') or 'openai'
    raw_api_key = decrypt_upstream_key(model_entry.api_key) if model_entry and model_entry.api_key else None
    if model_provider.lower() == 'anthropic':
        upstream_headers["anthropic-version"] = "2023-06-01"
        if raw_api_key:
            upstream_headers["x-api-key"] = raw_api_key

    if raw_api_key:
        auth_type_norm = (model_entry.auth_type or "none").lower()
        if auth_type_norm == "bearer":
            upstream_headers["Authorization"] = f"Bearer {raw_api_key}"
        elif auth_type_norm == "apikey":
            upstream_headers["apikey"] = raw_api_key

    # Determine tenant attribution hint early
    policy_tenant_code = None
    if db_policy and db_policy.match_conditions and db_policy.match_conditions.get("tenant_codes"):
        policy_tenant_code = db_policy.match_conditions["tenant_codes"][0]
    target_tenant_hint = request.headers.get("x-orche-tenant") or policy_tenant_code

    # Developer unit-test simulation check (only for local unit-testing with explicit test key)
    is_strict = request.headers.get("x-strict-upstream") == "true"
    is_dev_test = raw_auth and any(k in raw_auth for k in ["sk-ord-test-key-developer", "sk-ord-your-virtual-key"])

    # 4.1 Real-time SSE Streaming Dispatch (Claude Code & Interactive CLI)
    if is_streaming:
        async def stream_generator():
            async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as s_client:
                for target_url in candidate_urls:
                    try:
                        async with s_client.stream("POST", target_url, json=upstream_payload, headers=upstream_headers) as upstream_stream:
                            if upstream_stream.status_code == 200:
                                total_tokens = 0
                                if is_anthropic_messages:
                                    msg_id = f"msg_{uuid.uuid4().hex[:16]}"
                                    msg_start = {
                                        "type": "message_start",
                                        "message": {
                                            "id": msg_id,
                                            "type": "message",
                                            "role": "assistant",
                                            "content": [],
                                            "model": selected_model_id,
                                            "stop_reason": None,
                                            "stop_sequence": None,
                                            "usage": {"input_tokens": prompt_toks, "output_tokens": 1}
                                        }
                                    }
                                    yield f"event: message_start\ndata: {json.dumps(msg_start, ensure_ascii=False)}\n\n"

                                    current_block_index = 0
                                    text_block_open = False
                                    active_tool_blocks = {}
                                    finish_reason = None

                                    async for line in upstream_stream.aiter_lines():
                                        if not line:
                                            continue
                                        if line.startswith("data: "):
                                            raw_data = line[6:].strip()
                                            if raw_data == "[DONE]":
                                                break
                                            try:
                                                chunk = json.loads(raw_data)
                                                choices = chunk.get("choices", [])
                                                if choices:
                                                    choice = choices[0]
                                                    delta = choice.get("delta", {})
                                                    if choice.get("finish_reason"):
                                                        finish_reason = choice.get("finish_reason")

                                                    # 1. Text or reasoning delta
                                                    text_delta = delta.get("content") or delta.get("reasoning") or delta.get("reasoning_content") or ""
                                                    if text_delta:
                                                        total_tokens += 1
                                                        if not text_block_open:
                                                            block_start = {
                                                                "type": "content_block_start",
                                                                "index": current_block_index,
                                                                "content_block": {"type": "text", "text": ""}
                                                            }
                                                            yield f"event: content_block_start\ndata: {json.dumps(block_start, ensure_ascii=False)}\n\n"
                                                            text_block_open = True
                                                        block_delta = {
                                                            "type": "content_block_delta",
                                                            "index": current_block_index,
                                                            "delta": {"type": "text_delta", "text": text_delta}
                                                        }
                                                        yield f"event: content_block_delta\ndata: {json.dumps(block_delta, ensure_ascii=False)}\n\n"

                                                    # 2. Tool calls delta
                                                    tool_calls_delta = delta.get("tool_calls", [])
                                                    if tool_calls_delta:
                                                        if text_block_open:
                                                            yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': current_block_index}, ensure_ascii=False)}\n\n"
                                                            text_block_open = False
                                                            current_block_index += 1

                                                        for tc in tool_calls_delta:
                                                            tc_idx = tc.get("index", 0)
                                                            if tc_idx not in active_tool_blocks:
                                                                tool_id = tc.get("id") or f"toolu_{uuid.uuid4().hex[:12]}"
                                                                tool_name = tc.get("function", {}).get("name") or "tool"
                                                                active_tool_blocks[tc_idx] = {
                                                                    "block_index": current_block_index,
                                                                    "id": tool_id,
                                                                    "name": tool_name
                                                                }
                                                                tb_start = {
                                                                    "type": "content_block_start",
                                                                    "index": current_block_index,
                                                                    "content_block": {
                                                                        "type": "tool_use",
                                                                        "id": tool_id,
                                                                        "name": tool_name,
                                                                        "input": {}
                                                                    }
                                                                }
                                                                yield f"event: content_block_start\ndata: {json.dumps(tb_start, ensure_ascii=False)}\n\n"
                                                                current_block_index += 1

                                                            arg_chunk = tc.get("function", {}).get("arguments", "")
                                                            if arg_chunk:
                                                                total_tokens += 1
                                                                tb_delta = {
                                                                    "type": "content_block_delta",
                                                                    "index": active_tool_blocks[tc_idx]["block_index"],
                                                                    "delta": {
                                                                        "type": "input_json_delta",
                                                                        "partial_json": arg_chunk
                                                                    }
                                                                }
                                                                yield f"event: content_block_delta\ndata: {json.dumps(tb_delta, ensure_ascii=False)}\n\n"
                                            except Exception:
                                                continue

                                    # Close any open content blocks
                                    if text_block_open:
                                        yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': current_block_index}, ensure_ascii=False)}\n\n"

                                    for tc_idx, tb_info in active_tool_blocks.items():
                                        yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': tb_info['block_index']}, ensure_ascii=False)}\n\n"

                                    if not text_block_open and not active_tool_blocks and current_block_index == 0:
                                        yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}}, ensure_ascii=False)}\n\n"
                                        yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': 0}, ensure_ascii=False)}\n\n"

                                    stop_reason = "tool_use" if active_tool_blocks or finish_reason == "tool_calls" else "end_turn"
                                    msg_delta = {
                                        "type": "message_delta",
                                        "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                                        "usage": {"output_tokens": max(total_tokens, 1)}
                                    }
                                    yield f"event: message_delta\ndata: {json.dumps(msg_delta, ensure_ascii=False)}\n\n"

                                    msg_stop = {"type": "message_stop"}
                                    yield f"event: message_stop\ndata: {json.dumps(msg_stop, ensure_ascii=False)}\n\n"
                                else:
                                    # OpenAI SSE format streaming
                                    async for line in upstream_stream.aiter_lines():
                                        if line:
                                            yield f"{line}\n\n"

                                try:
                                    record_token_and_cost_metering(
                                        db=db,
                                        matched_key=matched_key,
                                        model_entry=model_entry,
                                        prompt_tokens=prompt_toks,
                                        completion_tokens=max(total_tokens, 1),
                                        target_tenant_hint=target_tenant_hint
                                    )
                                except Exception as meter_err:
                                    logger.warning(f"Stream metering commit failed: {meter_err}")
                                return
                            else:
                                logger.warning(f"Upstream stream returned HTTP {upstream_stream.status_code} for URL {target_url}")
                                continue
                    except Exception as e:
                        logger.warning(f"Upstream stream connection error for {target_url}: {e}")
                        continue

                # If all candidate URLs fail in streaming
                if is_dev_test and not is_strict:
                    if is_anthropic_messages:
                        msg_id = f"msg_sim_{int(time.time()*1000)}"
                        yield f"event: message_start\ndata: {json.dumps({'type':'message_start','message':{'id':msg_id,'type':'message','role':'assistant','content':[],'model':selected_model_id,'stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':prompt_toks,'output_tokens':1}}}, ensure_ascii=False)}\n\n"
                        yield f"event: content_block_start\ndata: {json.dumps({'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}}, ensure_ascii=False)}\n\n"
                        yield f"event: content_block_delta\ndata: {json.dumps({'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'[Simulated Stream Response]'}}, ensure_ascii=False)}\n\n"
                        yield f"event: content_block_stop\ndata: {json.dumps({'type':'content_block_stop','index':0}, ensure_ascii=False)}\n\n"
                        yield f"event: message_delta\ndata: {json.dumps({'type':'message_delta','delta':{'stop_reason':'end_turn','stop_sequence':None},'usage':{'output_tokens':4}}, ensure_ascii=False)}\n\n"
                        yield f"event: message_stop\ndata: {json.dumps({'type':'message_stop'}, ensure_ascii=False)}\n\n"
                    else:
                        sim_chunk = {
                            "id": f"chatcmpl-sim-{int(time.time()*1000)}",
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": selected_model_id,
                            "choices": [{"index": 0, "delta": {"content": "[Simulated Stream Response]"}, "finish_reason": None}]
                        }
                        yield f"data: {json.dumps(sim_chunk, ensure_ascii=False)}\n\n"
                        yield "data: [DONE]\n\n"
                    return

                err_event = {
                    "type": "error",
                    "error": {
                        "type": "api_error",
                        "message": f"라우트 '{route_name}'에 연결된 모델 '{selected_model_id}'의 스트리밍 엔드포인트에 연결할 수 없습니다."
                    }
                }
                yield f"event: error\ndata: {json.dumps(err_event, ensure_ascii=False)}\n\n"

        stream_headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "x-agent-router-decision": routing_decision.policy_applied.value,
            "x-agent-complexity": routing_decision.complexity.value,
            "x-agent-route-tier": routing_decision.tier,
            "x-orche-upstream-cluster": target_cluster,
            **affinity_headers
        }
        return StreamingResponse(stream_generator(), media_type="text/event-stream", headers=stream_headers)

    client_timeout = httpx.Timeout(90.0, connect=5.0)
    async with httpx.AsyncClient(timeout=client_timeout) as client:
        for url in candidate_urls:
            try:
                res = await client.post(url, json=upstream_payload, headers=upstream_headers)
                if res.status_code == 200:
                    upstream_response_data = res.json()
                    # Ensure choices[0].message.content has fallback for reasoning models (e.g. Qwen reasoning / DeepSeek)
                    if upstream_response_data and "choices" in upstream_response_data:
                        choices = upstream_response_data.get("choices", [])
                        if choices and isinstance(choices, list):
                            first_choice = choices[0]
                            msg = first_choice.get("message", {})
                            if isinstance(msg, dict) and msg.get("content") is None:
                                reasoning = msg.get("reasoning") or msg.get("reasoning_content")
                                if reasoning:
                                    msg["content"] = reasoning
                    upstream_success = True
                    break
                else:
                    logger.warning(f"Upstream returned HTTP {res.status_code} for URL {url}: {res.text[:100]}")
            except Exception as e:
                logger.warning(f"Failed connecting to upstream candidate URL {url}: {type(e).__name__}({e})")
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

    # Determine tenant attribution hint
    policy_tenant_code = None
    if db_policy and db_policy.match_conditions and db_policy.match_conditions.get("tenant_codes"):
        policy_tenant_code = db_policy.match_conditions["tenant_codes"][0]
    target_tenant_hint = request.headers.get("x-orche-tenant") or policy_tenant_code

    # 5. Format Return Payload
    if upstream_success and upstream_response_data:
        usage_data = upstream_response_data.get("usage", {}) if isinstance(upstream_response_data, dict) else {}
        actual_prompt_toks = usage_data.get("prompt_tokens", prompt_toks)
        actual_compl_toks = usage_data.get("completion_tokens", compl_toks)
        actual_total_toks = usage_data.get("total_tokens", actual_prompt_toks + actual_compl_toks)

        finops_metering = record_token_and_cost_metering(
            db=db,
            matched_key=matched_key,
            model_entry=model_entry,
            prompt_tokens=actual_prompt_toks,
            completion_tokens=actual_compl_toks,
            target_tenant_hint=target_tenant_hint
        )

        upstream_response_data["orche_metadata"] = {
            "routed_by": "Envoy AI Gateway + AgentRouter",
            "route_name": route_name,
            "selected_model": selected_model_id,
            "serving_engine": serving_engine,
            "target_endpoint": target_endpoint,
            "auth_type": getattr(model_entry, 'auth_type', 'none'),
            "target_cluster": target_cluster,
            "latency_ms": latency_ms,
            "complexity": routing_decision.complexity.value,
            "tier": routing_decision.tier,
            "policy_applied": routing_decision.policy_applied.value,
            "reasons": routing_decision.reasons,
            "pii_filtered": len(detections) > 0,
            "status": "LIVE_UPSTREAM",
            "finops": finops_metering
        }
        if cacheable:
            semantic_cache.store(cache_scope, selected_model_id, upstream_messages, upstream_response_data)
        if response:
            response.headers["x-orche-semantic-cache"] = "MISS"

        # Anthropic Claude Code / SDK Dual-Compatibility
        if isinstance(upstream_response_data, dict):
            extracted_reply = ""
            raw_tool_calls = []
            if "choices" in upstream_response_data and isinstance(upstream_response_data["choices"], list):
                if upstream_response_data["choices"]:
                    first_msg = upstream_response_data["choices"][0].get("message", {})
                    extracted_reply = first_msg.get("content") or first_msg.get("reasoning") or first_msg.get("reasoning_content") or ""
                    raw_tool_calls = first_msg.get("tool_calls") or []
            elif "content" in upstream_response_data and isinstance(upstream_response_data["content"], str):
                extracted_reply = upstream_response_data["content"]

            if "type" not in upstream_response_data:
                upstream_response_data["type"] = "message"
            if "role" not in upstream_response_data:
                upstream_response_data["role"] = "assistant"

            if raw_tool_calls:
                content_blocks = []
                if extracted_reply:
                    content_blocks.append({"type": "text", "text": str(extracted_reply)})
                for tc in raw_tool_calls:
                    fn = tc.get("function", {})
                    tc_name = fn.get("name", "")
                    tc_args = fn.get("arguments", "{}")
                    try:
                        parsed_args = json.loads(tc_args) if isinstance(tc_args, str) else tc_args
                    except Exception:
                        parsed_args = {}
                    content_blocks.append({
                        "type": "tool_use",
                        "id": tc.get("id") or f"toolu_{uuid.uuid4().hex[:12]}",
                        "name": tc_name,
                        "input": parsed_args
                    })
                upstream_response_data["content"] = content_blocks
                upstream_response_data["stop_reason"] = "tool_use"
            else:
                if "content" not in upstream_response_data or isinstance(upstream_response_data.get("content"), str):
                    upstream_response_data["content"] = [{"type": "text", "text": str(extracted_reply)}]
                if "stop_reason" not in upstream_response_data:
                    upstream_response_data["stop_reason"] = "end_turn"

            if "stop_sequence" not in upstream_response_data:
                upstream_response_data["stop_sequence"] = None
            if "usage" in upstream_response_data and isinstance(upstream_response_data["usage"], dict):
                u = upstream_response_data["usage"]
                if "input_tokens" not in u:
                    u["input_tokens"] = u.get("prompt_tokens", actual_prompt_toks)
                if "output_tokens" not in u:
                    u["output_tokens"] = u.get("completion_tokens", actual_compl_toks)

        return upstream_response_data

    # Developer unit-test simulation check (only for local unit-testing with explicit test key)
    is_strict = request.headers.get("x-strict-upstream") == "true"
    is_dev_test = raw_auth and any(k in raw_auth for k in ["sk-ord-test-key-developer", "sk-ord-your-virtual-key"])

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
        sim_prompt_tokens = prompt_toks
        sim_compl_tokens = len(sample_text) // 4 + 10
        finops_metering = record_token_and_cost_metering(
            db=db,
            matched_key=matched_key,
            model_entry=model_entry,
            prompt_tokens=sim_prompt_tokens,
            completion_tokens=sim_compl_tokens,
            target_tenant_hint=target_tenant_hint
        )
        return {
            "id": resp_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": f"{route_name}:{selected_model_id}",
            # OpenAI 호환 필드
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
            # Anthropic Claude Code / SDK 호환 필드
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": sample_text
                }
            ],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {
                "prompt_tokens": sim_prompt_tokens,
                "completion_tokens": sim_compl_tokens,
                "total_tokens": sim_prompt_tokens + sim_compl_tokens,
                "input_tokens": sim_prompt_tokens,
                "output_tokens": sim_compl_tokens
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
                "note": "개발자 단위 테스트 모드",
                "finops": finops_metering
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
            "owned_by": "ordinatio-routing",
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

@router.post("/{custom_path:path}")
async def gateway_custom_path_ingress(
    custom_path: str,
    req: ChatCompletionRequest,
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """사용자 지정 라우트 경로 수신 엔드포인트: POST /v1/{custom_path}
    RoutingPolicy의 match_conditions['path_prefix']를 조회하여 일치하는 정책으로 자동 디스패치
    """
    matched_key = authenticate_gateway_key(authorization, x_virtual_key, db, request)

    clean_path = custom_path.strip("/")
    req_full_path = f"/v1/{clean_path}"

    # 1. 활성화된 RoutingPolicy 목록을 우선순위(priority 내림차순)로 검색
    policies = db.query(RoutingPolicy).filter(RoutingPolicy.is_active == True).order_by(RoutingPolicy.priority.desc()).all()

    matched_policy = None
    for p in policies:
        cond = p.match_conditions or {}
        prefix = cond.get("path_prefix")
        if prefix:
            prefix_clean = prefix.strip("/")
            if not prefix_clean.startswith("v1/"):
                prefix_clean = f"v1/{prefix_clean}" if not prefix_clean.startswith("v1") else prefix_clean
            expected_full = f"/{prefix_clean}"
            if req_full_path == expected_full or req_full_path.startswith(f"{expected_full}/"):
                matched_policy = p
                break

        # 라우트 이름 자체가 custom_path와 일치하는 경우도 지원
        if clean_path == p.route_name:
            matched_policy = p
            break

    if not matched_policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"요청 경로 '{req_full_path}'와 매칭되는 활성 라우팅 정책(path_prefix)을 찾을 수 없습니다."
        )

    return await dispatch_chat_completion(
        route_name=matched_policy.route_name,
        req=req,
        raw_auth=authorization or x_virtual_key,
        matched_key=matched_key,
        db=db,
        request=request,
        response=response
    )

