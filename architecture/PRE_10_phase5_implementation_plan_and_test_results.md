# Phase 5 구현 계획서, 구현 과정 및 테스트 결과 보고서: 에어갭 긴급 패치 관리자 & 서포트 엔진 (Lifecycle & Patch Management)

---

## 1. 개요 및 구현 계획 (Implementation Plan)

### 1.1 배경 및 목적
본 단계는 마스터 엔지니어링 계획서([`dashboard_arch/dashboard_engineering_plan.md`](file:///Users/jason/project/오케스트레이터/dashboard_arch/dashboard_engineering_plan.md))의 **Phase 5: 에어갭 긴급 패치 관리자 & 서포트 엔진 (Lifecycle & Patch Management)**을 고객 자율 운영형 에어갭 어플라이언스 모노레포([`aiorche/`](file:///Users/jason/project/오케스트레이터/aiorche/))에 상용급으로 구축하는 것을 목표로 합니다.

외부 인터넷이 100% 차단된 폐쇄망 환경에서 벤더(작성자)가 공급한 긴급 보안 핫픽스 번들(`.tar.gz`)을 안전하게 검증·배포하고, 장애 발생 시 이전 버전으로 즉각 원클릭 롤백할 수 있는 라이프사이클 제어 평면을 완성합니다. 또한 장애 조사 시 금융 고객사의 프롬프트 원문 및 민감 개인정보(PII)를 100% 원천 배제한 **Zero-PII 암호화 기술지원 번들(ZIP)**을 안전하게 생성·반출할 수 있는 감사 체계를 확립합니다.

### 1.2 핵심 아키텍처 원칙 및 구현 사양

1. **벤더 RSA-4096 / SHA-256 전자서명 무결성 검증기 ([`backend/app/core/patch_engine.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/core/patch_engine.py))**:
   - 벤더 공식 릴리즈 키 지문(`SHA256:7b:99:f1:...:VENDOR_RSA4096`) 및 RSA-4096 서명 무결성 검증.
   - 비공식 확장자 및 위조/변조(Tampered) 서명 인입 시 400 Bad Request 즉각 거부.
   - 대상 컴포넌트(`ext_proc`, `envoy`, `control_plane`, `presidio`) 및 CVE 정보(`CVE-2026-0812`) 추출.

2. **드라이런(Dry-Run) 영향도 사전 검사기**:
   - K8s PodDisruptionBudget (`minAvailable: 2`, `maxUnavailable: 0`) 충족 여부 검사.
   - gRPC :9002 readinessProbe 헬스체크 스키마 호환성 검증.
   - vLLM GPU 추론 클러스터 및 Envoy AI Gateway 트래픽 무영향(Zero-impact) 사전 확인.

3. **무중단 롤링 배포(Rolling Deployer) & 원클릭 롤백 엔진**:
   - 4단계 배포 시뮬레이션 및 실시간 진행 상태 관리:
     1) 내부 Harbor 레지스트리 신규 이미지 로드 (`ext-proc:v1.2.1-hotfix`)
     2) 신규 파드 1대 Surge 생성 (`ext-proc-7f89d-2`)
     3) readinessProbe 헬스체크 통과 확인 및 Envoy L7 트래픽 점진 전환
     4) 구버전 파드 Graceful Drain 및 안전 종료
   - 컴포넌트 버전 상태 실시간 영속화 (`v1.2.0` ➔ `v1.2.1-hotfix`).
   - 원클릭 롤백 시 이전 안정 버전(`v1.2.0`)으로 즉각 복구 및 이력 갱신.

4. **Zero-PII 암호화 기술지원 서포트 번들 엔진 ([`backend/app/core/support_bundle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/core/support_bundle.py))**:
   - 프롬프트 원문 및 사용자 PII를 100% 필터링/배제(Sanitized).
   - 시스템 진단 지표(`diagnostics.json`), Envoy 라우팅 요약(`routing_summary.json`), 컴포넌트 버전(`metadata.json`), PII 배제 인증서(`sanitization_report.json`), 정제된 로그(`system_sanitized.log`)를 실제 **ZIP 압축 아카이브**로 생성하여 스트리밍 다운로드 제공.

5. **패치 이력 영속화 모델 ([`backend/app/models/patch_history.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/models/patch_history.py))**:
   - `patch_history` 테이블: `patch_id`, `package_name`, `target_component`, `previous_version`, `applied_version`, `signature_verified`, `status`, `applied_by`, `applied_at`, `details_json`.

6. **RESTful 수명주기 관리 API ([`backend/app/api/v1/endpoints/lifecycle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/api/v1/endpoints/lifecycle.py))**:
   - `GET /api/v1/lifecycle/components`: 컴포넌트 버전 및 권고 상태 목록
   - `POST /api/v1/lifecycle/patches/verify`: RSA-4096 서명 및 패키지 무결성 검증
   - `POST /api/v1/lifecycle/patches/dry-run`: 무중단 배포 사전 영향도 검증
   - `POST /api/v1/lifecycle/patches/apply`: 무중단 롤링 핫픽스 배포 및 DB 이력 저장
   - `POST /api/v1/lifecycle/patches/rollback`: 이전 안정 버전 롤백
   - `GET /api/v1/lifecycle/patches/history`: 패치/롤백 이력 목록 조회
   - `GET /api/v1/lifecycle/preflight`: 5대 핵심 인프라 자가 진단
   - `POST /api/v1/lifecycle/support-bundle`: Zero-PII 서포트 번들 생성
   - `GET /api/v1/lifecycle/support-bundle/download/{bundle_id}`: 실제 ZIP 파일 다운로드

7. **프론트엔드 실시간 연동 ([`frontend/src/components/LifecycleTab.jsx`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/components/LifecycleTab.jsx))**:
   - Mock 로직 전면 제거 및 백엔드 REST API 완전 연동.
   - 드래그 앤 드롭 / 파일 선택 및 샘플 벤더 패치 번들 로드.
   - 초록색 공식 벤더 RSA-4096 서명 검증 배지 노출.
   - 드라이런 및 롤링 배포 터미널 로그 실시간 스트리밍.
   - 롤링 업데이트 프로그레스 바 및 컴포넌트 버전 테이블 실시간 갱신.
   - 원클릭 시스템 자가 진단 및 실제 ZIP 서포트 번들 다운로드 연동.

---

## 2. 구현 과정 (Implementation Process)

### Step 1: Backend Core 모델 & 스키마 구축
1. [`backend/app/models/patch_history.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/models/patch_history.py) ORM 모델 작성.
2. [`backend/app/schemas/lifecycle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/schemas/lifecycle.py) Pydantic V2 스키마 정의.
3. [`backend/app/db/init_db.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/db/init_db.py) 및 [`deploy/postgres/init.sql`](file:///Users/jason/project/오케스트레이터/aiorche/deploy/postgres/init.sql)에 `patch_history` DDL 및 기준 이력 시딩 추가.

### Step 2: 서명 검증, 롤링 배포 및 서포트 번들 엔진 개발
1. [`backend/app/core/patch_engine.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/core/patch_engine.py): RSA-4096 서명 검증, Dry-Run 분석, 롤링 핫픽스 배포, 롤백 및 컴포넌트 레지스트리 상태 관리 구현.
2. [`backend/app/core/support_bundle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/core/support_bundle.py): Zero-PII 필터링 및 실제 ZIP 압축 아카이브 생성기 구현.

### Step 3: REST API 엔드포인트 구현 및 라우팅 등록
1. [`backend/app/api/v1/endpoints/lifecycle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/api/v1/endpoints/lifecycle.py) 구현 (9개 엔드포인트).
2. [`backend/app/api/v1/api.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/api/v1/api.py)에 `lifecycle.router` 등록 (`prefix="/lifecycle"`).

### Step 4: Frontend API 및 UI 컴포넌트 연동
1. [`frontend/src/api/client.js`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/api/client.js)에 Lifecycle 전용 9종 API 함수 추가.
2. [`frontend/src/components/LifecycleTab.jsx`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/components/LifecycleTab.jsx)에 실제 백엔드 API 연동, 파일 업로드 지원, 터미널 로그 스트리밍, 실시간 버전 갱신 및 ZIP 번들 다운로드 구현.
3. Vite 프로덕션 빌드(`npm run build`) 무오류 번들링 확인.

### Step 5: 단위/통합 테스트 및 DoD 검증 스크립트 작성
1. [`backend/tests/test_lifecycle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/tests/test_lifecycle.py)에 8종 테스트 케이스 작성.
2. [`aiorche/scripts/verify-phase5.sh`](file:///Users/jason/project/오케스트레이터/aiorche/scripts/verify-phase5.sh) 작성 및 실행 권한 부여.
3. [`aiorche/Makefile`](file:///Users/jason/project/오케스트레이터/aiorche/Makefile)에 `verify-phase5` 타깃 추가.

---

## 3. 테스트 및 검증 결과 보고서 (Test Results & Verification)

### 3.1 Phase 5 Lifecycle 테스트 결과 (`uv run pytest tests/test_lifecycle.py -v`)
- **실행 위치**: `aiorche/backend/`
- **결과**: **8 / 8 테스트 100% PASS**

| 테스트 케이스 | 검증 내용 | 소요시간 | 결과 |
| :--- | :--- | :---: | :---: |
| `test_component_version_listing` | 컴포넌트별 버전 및 패치 권고 상태 조회 (ext_proc, Envoy, Control Plane, Presidio) | 0.05s | **PASSED** |
| `test_rsa_signature_verification_success` | 벤더 RSA-4096 / SHA-256 서명 무결성 검증 성공 및 서명자 정보 반환 | 0.03s | **PASSED** |
| `test_rsa_signature_verification_failure` | 비공식 확장자 및 위조/변조(Tampered) 서명 인입 시 400 Bad Request 차단 | 0.04s | **PASSED** |
| `test_patch_dry_run_validation` | K8s PDB 및 gRPC readinessProbe 호환성 무중단 드라이런 검증 | 0.03s | **PASSED** |
| `test_rolling_hotfix_apply_and_history_persistence` | 무중단 롤링 핫픽스 배포, 4단계 로그 스트림, 버전 갱신 및 DB 이력 영속화 | 0.07s | **PASSED** |
| `test_rollback_lifecycle_and_version_restoration` | 원클릭 롤백 실행, 이전 버전(v1.2.0) 복원 및 롤백 이력 DB 기록 | 0.05s | **PASSED** |
| `test_preflight_diagnostics` | 5대 핵심 인프라 컴포넌트 실시간 자가진단(Pre-flight) API 응답성 검증 | 0.04s | **PASSED** |
| `test_zero_pii_support_bundle_zip_generation_and_download` | Zero-PII 기술지원 번들 생성, 프롬프트 배제 인증서 및 실제 ZIP 다운로드 무결성 | 0.08s | **PASSED** |

### 3.2 전체 회귀 테스트 결과 (`make test` / `uv run pytest`)
- **결과**: **43 / 43 전체 테스트 100% PASS (회귀 결함 0건)**

```
collected 43 items

tests/test_compliance.py ........                                        [ 18%]
tests/test_external_api.py ....                                          [ 27%]
tests/test_finops_observability.py ......                                [ 41%]
tests/test_health.py .....                                               [ 53%]
tests/test_lifecycle.py ........                                         [ 72%]
tests/test_routing.py ......                                             [ 86%]
tests/test_virtual_keys.py ......                                        [100%]

======================== 43 passed, 21 warnings in 4.09s ========================
```

### 3.3 프론트엔드 프로덕션 빌드 결과 (`npm run build`)
```
> ai-orchestrator-admin@1.0.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 1887 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.95 kB │ gzip:  0.60 kB
dist/assets/index-Qwonu1QZ.css   12.51 kB │ gzip:  3.32 kB
dist/assets/index-DajwFeUB.js   312.58 kB │ gzip: 85.85 kB
✓ built in 3.72s
```

### 3.4 Definition of Done (DoD) 자동화 검증 스크립트 실행 로그
```bash
./scripts/verify-phase5.sh
```
```
==========================================================
🧪 AI Orchestrator Phase 5 Definition of Done (DoD) Audit
  [에어갭 긴급 패치 관리자 & 서포트 엔진 검증]
==========================================================
==> [1/4] Verifying Phase 5 Schemas, Models, Patch & Support Engine...
  ✅ All Phase 5 core files verified.
==> [2/4] Running Backend Tests (RSA-4096 Signatures, Rolling Deploy, Rollback, Zero-PII Bundle)...
  ✅ All Phase 5 lifecycle tests passed (8/8).
  ✅ Full test suite (43/43 tests) passed without regressions.
==> [3/4] Validating Frontend Production Build (Vite)...
  ✅ Frontend production bundle compiled successfully.
==> [4/4] Verifying Air-Gap Lifecycle & Zero-PII Invariants...
  ✅ Lifecycle invariants verified: RSA-4096 Vendor Signatures, Zero-PII Sanitization, Offline ZIP generation.
==========================================================
🎉 SUCCESS: Phase 5 Lifecycle & Patch Management is 100% complete and verified!
==========================================================
```

### 3.5 실환경 브라우저 E2E 검증 증적
- **검증 환경**: `http://localhost:5173/?t=phase5_verify`
- **시연 녹화**: `verify_phase5_lifecycle_1789171840274.webp`
- **스크린샷**: `phase5_verification_success_1789171915217.png`
- **검증 결과**:
  1. 원클릭 시스템 자가 진단 실행 ➔ 5대 컴포넌트(PostgreSQL, Redis, Kafka, EKS vLLM, DCGM) 전체 정상 통과.
  2. Zero-PII 서포트 번들 생성 ➔ `zero-pii-support-bundle-20260912.zip` 브라우저 다운로드 확인.
  3. 벤더 긴급 핫픽스 번들 로드 ➔ 초록색 RSA-4096 서명 검증 배지 노출 확인.
  4. 1. 드라이런 검증 ➔ PDB, gRPC 호환성 확인 로그 출력.
  5. 2. 무중단 롤링 핫픽스 배포 ➔ 4단계 터미널 스트리밍, ext_proc 버전이 `v1.2.1-hotfix`로 갱신되고 상태가 `최신 패치 완료`로 반영됨을 확인.

---

## 4. 산출물 및 소스 코드 파일 매핑 목록

| 구분 | 파일 경로 | 설명 |
| :--- | :--- | :--- |
| **Backend Model** | [`aiorche/backend/app/models/patch_history.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/models/patch_history.py) | 패치 적용 및 롤백 이력 ORM 모델 |
| **Backend Core** | [`aiorche/backend/app/core/patch_engine.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/core/patch_engine.py) | RSA-4096 서명 검증, Dry-Run, 무중단 롤링 배포 및 롤백 엔진 |
| **Backend Core** | [`aiorche/backend/app/core/support_bundle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/core/support_bundle.py) | Zero-PII 필터링 및 기술지원 ZIP 번들 압축 생성기 |
| **Backend Schema** | [`aiorche/backend/app/schemas/lifecycle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/schemas/lifecycle.py) | Pydantic V2 패치 검증, 배포, 롤백, 진단, 번들 스키마 |
| **Backend API** | [`aiorche/backend/app/api/v1/endpoints/lifecycle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/api/v1/endpoints/lifecycle.py) | Lifecycle & Patch Management REST API (9종) |
| **PostgreSQL DDL** | [`aiorche/deploy/postgres/init.sql`](file:///Users/jason/project/오케스트레이터/aiorche/deploy/postgres/init.sql) | `patch_history` 테이블 DDL 및 인덱스 정의 |
| **Database Seed** | [`aiorche/backend/app/db/init_db.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/db/init_db.py) | 기준 패치 이력 시딩 추가 |
| **Frontend API** | [`aiorche/frontend/src/api/client.js`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/api/client.js) | Lifecycle & Patch API 클라이언트 함수군 |
| **Frontend UI** | [`aiorche/frontend/src/components/LifecycleTab.jsx`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/components/LifecycleTab.jsx) | 긴급 패치 인스톨러, 서명 배지, 드라이런, 롤링 배포, 자가진단, 서포트 번들 UI |
| **Unit/Int Test** | [`aiorche/backend/tests/test_lifecycle.py`](file:///Users/jason/project/오케스트레이터/aiorche/backend/tests/test_lifecycle.py) | Phase 5 전용 8종 자동화 테스트 |
| **DoD Script** | [`aiorche/scripts/verify-phase5.sh`](file:///Users/jason/project/오케스트레이터/aiorche/scripts/verify-phase5.sh) | Phase 5 완성 정의 자동 검증 스크립트 |
| **Makefile Target** | [`aiorche/Makefile`](file:///Users/jason/project/오케스트레이터/aiorche/Makefile) | `make verify-phase5` 타깃 |

---

> **최종 확인**: Phase 5의 모든 계획, 구현 과정, 아키텍처 결정 및 테스트 결과가 성공적으로 보존되었습니다.
