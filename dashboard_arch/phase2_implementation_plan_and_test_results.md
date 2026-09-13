# Phase 2 구현 계획서 및 테스트 결과 보고서: 동적 모델 카탈로그 및 Envoy L7 xDS 제어 평면 (Dynamic Catalog & Routing Engine)

## 1. 개요 및 구현 계획 (Implementation Plan)

### 1.1 배경 및 목적
본 단계는 엔지니어링 계획서(`dashboard_arch/dashboard_engineering_plan.md`)의 **Phase 2: 동적 모델 카탈로그 및 Envoy L7 xDS 제어 평면 연동**을 모노레포(`aiorche/`)에 정식 구현하여, AI 모델의 동적 등록 및 관리, 카나리 배포(80:20 트래픽 가중치 분할), Prefix-Cache Affinity(세션 스티키 라우팅), 장애 시 Fallback 서킷 브레이킹을 Envoy L7 게이트웨이의 xDS(RDS) 프로토콜을 통해 실시간 동적으로 제어하는 것을 목표로 합니다.

### 1.2 아키텍처 원칙 및 구현 사양
1. **도메인 엔티티 모델링**:
   - `ModelCatalog`: 모델 식별자(`model_id`), 명칭(`display_name`), 제공자(`provider`), 컨텍스트 윈도우(`context_window`), 입출력 단가(`cost_per_1k_input`, `cost_per_1k_output`), P95 지연시간(`p95_latency_ms`), 헬스 상태(`health_status`), 활성화 여부
   - `RoutingPolicy`: 라우팅 식별자(`route_id`), 라우트 경로명(`route_name`), 트래픽 분할 가중치(`traffic_split`: JSON `{model_id: weight}`), 해시 정책(`hash_policy`: JSON), 타임아웃(`timeout_ms`), 재시도(`retry_attempts`), 장애 폴백 모델(`fallback_model_id`), xDS 리비전(`xds_revision`), 활성화 여부
2. **Envoy xDS RouteConfiguration 동적 변환 엔진 (`app/core/xds_generator.py`)**:
   - Envoy L7 xDS v3 API 표준 규격 준수: `type.googleapis.com/envoy.config.route.v3.RouteConfiguration`
   - **가중치 기반 클러스터 분할(Weighted Clusters)**: 백분율 합산 100% 가중치를 Envoy L7 클러스터별 `weight` 필드로 매핑
   - **Prefix Cache Affinity**: 세션 헤더(`x-session-id`) 기반 일관 해싱(`hash_policy`)을 적용하여 동일 프롬프트/세션이 특정 vLLM 파드로 라우팅되어 KV 캐시 히트율 극대화
   - **Fallback & Retry**: 5xx, gateway-error 발생 시 자동 재시도 및 지정된 폴백 모델로의 즉시 우회 보장
   - **동적 리비전 태깅**: 정책 수정 시 `xds-rev-YYYYMMDD-HHMMSS` 형식의 불변 식별자 자동 부여
3. **제어 평면 API 사양**:
   - `GET /api/v1/models/`: 사내 배포된 AI 모델 카탈로그 목록 및 지연시간/상태 조회
   - `POST /api/v1/models/`: 신규 서빙 엔진/모델 동적 등록
   - `PATCH /api/v1/models/{model_id}`: 모델 메타데이터, 비용, 활성화 상태 변경
   - `GET /api/v1/routing/policies`: 현재 활성화된 라우팅 정책 목록
   - `POST /api/v1/routing/dry-run`: Envoy 반영 전 가중치 합산(100%) 검증 및 xDS RouteConfiguration JSON 프리뷰
   - `POST /api/v1/routing/deploy-canary`: 카나리 정책 DB 저장 및 xDS 신규 리비전 즉각 배포
   - `POST|GET /api/v1/xds/v3/discovery:routes`: Envoy 프록시가 구독하는 동적 RDS(Route Discovery Service) 표준 엔드포인트
