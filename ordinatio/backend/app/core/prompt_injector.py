import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.system_prompt import SystemPrompt

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
    """
    try:
        active_prompts = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).all()
        if not active_prompts:
            return None, None

        # Priority 1: Virtual Key Binding
        if key_id:
            for p in active_prompts:
                if p.target_type == "VIRTUAL_KEY" and p.target_id == key_id:
                    return p, "VIRTUAL_KEY"

        # Priority 2: Route Binding
        if route_name:
            for p in active_prompts:
                if p.target_type == "ROUTE" and p.target_id == route_name:
                    return p, "ROUTE"

        # Priority 3: Tenant Binding
        if tenant_id:
            for p in active_prompts:
                if p.target_type == "TENANT" and p.target_id == tenant_id:
                    return p, "TENANT"

        # Priority 4: Global Binding
        for p in active_prompts:
            if p.target_type == "GLOBAL":
                return p, "GLOBAL"

    except Exception as e:
        logger.warning(f"Error resolving system prompt: {e}")

    return None, None

def inject_system_prompt(
    messages: List[Dict[str, Any]],
    prompt: SystemPrompt
) -> List[Dict[str, Any]]:
    """
    주입 모드(PREPEND / OVERRIDE / FALLBACK_ONLY)에 따라 프롬프트를 메시지 목록에 합성합니다.
    """
    if not prompt or not prompt.content:
        return messages

    sys_content = prompt.content
    mode = prompt.injection_mode
    existing_sys_indices = [i for i, m in enumerate(messages) if m.get("role") == "system"]

    new_messages = [dict(m) for m in messages]

    if mode == "OVERRIDE":
        # 기존 system 메시지 전부 제거 후 신규 system 주입
        new_messages = [m for m in new_messages if m.get("role") != "system"]
        new_messages.insert(0, {"role": "system", "content": sys_content})
    elif mode == "FALLBACK_ONLY":
        # 기존 system 메시지가 없을 때만 선두에 추가
        if not existing_sys_indices:
            new_messages.insert(0, {"role": "system", "content": sys_content})
    else:  # PREPEND (기본 추천 전략)
        if existing_sys_indices:
            # 기존 system 메시지 앞에 사내 표준 규정을 결합
            first_idx = existing_sys_indices[0]
            orig_content = new_messages[first_idx].get("content", "")
            if isinstance(orig_content, list):
                new_messages[first_idx]["content"] = [{"type": "text", "text": f"{sys_content}\n\n"}] + list(orig_content)
            else:
                new_messages[first_idx]["content"] = f"{sys_content}\n\n{orig_content}"
        else:
            new_messages.insert(0, {"role": "system", "content": sys_content})

    return new_messages

def resolve_and_inject_system_prompt(
    db: Session,
    messages: List[Dict[str, Any]],
    key_id: Optional[str] = None,
    route_name: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Optional[SystemPrompt], Optional[str]]:
    """
    우선순위 해석 및 주입을 원스톱으로 처리하여 (최종 메시지, 적용된 프롬프트, 해석 소스)를 반환합니다.
    """
    prompt, resolved_by = resolve_system_prompt_for_context(
        db=db,
        key_id=key_id,
        route_name=route_name,
        tenant_id=tenant_id
    )

    if not prompt:
        return messages, None, None

    final_messages = inject_system_prompt(messages=messages, prompt=prompt)
    return final_messages, prompt, resolved_by
