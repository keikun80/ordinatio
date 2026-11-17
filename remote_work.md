# 프로젝트: Ordinatio AI Orchestrator (폐쇄망 AI 어플라이언스)
# 작업 목표: 프론트엔드 UI/UX 결함 해결, Envoy 게이트웨이 라우팅 복구, 가상키 발급 실시간 연동, 백엔드 타임아웃 개선

---

## 1. 개요 및 배경
- 본 어플라이언스는 Envoy L7 게이트웨이(8080), FastAPI 백엔드(8000), Vite React 프론트엔드(5173/80), vLLM 모델 서빙 인프라로 구성되어 있습니다.
- 오늘 발생한 다음 5가지 주요 문제들을 순차적으로 일괄 수정해야 합니다:
  1. **DevInspector HTTP 비보안 컨텍스트 cURL 복사 실패** (클립보드 API 권한 문제)
  2. **가상 API Key 발급 모달(SCR-VK-M01) 모델 미표시 버그** (실시간 조회 및 Fallback 처리)
  3. **Overview 대시보드 시스템 이상 징후 하드코딩 Mock 제거** (실제 무장애 시 정상 상태 표시)
  4. **Envoy 게이트웨이 `no healthy upstream` 장애 해결** (도커 브리지 호스트 IP 매핑)
  5. **라우팅 벤치마크 테스트 3초 조기 타임아웃 오류 수정** (Connect/Read Timeout 분리)

---

## 2. 세부 수정 작업 내역

### 작업 1: DevInspector HTTP 환경 클립보드 복사 Fallback 구현
- **파일**: `aiorche/frontend/src/components/DevInspector.jsx`
- **문제**: 폐쇄망/사내망 환경에서 HTTPS가 아닌 HTTP IP/도메인으로 접근 시 `navigator.clipboard.writeText()`가 `SecurityError`를 발생시켜 cURL 명령 복사가 동작하지 않음.
- **요청 사항**:
  - `handleCopyCurl` 함수에 비보안 컨텍스트용 Fallback 로직 추가:
  - `navigator.clipboard?.writeText` 실패 시, 숨겨진 `<textarea>` 요소를 생성하고 `document.execCommand('copy')`를 호출하는 안전한 복사 fallback 구현.
  - 복사 성공 여부에 따른 Toast 및 툴팁 피드백 정상 출력.

---

### 작업 2: SCR-VK-M01 가상키 발급 모달 모델 실시간 로딩 및 UX 개선
- **파일**: `aiorche/frontend/src/components/VirtualKeysTab.jsx`, `aiorche/frontend/src/constants/strings.js`
- **문제**: 가상키 발급 모달을 띄웠을 때 DB에 등록된 최신 모델 목록이 즉시 반영되지 않아 체크박스 목록이 비어 있거나 로컬스토리지 갱신이 누락됨.
- **요청 사항**:
  1. **실시간 모델 재조회**: 모달 오픈(`handleOpenCreateModal`) 시 `apiClient.getModels()`를 즉시 호출하여 최신 모델 목록을 가져오고, 실패 시 `localStorage('aiorche_models')`에서 안전하게 fallback 로딩.
  2. **Empty State UX 개선**: 등록된 모델이 0개일 경우 "등록된 모델이 없습니다" 안내 메시지와 함께 '모델 카탈로그(SCR-RT-02)'로 바로 이동할 수 있는 바로가기 버튼 제공.
  3. **문구 정리**: 하드코딩된 한글 안내 문구 및 라벨을 `strings.js` 상수로 정비.

---

