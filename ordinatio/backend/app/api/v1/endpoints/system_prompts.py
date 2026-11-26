import uuid
import hashlib
import json
import logging
import time
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.db.session import get_db
from app.models.system_prompt import SystemPrompt
from app.models.system_prompt_version import SystemPromptVersion
from app.models.tenant import Tenant
from app.models.routing_policy import RoutingPolicy
from app.models.virtual_key import VirtualKey
from app.models.audit_log import AuditLog
from app.core.worm_storage import WormStorage
from app.schemas.system_prompt import (
    SystemPromptCreate,
    SystemPromptUpdate,
    SystemPromptResponse,
    SystemPromptVersionResponse,
    SystemPromptStatsResponse,
    PromptVariableInfo,
    PromptResolveRequest,
    PromptResolveResponse
)
from app.api.deps import require_permission, get_current_user

router = APIRouter(prefix="/system-prompts", tags=["System Prompt Governance"])

def _is_cjk(code: int) -> bool:
    """CJK Unified Ideographs & Hangul Syllables / Kana"""
    return (0xAC00 <= code <= 0xD7A3) or (0x4E00 <= code <= 0x9FFF) or (0x3040 <= code <= 0x30FF)


def _estimate_tokens(text: str) -> int:
    """
    정밀 토큰 추정치 산출기:
    CJK(한중일 문자)는 평균 1.5~2 글자당 1토큰,
    영단어 및 공백은 공백/구두점 기준 분할 단어당 ~1.3토큰으로 가중 계산

    중요: 프론트엔드 에디터의 calculateEstimatedTokens()(SystemPromptsTab.jsx)와 반드시 동일한
    결과를 내야 한다. 그렇지 않으면 작성 중 표시되는 "예상 토큰"과 저장된 estimated_tokens 가
    어긋난다. CJK 문자는 '제거'가 아니라 '공백으로 치환'해야 하며(제거하면 CJK로 분리된 영단어가
    하나로 붙어 단어 수가 줄어든다), 동일 벡터로 양측을 비교하는 검증이
    scripts/verify-phase-system-prompt.sh [5/5] 단계에 포함되어 있다.
    """
    if not text:
        return 0
    cjk_count = 0
    other_count = 0
    spaced_chars = []
    for ch in text:
        if _is_cjk(ord(ch)):
            cjk_count += 1
            spaced_chars.append(" ")
        else:
            other_count += 1
            spaced_chars.append(ch)

    words = "".join(spaced_chars).split()
    other_tokens = int(len(words) * 1.3) + (other_count - len("".join(words))) // 4
    cjk_tokens = int(cjk_count * 1.5)
    return max(1, cjk_tokens + other_tokens)

def _record_prompt_audit_log(
    db: Session,
    requester_id: str,
    action: str,
    prompt_id: str,
    details: dict,
    key_id: Optional[str] = None,
    model_id: Optional[str] = None
) -> bool:
    """
    시스템 프롬프트 거버넌스 라이프사이클 변경 WORM 감사 로그 및 DB AuditLog 불변 보관.
    기록 성공 시 True, 실패 시 False(주 트랜잭션은 중단하지 않되 ERROR 로깅 및 응답 헤더로 노출).
    """
    try:
        t0 = time.time()
        log_id = f"audit-prompt-{int(t0 * 1000)}-{uuid.uuid4().hex[:6]}"
        details_str = json.dumps(details, ensure_ascii=False)
        payload_hash = hashlib.sha256(details_str.encode("utf-8")).hexdigest()
        elapsed_latency_ms = round((time.time() - t0) * 1000, 2)

        worm_ref = WormStorage.record_audit_log(
            log_id=log_id,
            requester_id=requester_id,
            key_id=key_id,
            model_id=model_id,
            original_prompt_hash=payload_hash,
            masked_payload_hash=payload_hash,
            detections=[{"prompt_governance_action": action, "prompt_id": prompt_id, "details": details}],
            pii_count=0,
            action_taken=action,
            latency_ms=elapsed_latency_ms,
            is_blocked=False,
        )

        audit_entry = AuditLog(
            log_id=log_id,
            requester_id=requester_id,
            key_id=key_id,
            model_id=model_id,
            original_prompt_hash=payload_hash,
            masked_payload_hash=payload_hash,
            detections_json=details_str,
            pii_count=0,
            action_taken=action,
            latency_ms=elapsed_latency_ms,
            is_blocked=False,
            worm_reference_id=worm_ref
        )
        db.add(audit_entry)
        db.commit()
        return True
    except Exception as e:
        # 감사 로그 실패가 주 트랜잭션을 중단시키지는 않지만, 규제 대응을 위해 반드시 추적 가능해야 한다.
        try:
            db.rollback()
        except Exception:
            pass
        logger.error(
            f"시스템 프롬프트 감사로그 기록 실패 (action={action}, prompt_id={prompt_id}, requester={requester_id}): {e}",
            exc_info=True
        )
        return False

