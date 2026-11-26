import logging
import datetime
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.system_prompt import SystemPrompt
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey

logger = logging.getLogger(__name__)

def resolve_system_prompt_for_context(
    db: Session,
    key_id: Optional[str] = None,
    route_name: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> Tuple[Optional[SystemPrompt], Optional[str]]:
    """
    위계적 우선순위에 따라 활성화된 시스템 프롬프트를 탐색합니다.
    우선순위: VIRTUAL_KEY (1순위) > ROUTE (2순위) > TENANT (3순위) > GLOBAL (4순위)
    key_id와 tenant_id는 별칭/코드(prefix, department_code) 역조회를 지원합니다.
    """
    try:
        active_prompts = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).all()
        if not active_prompts:
            return None, None

        # Priority 1: Virtual Key Binding
        if key_id:
            # 1-1. 직접 매칭
            for p in active_prompts:
                if p.target_type == "VIRTUAL_KEY" and p.target_id == key_id:
                    return p, "VIRTUAL_KEY"

            # 1-2. key_id가 prefix 또는 raw secret 형태로 전달된 경우 역조회
            vk_cand = db.query(VirtualKey).filter(
                (VirtualKey.key_id == key_id) | (VirtualKey.key_prefix == key_id[:16])
            ).first()
            if vk_cand:
                for p in active_prompts:
                    if p.target_type == "VIRTUAL_KEY" and p.target_id == vk_cand.key_id:
                        return p, "VIRTUAL_KEY"

        # Priority 2: Route Binding
        if route_name:
            for p in active_prompts:
                if p.target_type == "ROUTE" and p.target_id == route_name:
                    return p, "ROUTE"

        # Priority 3: Tenant Binding
        if tenant_id:
            # 3-1. 직접 매칭
            for p in active_prompts:
                if p.target_type == "TENANT" and p.target_id == tenant_id:
                    return p, "TENANT"

            # 3-2. tenant_id가 department_code("DEV", "FIN" 등)로 전달된 경우 역조회
            t_cand = db.query(Tenant).filter(
                (Tenant.tenant_id == tenant_id) | (Tenant.department_code == tenant_id)
            ).first()
            if t_cand:
                for p in active_prompts:
                    if p.target_type == "TENANT" and p.target_id == t_cand.tenant_id:
                        return p, "TENANT"

        # Priority 4: Global Binding
        for p in active_prompts:
            if p.target_type == "GLOBAL":
                return p, "GLOBAL"

    except Exception as e:
        logger.warning(f"Error resolving system prompt: {e}")

    return None, None

# 프롬프트 본문에서 사용 가능한 동적 템플릿 변수의 단일 진실 공급원.
# render_prompt_variables()가 이 정의를 그대로 소비하고, GET /system-prompts/variables 가
# 동일 정의를 UI에 노출하므로 양쪽이 구조적으로 드리프트할 수 없다.
SUPPORTED_PROMPT_VARIABLES: Dict[str, Dict[str, str]] = {
    "date": {"description": "요청 시점의 날짜 (YYYY-MM-DD)", "example": "2026-11-26"},
    "current_date": {"description": "요청 시점의 날짜 ({{date}}와 동일)", "example": "2026-11-26"},
    "datetime": {"description": "요청 시점의 날짜와 시각", "example": "2026-11-26 14:05:30"},
    "route_name": {"description": "호출된 라우팅 정책 명칭", "example": "code-copilot-v2"},
    "tenant_id": {"description": "호출자 소속 테넌트 식별자", "example": "dept-wm"},
    "tenant_name": {"description": "호출자 소속 부서명", "example": "자산관리(WM)혁신부"},
    "key_id": {"description": "호출에 사용된 가상 API Key 식별자", "example": "vk-finance-01"},
}


def render_prompt_variables(
    content: str,
    context: Optional[Dict[str, Any]] = None
) -> Tuple[str, Dict[str, str]]:
    """
    동적 템플릿 변수 치환기 (지원 변수는 SUPPORTED_PROMPT_VARIABLES 참조)
    반환: (치환된_텍스트, 적용된_변수_딕셔너리)
    """
    if not content:
        return "", {}
    if not context:
        context = {}

    now = datetime.datetime.now()
    now_str = now.strftime("%Y-%m-%d")
    now_time_str = now.strftime("%Y-%m-%d %H:%M:%S")

    values = {
        "date": now_str,
        "current_date": now_str,
        "datetime": now_time_str,
        "route_name": str(context.get("route_name") or ""),
        "tenant_id": str(context.get("tenant_id") or ""),
        "tenant_name": str(context.get("tenant_name") or ""),
        "key_id": str(context.get("key_id") or ""),
    }
    # SUPPORTED_PROMPT_VARIABLES 에 선언된 변수만 치환 대상이 된다.
    replacements = {f"{{{{{name}}}}}": values[name] for name in SUPPORTED_PROMPT_VARIABLES if name in values}

    rendered = content
    applied_vars = {}
    for placeholder, val in replacements.items():
        if placeholder in rendered:
            rendered = rendered.replace(placeholder, val)
            applied_vars[placeholder] = val
    return rendered, applied_vars

