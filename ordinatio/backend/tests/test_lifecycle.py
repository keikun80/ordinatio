import os
import zipfile
import pytest
from fastapi.testclient import TestClient

def test_component_version_listing(client: TestClient):
    """컴포넌트별 버전 및 패치 권고 상태 조회 테스트"""
    response = client.get("/api/v1/lifecycle/components")
    assert response.status_code == 200
    data = response.json()
    assert "components" in data
    assert len(data["components"]) >= 4
    comp_names = [c["name"] for c in data["components"]]
    assert any("ext_proc" in n for n in comp_names)
    assert any("Envoy" in n for n in comp_names)
    assert data["current_solution_version"] == "v1.2.0"


def test_rsa_signature_verification_success(client: TestClient):
    """벤더 RSA-4096 / SHA-256 서명 무결성 검증 성공 테스트"""
    payload = {
        "patch_id": "patch-v1.2.1-hotfix-cve2026",
        "package_name": "patch-v1.2.1-hotfix-cve2026.tar.gz",
        "target_component": "ext_proc",
        "version": "v1.2.1-hotfix",
        "cve_id": "CVE-2026-0812",
        "description": "Presidio L7 메모리 누수 및 PII 필터링 보안 패치"
    }
    response = client.post("/api/v1/lifecycle/patches/verify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "VERIFIED"
    assert data["verification"]["signature_valid"] is True
    assert "RSA-4096" in data["verification"]["algorithm"]
    assert "Antigravity Vendor" in data["verification"]["signer"]


def test_rsa_signature_verification_failure(client: TestClient):
    """위조/변조되거나 허가되지 않은 패치 파일 검증 실패 테스트"""
    # 1. 비공식 포맷
    bad_payload = {
        "patch_id": "malicious-patch",
        "package_name": "unauthorized-script.exe",
        "target_component": "ext_proc",
        "version": "v9.9.9"
    }
    res1 = client.post("/api/v1/lifecycle/patches/verify", json=bad_payload)
    assert res1.status_code == 400
    assert "비정상 패키지 포맷" in res1.json()["detail"]

    # 2. 위조된 서명
    tampered_payload = {
        "patch_id": "tampered-patch",
        "package_name": "patch-tampered.tar.gz",
        "target_component": "ext_proc",
        "version": "v1.2.1",
        "signature_b64": "invalid_tampered_signature_bytes"
    }
    res2 = client.post("/api/v1/lifecycle/patches/verify", json=tampered_payload)
    assert res2.status_code == 400
    assert "서명 불일치" in res2.json()["detail"]


def test_patch_dry_run_validation(client: TestClient):
    """K8s PDB 및 gRPC 호환성 무중단 드라이런 검증 테스트"""
    payload = {
        "patch_id": "patch-v1.2.1-hotfix-cve2026",
        "package_name": "patch-v1.2.1-hotfix-cve2026.tar.gz",
        "target_component": "ext_proc",
        "version": "v1.2.1-hotfix"
    }
    response = client.post("/api/v1/lifecycle/patches/dry-run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "DRY_RUN_PASSED"
    assert data["can_apply_zero_downtime"] is True
    assert len(data["checks"]) >= 4
    # PDB 및 vLLM 무영향 확인
    check_names = [c["check"] for c in data["checks"]]
    assert any("PodDisruptionBudget" in n for n in check_names)
    assert any("Inference" in n for n in check_names)


def test_rolling_hotfix_apply_and_history_persistence(client: TestClient):
    """무중단 롤링 핫픽스 배포 및 DB 이력 영속화 테스트"""
    payload = {
        "patch_id": "patch-v1.2.1-hotfix-test",
        "package_name": "patch-v1.2.1-hotfix-cve2026.tar.gz",
        "target_component": "ext_proc",
        "version": "v1.2.1-hotfix",
        "applied_by": "ops-admin-tester"
    }
    response = client.post("/api/v1/lifecycle/patches/apply", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "APPLIED"
    assert data["applied_version"] == "v1.2.1-hotfix"
    assert len(data["logs"]) >= 6

    # DB 이력 조회 검증
    history_res = client.get("/api/v1/lifecycle/patches/history")
    assert history_res.status_code == 200
    histories = history_res.json()
    applied_patches = [h for h in histories if h["patch_id"] == "patch-v1.2.1-hotfix-test"]
    assert len(applied_patches) == 1
    assert applied_patches[0]["status"] == "APPLIED"
    assert applied_patches[0]["applied_version"] == "v1.2.1-hotfix"

    # 컴포넌트 목록에서 버전 갱신 반영 확인
    comp_res = client.get("/api/v1/lifecycle/components")
    comps = comp_res.json()["components"]
    ext_proc = next(c for c in comps if "ext_proc" in c["name"])
    assert ext_proc["version"] == "v1.2.1-hotfix"


def test_rollback_lifecycle_and_version_restoration(client: TestClient):
    """원클릭 롤백 및 이전 버전 복원 테스트"""
    payload = {
        "target_component": "ext_proc",
        "rollback_to_version": "v1.2.0",
        "reason": "테스트 롤백 시나리오 검증",
        "applied_by": "ops-admin-tester"
    }
    response = client.post("/api/v1/lifecycle/patches/rollback", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ROLLED_BACK"
    assert data["restored_version"] == "v1.2.0"

    # 컴포넌트 버전이 v1.2.0으로 복원되었는지 확인
    comp_res = client.get("/api/v1/lifecycle/components")
    comps = comp_res.json()["components"]
    ext_proc = next(c for c in comps if "ext_proc" in c["name"])
    assert ext_proc["version"] == "v1.2.0"

    # 이력에 ROLLED_BACK 레코드 추가 확인
    history_res = client.get("/api/v1/lifecycle/patches/history")
    histories = history_res.json()
    assert any(h["status"] == "ROLLED_BACK" for h in histories)


def test_preflight_diagnostics(client: TestClient):
    """5대 핵심 컴포넌트 실시간 자가진단(Pre-flight) API 테스트"""
    response = client.get("/api/v1/lifecycle/preflight")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    checks = data["checks"]
    assert "postgres" in checks
    assert "redis" in checks
    assert "kafka" in checks
    assert "vllmEks" in checks
    assert "dcgm" in checks
    assert checks["postgres"]["status"] == "OK"
    assert checks["redis"]["status"] == "OK"


def test_zero_pii_support_bundle_zip_generation_and_download(client: TestClient):
    """Zero-PII 기술지원 번들 생성 및 실제 ZIP 파일 다운로드 무결성 테스트"""
    # 1. 서포트 번들 생성
    bundle_req = {
        "include_diagnostics": True,
        "include_system_metrics": True,
        "include_routing_dump": True,
        "requester_id": "tester-sysops"
    }
    create_res = client.post("/api/v1/lifecycle/support-bundle", json=bundle_req)
    assert create_res.status_code == 200
    bundle = create_res.json()
    assert bundle["status"] == "READY"
    assert bundle["sanitization_report"]["prompts_included"] is False
    assert bundle["sanitization_report"]["user_pii_included"] is False
    assert bundle["file_size_bytes"] > 0
    bundle_id = bundle["bundle_id"]

    # 2. 실제 ZIP 파일 다운로드
    download_res = client.get(f"/api/v1/lifecycle/support-bundle/download/{bundle_id}")
    assert download_res.status_code == 200
    assert download_res.headers["content-type"] == "application/zip"
    
    # 3. 다운로드된 ZIP 파일 내용 무결성 검증
    content = download_res.content
    import io
    with zipfile.ZipFile(io.BytesIO(content), 'r') as zf:
        file_list = zf.namelist()
        assert "metadata.json" in file_list
        assert "sanitization_report.json" in file_list
        assert "diagnostics.json" in file_list
        assert "routing_summary.json" in file_list
        assert "system_sanitized.log" in file_list

        # Zero-PII 검증: 프롬프트 원문이 없음
        sanitization_text = zf.read("sanitization_report.json").decode("utf-8")
        assert '"prompts_included": false' in sanitization_text
