# PRE_24: 라우트 커스텀 경로 디스패치, FinOps 실시간 계량 누적 및 테넌트 매핑 선택 UI 구현 보고서

## 1. 개요 및 배경 (Executive Summary)

본 보고서는 온프레미스 에어갭 AI 오케스트레이터의 라우팅 제어 및 FinOps 비용 거버넌스 운영 중 보고된 4가지 핵심 결함을 근본적으로 해결하고, 라우트-테넌트 매핑 편의성을 대폭 향상시킨 엔지니어링 내역과 검증 증적을 기록합니다.

### 대상 이슈 목록
1. **커스텀 라우트 경로 404 오류**: 신규 라우트 정책으로 `path_prefix: "/v1/tech"`를 등록하였으나, 게이트웨이 호출 시 `HTTP 404 Not Found`가 반환되는 현상.
2. **모델 카탈로그 핑(Health Check) 실패**: `gemma2:2b` 모델을 카탈로그에 등록했으나 헬스체크 프로브가 지속 실패(Connection Refused)하는 현상.
3. **FinOps 실시간 토큰량 및 비용 미갱신**: 추론 요청이 성공하더라도 FinOps 화면에서 `기술지원(TECH)` 조직의 토큰 소비량 및 집행 비용이 갱신되지 않고 `0`으로 동결되는 현상.
4. **테넌트 매핑 UX 불편**: 라우트 설정 시 대상 부서를 수동 텍스트로 입력해야 하여 휴먼 에러가 발생하기 쉬운 문제.

---

## 2. 근본 원인 분석 (Root Cause Analysis)

### 2.1 커스텀 라우트 경로 `/v1/tech` 404 오류 원인
1. **Envoy L7 인그레스 매처 부재**:
   - `deploy/envoy/envoy.yaml`에 `/v1/routes`, `/v1/chat/completions`, `/v1/models` 등 고정 프리픽스만 정의되어 있어, 임의 경로(`/v1/tech`)는 인그레스 매칭에서 누락되어 Envoy 차원에서 404를 반환함.
2. **FastAPI 백엔드 수신 핸들러 부재**:
   - `backend/app/api/v1/endpoints/gateway.py`에 `@router.post("/routes/{route_name}")` 및 `@router.post("/chat/completions")`만 존재하여, 활성 라우팅 정책의 `match_conditions.path_prefix`와 대조하여 디스패치하는 Catch-all 라우터가 부재함.

### 2.2 `gemma2:2b` 헬스체크 핑 실패 원인
- DB의 모델 카탈로그 레코드에 엔드포인트 URL이 `https://ollama-gemma/v1/chat/completions` (SSL 443 포트)로 잘못 등록됨.
- 실제 도커 브리지 네트워크 상의 `ollama-gemma` 컨테이너는 비-SSL **HTTP 11434 포트**(`http://ollama-gemma:11434/v1/chat/completions`)로 서빙 중이어서 연결이 거부됨.

### 2.3 FinOps 기술지원(TECH) 실시간 계량 미갱신 원인
1. **게이트웨이 실시간 계량 및 DB 반영 누락 (가장 결정적)**:
   - `gateway.py`의 `dispatch_chat_completion`에서 업스트림 LLM으로부터 토큰 사용량(`usage`)을 수신하였으나, 가상 API Key(`matched_key.total_tokens`, `matched_key.spent_krw`) 및 소속 조직(`tenant.spent_budget_krw`)의 누적치를 DB에 저장(`db.commit()`)하는 코드가 누락되어 있었음.
2. **테스트벤치 호출 인증 키의 타 부서 고정**:
   - 대시보드의 라우팅 테스트 호출(`_execute_single_test_call`)이 항상 전역 진단 키(`SYSTEM_DIAGNOSTICS_KEY`)로 고정되어 있었으며, 이 키는 DB 상에서 `dept-01 (자산관리본부)`에 귀속되어 있어 기술지원 부서로 사용량이 잡히지 않음.
3. **라우팅 정책과 테넌트 간 바인딩 누락**:
   - `tech-ass` 정책의 `match_conditions`에 `tenant_codes: ["TECH"]`가 미등록되어 있었음.
4. **프론트엔드 UI(`FinOpsTab.jsx`) 마크업 누락**:
   - 백엔드 API가 내려주는 `total_tokens`를 프론트엔드 상태로 수신했으나, 부서별 카드 UI 마크업에서 토큰 수치를 렌더링하는 태그가 누락되어 있었음.

---

## 3. 해결 및 구현 내역 (Implementation Details)