def _record_prompt_version(
    db: Session,
    prompt: SystemPrompt,
    change_kind: str,
    changed_by: str,
    change_summary: Optional[str] = None
) -> None:
    """
    현재 프롬프트 상태를 이력 테이블에 append-only 스냅샷으로 기록한다.
    이력 기록 실패가 주 트랜잭션을 되돌리지는 않되, 반드시 추적 가능해야 한다.
    """
    try:
        snapshot = SystemPromptVersion(
            prompt_id=prompt.prompt_id,
            version=prompt.version or 1,
            name=prompt.name,
            description=prompt.description,
            content=prompt.content,
            target_type=prompt.target_type,
            target_id=prompt.target_id,
            target_name=prompt.target_name,
            injection_mode=prompt.injection_mode,
            category=getattr(prompt, "category", None),
            estimated_tokens=prompt.estimated_tokens or 0,
            is_active=prompt.is_active,
            content_hash=hashlib.sha256(prompt.content.encode("utf-8")).hexdigest(),
            change_kind=change_kind,
            change_summary=change_summary,
            changed_by=changed_by or "SYSTEM",
        )
        db.add(snapshot)
        db.commit()
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        logger.error(
            f"시스템 프롬프트 버전 이력 기록 실패 (prompt_id={prompt.prompt_id}, change_kind={change_kind}): {e}",
            exc_info=True
        )


def _summarize_changes(prev: Dict[str, Any], prompt: SystemPrompt) -> Optional[str]:
    """이력 목록에 표시할 사람이 읽을 수 있는 변경 요약 생성"""
    labels = {
        "name": "명칭",
        "description": "설명",
        "content_hash": "본문",
        "target_type": "타겟 유형",
        "target_id": "타겟 대상",
        "injection_mode": "주입 모드",
        "is_active": "활성 여부",
    }
    current = {
        "name": prompt.name,
        "description": prompt.description,
        "content_hash": hashlib.sha256(prompt.content.encode("utf-8")).hexdigest(),
        "target_type": prompt.target_type,
        "target_id": prompt.target_id,
        "injection_mode": prompt.injection_mode,
        "is_active": prompt.is_active,
    }
    changed = [labels[k] for k in labels if prev.get(k) != current.get(k)]
    if not changed:
        return None
    return ", ".join(changed) + " 변경"


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
            route = db.query(RoutingPolicy).filter(RoutingPolicy.policy_id == target_id).first()
        if not route:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"지정된 라우트 '{target_id}'가 존재하지 않습니다."
            )
        return route.route_name

    elif target_type == "VIRTUAL_KEY":
        vkey = db.query(VirtualKey).filter(VirtualKey.key_id == target_id).first()
        if not vkey:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"지정된 가상 API Key '{target_id}'가 존재하지 않습니다."
            )
        return f"{vkey.name} ({vkey.key_id})"

    elif target_type == "TENANT":
        t = db.query(Tenant).filter(Tenant.tenant_id == target_id).first()
        if not t:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"지정된 부서(테넌트) '{target_id}'가 존재하지 않습니다."
            )
        return f"{t.name} ({t.department_code})"

    return target_id

from app.core.prompt_injector import resolve_and_inject_system_prompt

