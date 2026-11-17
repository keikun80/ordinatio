import os
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.patch_history import PatchHistory
from app.core.patch_engine import PatchEngine
from app.core.support_bundle import SupportBundleGenerator
from app.schemas.lifecycle import (
    ComponentListResponse,
    ComponentVersionInfo,
    PatchVerifyRequest,
    PatchVerifyResponse,
    PatchDryRunRequest,
    PatchDryRunResponse,
    PatchApplyRequest,
    PatchApplyResponse,
    PatchRollbackRequest,
    PatchRollbackResponse,
    PatchHistoryRead,
    PreflightResponse,
    SupportBundleRequest,
    SupportBundleResponse
)
from app.api.deps import require_permission

router = APIRouter()


# ==========================================
# 1. Component Version Management
# ==========================================

@router.get("/components", response_model=ComponentListResponse, dependencies=[Depends(require_permission("lifecycle:read"))])
def get_components():
    """어플라이언스 내 핵심 모듈(ext_proc, Envoy, Control Plane, Presidio)의 버전 및 패치 상태를 반환합니다."""
    comps = PatchEngine.get_components()
    comp_list = [
        ComponentVersionInfo(
            name=c["name"],
            version=c["version"],
            target_patch_version=c.get("target_patch_version"),
            status=c["status"],
            description=c["description"]
        )
        for c in comps
    ]
    return ComponentListResponse(
        components=comp_list,
        current_solution_version="v1.2.0"
    )


# ==========================================
# 2. Patch Verification, Dry-Run & Rolling Deploy
# ==========================================

@router.post("/patches/verify", response_model=PatchVerifyResponse, dependencies=[Depends(require_permission("lifecycle:write"))])
def verify_patch(payload: PatchVerifyRequest):
    """업로드된 오프라인 패치 번들의 RSA-4096 서명 및 SHA-256 무결성을 검증합니다."""
    verif = PatchEngine.verify_signature(
        package_name=payload.package_name,
        target_component=payload.target_component,
        version=payload.version,
        signature_b64=payload.signature_b64,
        payload_sha256=payload.payload_sha256
    )

    if not verif["signature_valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=verif.get("error", "RSA-4096 서명 검증 실패: 공인 벤더 키와 일치하지 않습니다.")
        )

    patch_id = payload.patch_id or f"patch-{payload.target_component}-{payload.version}"
    return PatchVerifyResponse(
        status="VERIFIED",
        patch_id=patch_id,
        package_name=payload.package_name,
        target_component=payload.target_component,
        version=payload.version,
        verification={
            "signature_valid": True,
            "signer": verif["signer"],
            "algorithm": verif["algorithm"],
            "fingerprint": verif["fingerprint"]
        },
        cve_id=payload.cve_id or verif.get("cve_id"),
        release_notes=payload.description or "Presidio L7 메모리 누수 및 PII 필터링 보안 패치"
    )


@router.post("/patches/dry-run", response_model=PatchDryRunResponse, dependencies=[Depends(require_permission("lifecycle:write"))])
def dry_run_patch(payload: PatchDryRunRequest):
    """K8s PDB, readinessProbe 및 vLLM GPU 워크로드 무영향성 드라이런 검증을 수행합니다."""
    res = PatchEngine.run_dry_run(
        patch_id=payload.patch_id,
        package_name=payload.package_name,
        target_component=payload.target_component,
        version=payload.version
    )
    return PatchDryRunResponse(**res)


@router.post("/patches/apply", response_model=PatchApplyResponse, dependencies=[Depends(require_permission("lifecycle:write"))])
def apply_patch(payload: PatchApplyRequest, db: Session = Depends(get_db)):
    """무중단 롤링 핫픽스 배포를 실행하고, 패치 이력을 데이터베이스에 영속화합니다."""
    target_comp = payload.target_component or "ext_proc"
    applied_ver = payload.version or "v1.2.1-hotfix"

    # 배포 엔진 실행
    res = PatchEngine.apply_hotfix(
        patch_id=payload.patch_id,
        target_component=target_comp,
        version=applied_ver,
        applied_by=payload.applied_by
    )

    # DB에 배포 이력 저장
    patch_record = PatchHistory(
        patch_id=payload.patch_id,
        package_name=payload.package_name or f"patch-{target_comp}-{applied_ver}.tar.gz",
        target_component=target_comp,
        previous_version=res["previous_version"],
        applied_version=applied_ver,
        signature_verified=True,
        status="APPLIED",
        applied_by=payload.applied_by,
        details_json=json.dumps({"logs": res["logs"], "strategy": res["strategy"]})
    )
    db.merge(patch_record)
    db.commit()

    return PatchApplyResponse(**res)


