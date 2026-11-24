# Ordinatio Release Notes - 0.1.5

---

## 📌 Release Summary
- **Release Version**: `0.1.5`
- **Release Date**: 2026-11-24
- **Git Tag**: `0.1.5`
- **License**: Apache 2.0
- **Architectural Scope**: LLM 모델 카탈로그 관리 체계 혁신 (Model Name 도입, Route Alias 선택적 자동 동기화, vLLM 업스트림 매핑 최적화 및 UI/UX 명확화)

---

## 🛠️ Key Improvements & Features

### 1. 모델 카탈로그 다계층 식별자 체계 정립 및 모델 이름(Model Name) 지원
- **도입 배경**:
  - 기존에는 사람이 식별하기 쉬운 표시 명칭(Display Name)이 없어 기술적 식별자(Model ID)만으로 카탈로그를 관리해야 하는 불편함이 존재함.
- **개선 내용**:
  - `model_catalogs` 메타스토어 및 스키마에 `name VARCHAR(128)` 컬럼 추가.
  - 사용자가 "Qwen 36B Instruct", "Claude 3.5 Sonnet" 등 직관적인 자연어 모델명을 부여할 수 있도록 지원.
  - 대시보드 테이블에서 Model Name을 주 타이틀로 강조하고, 하단에 고유 식별자(`id: ...`)를 명시하여 관제 가독성 극대화.

### 2. Route Alias(클라이언트용 서비스 별칭)의 선택적 자동 동기화
- **도입 배경**:
  - 단순 1:1 서빙 환경(예: 클라이언트도 `qwen36`으로 호출하고 서버도 `qwen36`으로 구동)에서도 Model ID와 Route Alias를 중복 입력해야 하는 피로감 해소.
- **개선 내용**:
  - `alias` 컬럼을 필수(`NOT NULL`)에서 선택(`nullable=True`)으로 변경.
  - 모델 등록 시 `alias`를 생략하거나 미입력할 경우, 백엔드 및 프론트엔드가 자동으로 `model_id`와 동일하게 설정.
  - 고급 가상화 및 무중단 카나리 전환이 필요한 엔터프라이즈 환경을 위해 원하는 별칭을 직접 입력할 수 있는 기능은 100% 유지.

### 3. L7 AI Gateway 업스트림 모델명 매핑 최적화 (vLLM 502/404 원천 차단)
- **개선 내용**:
  - 게이트웨이가 vLLM 등 엔터프라이즈 업스트림 추론 노드로 요청을 포워딩할 때, 가상 `alias` 대신 실제 서버 런타임 식별자인 `model_id`를 최우선으로 매핑하도록 라우팅 디스패처 로직 개선.
  - vLLM의 `--model` 식별자 불일치로 인한 404/502 오류를 원천 차단하고 실제 추론 스트림 완결 보장.

### 4. UI/UX 라벨 및 사용자 안내 문구 직관화
- **서버측 모델 식별자 (Model ID)**: 실제 GPU 서빙 엔진(vLLM, Ollama)이 로드한 고유 모델명임을 명확히 안내.
- **클라이언트용 서비스 별칭 (Alias - 선택)**: API 호출 클라이언트가 사용하는 가상 이름이며 생략 시 Model ID로 자동 채워진다는 힌트 제공.

### 5. 솔루션 버전 일원화 (0.1.5)
- 백엔드 설정(`config.py`), 프론트엔드 UI 스트링(`strings.js`, `client.js`), 인스톨러(`install.sh`), 설치 환경설정 예시(`install.conf.example`) 전반에 걸쳐 `0.1.5` 통일 반영.

---

## 📦 Container Images & Artifacts

| Service | Image | Description |
| :--- | :--- | :--- |
| **Backend** | `keikun808/ordinatio-backend:0.1.5` | FastAPI 컨트롤 플레인, xDS 제어, 텔레메트리 & FinOps |
| **Frontend** | `keikun808/ordinatio-frontend:0.1.5` | React 18 + Vite SPA, Nginx 1.31 웹 콘솔 |
| **Gateway** | `envoyproxy/envoy:v1.31.2` | L7 AI Gateway, 동적 xDS 라우팅, 실시간 토큰 레이트 리미터 |
| **Metastore** | `postgres:15-alpine` | PostgreSQL 15 메타스토어, WORM 감사로그 |
| **Cache** | `redis:7-alpine` | Redis 7 분산 토큰 슬라이딩 윈도우 & 세션 캐시 |

---

## 🧪 Verification Matrix
- **Backend Unit & Integration Tests**: 114/114 Passed (100%)
- **Routing & Model Catalog Tests**: 11/11 Passed (`tests/test_routing.py`)
- **Lifecycle & Health Probing**: PASS (`test_lifecycle.py`, `test_health.py`)
- **Frontend Production Build**: Vite v6.4.3 빌드 0 에러 정상 완료
- **EC2 Live Production Appliance Verification**:
  - `GET /api/v1/models` $\rightarrow$ `HTTP/1.1 200 OK` (Name, ID, Alias 일체 검증)
  - `GET /api/v1/models/health-check` $\rightarrow$ `HTTP/1.1 200 OK` (Latency 226ms Healthy)
  - `POST /v1/chat/completions` $\rightarrow$ `HTTP/1.1 200 OK` (vLLM 실추론 토큰 응답 검증)
