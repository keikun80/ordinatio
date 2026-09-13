# Phase 3 구현 계획서 및 테스트 결과 보고서: 관제, FinOps 과금 및 Prometheus/Grafana 통합 (Observability & FinOps Governance)

## 1. 개요 및 구현 계획 (Implementation Plan)

### 1.1 배경 및 목적
본 단계는 엔지니어링 계획서(`dashboard_arch/dashboard_engineering_plan.md`)의 **Phase 3: 관제, FinOps 과금 및 Prometheus/Grafana 통합**을 상용급 에어갭 자립형 모노레포(`aiorche/`)에 구축하여, 1초 주기 실시간 텔레메트리 관제 스트림, 토큰 단위 실시간 계량 및 Hard Cap(100% 예산 초과 시 즉시 HTTP 429 차단) 엔진, 사내 회계 결산용 UTF-8 BOM CSV 청구서 스트리밍 엔진을 완성하는 것을 목표로 합니다.

### 1.2 아키텍처 원칙 및 구현 사양
1. **1초 주기 실시간 텔레메트리 관제 스트림 (`app/core/telemetry_hub.py`)**:
   - `TelemetryHub`: 브라우저 관리자 콘솔과 WebSocket(`ws://localhost:8000/api/v1/observability/ws`) 세션을 유지하며 1초 주기로 실시간 RPS, TPS, TTFT(ms), 에러율(5xx), 누적 비용, Multi-Compute Pools(EKS, ECS, EC2) 인프라 부하를 브로드캐스트.
   - 단절 및 재접속 시 리소스 릭 방지 및 연결 즉시 첫 번째 텔레메트리 패킷 능동 푸시.
   - 클라이언트 핑-퐁(`ping` -> `pong`) 헬스체크 지원.
2. **FinOps 과금 & Hard Cap 자동 차단 엔진**:
   - **표준 토큰 계량 단가 모델 (`app/schemas/finops.py`)**: 입력 토큰 ₩0.80/1k, 출력 토큰 ₩2.40/1k, KV 캐시 적중 할인 75%(₩0.20/1k).
   - **Hard Cap 100% 자동 차단 (`app/api/v1/endpoints/virtual_keys.py`)**: 부서의 누적 지출액(`spent_budget_krw`)이 월간 예산(`monthly_budget_krw`)의 100%에 도달하고 `is_hard_cap_enabled == True`인 경우, 가상키 검증(`POST /api/v1/virtual-keys/validate`) 시 `HTTP 429 Too Many Requests` (`TENANT_HARD_CAP_EXCEEDED`)를 즉시 반환하여 L7 AI 게이트웨이 및 클라이언트의 신규 추론을 원천 차단.
   - 소프트 캡 모드(`is_hard_cap_enabled == False`)인 경우 초과 사용 허용 및 경고 상태 유지.
3. **사내 회계 결산용 동적 CSV 청구서 스트리밍 (`app/api/v1/endpoints/finops.py`)**:
   - 엔드포인트: `GET /api/v1/finops/invoices/export?month=YYYY-MM`
   - `StreamingResponse` 적용으로 메모리 부하 없는 스트리밍 반환.
   - **한글 엑셀 완벽 호환**: UTF-8 Byte Order Mark (`\uFEFF`)를 첫 바이트에 삽입하여 Microsoft Excel에서 한글 깨짐 현상 원천 방지.
   - 컬럼 규격: `부서ID,부서명,부서코드,월간예산(KRW),누적지출액(KRW),잔여예산(KRW),소진율(%),하드캡적용,차단상태,총처리토큰,결산기준월`.
4. **프론트엔드 실시간 대시보드 연동**:
   - `OverviewTab.jsx`: `apiClient.getObservabilityWsUrl()`을 통해 웹소켓에 직접 연결되어 실시간 트래픽, 토큰 출력 속도, 지연시간, Compute Pool 상태를 1초 단위로 리렌더링 (헤더에 `🟢 실시간 WebSocket (1s 스트림)` 배지 표출).
   - `FinOpsTab.jsx`: `apiClient.getFinOpsOverview()`를 연동하여 전사 AI 월간 총 예산, 누적 집행액, 소진율, 월말 예상 지출액(Run Rate) 4종 집계 카드 및 부서별 프로그레스 바 실시간 바인딩.
   - 원클릭 `사내 결산 청구서 다운로드 (CSV)` 트리거 시 백엔드 스트리밍 엔드포인트 호출 및 파일 다운로드.

