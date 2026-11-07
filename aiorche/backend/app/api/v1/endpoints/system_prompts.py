import uuid
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.system_prompt import SystemPrompt
from app.models.tenant import Tenant
from app.models.routing_policy import RoutingPolicy
from app.models.virtual_key import VirtualKey
from app.schemas.system_prompt import (
    SystemPromptCreate,
    SystemPromptUpdate,
    SystemPromptResponse,
    PromptResolveRequest,
    PromptResolveResponse
)
from app.api.deps import require_permission

router = APIRouter(prefix="/system-prompts", tags=["System Prompt Governance"])

def _estimate_tokens(text: str) -> int:
    """간이 토큰 추정치 산출기 (한글 2~3글자당 1토큰, 공백/영어 4글자당 1토큰)"""
    if not text:
        return 0
    return max(len(text) // 3, 1)

def _validate_and_enrich_target(
    target_type: str,
    target_id: Optional[str],
    db: Session
) -> Optional[str]:
    """바인딩 타겟 존재 여부 검증 및 표시 명칭(target_name) 반환"""
    if target_type == "GLOBAL":
        return "전사 공통 (Global)"

    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{target_type} 바인딩을 위해서는 target_id가 반드시 필요합니다."
        )

    if target_type == "ROUTE":
        route = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == target_id).first()
        if not route:
            # 정책 ID로 검색 fallback
            route = db.query(RoutingPolicy).filter(RoutingPolicy.policy_id == target_id).first()
        return route.route_name if route else f"라우트 ({target_id})"

    elif target_type == "VIRTUAL_KEY":
        vkey = db.query(VirtualKey).filter(VirtualKey.key_id == target_id).first()
        return f"{vkey.name} ({vkey.key_id})" if vkey else f"가상키 ({target_id})"

    elif target_type == "TENANT":
        t = db.query(Tenant).filter(Tenant.tenant_id == target_id).first()
        return f"{t.name} ({t.department_code})" if t else f"테넌트 ({target_id})"

    return target_id

@router.get("", response_model=List[SystemPromptResponse], dependencies=[Depends(require_permission("prompts:read"))])
def list_system_prompts(
    target_type: Optional[str] = Query(None, description="타겟 유형 필터링 (ROUTE, VIRTUAL_KEY, TENANT, GLOBAL)"),
    is_active: Optional[bool] = Query(None, description="활성화 여부 필터링"),
    search: Optional[str] = Query(None, description="프롬프트 명칭 검색어"),
    db: Session = Depends(get_db)
):
    """
    시스템 프롬프트 카탈로그 목록 조회
    """
    query = db.query(SystemPrompt)
    if target_type:
        query = query.filter(SystemPrompt.target_type == target_type)
    if is_active is not None:
        query = query.filter(SystemPrompt.is_active == is_active)
    if search:
        query = query.filter(SystemPrompt.name.ilike(f"%{search}%"))

    return query.order_by(SystemPrompt.created_at.desc()).all()

@router.post("", response_model=SystemPromptResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("prompts:write"))])
def create_system_prompt(
    payload: SystemPromptCreate,
    db: Session = Depends(get_db)
):
    """
    신규 시스템 프롬프트 등록 및 1:1 타겟 바인딩
    """
    prompt_id = payload.prompt_id or f"sp-{uuid.uuid4().hex[:8]}"

    # 중복 ID 검사
    existing = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"이미 존재하는 시스템 프롬프트 ID입니다: {prompt_id}"
        )

    # 타겟 검증 및 명칭 보강
    target_name = payload.target_name or _validate_and_enrich_target(payload.target_type, payload.target_id, db)
    token_count = _estimate_tokens(payload.content)

    new_prompt = SystemPrompt(
        prompt_id=prompt_id,
        name=payload.name,
        description=payload.description,
        content=payload.content,
        target_type=payload.target_type,
        target_id=payload.target_id if payload.target_type != "GLOBAL" else None,
        target_name=target_name,
        injection_mode=payload.injection_mode,
        estimated_tokens=token_count,
        is_active=payload.is_active
    )

    db.add(new_prompt)
    db.commit()
    db.refresh(new_prompt)
    return new_prompt

@router.get("/{prompt_id}", response_model=SystemPromptResponse, dependencies=[Depends(require_permission("prompts:read"))])
def get_system_prompt(
    prompt_id: str,
    db: Session = Depends(get_db)
):
    """
    특정 시스템 프롬프트 상세 조회
    """
    prompt = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"시스템 프롬프트를 찾을 수 없습니다: {prompt_id}"
        )
    return prompt