4. **프론트엔드 라우팅 제어 콘솔 (`RoutingTab.jsx`)**:
   - 실시간 트래픽 분할 슬라이더 (예: Qwen2.5 80% : Llama-3 20%)
   - Prefix-Cache Affinity 및 Fallback Model 드롭다운 선택기
   - "Dry-Run 검증" 모달 (Envoy RDS v3 RouteConfig JSON 사전 검증)
   - "Envoy L7 라우팅 정책 무중단 배포 (RDS v3)" 원클릭 트리거 및 현재 Envoy 라우팅 리비전 배지 표시
   - 아키텍처 가이드 안내 배너 (서빙 모델은 xDS 미사용 / Envoy L7이 REST RDS v3 구독) 탑재
5. **폐쇄망 Kubernetes 5개 Pod 배포 아키텍처 (`aiorche/deploy/k8s/`)**:
   - 네임스페이스: `aiorche`
   - `01-postgres.yaml`: PostgreSQL 16 메타데이터 스토어 Pod & ClusterIP
   - `02-redis.yaml`: Redis 7 캐시 및 세션 스토어 Pod & ClusterIP
   - `03-backend.yaml`: FastAPI 코어 제어 평면 백엔드 Pod & ClusterIP (8000)
   - `04-envoy.yaml`: Envoy L7 AI 게이트웨이 Pod & NodePort (10000, 9901)
   - `05-frontend.yaml`: React Admin Web 콘솔 Pod & NodePort (30080)

### 1.3 아키텍처 대체 결정 기록 (ADR-01, ADR-02 현행화)
본 단계 구현 시 100% 에어갭 폐쇄망 환경의 운영 자립성과 단순성을 극대화하기 위해 다음 두 가지 대체 아키텍처 결정을 채택하고 정식 반영하였습니다.

| 결정 번호 | 최적화 영역 | 기존 초기 구상 | 현행화된 프로덕션 아키텍처 | 채택 배경 및 엔지니어링 효과 |
| :---: | :---: | :--- | :--- | :--- |
| **ADR-01** | xDS 제어 평면 | `go-control-plane` gRPC ADS 서버 | **FastAPI Envoy REST RDS v3** (`/api/v1/xds/v3/discovery:routes`) | 별도 무거운 Go 데몬 의존성을 배제하고 Envoy 공식 `rest_api_provider`를 단일 백엔드에 통합하여 무중단 카나리 라우팅 구현 |
| **ADR-02** | 컴퓨팅 풀 관제 | K8s `InferencePool` 실시간 CRD Watcher | **Multi-Compute Pools 동적 상태 모델링** | 폐쇄망에서 K8s cluster-admin API 권한 종속성을 배제하고 `telemetry_hub`를 통한 1초 주기 실시간 관제 스트림 구축 |

---

## 2. 테스트 결과 보고서 (Test Results & Verification)

### 2.1 자동화 단위 및 통합 테스트 (`uv run pytest -v`)
- **실행 위치**: `aiorche/backend/`
- **테스트 파일**: `tests/test_routing.py`, `tests/test_virtual_keys.py`, `tests/test_external_api.py`, `tests/test_health.py`
- **결과**: **20 / 20 테스트 100% PASS**

| 테스트 모듈 및 케이스 | 검증 내용 | 결과 |
| :--- | :--- | :---: |
| `test_model_catalog_crud` | 모델 카탈로그 조회 및 동적 모델 등록/상태 변경 | **PASSED** |
| `test_routing_policy_get_active` | 현재 적용된 L7 라우팅 정책 및 기본 가중치 조회 | **PASSED** |
| `test_dry_run_validation` | 가중치 100% 검증 오류 처리 및 정상 xDS JSON 미리보기 생성 | **PASSED** |
| `test_canary_deployment_lifecycle` | 카나리 80:20 배포 실행, DB 반영 및 신규 xDS 리비전 발급 | **PASSED** |
| `test_xds_discovery_routes_endpoint` | Envoy용 RDS 표준 응답 (`RouteConfiguration`, `weighted_clusters`) 검증 | **PASSED** |
| `test_client_self_inspection_me_and_models` | Bearer Token 기반 자가 쿼터 점검 및 인가 모델 목록 조회 | **PASSED** |
| `test_gateway_usage_reporting_and_cost_aggregation` | Envoy 사용량 보고 수신 및 키/부서 누적 토큰/비용 원자적 증가 | **PASSED** |
| `test_erp_tenant_budget_and_summary` | ERP 부서 월별 예산 변경 및 하드 캡 실시간 토글 | **PASSED** |
| `test_prometheus_metrics_scrape` | `/metrics` OpenMetrics 지표 수집 검증 | **PASSED** |
| `test_tenant_lifecycle` | 테넌트 목록 조회 및 신규 부서 등록 라이프사이클 | **PASSED** |
| `test_virtual_key_creation_one_time_exposure_and_argon2_hashing` | 단 1회 평문 노출, `sk-orch-` 접두사, DB Argon2id 해싱 검증 | **PASSED** |
| `test_virtual_key_listing_does_not_leak_raw_key` | 키 목록 조회 시 평문 키 미노출 및 마스킹된 prefix 표출 검증 | **PASSED** |
| `test_virtual_key_validation_and_model_authorization` | 허용 모델/인가 대역 일치 여부 및 키 검증 통과 | **PASSED** |
| `test_virtual_key_revoke_lifecycle` | 원클릭 즉시 파기 및 차단 후 403 반환 검증 | **PASSED** |
| `test_virtual_key_update_lifecycle` | 키 명칭, 속도 제한(RPM/TPM), 상태 실시간 수정 및 DB 반영 | **PASSED** |
| `test_health.py` (5개 테스트) | Liveness, Readiness, 시스템 정보, 암호화 무결성 | **PASSED** |

