"""
시스템 프롬프트 바인딩 참조 정합성 가드.

라우트 / 가상 API Key / 테넌트는 시스템 프롬프트의 1:1 바인딩 타겟이지만 DB 레벨 외래키가 없다.
가드 없이 타겟 자원을 삭제하면 프롬프트가 고아 상태로 남아 활성 상태인데도 영구히 매칭되지 않는
'좀비 프롬프트'가 되고, 운영자는 주입이 중단된 사실을 인지할 수 없다.

본 모듈은 `app/api/v1/endpoints/tenants.py` 의 '활성 가상키 잔존 시 400' 가드와 동일한 패턴으로
타겟 삭제 시점에 바인딩을 검사한다.
"""
import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.system_prompt import SystemPrompt

logger = logging.getLogger(__name__)

TARGET_TYPE_LABELS = {
    "ROUTE": "라우팅 정책",
    "VIRTUAL_KEY": "가상 API Key",
    "TENANT": "테넌트(부서)",
}


def find_bound_prompts(
    db: Session,
    target_type: str,
    target_id: Optional[str],
    active_only: bool = False
) -> List[SystemPrompt]:
    """지정한 타겟에 바인딩된 시스템 프롬프트 목록을 반환한다."""
    if not target_id:
        return []
    query = db.query(SystemPrompt).filter(
        SystemPrompt.target_type == target_type,
        SystemPrompt.target_id == target_id
    )
    if active_only:
        query = query.filter(SystemPrompt.is_active == True)
    return query.all()


def guard_bound_prompts(
    db: Session,
    target_type: str,
    target_id: Optional[str],
    force: bool = False,
    requester_id: str = "SYSTEM"
) -> List[str]:
    """
    타겟 삭제 전 바인딩 검사.

    - force=False: 바인딩된 프롬프트가 있으면 HTTP 400 으로 삭제를 차단한다.
    - force=True : 바인딩된 프롬프트를 비활성화(is_active=False)하여 주입을 중단시키고,
                   고아화 사실을 WORM 감사로그(PROMPT_ORPHANED)에 남긴 뒤 삭제를 허용한다.

    반환: 처리된 prompt_id 목록 (force=True 인 경우에만 비어있지 않음)
    """
    bound = find_bound_prompts(db, target_type, target_id)
    if not bound:
        return []

    label = TARGET_TYPE_LABELS.get(target_type, target_type)

    if not force:
        names = ", ".join(f"'{p.name}'({p.prompt_id})" for p in bound[:3])
        suffix = f" 외 {len(bound) - 3}건" if len(bound) > 3 else ""
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"해당 {label}에 바인딩된 시스템 프롬프트가 {len(bound)}건 존재하여 삭제할 수 없습니다: "
                f"{names}{suffix}. 시스템 프롬프트 거버넌스 메뉴에서 바인딩을 먼저 해제하거나, "
                f"force 옵션으로 강제 삭제하십시오."
            )
        )

    # 지연 임포트: 감사 로거는 엔드포인트 모듈에 있으며 순환 임포트를 피한다.
    from app.api.v1.endpoints.system_prompts import _record_prompt_audit_log

    orphaned_ids = []
    for p in bound:
        p.is_active = False
        orphaned_ids.append(p.prompt_id)
    db.commit()

    for p in bound:
        _record_prompt_audit_log(
            db=db,
            requester_id=requester_id,
            action="PROMPT_ORPHANED",
            prompt_id=p.prompt_id,
            details={
                "reason": f"{target_type} 타겟 강제 삭제로 바인딩이 해제되어 주입이 중단되었습니다.",
                "name": p.name,
                "target_type": target_type,
                "target_id": target_id,
                "injection_mode": p.injection_mode,
                "deactivated": True,
            },
            key_id=target_id if target_type == "VIRTUAL_KEY" else None,
        )

    logger.warning(
        f"{target_type} '{target_id}' 강제 삭제로 시스템 프롬프트 {len(orphaned_ids)}건이 비활성화되었습니다: {orphaned_ids}"
    )
    return orphaned_ids