@router.get("", response_model=List[SystemPromptResponse], dependencies=[Depends(require_permission("prompts:read"))])
def list_system_prompts(
    response: Response,
    target_type: Optional[str] = Query(None, description="타겟 유형 필터링 (ROUTE, VIRTUAL_KEY, TENANT, GLOBAL)"),
    is_active: Optional[bool] = Query(None, description="활성화 여부 필터링"),
    search: Optional[str] = Query(None, description="프롬프트 명칭 검색어"),
    offset: int = Query(0, ge=0, description="페이지네이션 오프셋"),
    limit: int = Query(100, ge=1, le=500, description="페이지당 반환 항목 수"),
    db: Session = Depends(get_db)
):
    """
    시스템 프롬프트 카탈로그 목록 조회 (서버사이드 페이지네이션 및 실시간 타겟 명칭 최신 동기화)
    """
    query = db.query(SystemPrompt)
    if target_type:
        query = query.filter(SystemPrompt.target_type == target_type)
    if is_active is not None:
        query = query.filter(SystemPrompt.is_active == is_active)
    if search:
        from sqlalchemy import or_
        query = query.filter(
            or_(
                SystemPrompt.name.ilike(f"%{search}%"),
                SystemPrompt.description.ilike(f"%{search}%"),
                SystemPrompt.content.ilike(f"%{search}%"),
                SystemPrompt.target_name.ilike(f"%{search}%"),
                SystemPrompt.target_id.ilike(f"%{search}%")
            )
        )

    total_count = query.count()
    response.headers["X-Total-Count"] = str(total_count)

    prompts = query.order_by(SystemPrompt.created_at.desc()).offset(offset).limit(limit).all()

    # 실시간 최신 target_name 동기화
    # 변경분은 DB에 반영한다. 그렇지 않으면 서버사이드 search가 낡은 target_name 컬럼을 조회해
    # 화면에는 새 이름이 보이는데 검색에서는 누락되는 불일치가 발생한다.
    # 1차 패스: 유효한 타겟의 명칭 변경분만 영속화
    orphaned = []
    needs_commit = False
    for p in prompts:
        try:
            latest_name = _validate_and_enrich_target(p.target_type, p.target_id, db)
            if latest_name and latest_name != p.target_name:
                p.target_name = latest_name
                needs_commit = True
        except Exception:
            orphaned.append(p)

    if needs_commit:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning(f"target_name 캐시 동기화 커밋 실패: {e}")

    # 2차 패스: 삭제된 타겟 라벨은 표시 전용이며 영속하지 않는다.
    # (자원이 복구되면 다음 조회에서 자동으로 정상 명칭으로 돌아오도록)
    for p in orphaned:
        if p.target_type != "GLOBAL" and "[삭제된 자원]" not in (p.target_name or ""):
            p.target_name = f"{p.target_name or p.target_id} [삭제된 자원]"

    return prompts

