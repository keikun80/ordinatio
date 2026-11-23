import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.patch_engine import PatchEngine
from app.core.support_bundle import SupportBundleGenerator
from app.schemas.lifecycle import (
    ComponentListResponse,
    ComponentVersionInfo,
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
    """어플라이언스 내 핵심 모듈(ext_proc, Envoy, Control Plane, Presidio)의 버전 및 상태를 반환합니다."""
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
        current_solution_version=f"v{settings.VERSION}"
    )


# ==========================================
# 2. Pre-flight Diagnostics
# ==========================================

@router.get("/preflight", response_model=PreflightResponse, dependencies=[Depends(require_permission("lifecycle:read"))])
def run_preflight():
    """5대 핵심 컴포넌트(PostgreSQL, Redis, Kafka, vLLM, DCGM) 실시간 자가진단을 수행합니다."""
    diag = PatchEngine.run_preflight()
    return PreflightResponse(**diag)


# ==========================================
# 3. Zero-PII Support Bundle
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
