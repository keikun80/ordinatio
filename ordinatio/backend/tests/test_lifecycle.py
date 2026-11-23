import os
import json
import zipfile
import pytest
from fastapi.testclient import TestClient
from app.core.config import settings

def test_component_version_listing(client: TestClient):
    """컴포넌트별 버전 및 상태 조회 테스트"""
    response = client.get("/api/v1/lifecycle/components")
    assert response.status_code == 200
    data = response.json()
    assert "components" in data
    assert len(data["components"]) >= 4
    comp_names = [c["name"] for c in data["components"]]
    assert any("ext_proc" in n for n in comp_names)
    assert any("Envoy" in n for n in comp_names)
    assert data["current_solution_version"] in [settings.VERSION, f"v{settings.VERSION}", "1.0.3"]


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
    
    # 3. 다운로드된 ZIP 파일 내용 무결성 및 실제 구현 데이터 검증
    content = download_res.content
    import io
    with zipfile.ZipFile(io.BytesIO(content), 'r') as zf:
        file_list = zf.namelist()
        assert "metadata.json" in file_list
        assert "sanitization_report.json" in file_list
        assert "diagnostics.json" in file_list
        assert "routing_summary.json" in file_list
        assert "system_sanitized.log" in file_list

        # Zero-PII 및 실제 OS/진단/라우트 메트릭 데이터 무결성 검증
        meta = json.loads(zf.read("metadata.json").decode("utf-8"))
        assert meta["bundle_id"] == bundle_id
        assert meta["requester"] == "tester-sysops"
        assert "environment" in meta
        assert "os" in meta["environment"]

        sanit = json.loads(zf.read("sanitization_report.json").decode("utf-8"))
        assert sanit["prompts_included"] is False
        assert sanit["user_pii_included"] is False
        assert "prompts_stripped" in sanit
        assert isinstance(sanit["prompts_stripped"], int)
        assert "pii_masked_count" in sanit
        assert isinstance(sanit["pii_masked_count"], int)

        diag = json.loads(zf.read("diagnostics.json").decode("utf-8"))
        assert "checks" in diag
        assert "postgres" in diag["checks"]

        routing = json.loads(zf.read("routing_summary.json").decode("utf-8"))
        assert "routing_policies" in routing
        assert isinstance(routing["routing_policies"], list)
        assert routing["total_active_routes"] >= 1