@router.post("", response_model=SystemPromptResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("prompts:write"))])
def create_system_prompt(
    payload: SystemPromptCreate,
    response: Response,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    신규 시스템 프롬프트 등록 및 1:1 타겟 바인딩 (동일 타겟/GLOBAL 중복 활성화 방지 및 WORM 감사로그 기록)
    """
    prompt_id = payload.prompt_id or f"sp-{uuid.uuid4().hex[:8]}"

    # 중복 ID 검사
    existing = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"이미 존재하는 시스템 프롬프트 ID입니다: {prompt_id}"
        )

    # 타겟 존재 검증 및 명칭 보강
    # target_name은 UI 렌더링용 서버 파생 캐시이므로, 클라이언트 입력으로 타겟 존재 검증을 우회할 수 없다.
    target_name = _validate_and_enrich_target(payload.target_type, payload.target_id, db)
    token_count = _estimate_tokens(payload.content)

    # ROUTE 타입인 경우 target_id를 정규화된 라우트 명칭으로 보정
    effective_target_id = payload.target_id
    if payload.target_type == "ROUTE" and target_name:
        effective_target_id = target_name
    elif payload.target_type == "GLOBAL":
        effective_target_id = None

    # 동일 타겟 중복 활성화 방지 검증 (정규화된 effective_target_id 기준)
    if payload.is_active:
        if payload.target_type == "GLOBAL":
            duplicate_global = db.query(SystemPrompt).filter(
                SystemPrompt.target_type == "GLOBAL",
                SystemPrompt.is_active == True
            ).first()
            if duplicate_global:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"이미 활성화된 전사 공통(GLOBAL) 시스템 프롬프트 '{duplicate_global.name}'({duplicate_global.prompt_id})가 존재합니다. 기존 프롬프트를 비활성화하거나 수정한 후 다시 등록하십시오."
                )
        else:
            duplicate = db.query(SystemPrompt).filter(
                SystemPrompt.target_type == payload.target_type,
                SystemPrompt.target_id == effective_target_id,
                SystemPrompt.is_active == True
            ).first()
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"해당 {payload.target_type} 대상({effective_target_id})에 이미 활성화된 시스템 프롬프트 '{duplicate.name}'({duplicate.prompt_id})가 존재합니다."
                )

    new_prompt = SystemPrompt(
        prompt_id=prompt_id,
        name=payload.name,
        description=payload.description,
        content=payload.content,
        target_type=payload.target_type,
        target_id=effective_target_id,
        target_name=target_name,
        injection_mode=payload.injection_mode,
        category=payload.category,
        estimated_tokens=token_count,
        version=1,
        is_active=payload.is_active
    )

    db.add(new_prompt)
    db.commit()
    db.refresh(new_prompt)

    # WORM 감사로그 기록
    requester = getattr(current_user, "username", "SYSTEM_PROMPT_ADMIN")
    _record_prompt_version(db, new_prompt, "CREATE", requester, "최초 등록")
    content_hash = hashlib.sha256(new_prompt.content.encode("utf-8")).hexdigest()
    audit_ok = _record_prompt_audit_log(
        db=db,
        requester_id=requester,
        action="PROMPT_CREATED",
        prompt_id=new_prompt.prompt_id,
        details={
            "name": new_prompt.name,
            "target_type": new_prompt.target_type,
            "target_id": new_prompt.target_id,
            "injection_mode": new_prompt.injection_mode,
            "estimated_tokens": new_prompt.estimated_tokens,
            "content_hash": content_hash,
            "version": new_prompt.version,
            "is_active": new_prompt.is_active
        },
        key_id=new_prompt.target_id if new_prompt.target_type == "VIRTUAL_KEY" else None,
        model_id=new_prompt.target_name if new_prompt.target_type == "ROUTE" else None
    )

    # 감사 기록이 실패해도 주 트랜잭션은 성공하므로, 운영에서 탐지 가능하도록 헤더로 노출한다
    if not audit_ok:
        response.headers["x-orche-audit-degraded"] = "true"

    return new_prompt

@router.get("/stats", response_model=SystemPromptStatsResponse, dependencies=[Depends(require_permission("prompts:read"))])
def get_system_prompt_stats(db: Session = Depends(get_db)):
    """
    KPI 카드용 전사 집계 조회.
    목록이 서버사이드 페이지네이션으로 제공되므로, 전체 통계는 본 엔드포인트로 분리한다.
    (경로 선언 순서 주의: '/{prompt_id}' 보다 반드시 먼저 선언되어야 한다)
    """
    from sqlalchemy import func as sa_func

    total = db.query(SystemPrompt).count()
    active = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).count()

    by_type = {"ROUTE": 0, "VIRTUAL_KEY": 0, "TENANT": 0, "GLOBAL": 0}
    rows = db.query(SystemPrompt.target_type, sa_func.count(SystemPrompt.prompt_id)).group_by(SystemPrompt.target_type).all()
    for target_type, cnt in rows:
        by_type[target_type] = cnt

    return SystemPromptStatsResponse(total=total, active=active, by_target_type=by_type)


@router.get("/variables", response_model=List[PromptVariableInfo], dependencies=[Depends(require_permission("prompts:read"))])
def list_prompt_variables():
    """
    프롬프트 본문에서 사용 가능한 동적 템플릿 변수 목록.
    주입 엔진의 단일 진실 공급원(SUPPORTED_PROMPT_VARIABLES)을 그대로 노출하여
    프론트엔드 하드코딩에 의한 명세-구현 드리프트를 방지한다.
    (경로 선언 순서 주의: '/{prompt_id}' 보다 반드시 먼저 선언되어야 한다)
    """
    from app.core.prompt_injector import SUPPORTED_PROMPT_VARIABLES

    return [
        PromptVariableInfo(
            name=name,
            placeholder=f"{{{{{name}}}}}",
            description=meta["description"],
            example=meta.get("example", "")
        )
        for name, meta in SUPPORTED_PROMPT_VARIABLES.items()
    ]


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
    response: Response,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    시스템 프롬프트 정보 및 바인딩 타겟 수정 (동일 타겟 중복 검증 및 WORM 감사로그 기록)
    """
    prompt = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"수정할 시스템 프롬프트를 찾을 수 없습니다: {prompt_id}"
        )

    # 변경 대상 타겟 및 활성화 여부 계산
    new_target_type = payload.target_type if payload.target_type is not None else prompt.target_type
    new_is_active = payload.is_active if payload.is_active is not None else prompt.is_active
    target_changed = payload.target_type is not None or payload.target_id is not None

    # 타겟 존재 검증 및 정규화 (target_name 입력으로 검증을 우회할 수 없다)
    if new_target_type == "GLOBAL":
        new_target_id = None
        new_target_name = "전사 공통 (Global)"
    else:
        candidate_target_id = payload.target_id if payload.target_id is not None else prompt.target_id
        if target_changed:
            new_target_name = _validate_and_enrich_target(new_target_type, candidate_target_id, db)
            # ROUTE는 정규화된 라우트 명칭을 target_id로 보관한다
            new_target_id = new_target_name if new_target_type == "ROUTE" else candidate_target_id
        else:
            # 타겟 변경이 없는 수정(본문/모드/활성여부)에서는 기존 바인딩을 그대로 유지한다
            new_target_id = prompt.target_id
            new_target_name = prompt.target_name

    # 동일 타겟 중복 활성화 방지 검증 (본인 제외, 정규화된 target_id 기준)
    if new_is_active:
        if new_target_type == "GLOBAL":
            duplicate_global = db.query(SystemPrompt).filter(
                SystemPrompt.target_type == "GLOBAL",
                SystemPrompt.is_active == True,
                SystemPrompt.prompt_id != prompt_id
            ).first()
            if duplicate_global:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"이미 활성화된 다른 전사 공통(GLOBAL) 시스템 프롬프트 '{duplicate_global.name}'({duplicate_global.prompt_id})가 존재합니다."
                )
        elif new_target_id:
            duplicate = db.query(SystemPrompt).filter(
                SystemPrompt.target_type == new_target_type,
                SystemPrompt.target_id == new_target_id,
                SystemPrompt.is_active == True,
                SystemPrompt.prompt_id != prompt_id
            ).first()
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"해당 {new_target_type} 대상({new_target_id})에 이미 활성화된 다른 시스템 프롬프트 '{duplicate.name}'({duplicate.prompt_id})가 존재합니다."
                )

    # 수정 전 상태 스냅샷 저장
    prev_snapshot = {
        "name": prompt.name,
        "description": prompt.description,
        "content_hash": hashlib.sha256(prompt.content.encode("utf-8")).hexdigest(),
        "target_type": prompt.target_type,
        "target_id": prompt.target_id,
        "injection_mode": prompt.injection_mode,
        "is_active": prompt.is_active,
        "version": prompt.version or 1
    }

    if payload.name is not None:
        prompt.name = payload.name
    if payload.description is not None:
        prompt.description = payload.description
    if payload.content is not None:
        prompt.content = payload.content
        prompt.estimated_tokens = _estimate_tokens(payload.content)
    if payload.injection_mode is not None:
        prompt.injection_mode = payload.injection_mode
    if payload.category is not None:
        prompt.category = payload.category
    if payload.is_active is not None:
        prompt.is_active = payload.is_active

    # 사전 검증된 타겟 반영
    prompt.target_type = new_target_type
    prompt.target_id = new_target_id
    prompt.target_name = new_target_name

    # 버전 증가 규칙: 실질적 내용(본문/명칭/설명/타겟/주입모드) 변경 시에만 version++.
    # 활성 여부 토글만으로는 프롬프트 내용이 달라지지 않으므로 버전을 소모하지 않는다.
    substantive_changed = any([
        payload.name is not None and payload.name != prev_snapshot["name"],
        payload.description is not None and payload.description != prev_snapshot["description"],
        payload.content is not None and hashlib.sha256(prompt.content.encode("utf-8")).hexdigest() != prev_snapshot["content_hash"],
        payload.injection_mode is not None and payload.injection_mode != prev_snapshot["injection_mode"],
        new_target_type != prev_snapshot["target_type"],
        new_target_id != prev_snapshot["target_id"],
    ])
    if substantive_changed:
        prompt.version = (prompt.version or 1) + 1

    db.commit()
    db.refresh(prompt)

    if substantive_changed:
        change_kind = "UPDATE"
    elif prompt.is_active != prev_snapshot["is_active"]:
        change_kind = "ACTIVATE" if prompt.is_active else "DEACTIVATE"
    else:
        change_kind = "NOOP"

    # 실질 변경이 없는 요청은 이력을 오염시키지 않도록 스냅샷을 남기지 않는다
    requester = getattr(current_user, "username", "SYSTEM_PROMPT_ADMIN")
    if change_kind != "NOOP":
        _record_prompt_version(
            db, prompt, change_kind, requester,
            _summarize_changes(prev_snapshot, prompt)
        )

    # WORM 감사로그 기록
    new_content_hash = hashlib.sha256(prompt.content.encode("utf-8")).hexdigest()
    audit_ok = _record_prompt_audit_log(
        db=db,
        requester_id=requester,
        action="PROMPT_UPDATED",
        prompt_id=prompt.prompt_id,
        details={
            "name": prompt.name,
            "target_type": prompt.target_type,
            "target_id": prompt.target_id,
            "injection_mode": prompt.injection_mode,
            "estimated_tokens": prompt.estimated_tokens,
            "content_hash": new_content_hash,
            "version": prompt.version,
            "is_active": prompt.is_active,
            "change_kind": change_kind,
            "previous_state": prev_snapshot,
            "diff": {
                k: {"old": prev_snapshot.get(k), "new": getattr(prompt, k, None)}
                for k in ["name", "target_type", "target_id", "injection_mode", "is_active", "version"]
                if prev_snapshot.get(k) != getattr(prompt, k, None)
            }
        },
        key_id=prompt.target_id if prompt.target_type == "VIRTUAL_KEY" else None,
        model_id=prompt.target_name if prompt.target_type == "ROUTE" else None
    )

    # 감사 기록이 실패해도 주 트랜잭션은 성공하므로, 운영에서 탐지 가능하도록 헤더로 노출한다
    if not audit_ok:
        response.headers["x-orche-audit-degraded"] = "true"

    return prompt