@router.post("/patches/rollback", response_model=PatchRollbackResponse, dependencies=[Depends(require_permission("lifecycle:write"))])
def rollback_patch(payload: PatchRollbackRequest, db: Session = Depends(get_db)):
    """이전 안정 버전으로 롤백을 수행하고 이력을 갱신합니다."""
    target_comp = payload.target_component
    rollback_ver = payload.rollback_to_version or "v1.2.0"

    res = PatchEngine.rollback_patch(
        target_component=target_comp,
        rollback_to_version=rollback_ver,
        reason=payload.reason
    )

    # DB에 롤백 이력 저장
    rollback_record = PatchHistory(
        patch_id=payload.patch_id or f"rollback-{target_comp}-{os.urandom(3).hex()}",
        package_name=f"rollback-to-{rollback_ver}",
        target_component=target_comp,
        previous_version="v1.2.1-hotfix",
        applied_version=rollback_ver,
        signature_verified=True,
        status="ROLLED_BACK",
        applied_by=payload.applied_by,
        details_json=json.dumps({"reason": payload.reason, "logs": res["logs"]})
    )
    db.add(rollback_record)
    db.commit()

    return PatchRollbackResponse(**res)


@router.get("/patches/history", response_model=List[PatchHistoryRead], dependencies=[Depends(require_permission("lifecycle:read"))])
def get_patch_history(limit: int = 50, db: Session = Depends(get_db)):
    """패치 적용 및 롤백 이력 목록을 조회합니다."""
    records = db.query(PatchHistory).order_by(PatchHistory.applied_at.desc()).limit(limit).all()
    return records


# ==========================================
# 3. Pre-flight Diagnostics
# ==========================================

@router.get("/preflight", response_model=PreflightResponse, dependencies=[Depends(require_permission("lifecycle:read"))])
def run_preflight():
    """5대 핵심 컴포넌트(PostgreSQL, Redis, Kafka, vLLM, DCGM) 실시간 자가진단을 수행합니다."""
    diag = PatchEngine.run_preflight()
    return PreflightResponse(**diag)


# ==========================================
# 4. Zero-PII Support Bundle
# ==========================================

@router.post("/support-bundle", response_model=SupportBundleResponse, dependencies=[Depends(require_permission("lifecycle:write"))])
def generate_support_bundle(payload: SupportBundleRequest = SupportBundleRequest()):
    """고객 개인정보(PII)를 100% 배제한 암호화 기술지원 번들 ZIP 아카이브를 생성합니다."""
    bundle_res = SupportBundleGenerator.generate_bundle(
        requester_id=payload.requester_id,
        include_diagnostics=payload.include_diagnostics,
        include_system_metrics=payload.include_system_metrics,
        include_routing_dump=payload.include_routing_dump
    )
    return SupportBundleResponse(
        status="READY",
        bundle_id=bundle_res["bundle_id"],
        bundle_filename=bundle_res["bundle_filename"],
        sanitization_report=bundle_res["sanitization_report"],
        download_url=bundle_res["download_url"],
        file_size_bytes=bundle_res["file_size_bytes"]
    )


@router.get("/support-bundle/download/{bundle_id}", dependencies=[Depends(require_permission("lifecycle:write"))])
def download_support_bundle(bundle_id: str):
    """생성된 Zero-PII 서포트 번들 ZIP 파일을 다운로드합니다."""
    zip_path = SupportBundleGenerator.get_bundle_path(bundle_id)
    if not zip_path or not os.path.exists(zip_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="요청하신 기술지원 번들을 찾을 수 없거나 만료되었습니다."
        )

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"zero-pii-support-bundle-{bundle_id[:16]}.zip"
    )