### 1.3 아키텍처 대체 결정 기록 (ADR-03, ADR-04 현행화)
본 단계 구현 시 100% 에어갭 폐쇄망 환경의 운영 자립성과 단순성을 극대화하기 위해 다음 두 가지 대체 아키텍처 결정을 채택하고 정식 반영하였습니다.

| 결정 번호 | 최적화 영역 | 기존 초기 구상 | 현행화된 프로덕션 아키텍처 | 채택 배경 및 엔지니어링 효과 |
| :---: | :---: | :--- | :--- | :--- |
| **ADR-03** | FinOps 과금 계량 | Apache Kafka 비동기 이벤트 컨슈머 | **Envoy L7 직접 보고 동기식 원자적 계량 API** (`POST /api/v1/external/usage/report`) | 분산 Kafka 클러스터 설치/운영 오버헤드 없이 단일 DB 트랜잭션으로 토큰/비용의 100% 원자적 일관성 및 초저지연 보장 |
| **ADR-04** | 전문 관제 대시보드 | Grafana Kiosk 모드 iFrame 직접 임베딩 | **전문 3종 내장 관제 패널 및 외부 Grafana 연동 링크** | Grafana 컨테이너 미구동 상태에서도 L7, GPU, FinOps 3대 화면을 자체 독립적으로 완벽 관제 가능 |

---

## 2. 테스트 결과 보고서 (Test Results & Verification)

### 2.1 자동화 단위 및 통합 테스트 (`uv run pytest -v`)
- **실행 위치**: `aiorche/backend/`
- **테스트 파일**: `tests/test_finops_observability.py`, `tests/test_routing.py`, `tests/test_virtual_keys.py`, `tests/test_external_api.py`, `tests/test_health.py`
- **결과**: **26 / 26 테스트 100% PASS**

| 테스트 모듈 및 케이스 | 검증 내용 | 결과 |
| :--- | :--- | :---: |
| `test_observability_metrics_summary` | 관리자 Overview용 REST 실시간 집계 지표 반환 검증 | **PASSED** |
| `test_observability_websocket_telemetry` | 1초 주기 WebSocket 스트림 연결, JSON 패킷 수신 및 ping-pong | **PASSED** |
| `test_observability_promql_proxy` | Grafana 및 모니터링 연동용 PromQL 쿼리 프록시 정상 동작 | **PASSED** |
| `test_finops_overview_and_pricing` | 부서별 예산 소진 현황 및 모델별 계량 단가 매트릭스 계산 검증 | **PASSED** |
| `test_finops_csv_invoice_export` | UTF-8 BOM(`\uFEFF`) 헤더, 한글 인코딩 및 CSV 스트리밍 다운로드 무결성 | **PASSED** |
| `test_hard_cap_enforcement_blocks_traffic` | 예산 100% 소진 테넌트의 추론 요청에 대한 HTTP 429 차단 검증 | **PASSED** |
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

### 2.2 Phase 3 Definition of Done (DoD) 전체 감사 (`make verify-phase3`)
- **실행 스크립트**: `bash aiorche/scripts/verify-phase3.sh`

```
==========================================================
🧪 AI Orchestrator Phase 3 Definition of Done (DoD) Audit
  [관제 실시간 텔레메트리 & FinOps 과금 거버넌스 검증]
==========================================================
==> [1/4] Verifying Phase 3 Schemas, Endpoints & Core Files...
  ✅ All Phase 3 core files verified.
==> [2/4] Running Backend Tests (Telemetry Hub, FinOps Overview, UTF-8 BOM CSV, Hard Cap 429)...
======================== 26 passed, 8 warnings in 2.53s ========================
  ✅ All 26 backend unit and integration tests passed.
==> [3/4] Validating Frontend Production Build (Vite)...
  ✓ built in 2.90s
  ✅ Frontend production bundle compiled successfully.
==> [4/4] Verifying Hard Cap & FinOps CSV Invariants...
  ✅ FinOps invariants verified: Hard Cap 429, UTF-8 BOM CSV streaming, 1s WebSocket stream, UI export button.
==========================================================
🎉 SUCCESS: Phase 3 Observability & FinOps Governance is 100% complete and verified!
```