@router.delete("/{prompt_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(require_permission("prompts:write"))])
def delete_system_prompt(
    prompt_id: str,
    response: Response,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    시스템 프롬프트 영구 삭제 (WORM 감사로그 기록)
    """
    prompt = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"삭제할 시스템 프롬프트를 찾을 수 없습니다: {prompt_id}"
        )

    version_count = db.query(SystemPromptVersion).filter(SystemPromptVersion.prompt_id == prompt_id).count()
    deleted_info = {
        "name": prompt.name,
        "target_type": prompt.target_type,
        "target_id": prompt.target_id,
        "injection_mode": prompt.injection_mode,
        "purged_version_history": version_count
    }

    # 영구 삭제이므로 버전 이력도 함께 정리한다.
    # (남겨두면 동일 prompt_id 로 재등록했을 때 과거 이력이 섞여 보인다.
    #  삭제 사실 자체는 WORM 감사로그에 불변 보관된다)
    db.query(SystemPromptVersion).filter(SystemPromptVersion.prompt_id == prompt_id).delete(synchronize_session=False)
    db.delete(prompt)
    db.commit()

    # WORM 감사로그 기록
    requester = getattr(current_user, "username", "SYSTEM_PROMPT_ADMIN")
    audit_ok = _record_prompt_audit_log(
        db=db,
        requester_id=requester,
        action="PROMPT_DELETED",
        prompt_id=prompt_id,
        details=deleted_info,
        key_id=prompt.target_id if prompt.target_type == "VIRTUAL_KEY" else None,
        model_id=prompt.target_name if prompt.target_type == "ROUTE" else None
    )

    # 감사 기록이 실패해도 주 트랜잭션은 성공하므로, 운영에서 탐지 가능하도록 헤더로 노출한다
    if not audit_ok:
        response.headers["x-orche-audit-degraded"] = "true"

    return {"message": f"시스템 프롬프트 [{prompt_id}]가 성공적으로 삭제되었습니다.", "prompt_id": prompt_id}


@router.get(
    "/{prompt_id}/versions",
    response_model=List[SystemPromptVersionResponse],
    dependencies=[Depends(require_permission("prompts:read"))]
)
def list_system_prompt_versions(
    prompt_id: str,
    include_content: bool = Query(False, description="각 버전의 본문 전문 포함 여부"),
    db: Session = Depends(get_db)
):
    """
    시스템 프롬프트 변경 이력 조회 (최신순).
    기본은 메타데이터만 반환하며, 본문 비교/복원 시 include_content=true 로 전문을 가져온다.
    """
    prompt = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"시스템 프롬프트를 찾을 수 없습니다: {prompt_id}"
        )

    rows = (
        db.query(SystemPromptVersion)
        .filter(SystemPromptVersion.prompt_id == prompt_id)
        .order_by(SystemPromptVersion.id.desc())
        .all()
    )

    current_hash = hashlib.sha256(prompt.content.encode("utf-8")).hexdigest()
    results = []
    for r in rows:
        item = SystemPromptVersionResponse.model_validate(r)
        item.is_current = (r.version == (prompt.version or 1) and r.content_hash == current_hash)
        if not include_content:
            item.content = None
        results.append(item)
    return results


@router.post(
    "/{prompt_id}/versions/{snapshot_id}/restore",
    response_model=SystemPromptResponse,
    dependencies=[Depends(require_permission("prompts:write"))]
)
def restore_system_prompt_version(
    prompt_id: str,
    snapshot_id: int,
    response: Response,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    지정한 이력 스냅샷의 내용으로 시스템 프롬프트를 복원한다.

    식별자는 version 번호가 아니라 이력 행의 id 를 사용한다.
    활성 토글은 의도적으로 version 을 증가시키지 않으므로 동일 version 을 가진 스냅샷이
    여러 개 존재할 수 있고, version 번호만으로는 복원 대상이 모호해지기 때문이다.

    파괴적 롤백(과거 버전으로 되돌려 이후 이력을 지우는 방식)을 하지 않고,
    복원된 내용으로 '새 버전'을 생성한다. 따라서 이력은 항상 append-only 이며
    "무엇을 언제 누가 되돌렸는지"가 그대로 추적된다.
    복원 역시 활성 상태 변경을 유발할 수 있으므로 동일 타겟 중복 활성 검증을 재수행한다.
    """
    prompt = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"시스템 프롬프트를 찾을 수 없습니다: {prompt_id}"
        )

    snapshot = (
        db.query(SystemPromptVersion)
        .filter(
            SystemPromptVersion.prompt_id == prompt_id,
            SystemPromptVersion.id == snapshot_id
        )
        .first()
    )
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"복원할 이력 스냅샷을 찾을 수 없습니다: {prompt_id} #{snapshot_id}"
        )

    # 복원 대상 타겟이 아직 유효한지 재검증 (그 사이 자원이 삭제되었을 수 있다)
    restored_target_name = _validate_and_enrich_target(snapshot.target_type, snapshot.target_id, db)

    # 복원으로 활성 상태가 되는 경우 동일 타겟 중복 활성 검증
    if snapshot.is_active:
        if snapshot.target_type == "GLOBAL":
            dup = db.query(SystemPrompt).filter(
                SystemPrompt.target_type == "GLOBAL",
                SystemPrompt.is_active == True,
                SystemPrompt.prompt_id != prompt_id
            ).first()
        else:
            dup = db.query(SystemPrompt).filter(
                SystemPrompt.target_type == snapshot.target_type,
                SystemPrompt.target_id == snapshot.target_id,
                SystemPrompt.is_active == True,
                SystemPrompt.prompt_id != prompt_id
            ).first()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"복원하려는 버전은 활성 상태이지만, 해당 타겟에 이미 활성화된 다른 시스템 프롬프트 "
                    f"'{dup.name}'({dup.prompt_id})가 존재합니다. 기존 프롬프트를 먼저 비활성화하십시오."
                )
            )

    prev_snapshot = {
        "name": prompt.name,
        "description": prompt.description,
        "content_hash": hashlib.sha256(prompt.content.encode("utf-8")).hexdigest(),
        "target_type": prompt.target_type,
        "target_id": prompt.target_id,
        "injection_mode": prompt.injection_mode,
        "is_active": prompt.is_active,
    }

    prompt.name = snapshot.name
    prompt.description = snapshot.description
    prompt.content = snapshot.content
    prompt.target_type = snapshot.target_type
    prompt.target_id = snapshot.target_id
    prompt.target_name = restored_target_name
    prompt.injection_mode = snapshot.injection_mode
    prompt.category = snapshot.category
    prompt.is_active = snapshot.is_active
    prompt.estimated_tokens = _estimate_tokens(snapshot.content)
    prompt.version = (prompt.version or 1) + 1

    db.commit()
    db.refresh(prompt)

    requester = getattr(current_user, "username", "SYSTEM_PROMPT_ADMIN")
    _record_prompt_version(
        db, prompt, "RESTORE", requester,
        f"v{snapshot.version} 내용으로 복원 (이력 #{snapshot_id}, {_summarize_changes(prev_snapshot, prompt) or '내용 동일'})"
    )
    audit_ok = _record_prompt_audit_log(
        db=db,
        requester_id=requester,
        action="PROMPT_RESTORED",
        prompt_id=prompt.prompt_id,
        details={
            "restored_from_version": snapshot.version,
            "restored_from_snapshot_id": snapshot_id,
            "new_version": prompt.version,
            "name": prompt.name,
            "target_type": prompt.target_type,
            "target_id": prompt.target_id,
            "injection_mode": prompt.injection_mode,
            "content_hash": snapshot.content_hash,
            "is_active": prompt.is_active,
            "previous_state": prev_snapshot,
        },
        key_id=prompt.target_id if prompt.target_type == "VIRTUAL_KEY" else None,
        model_id=prompt.target_name if prompt.target_type == "ROUTE" else None
    )

    # 감사 기록이 실패해도 주 트랜잭션은 성공하므로, 운영에서 탐지 가능하도록 헤더로 노출한다
    if not audit_ok:
        response.headers["x-orche-audit-degraded"] = "true"

    return prompt