### 3.1 Envoy & Backend 동적 커스텀 경로 디스패처
- **Envoy L7 인그레스 확장 ([envoy.yaml](file:///Users/jason/project/오케스트레이터/ordinatio/deploy/envoy/envoy.yaml))**:
  ```yaml
  - match:
      prefix: "/v1"
    route:
      cluster: backend_service
      timeout: 120s
  ```
- **FastAPI 동적 경로 디스패처 ([gateway.py:L634-L688](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/api/v1/endpoints/gateway.py#L634-L688))**:
  - `@router.post("/{custom_path:path}")`를 추가하여 `/v1/tech` 및 `/v1/tech/chat/completions` 요청을 활성 `RoutingPolicy`의 `match_conditions['path_prefix']`와 대조 후 해당 정책으로 자동 디스패치.

### 3.2 모델 카탈로그 엔드포인트 정정
- `model_catalogs` 테이블의 `gemma2:2b` 레코드를 `http://ollama-gemma:11434/v1/chat/completions` (엔진: `Ollama`)로 정정.

### 3.3 FinOps 실시간 토큰 계량 및 비용 누적 엔진 구현 ([gateway.py](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/api/v1/endpoints/gateway.py))
- `record_token_and_cost_metering` 헬퍼 함수 구현:
  - 모델 단가(`input_price_per_1k`, `output_price_per_1k`) 기반 원화(KRW) 비용 정밀 산출.
  - 가상 API Key 및 부서(Tenant)의 누적 토큰량과 집행 예산을 단일 트랜잭션으로 원자적 커밋(`db.commit()`).
  - 요청 헤더(`x-orche-tenant`) 또는 정책 매칭 조건(`tenant_codes`)을 참조하여 진단 키 호출이라도 해당 부서의 실적으로 정확히 귀속.
  - 응답 메타데이터(`orche_metadata.finops`)에 실시간 과금 정보 주입.

### 3.4 라우트 테스트벤치 헤더 주입 및 정책 바인딩 ([routing.py](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/api/v1/endpoints/routing.py))
- `_execute_single_test_call`에서 `method: "path"` 및 `method: "header"` 모두에 대해 정책의 `tenant_codes[0]`를 `x-orche-tenant` 헤더로 자동 주입.
- `tech-ass` 정책의 DB `match_conditions`에 `tenant_codes: ["TECH"]` 영속화.

### 3.5 프론트엔드 UI 개선 ([FinOpsTab.jsx](file:///Users/jason/project/오케스트레이터/ordinatio/frontend/src/components/FinOpsTab.jsx) & [RoutingTab.jsx](file:///Users/jason/project/오케스트레이터/ordinatio/frontend/src/components/RoutingTab.jsx))
- **FinOps 화면**:
  - 부서별 카드 우측 상단에 `⚡ {totalTokens} tokens` 뱃지 추가.
  - 100원 미만 소액 소비에 대해 소수점 둘째 자리 정밀 표기(`₩0.66`, `₩1.30`) 지원.
  - 카드 하단에 누적 소비 토큰량 메타데이터 표시.
- **라우팅 제어 화면**:
  - 기존 수동 텍스트 입력창을 제거하고, `apiClient.getTenants()`로 조회된 **등록 테넌트 목록 드롭다운** 제공.
  - 선택된 테넌트를 `[기술지원 (TECH) ✕]` 형태의 인터랙티브 뱃지 칩으로 표시하여 직관적인 추가/삭제 지원.
  - 신규 라우트 생성 모달에도 테넌트 선택 드롭다운 탑재.

---

## 4. 검증 결과 및 증적 (Verification Evidence)

### 4.1 `gemma2:2b` 헬스체크 핑 검증
```bash
POST /api/v1/models/gemma2%3A2b/health
➔ HTTP 200 OK: {"is_healthy": true, "status_code": 200, "latency_ms": 2.92}
```

### 4.2 `/v1/tech` 라우팅 및 LLM 추론 검증
```bash
# 1. /v1/tech 직접 호출 (DeepSeek 모델 50% 분기)
curl -X POST "http://localhost:8080/v1/tech" ... ➔ HTTP 200 OK (LIVE_UPSTREAM)

# 2. /v1/tech 직접 호출 (Gemma2 모델 50% 분기)
curl -X POST "http://localhost:8080/v1/tech" -d '{"model":"gemma2:2b", ...}' ➔ HTTP 200 OK (LIVE_UPSTREAM)

# 3. OpenAI 표준 SDK 서브패스 (/v1/tech/chat/completions)
curl -X POST "http://localhost:8080/v1/tech/chat/completions" ... ➔ HTTP 200 OK
```

### 4.3 FinOps 실시간 계량 누적 검증 (기술지원 TECH)
- **1차 호출 (DeepSeek)**: 296 tokens / ₩0.66 누적
- **2차 호출 (Gemma2)**: 278 tokens / ₩0.64 누적
- **DB 누적 결과 및 API 검증 (`GET /api/v1/finops/overview`)**:
  ```json
  {
    "tenant_id": "dept-tech",
    "tenant_name": "기술지원",
    "department_code": "TECH",
    "monthly_budget_krw": 15000000.0,
    "spent_budget_krw": 1.3,
    "remaining_budget_krw": 14999998.7,
    "total_tokens": 574
  }
  ```

### 4.4 회귀 테스트 및 빌드 검증
- **백엔드 테스트 스위트 (`uv run pytest`)**: **78 passed (100% 통과)**
- **프론트엔드 프로덕션 빌드 (`npm run build`)**: **Vite build 2.11s 완료 (0 Errors)**
- **컨테이너 핫 리로드**: `ordinatio-backend`, `ordinatio-envoy`, `ordinatio-frontend` 정상 가동.

---

## 5. 변경 파일 목록 (File Diff Summary)

| 파일 경로 | 구분 | 주요 변경 사항 |
| :--- | :---: | :--- |
| `ordinatio/backend/app/api/v1/endpoints/gateway.py` | Backend | FinOps 실시간 계량 누적 함수 및 `/v1/{custom_path:path}` 동적 디스패처 구현 |
| `ordinatio/backend/app/api/v1/endpoints/routing.py` | Backend | 테스트벤치 호출 시 `x-orche-tenant` 자동 주입 로직 추가 |
| `ordinatio/deploy/envoy/envoy.yaml` | Infra | `/v1` 와일드카드 프리픽스 라우팅 룰 추가 |
| `ordinatio/frontend/src/components/FinOpsTab.jsx` | Frontend | 누적 토큰량 뱃지 및 소수점 정밀 통화 포맷팅 반영 |
| `ordinatio/frontend/src/components/RoutingTab.jsx` | Frontend | 등록된 테넌트 목록 드롭다운 및 인터랙티브 뱃지 칩 선택 UI 구현 |
