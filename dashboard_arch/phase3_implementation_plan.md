# Phase 3 구현 계획서: 관제, FinOps 과금 및 Prometheus/Grafana 통합 (Observability & FinOps)

## 1. 개요 및 배경

본 문서는 `dashboard_arch/dashboard_engineering_plan.md`의 **Phase 3: 관제, FinOps 과금 및 Prometheus/Grafana 통합**을 상용급 에어갭 자립형 모노레포(`aiorche/`)에 구축하기 위한 상세 소프트웨어 공학 설계서입니다.

### 핵심 목표
1. **실시간 텔레메트리 관제 스트림**: 1초 주기 WebSocket Hub (`/api/v1/observability/ws`), REST 지표 요약 및 PromQL 프록시
2. **FinOps 과금 & Hard Cap 자동 차단 엔진**: 모델별 입력/출력/캐시 토큰 단가 실시간 계량, 부서별 100% 예산 초과 시 즉시 차단(HTTP 429) 로직
3. **사내 회계 결산용 동적 CSV 스트리밍**: 사내 ERP/FinOps 연동 및 엑셀 호환 UTF-8-BOM CSV 청구서 스트리밍 다운로드 (`/api/v1/finops/invoices/export`)
4. **프론트엔드 연동**: `OverviewTab.jsx`의 5대 핵심 KPI 및 Compute Pool 실시간 바인딩, `FinOpsTab.jsx` 실제 예산 소진율 및 원클릭 CSV 청구서 다운로드
5. **DoD 자동화 검증**: `test_finops_observability.py`, `scripts/verify-phase3.sh`, `make verify-phase3`

---

## 2. 아키텍처 및 상세 컴포넌트 설계

### 2.1 Backend Domain & Schemas
- **`app/schemas/finops.py`**:
  - `FinOpsPricingMatrix`: 입력 토큰(₩0.80), 출력 토큰(₩2.40), KV-Cache 적중 할인(₩0.20)
  - `TenantFinOpsSummary`: 부서별 예산, 누적 소진액, 소진율(%), 하드캡 차단 여부
  - `FinOpsOverviewResponse`: 사내 전체 AI 지출 현황 및 월말 예상 지출액
- **`app/schemas/observability.py`**:
  - `TelemetryPacket`: `rps`, `tps`, `ttft_ms`, `error_rate_5xx`, `cumulative_cost_krw`, `compute_pools`
  - `ComputePoolStatus`: `pool_name`, `infra`, `pod_count`, `waiting_queue`, `gpu_memory_pct`

### 2.2 실시간 텔레메트리 스트림 허브 (WebSocket)
- **`app/core/telemetry_hub.py`**:
  - `TelemetryConnectionManager`: 활성 브라우저 WebSocket 연결 관리
  - 1초 주기로 백그라운드 태스크에서 Envoy 및 vLLM 메트릭을 수집/모의하여 연결된 모든 관리자 화면으로 브로드캐스트
  - 네트워크 단절 및 재연결 시 리소스 릭 방지

### 2.3 Hard Cap 예산 100% 도달 시 즉시 차단 엔진
- 부서의 누적 사용액(`spent_budget_krw`)이 `monthly_budget_krw`에 도달하고 `is_hard_cap_enabled == True`인 경우:
  - `POST /api/v1/virtual-keys/validate` 호출 시 `is_valid: False`, `reason: "TENANT_HARD_CAP_EXCEEDED"`, HTTP 429 반환
  - Envoy AI Gateway가 해당 부서의 신규 추론 요청을 즉시 차단하여 초과 과금 원천 차단

### 2.4 사내 회계 결산용 동적 CSV 청구서 스트리밍 생성 엔진
- **`GET /api/v1/finops/invoices/export?month=YYYY-MM`**:
  - `StreamingResponse`로 대용량 데이터도 메모리 부담 없이 스트리밍
  - 한글 엑셀 깨짐 방지용 `UTF-8 with BOM (\uFEFF)` 적용
  - 헤더 규격: `부서ID`, `부서명`, `부서코드`, `월간예산(KRW)`, `누적지출액(KRW)`, `잔여예산(KRW)`, `소진율(%)`, `하드캡상태`, `총처리토큰`, `차단여부`, `결산일시`

---

## 3. 프론트엔드 연동 계획

1. **`OverviewTab.jsx`**:
   - `useEffect`에서 `ws://localhost:8000/api/v1/observability/ws`에 연결
   - 수신되는 패킷으로 RPS, TPS, TTFT, 비용 및 EKS/ECS/EC2 풀 대기 큐를 실시간 리렌더링
   - WebSocket 미연결 시 로컬 모의 지표로 graceful fallback
2. **`FinOpsTab.jsx`**:
   - `apiClient.getFinOpsOverview()`를 호출하여 실제 부서별 지출액 및 프로그레스 바 바인딩
   - `[📥 사내 결산 청구서 다운로드]` 클릭 시 브라우저에서 백엔드 CSV 엔드포인트를 호출하여 실제 파일 다운로드 트리거
3. **`client.js`**:
   - `getFinOpsOverview()`, `exportInvoiceUrl()`, `getMetricsSummary()` 메서드 추가

---

## 4. 검증 계획 및 완료 정의 (Definition of Done)

### 4.1 자동화 단위/통합 테스트 (`backend/tests/test_finops_observability.py`)
- `test_observability_metrics_summary`: REST 지표 요약 정상 응답 검증
- `test_observability_websocket_telemetry`: WebSocket 핸드셰이크 및 텔레메트리 패킷 수신 검증
- `test_finops_overview_and_pricing`: 토큰 단가표 및 부서별 지출 요약 검증
- `test_finops_csv_invoice_export`: CSV 다운로드 헤더, UTF-8 BOM, 내용 무결성 검증
- `test_hard_cap_enforcement_blocks_traffic`: 예산 100% 초과 테넌트 가상키 검증 시 HTTP 429 차단 검증

### 4.2 Phase 3 Definition of Done (DoD) 감사 스크립트 (`scripts/verify-phase3.sh`)
- 4단계 자동화 감사:
  1. Phase 3 스키마, 엔드포인트, 컴포넌트 파일 존재 검증
  2. 25개 이상 전체 백엔드 단위/통합 테스트 100% 통과 검증
  3. 프론트엔드 Vite 프로덕션 빌드 성공 검증
  4. Hard Cap 차단 로직 및 CSV 인보이스 스트리밍 불변식 검증
- Makefile 타깃: `make verify-phase3`