### 2.2 Phase 2 Definition of Done (DoD) 전체 감사 (`make verify-phase2`)
- **실행 스크립트**: `bash aiorche/scripts/verify-phase2.sh`

```
==========================================================
🧪 AI Orchestrator Phase 2 Definition of Done (DoD) Audit
  [Envoy xDS 연동 & 동적 카나리 라우팅 엔진 검증]
==========================================================
==> [1/4] Verifying Phase 2 Schemas, Endpoints & Core Files...
  ✅ All Phase 2 core files verified.
==> [2/4] Running Backend Tests (Model Catalog, Dry-Run, Canary 80:20, xDS Discovery)...
======================== 20 passed, 4 warnings in 2.65s ========================
  ✅ All 20 backend unit and integration tests passed.
==> [3/4] Validating Frontend Production Build (Vite)...
  ✓ built in 3.21s
  ✅ Frontend production bundle compiled successfully.
==> [4/4] Verifying xDS Invariants & Canary Split Engine...
  ✅ Routing invariants verified: weighted_clusters, xds_revision generator, RDS REST endpoint, UI slider.
==========================================================
🎉 SUCCESS: Phase 2 Dynamic xDS Control Plane is 100% complete and verified!
```

### 2.3 Kubernetes 클러스터 5개 Pod 배포 및 파드 구동 상태 검증
- **명령어**: `kubectl get pods -n aiorche -o wide`
- **결과**: **5 / 5 파드 100% Running (Ready 1/1)**

| Pod Name | Ready | Status | Restarts | Age | Node / IP |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `postgres-5b86d57c7b-97m28` | 1/1 | **Running** | 0 | 15m | `desktop-worker` / 10.244.1.2 |
| `redis-b7f66f4b6-hfjvk` | 1/1 | **Running** | 0 | 15m | `desktop-worker` / 10.244.1.3 |
| `envoy-5cfc8cf5c5-gsxqh` | 1/1 | **Running** | 0 | 15m | `desktop-worker` / 10.244.1.4 |
| `backend-c64cbc9b9-twcqt` | 1/1 | **Running** | 0 | 15m | `desktop-worker` / 10.244.1.5 |
| `frontend-654f797f9-n2dtf` | 1/1 | **Running** | 0 | 14m | `desktop-worker` / 10.244.1.6 |

### 2.4 브라우저 실환경 UI / Envoy L7 xDS 배포 검증
- **검증 시나리오**:
  1. 관리자 콘솔 `모델 라우팅 (Envoy xDS)` 탭 진입
  2. 트래픽 분할 슬라이더를 `Qwen2.5-72B-Instruct` 80% : `Llama-3.3-70B-Instruct` 20%로 설정
  3. `Prefix-Cache Affinity` 토글 활성화 (`x-session-id` 해시 라우팅 적용)
  4. `Dry-Run 검증` 모달을 통해 Envoy xDS JSON payload 구조 확인
  5. `Envoy L7 즉시 배포` 버튼 클릭 -> xDS 신규 리비전(`xds-rev-20260911-230432`) 생성 및 성공 알림 배너 표출
