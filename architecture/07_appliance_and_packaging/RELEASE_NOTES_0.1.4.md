# Ordinatio Release Notes - 0.1.4

---

## 📌 Release Summary
- **Release Version**: `0.1.4`
- **Release Date**: 2026-11-24
- **Git Tag**: `0.1.4`
- **License**: Apache 2.0
- **Architectural Scope**: L7 AI Gateway 긴급 SSE 스트리밍 타임아웃 확장 및 Standalone 프론트엔드 Nginx 403 결함 근본 패치

---

## 🛠️ Key Bugfixes & Enhancements

### 1. Standalone 배포 환경 Nginx 403 Forbidden 근본 해결 (Bugfix)
- **발생 원인**: `docker-compose.standalone.yml`에서 호스트 경로 `./frontend/dist`를 컨테이너 `/usr/share/nginx/html`에 바인드 마운트하여, 호스트 디렉터리가 비어 있을 때 컨테이너 내부의 정상 빌드 정적 산출물이 가려져 Nginx가 403 Forbidden을 반환하고 컨테이너가 Unhealthy 상태에 빠지던 결함.
- **수정 조치**:
  - `docker-compose.standalone.yml`에서 `./frontend/dist:/usr/share/nginx/html:ro,z` 볼륨 마운트 완전 제거.
  - 도커 이미지(`keikun808/ordinatio-frontend:0.1.4`) 내부 번들링된 불변(Immutable) 프로덕션 정적 자산을 직접 서빙하도록 아키텍처 정합화.

### 2. 장시간 LLM 에이전틱 생성 시 `Connection closed mid-response` 해결 (Enhancement)
- **발생 원인**:
  - AWS ALB의 유휴 타임아웃 기본값(60초) 및 Envoy Gateway의 고정 타임아웃(120초)으로 인해 Claude Code CLI 및 장시간 추론(Thinking) 시 SSE 스트림이 중간 단절되던 현상.
- **수정 조치**:
  - AWS Application Load Balancer `idle_timeout.timeout_seconds`를 300초(5분)로 증설.
  - Envoy AI Gateway (`deploy/envoy/envoy.yaml`) 라우트에 `timeout: 0s` (무제한 스트리밍) 및 `idle_timeout: 300s` 부여.
  - Ordinatio 백엔드 SSE 클라이언트(`gateway.py`) 타임아웃을 300초로 확장.
  - 대용량 장문 추론 57초 이상 연속 스트리밍 완결 검증 완료 (`message_start` ~ `message_stop`).

### 3. 솔루션 버전 일원화 (0.1.4)
- 백엔드 설정(`config.py`), 프론트엔드 UI 스트링(`strings.js`), 인스톨러(`install.sh`), 단일 호스트 Compose 규격 전반에 걸쳐 `0.1.4` 통일 반영.

---

## 📦 Container Images & Artifacts

| Service | Image | Description |
| :--- | :--- | :--- |
| **Backend** | `keikun808/ordinatio-backend:0.1.4` | FastAPI 컨트롤 플레인, xDS 제어, 텔레메트리 & FinOps |
| **Frontend** | `keikun808/ordinatio-frontend:0.1.4` | React 18 + Vite SPA, Nginx 1.31 웹 콘솔 |
| **Gateway** | `envoyproxy/envoy:v1.31.2` | L7 AI Gateway, 동적 xDS 라우팅, 실시간 토큰 레이트 리미터 |
| **Metastore** | `postgres:15-alpine` | PostgreSQL 15 메타스토어, WORM 감사로그 |
| **Cache** | `redis:7-alpine` | Redis 7 분산 토큰 슬라이딩 윈도우 & 세션 캐시 |

---

## 🧪 Verification Matrix
- **Backend Unit & Integration Tests**: 114/114 Passed (100%)
- **Lifecycle & Health Probing**: PASS (`test_lifecycle.py`, `test_health.py`)
- **Frontend Production Build**: Vite v6.4.3 빌드 0 에러 정상 완료
- **EC2 Live Production Appliance Verification**:
  - `http://ellt-comm-etc-aiproxy-elb-1879199041.ap-northeast-2.elb.amazonaws.com:5173/` $\rightarrow$ `HTTP/1.1 200 OK`
  - `http://ellt-comm-etc-aiproxy-elb-1879199041.ap-northeast-2.elb.amazonaws.com:8080/v1/techpoc/v1/messages?beta=true` $\rightarrow$ SSE 2,010 라인 무결 완결