@router.put("/{prompt_id}", response_model=SystemPromptResponse, dependencies=[Depends(require_permission("prompts:write"))])
def update_system_prompt(
    prompt_id: str,
    payload: SystemPromptUpdate,
    db: Session = Depends(get_db)
):
    """
    시스템 프롬프트 정보 및 바인딩 타겟 수정
    """
    prompt = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"수정할 시스템 프롬프트를 찾을 수 없습니다: {prompt_id}"
        )

    if payload.name is not None:
        prompt.name = payload.name
    if payload.description is not None:
        prompt.description = payload.description
    if payload.content is not None:
        prompt.content = payload.content
        prompt.estimated_tokens = _estimate_tokens(payload.content)
    if payload.injection_mode is not None:
        prompt.injection_mode = payload.injection_mode
    if payload.is_active is not None:
        prompt.is_active = payload.is_active

    # 타겟 변경 시 검증
    if payload.target_type is not None:
        prompt.target_type = payload.target_type
        if payload.target_type == "GLOBAL":
            prompt.target_id = None
            prompt.target_name = "전사 공통 (Global)"
        else:
            t_id = payload.target_id if payload.target_id is not None else prompt.target_id
            prompt.target_id = t_id
            prompt.target_name = payload.target_name or _validate_and_enrich_target(payload.target_type, t_id, db)
    elif payload.target_id is not None and prompt.target_type != "GLOBAL":
        prompt.target_id = payload.target_id
        prompt.target_name = payload.target_name or _validate_and_enrich_target(prompt.target_type, payload.target_id, db)

    db.commit()
    db.refresh(prompt)
    return prompt

@router.delete("/{prompt_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(require_permission("prompts:write"))])
def delete_system_prompt(
    prompt_id: str,
    db: Session = Depends(get_db)
):
    """
    시스템 프롬프트 영구 삭제
    """
    prompt = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"삭제할 시스템 프롬프트를 찾을 수 없습니다: {prompt_id}"
        )

    db.delete(prompt)
    db.commit()
    return {"message": f"시스템 프롬프트 [{prompt_id}]가 성공적으로 삭제되었습니다.", "prompt_id": prompt_id}

@router.post("/resolve", response_model=PromptResolveResponse, dependencies=[Depends(require_permission("prompts:read"))])
def resolve_system_prompt(
    req: PromptResolveRequest,
    db: Session = Depends(get_db)
):
    """
    가상키/라우트/테넌트 컨텍스트 기반 우선순위 해석 및 최종 메시지 배열 합성 시뮬레이션
    우선순위: VIRTUAL_KEY > ROUTE > TENANT > GLOBAL
    """
    active_prompts = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).all()

    matched_prompt: Optional[SystemPrompt] = None
    resolved_by: Optional[str] = None

    # Priority 1: Virtual Key
    if req.key_id:
        for p in active_prompts:
            if p.target_type == "VIRTUAL_KEY" and p.target_id == req.key_id:
                matched_prompt = p
                resolved_by = "VIRTUAL_KEY"
                break

    # Priority 2: Route
    if not matched_prompt and req.route_name:
        for p in active_prompts:
            if p.target_type == "ROUTE" and p.target_id == req.route_name:
                matched_prompt = p
                resolved_by = "ROUTE"
                break

    # Priority 3: Tenant
    if not matched_prompt and req.tenant_id:
        for p in active_prompts:
            if p.target_type == "TENANT" and p.target_id == req.tenant_id:
                matched_prompt = p
                resolved_by = "TENANT"
                break

    # Priority 4: Global
    if not matched_prompt:
        for p in active_prompts:
            if p.target_type == "GLOBAL":
                matched_prompt = p
                resolved_by = "GLOBAL"
                break

    # 메시지 합성
    input_msgs = req.input_messages or [{"role": "user", "content": "안녕하세요. 모델 테스트입니다."}]
    final_msgs = [dict(m) for m in input_msgs]

    if not matched_prompt:
        return PromptResolveResponse(
            matched=False,
            resolved_by=None,
            matched_prompt=None,
            final_messages=final_msgs
        )

    sys_content = matched_prompt.content
    mode = matched_prompt.injection_mode
    existing_sys_indices = [i for i, m in enumerate(final_msgs) if m.get("role") == "system"]

    if mode == "OVERRIDE":
        final_msgs = [m for m in final_msgs if m.get("role") != "system"]
        final_msgs.insert(0, {"role": "system", "content": sys_content})
    elif mode == "FALLBACK_ONLY":
        if not existing_sys_indices:
            final_msgs.insert(0, {"role": "system", "content": sys_content})
    else:  # PREPEND
        if existing_sys_indices:
            first_idx = existing_sys_indices[0]
            orig_content = final_msgs[first_idx].get("content", "")
            final_msgs[first_idx]["content"] = f"{sys_content}\n\n{orig_content}"
        else:
            final_msgs.insert(0, {"role": "system", "content": sys_content})

    return PromptResolveResponse(
        matched=True,
        resolved_by=resolved_by,
        matched_prompt=SystemPromptResponse.model_validate(matched_prompt),
        final_messages=final_msgs
    )