### 2.3 브라우저 실환경 UI / WebSocket / CSV 다운로드 검증
- **검증 환경**: `http://localhost:5173/`
- **검증 결과**:
  1. **개요 탭**: `🟢 실시간 WebSocket (1s 스트림)` 배지 활성화, 초당 처리 트래픽(143 RPS), 토큰 생성 속도(4,226 TPS), TTFT(35ms), 일일 누적 비용이 1초 주기로 실시간 갱신됨을 확인.
  2. **FinOps 탭**: `실시간 DB 연동 완료 (2개 부서)` 배지 표시, 전사 총 예산 ₩45,000,000, 누적 집행액 ₩8,260,003, 소진율 18.36%, 월말 예상 지출 ₩22,527,280 및 각 부서별 프로그레스 바 확인.
  3. **청구서 다운로드**: `[📥 사내 결산 청구서 다운로드 (CSV)]` 버튼 클릭 시 `사내 회계 결산용 부서별 정산 청구서(CSV - UTF-8 BOM)가 성공적으로 다운로드되었습니다.` 토스트 발생 및 브라우저 다운로드 정상 완료.
- **증적 아티팩트**:
  - 개요 탭 웹소켓 스크린샷: `overview_tab_websocket_1789136069150.png`
  - FinOps 탭 청구서 다운로드 스크린샷: `finops_tab_invoice_toast_1789136131434.png`
  - 전체 시나리오 영상 녹화: `phase3_finops_demo_1789136054484.webp`

### 2.4 글로벌 관제 홈(Overview) 100% 실데이터 연동 및 깜빡임 결함 해결 (2026-09-13 현행화)
1. **서빙 인프라 풀 리소스 실데이터화 (`ComputePoolStatus`)**:
   - **기존 한계**: EKS/ECS/EC2 등 3개 고정 더미 배열로 렌더링.
   - **개선 구현**:
     - `telemetry_hub.py`에서 PostgreSQL `model_catalogs` 테이블을 실시간 조회하여 현재 활성화된 모델 목록을 서빙 인프라 풀로 동적 구성.
     - 각 모델의 서빙 엔진(`vLLM`, `Ollama`), 배포 인프라(`On-Prem K8s`, `Local Docker`), 호스트 시스템 실제 메모리 점유율(`psutil.virtual_memory().percent`), Envoy 클러스터 실시간 업스트림 큐 깊이(`upstream_rq_active`)를 실시간 매핑하여 전송.
2. **모델별 실시간 트래픽 점유율 실데이터화 (`ModelTrafficShare`)**:
   - **기존 한계**: Llama 68%, 70B 24%, Solar 8% 정적 하드코딩 비율.
   - **개선 구현**:
     - PostgreSQL WORM 불변 감사로그(`audit_logs`) 테이블에서 `COUNT(*) GROUP BY model_id` 쿼리를 실행하여 실제 누적 호출 통계를 산출.
     - Envoy 실시간 초당 요청수(RPS)를 가중 결합하여 현재 카탈로그에 등록된 5대 모델별 실시간 트래픽 점유율(%)을 1초 주기로 동적 계산 및 시각화.
3. **지표 요약 모드 깜빡임(Flickering) 근본 원인 해결 (Lifecycle Decoupling)**:
   - **원인 분석**: `OverviewTab.jsx`의 `useEffect` 의존성 배열에 `metricsSummary` 객체가 포함되어 있어, WebSocket 패킷이 수신되어 상태가 바뀔 때마다 `fetchSummary()` REST 호출이 재트리거되는 무한 상태 전파 및 리렌더링 경쟁 상태 발생.
   - **해결 방안**:
     - `hasFetchedRef = useRef(false)` 플래그를 도입하여 컴포넌트 마운트 시 최초 1회만 REST 요약을 가져오도록 수명주기 디커플링.
     - 이후 지표 갱신은 1초 주기 WebSocket 스트림으로만 스무스하게 반영되도록 일원화하고, 소켓 연결 단절 시 자동 폴백 재연결 로직 적용.
4. **증적 아티팩트**:
   - 실데이터 화면 스크린샷: `01_overview_main_real_data_1789260326198.png`
   - 깜빡임 제거 검증 스크린샷: `01_overview_no_flicker_1789260605135.png`
   - 검증 세션 녹화: `verify_flicker_fixed_1789260588656.webp`

