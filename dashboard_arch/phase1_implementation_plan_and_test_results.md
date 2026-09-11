# Phase 1 구현 계획서 및 테스트 결과 보고서: 인증, 멀티 테넌트 거버넌스 및 외부 연동 코어 (Multi-Tenancy & Auth Core)

## 1. 개요 및 구현 계획 (Implementation Plan)

### 1.1 배경 및 목적
본 단계는 엔지니어링 계획서(`dashboard_arch/dashboard_engineering_plan.md`)의 **Phase 1: 인증, 멀티 테넌트 거버넌스 및 가상 API Key 수명주기**를 구현하여 사내 부서별(테넌트) 독립된 AI 권한 분리, 엄격한 가상키 발급·파기·수정 및 외부 시스템(L7 게이트웨이, AI 클라이언트, ERP/FinOps) 연동 기반을 완성하는 것을 목표로 합니다.

### 1.2 아키텍처 원칙 및 구현 사양
1. **도메인 엔티티 모델링**:
   - `Tenant`: 부서 식별자(`tenant_id`), 명칭, 부서코드, 월간예산(`monthly_budget_krw`), 누적지출액(`spent_budget_krw`), 하드캡 여부(`is_hard_cap_enabled`)
   - `VirtualKey`: 키 식별자(`key_id`), 단방향 솔트 해시(`key_hash`), UI 접두사(`key_prefix`), 허용 모델 목록, 사내 IP CIDR 대역, 속도 제한(`rpm_limit`, `tpm_limit`), 누적 토큰(`total_tokens`), 누적 비용(`spent_krw`), 활성 상태
2. **가상 API Key 보안 불변식 (Security Invariants)**:
   - 모든 가상키는 금융권 표준 접두사 `sk-orch-`로 시작
   - 키 발급 직후 **단 1회만 모달을 통해 평문 노출**
   - 데이터베이스에는 `Argon2id` 단방향 암호화 해시로 저장하여 관리자 DB 유출 시에도 안전
3. **가상 API Key 영속성 및 변경 수정 기능 (Bug Fix)**:
   - `PATCH /api/v1/virtual-keys/{key_id}` 엔드포인트 구현 (명칭, RPM/TPM, IP대역, 모델목록, 상태 실시간 수정)
   - 브라우저 새로고침이나 오프라인 모드에서도 유지되는 `localStorage` 이중 영속화 계층 구축
4. **외부 애플리케이션 연동 엔드포인트**:
   - **사내 AI 클라이언트**: `GET /api/v1/external/me`, `GET /api/v1/external/models` (Bearer Token 검증 및 자가 쿼터/예산 진단)
   - **L7 게이트웨이(Envoy)**: `POST /api/v1/virtual-keys/validate`, `POST /api/v1/external/usage/report` (토큰 및 비용 실시간 누적 반영)
   - **사내 ERP/FinOps**: `GET /api/v1/external/tenants/{id}/summary`, `PATCH /api/v1/external/tenants/{id}/budget` (월간 예산 변경 및 Hard Cap 제어)
   - **Prometheus 모니터링**: `GET /metrics` (표준 OpenMetrics/Prometheus 텍스트 형식 실시간 수집 지원)

---

## 2. 테스트 결과 보고서 (Test Results & Verification)

### 2.1 자동화 단위 및 통합 테스트 (`uv run pytest -v`)
- **실행 위치**: `aiorche/backend/`
- **테스트 파일**: `tests/test_virtual_keys.py`, `tests/test_external_api.py`, `tests/test_health.py`
- **결과**: **15 / 15 테스트 100% PASS**

| 테스트 모듈 및 케이스 | 검증 내용 | 결과 |
| :--- | :--- | :---: |
| `test_tenant_lifecycle` | 테넌트 목록 조회 및 신규 부서 등록 라이프사이클 | **PASSED** |
| `test_virtual_key_creation_one_time_exposure_and_argon2_hashing` | 단 1회 평문 노출, `sk-orch-` 접두사, DB Argon2id 해싱 검증 | **PASSED** |
| `test_virtual_key_listing_does_not_leak_raw_key` | 키 목록 조회 시 평문 키 미노출 및 마스킹된 prefix 표출 검증 | **PASSED** |
| `test_virtual_key_validation_and_model_authorization` | 허용 모델/인가 대역 일치 여부 및 키 검증 통과 | **PASSED** |
| `test_virtual_key_revoke_lifecycle` | 원클릭 즉시 파기 및 차단 후 403 반환 검증 | **PASSED** |
| `test_virtual_key_update_lifecycle` | 키 명칭, 속도 제한(RPM/TPM), 상태 실시간 수정 및 DB 반영 | **PASSED** |
| `test_client_self_inspection_me_and_models` | Bearer Token 기반 자가 쿼터 점검 및 인가 모델 목록 조회 | **PASSED** |
| `test_gateway_usage_reporting_and_cost_aggregation` | Envoy 사용량 보고 수신 및 키/부서 누적 토큰/비용 원자적 증가 | **PASSED** |
| `test_erp_tenant_budget_and_summary` | ERP 부서 월별 예산 변경 및 하드 캡 실시간 토글 | **PASSED** |
| `test_prometheus_metrics_scrape` | `/metrics` OpenMetrics 지표 수집 검증 | **PASSED** |
| `test_health.py` (5개 테스트) | Liveness, Readiness, 시스템 정보, 암호화 무결성 | **PASSED** |

### 2.2 Phase 1 Definition of Done (DoD) 전체 감사 (`make verify-phase1`)
- **실행 스크립트**: `bash aiorche/scripts/verify-phase1.sh`

```
==========================================================
🧪 AI Orchestrator Phase 1 Definition of Done (DoD) Audit
  [인증 & 멀티 테넌트 메타데이터 코어 검증]
==========================================================
==> [1/4] Verifying Phase 1 Schemas, Endpoints & Components...
  ✅ All Phase 1 core files verified.
==> [2/4] Running Backend Tests (Tenant CRUD, Key Hashing, Validation, Revocation)...
  ✅ All 15 backend unit and integration tests passed.
==> [3/4] Validating Frontend Production Build (Vite)...
  ✓ built in 3.75s
  ✅ Frontend production bundle compiled successfully.
==> [4/4] Verifying Virtual Key Security Invariants (sk-orch- prefix & Argon2id)...
  ✅ Security invariants verified: sk-orch- prefix, Argon2id one-way hashing, single-exposure modal.
==========================================================
🎉 SUCCESS: Phase 1 Multi-Tenancy Core is 100% complete and verified!
```

- **브라우저 실환경 검증**:
  - 가상키 수정 모달을 통해 `vk-live-wm-bot-01`을 '수정된 PB 맞춤형 에이전트', '555 RPM'으로 변경 후 브라우저 새로고침(F5) 후에도 정상 영구 유지됨을 서브에이전트로 확인.
  - 영상 증적: `verify_apikey_fix_1789133825998.webp`