@router.post("/resolve", response_model=PromptResolveResponse, dependencies=[Depends(require_permission("prompts:read"))])
def resolve_system_prompt(
    req: PromptResolveRequest,
    db: Session = Depends(get_db)
):
    """
    가상키/라우트/테넌트 컨텍스트 기반 우선순위 해석 및 최종 메시지 배열 합성 시뮬레이션
    엔진 코어(resolve_and_inject_system_prompt)를 직접 호출하여 100% 동일한 합성 및 멀티모달 처리 보장
    우선순위: VIRTUAL_KEY > ROUTE > TENANT > GLOBAL
    """
    input_msgs = req.input_messages if req.input_messages is not None else []
    if not input_msgs:
        input_msgs = [{"role": "user", "content": "프롬프트 거버넌스 시뮬레이션 요청"}]

    resolve_res = resolve_and_inject_system_prompt(
        db=db,
        messages=input_msgs,
        key_id=req.key_id,
        route_name=req.route_name,
        tenant_id=req.tenant_id
    )
    final_msgs, matched_prompt, resolved_by = resolve_res

    applied_vars = getattr(resolve_res, "applied_variables", {})
    tok_delta = getattr(resolve_res, "token_delta", 0)

    return PromptResolveResponse(
        matched=matched_prompt is not None,
        resolved_by=resolved_by,
        matched_prompt=SystemPromptResponse.model_validate(matched_prompt) if matched_prompt else None,
        final_messages=final_msgs,
        applied_variables=applied_vars,
        token_delta=tok_delta
    )