### 작업 3: Overview 대시보드 이상 징후 Mock 데이터 제거 및 클린 UI
- **파일**: `aiorche/frontend/src/components/OverviewTab.jsx`, `aiorche/frontend/src/components/RoutingTab/subtabs/ModelCatalog.jsx`
- **문제**: 실제 이상 징후가 없음에도 과거 테스트용 Mock 알림("비인가 모델 접근 시도", "응답 지연 경고")이 화면에 상시 노출되어 혼선 유발. 모델 카탈로그 상단의 불필요한 중복 안내 배너 노출.
- **요청 사항**:
  1. `OverviewTab.jsx`: 하드코딩된 이상 징후 Mock 배열을 제거하고, 실제 백엔드 이벤트 기반으로 동작하도록 수정. 이벤트가 없을 때는 "감지된 시스템 이상 징후가 없습니다 (정상 운영 중)" 그린 상태 표시.
  2. `ModelCatalog.jsx`: 상단의 불필요한 보일러플레이트 부제목 및 회색 안내 박스 제거.

---

### 작업 4: Envoy 게이트웨이 `no healthy upstream` 장애 복구
- **파일**: `aiorche/deploy/envoy/envoy.yaml`
- **문제**: Envoy 프록시가 Docker 컨테이너로 동작할 때, 백엔드 라우팅 및 업스트림 vLLM 호출 경로에서 로컬 호스트(`127.0.0.1` / `localhost`)를 컨테이너 자기 자신으로 해석하여 패킷이 루프백되어 `503 Service Unavailable / no healthy upstream` 발생.
- **요청 사항**:
  1. 호스트 머신(FastAPI 백엔드 8000 등)과 통신해야 하는 클러스터의 엔드포인트를 `127.0.0.1` 대신 Docker 브리지 게이트웨이 IP(`172.17.0.1`)로 변경.
  2. vLLM 모델 업스트림 클러스터 설정에서 ALB/도메인 주소의 DNS 해석(`dns_lookup_family: V4_ONLY`) 및 Host 헤더 리라이트(`auto_host_rewrite: true`) 점검.
  3. Envoy 컨테이너 재기동 후 `curl -X POST localhost:8080/v1/tech/chat` 호출 시 503 에러가 해결되고 정상 라우팅되는지 검증.

---

### 작업 5: 라우팅 벤치마크 테스트 조기 타임아웃(3s) 수정
- **파일**: `aiorche/backend/app/api/v1/endpoints/routing.py`, `.env`
- **문제**: 화면(SCR-RT-03) 또는 `/api/v1/routing/test-call-all` 실행 시 45초 타임아웃 지정에도 불구하고 3초(3009ms) 만에 `"게이트웨이 LLM 모델 추론 타임아웃 (45초 초과)"` 에러 발생.
- **근본 원인**:
  - `httpx.Timeout(45.0, connect=3.0)`으로 연결 타임아웃이 3초로 제한되어 있음.
  - 컨테이너 전용 호스트명(`http://envoy:8080`)으로 먼저 연결을 시도하다가 호스트 환경에서 DNS 지연으로 3초 만에 `ConnectTimeout` 발생.
  - 예외 처리 블록에서 `ConnectTimeout`을 `ReadTimeout`과 구분 없이 즉시 `break`하여 후속 루프백 후보(`127.0.0.1:8080`) 시도 기회를 차단함.
- **요청 사항**:
  1. **후보 호스트 우선순위 최적화**:
     ```python
     candidate_hosts = [
         "http://127.0.0.1:8080",
         "http://localhost:8080",
         envoy_ingress,
         "http://envoy:8080",
     ]
     ```
  2. **Connect Timeout과 Read Timeout 분리**:
     - LLM 생성 대기시간을 고려하여 `ReadTimeout`을 120초로 상향, `ConnectTimeout`은 10초로 지정:
     ```python
     client_timeout = httpx.Timeout(120.0, connect=10.0, read=120.0)
     ```
  3. **예외 처리 분기**:
     - `httpx.ConnectTimeout`, `httpx.ConnectError` 발생 시 루프를 중단하지 않고 다음 후보 호스트로 폴백(`continue`).
     - `httpx.ReadTimeout` 발생 시에만 실제 추론 지연으로 판단하고 루프 종료(`break`).
  4. 환경변수 `ENVOY_INGRESS_URL`을 `http://127.0.0.1:8080`으로 설정.