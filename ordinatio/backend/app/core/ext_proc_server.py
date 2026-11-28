"""Envoy ext_proc 어댑터 — 라우팅 · 쿼터 · 프롬프트 주입 전용 (ADR-17)

적용 범위 (Scope Invariant):
    본 모듈은 **PII 탐지·마스킹을 수행하지 않는다.** ADR-17에 따라 인라인 가드레일
    (PII 마스킹 + WORM 감사)은 Python 제어 평면 게이트웨이
    ``api/v1/endpoints/gateway.py::dispatch_chat_completion``에 통합되어 있으며,
    업스트림 추론 호출은 전부 그 경로를 통과한다.

    현재 배포 구성(``deploy/envoy/envoy-ai-gateway.yaml``)에서 Envoy는 평문
    ``router`` 필터만 사용하는 역방향 프록시이며 ``ext_proc`` HTTP 필터는
    비활성(주석) 상태다. 따라서 모델에 도달하는 모든 트래픽은 마스킹을 거친다.

경고:
    Envoy ``ext_proc`` 필터를 활성화하여 이 어댑터가 추론 트래픽을 직접
    인터셉트·전달하게 만드는 경우, **마스킹을 우회하는 경로가 생긴다.**
    그 시점에는 ``PiiEngine.mask_conversation()`` 호출과 BLOCK 시 REJECT 처리,
    ``record_pii_audit()`` 기록을 본 모듈에 반드시 추가해야 한다.
"""
import time
import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from app.core.agent_router import (
    AgentRouter,
    classify_prompt,
    SessionAffinityManager
)
from app.core.token_limiter import token_rate_limiter

logger = logging.getLogger(__name__)

class ExtProcHeader(BaseModel):
    key: str
    value: str

class ExtProcRequest(BaseModel):
    headers: Dict[str, str] = Field(default_factory=dict)
    body: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None

class ExtProcResponse(BaseModel):
    status: str = "CONTINUE"            # CONTINUE, OVERRIDE, REJECT
    status_code: int = 200
    headers_to_add: Dict[str, str] = Field(default_factory=dict)
    body_override: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None

class ExtProcessorService:
    """
    Envoy AI Gateway External Processor (ext_proc) Core Adapter.
    Intercepts L7 HTTP/gRPC streams, enforces token quotas, executes AgentRouter,
    and returns routing headers to Envoy for low-latency upstream forwarding.
    """

    def __init__(self):
        self.router = AgentRouter()
        self.affinity = SessionAffinityManager()

    def process_request(
        self,
        headers: Dict[str, str],
        body: Optional[Dict[str, Any]],
        tpm_limit: int = 200000,
        budget_spent_ratio: float = 0.0
    ) -> ExtProcResponse:
        start_time = time.perf_counter()

        # 1. Virtual Key Extraction & Prefix
        auth_header = headers.get("authorization", "")
        raw_key = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else headers.get("x-virtual-key", "")
        key_id = raw_key[:16] if raw_key else "anonymous-dev-key"

        # 2. Extract messages from payload
        messages = []
        tools = None
        requested_model = None
        if body and isinstance(body, dict):
            messages = body.get("messages", [])
            tools = body.get("tools") or body.get("functions")
            requested_model = body.get("model")

        # 3. Classify Prompt with AgentRouter
        classification = classify_prompt(messages=messages, tools=tools)

        # 4. Token Rate Limit Check (TPM)
        estimated_tokens = max(classification.estimated_tokens, 10)
        is_allowed, current_usage, remaining = token_rate_limiter.check_and_consume(
            key_id=key_id,
            requested_tokens=estimated_tokens,
            tpm_limit=tpm_limit
        )

        if not is_allowed:
            logger.warning(f"ext_proc: TPM quota exceeded for key {key_id}. Usage: {current_usage}, Limit: {tpm_limit}")
            return ExtProcResponse(
                status="REJECT",
                status_code=429,
                headers_to_add={"retry-after": "5"},
                reason=f"TPM (Tokens Per Minute) limit exceeded ({current_usage}/{tpm_limit}). Please wait."
            )

        # 5. Determine Route via Policy Engine
        decision = self.router.evaluate_route(
            classification=classification,
            tenant_budget_spent_ratio=budget_spent_ratio,
            explicit_model_request=requested_model
        )

        # 6. Session Affinity Headers
        session_id = headers.get("x-session-id")
        affinity_headers = self.affinity.get_affinity_headers(session_id=session_id)

        # 7. System Prompt Governance Auto-Injection (Phase 3)
        body_override = None
        prompt_meta_headers = {}
        route_name = headers.get("x-orche-route") or headers.get("x-route-name")
        tenant_id = headers.get("x-orche-tenant") or headers.get("x-tenant-id")

        try:
            from app.db.session import SessionLocal
            from app.core.prompt_injector import resolve_and_inject_system_prompt
            from app.models.virtual_key import VirtualKey
            with SessionLocal() as db:
                # Resolve real VirtualKey entity and tenant context
                real_key_id = None
                real_tenant_id = tenant_id
                if raw_key:
                    if raw_key.startswith("vk-"):
                        real_key_id = raw_key
                        vk_obj = db.query(VirtualKey).filter(VirtualKey.key_id == raw_key).first()
                        if vk_obj and not real_tenant_id:
                            real_tenant_id = vk_obj.tenant_id
                    else:
                        prefix = raw_key[:16]
                        candidates = db.query(VirtualKey).filter(VirtualKey.key_prefix == prefix).all()
                        for cand in candidates:
                            from app.core.security import verify_virtual_key
                            if verify_virtual_key(raw_key, cand.key_hash):
                                real_key_id = cand.key_id
                                if not real_tenant_id:
                                    real_tenant_id = cand.tenant_id
                                break
                        if not real_key_id and candidates:
                            real_key_id = candidates[0].key_id
                            if not real_tenant_id:
                                real_tenant_id = candidates[0].tenant_id

                injected_messages, matched_p, resolved_by = resolve_and_inject_system_prompt(
                    db=db,
                    messages=messages,
                    key_id=real_key_id or key_id,
                    route_name=route_name,
                    tenant_id=real_tenant_id
                )
                if matched_p and body and isinstance(body, dict):
                    body_override = dict(body)
                    body_override["messages"] = injected_messages
                    prompt_meta_headers["x-orche-prompt-injected"] = matched_p.prompt_id
                    prompt_meta_headers["x-orche-prompt-target"] = resolved_by or "NONE"
                    prompt_meta_headers["x-orche-prompt-mode"] = matched_p.injection_mode
        except Exception as pe:
            logger.debug(f"ext_proc prompt injection skipped: {pe}")

        duration_ms = (time.perf_counter() - start_time) * 1000.0

        headers_to_add = {
            "x-orche-upstream-cluster": decision.target_cluster,
            "x-orche-selected-model": decision.selected_model,
            "x-agent-complexity": decision.complexity.value,
            "x-agent-route-tier": decision.tier,
            "x-agent-router-decision": decision.policy_applied.value,
            "x-agent-proc-time-ms": f"{duration_ms:.2f}",
            "x-ratelimit-remaining-tokens": str(remaining),
            **affinity_headers,
            **prompt_meta_headers
        }

        return ExtProcResponse(
            status="CONTINUE",
            status_code=200,
            headers_to_add=headers_to_add,
            body_override=body_override,
            reason=f"Routed to {decision.selected_model} via {decision.policy_applied.value}"
        )

ext_processor = ExtProcessorService()