SYS_ROLES = {"system", "developer"}

def _calc_raw_tokens(msgs: List[Dict[str, Any]]) -> int:
    total = 0
    for m in msgs:
        c = m.get("content", "")
        if isinstance(c, str):
            total += max(1, len(c) // 3)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and "text" in part:
                    total += max(1, len(str(part.get("text", ""))) // 3)
    return total

def inject_system_prompt(
    messages: List[Dict[str, Any]],
    prompt: SystemPrompt,
    context: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    주입 모드(PREPEND / OVERRIDE / FALLBACK_ONLY), 최신 OpenAI 추론 모델 규격(role: developer)
    및 동적 템플릿 변수에 따라 프롬프트를 메시지 목록에 합성합니다.
    """
    if not prompt or not prompt.content:
        return messages

    sys_content, _ = render_prompt_variables(prompt.content, context)
    mode = prompt.injection_mode
    existing_sys_indices = [i for i, m in enumerate(messages) if m.get("role") in SYS_ROLES]

    new_messages = [dict(m) for m in messages]

    if mode == "OVERRIDE":
        # 기존 system 및 developer 메시지 전부 제거 후 신규 system 주입
        new_messages = [m for m in new_messages if m.get("role") not in SYS_ROLES]
        new_messages.insert(0, {"role": "system", "content": sys_content})
    elif mode == "FALLBACK_ONLY":
        # 기존 system 또는 developer 메시지가 없을 때만 선두에 추가
        if not existing_sys_indices:
            new_messages.insert(0, {"role": "system", "content": sys_content})
    else:  # PREPEND (기본 추천 전략)
        if existing_sys_indices:
            # 기존 첫 번째 system/developer 메시지 앞에 사내 표준 규정을 결합
            first_idx = existing_sys_indices[0]
            orig_content = new_messages[first_idx].get("content", "")
            if isinstance(orig_content, list):
                new_messages[first_idx]["content"] = [{"type": "text", "text": f"{sys_content}\n\n"}] + list(orig_content)
            else:
                new_messages[first_idx]["content"] = f"{sys_content}\n\n{orig_content}"
        else:
            new_messages.insert(0, {"role": "system", "content": sys_content})

    return new_messages

class ResolveResult(tuple):
    """
    3-요소 튜플 (messages, prompt, resolved_by)과 100% 하위 호환되며,
    applied_variables와 token_delta 속성을 제공하는 결과 컨테이너
    """
    def __new__(cls, messages, prompt, resolved_by, applied_variables=None, token_delta=0):
        return super().__new__(cls, (messages, prompt, resolved_by))

    def __init__(self, messages, prompt, resolved_by, applied_variables=None, token_delta=0):
        self.messages = messages
        self.prompt = prompt
        self.resolved_by = resolved_by
        self.applied_variables = applied_variables or {}
        self.token_delta = token_delta

def resolve_and_inject_system_prompt(
    db: Session,
    messages: List[Dict[str, Any]],
    key_id: Optional[str] = None,
    route_name: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> ResolveResult:
    """
    우선순위 해석 및 동적 변수 주입을 원스톱으로 처리하여 (최종 메시지, 적용된 프롬프트, 해석 소스)를 반환합니다.
    """
    prompt, resolved_by = resolve_system_prompt_for_context(
        db=db,
        key_id=key_id,
        route_name=route_name,
        tenant_id=tenant_id
    )

    if not prompt:
        return ResolveResult(messages, None, None, {}, 0)

    # Context enrichment for template variables
    tenant_name = None
    if tenant_id:
        t = db.query(Tenant).filter((Tenant.tenant_id == tenant_id) | (Tenant.department_code == tenant_id)).first()
        if t:
            tenant_name = t.name

    context = {
        "key_id": key_id,
        "route_name": route_name,
        "tenant_id": tenant_id,
        "tenant_name": tenant_name
    }

    _, applied_vars = render_prompt_variables(prompt.content, context)
    tokens_before = _calc_raw_tokens(messages)
    final_messages = inject_system_prompt(messages=messages, prompt=prompt, context=context)
    tokens_after = _calc_raw_tokens(final_messages)
    token_delta = max(0, tokens_after - tokens_before)

    return ResolveResult(final_messages, prompt, resolved_by, applied_vars, token_delta)