- **증적 아티팩트**:
  - 스크린샷: `phase2_xds_deployment_1789135472844.png`
  - 세션 녹화: `phase2_routing_demo_1789135426348.webp`

### 2.5 화면 UI 아키텍처 정합성 개편 및 실환경 검증 (ADR-01 / ADR-02 연계)
- **개편 배경**: "모델은 xDS를 사용하지 않는 순수 HTTP 추론 엔진이며, xDS는 Envoy L7 프록시가 구독하는 동적 라우팅 규격"이라는 점을 운영자가 직관적으로 인지할 수 있도록 UI 용어 및 배너 전면 개편.
- **주요 개편 사항**:
  1. **사이드바 메뉴**: `xDS` 배지를 **`Envoy L7`** 배지로 직관화.
  2. **페이지 상단 헤더**: `Envoy L7 REST RDS v3` 배지 및 "L7 게이트웨이에서 가중치 분할 실시간 제어, 백엔드 모델은 재시작 없이 순수 추론 전념" 안내문 추가.
  3. **아키텍처 가이드 안내 배너 신설**: "서빙 모델(vLLM) 자체는 xDS를 사용하지 않는 순수 HTTP 추론 엔진이며, 트래픽 분기(80:20) 및 장애 우회는 Envoy L7 게이트웨이가 제어 평면의 REST RDS v3 API를 실시간 구독하여 수행함" 명시.
  4. **배포 버튼 및 상태 배지**: "🚀 Envoy L7 라우팅 정책 무중단 배포 (RDS v3)" 및 "현재 Envoy 라우팅 리비전 (RDS v3)" 표기.
  5. **모델 테이블 서브헤더**: "Multi-Compute 서빙 풀 (EKS/ECS/EC2) 엔드포인트 연동 [ADR-02]" 명시.
- **실환경 검증 증적**:
  - 스크린샷: `envoy_l7_rds_verified_1789137173884.png`
  - 브라우저 세션 녹화: `verify_routing_ui_update`

### 2.6 멀티 서빙 엔진(vLLM, Ollama), 실시간 헬스체크 및 라우트별 Envoy 게이트웨이 API 엔드포인트 연동 확장 (2026-09-13 현행화)
- **상세 설계서**: `dashboard_arch/MODEL_CATALOG_AND_GATEWAY_ROUTING_SPEC.md`
- **주요 확장 내역**:
  1. **서빙 런타임 엔진 & 실행 방식 다변화**:
     - `serving_engine` (`vLLM`, `Ollama`, `SGLang`, `Triton`) 및 `execution_method` (`k8s`, `docker-compose`, `direct`) 모델링.
     - 호스트 직접 실행 및 도커 컨테이너 구동 템플릿(Launch Snippet Box) 제공.
  2. **서빙 모델 풀 실시간 헬스체크 파이프라인**:
     - 타임아웃 2.5초 기반 비동기 프로빙 엔진(`probe_endpoint`), 엔진별 헬스 경로 분기(Ollama `/api/tags`, vLLM `/health`).
     - 전체 모델 병렬 점검(`GET /api/v1/models/health-check`) 및 개별 모델 즉시 점검(`POST /api/v1/models/{model_id}/health`).
     - 콘솔 [전체 헬스체크 (Ping All)] 버튼, 정상(ms 레이턴시)/오프라인 뱃지 및 개별 재점검 지원.
  3. **Envoy L7 게이트웨이 라우트별 API 엔드포인트 노출 및 연동 가이드**:
     - 경로 기반 라우팅: `http://localhost:8080/v1/routes/{route_name}` (`prefix_rewrite: "/v1/chat/completions"`).
     - 헤더 기반 라우팅: `http://localhost:8080/v1/chat/completions` (`x-orche-route: {route_name}`).
     - 라우트 상세 패널 내 원클릭 URL 복사, cURL 스니펫, Python OpenAI SDK 예제 제공.
     - 콘솔 내 **[⚡ 게이트웨이 즉시 테스트 호출]** 버튼 및 실시간 HTTP 응답/레이턴시 시각화.
  4. **테스트 통과 현황**:
     - `tests/test_routing.py`: **8 / 8 테스트 통과 (100% PASS)**
     - 전체 백엔드 테스트 스위트: **45 / 45 테스트 통과 (100% PASS)**

