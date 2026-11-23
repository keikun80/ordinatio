# Ordinatio Standalone 어플라이언스 네트워크 & 헬스체크 명세서 (Network & Endpoint Specification)

본 문서는 Ordinatio Standalone 모드에서 구동되는 5대 핵심 컨테이너 및 인프라의 **네트워크 포트 바인딩**, **컴포넌트별 역할**, **공식 헬스체크 경로(Health Check Probes)** 및 **진단 검증 명령어**를 정의합니다.

---

## 1. 전사 서비스 네트워크 매트릭스 (Network Port Matrix)

| 구분 | 컴포넌트명 | 컨테이너명 | 호스트 바인딩 포트 | 컨테이너 내부 포트 | 바인딩 스코프 | 프로토콜 | 주요 역할 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Presentation** | Admin Web Console | `ordinatio-frontend` | **`5173`** | `5173` | 외부 공개 (`0.0.0.0`) | HTTP | React 18 SPA + Nginx 웹 대시보드 |
| **Control Plane** | FastAPI REST Server | `ordinatio-backend` | **`8000`** | `8000` | 외부 공개 (`0.0.0.0`) | HTTP / WS | 어플라이언스 제어 평면, 인증, 라우팅 관리 |
| **Data Plane** | Envoy AI Gateway | `ordinatio-envoy` | **`8080`** | `8080` | 외부 공개 (`0.0.0.0`) | HTTP (OpenAI) | L7 AI 추론 트래픽 인그레스 (라우팅/로드밸런싱) |
| **Management** | Envoy Admin Console | `ordinatio-envoy` | **`9901`** | `9901` | 외부 공개 (`0.0.0.0`) | HTTP | Envoy 내부 엔진 통계 및 라이프사이클 프로브 |
| **Metastore** | PostgreSQL 15 | `ordinatio-postgres` | **`5432`** | `5432` | **로컬 루프백 (`127.0.0.1`)** | PostgreSQL | 메타데이터, 테넌트, 감사로그(WORM) 영구 저장 |
| **Cache & Quota** | Redis 7 | `ordinatio-redis` | **`6379`** | `6379` | **로컬 루프백 (`127.0.0.1`)** | RESP | 실시간 토큰 쿼터, 레이트리밋, 분산 캐시 |

> [!IMPORTANT]
> **보안 격리 원칙 (Loopback Binding Invariant)**
> - DB(`5432`)와 Redis(`6379`)는 외부 네트워크 침입 방지를 위해 **`127.0.0.1` 로컬 루프백**으로만 바인딩되어 외부 직접 접근이 원천 차단됩니다.
> - 웹 UI는 포트 `80`을 일절 점유하지 않으며, 전용 포트 **`5173`**으로 단독 서비스됩니다.

---

## 2. 컴포넌트별 헬스체크 상세 규격 (Health Check Probes)

### ① Control Plane: FastAPI Backend (`:8000`)
- **담당 역할**: 전사 제어 평면 관리 REST API
- **헬스체크 엔드포인트**: `GET http://<HOST>:8000/api/v1/health`
- **검증 명령어**:
  ```bash
  curl -sf http://localhost:8000/api/v1/health
  ```
- **정상 응답 (HTTP 200)**:
  ```json
  {
    "status": "UP",
    "service": "Ordinatio Standalone Appliance",
    "version": "0.1.4",
    "environment": "production"
  }
  ```
- **주의 사항**:
  - 백엔드 REST API는 `/api/v1` 프리픽스를 사용하므로 `http://localhost:8000/health` 호출 시 `404 Not Found`가 발생합니다. 반드시 **`/api/v1/health`**를 호출해야 합니다.

---

### ② Data Plane: Envoy AI Gateway Traffic Ingress (`:8080`)
- **담당 역할**: OpenAI 규격 L7 AI 추론 트래픽 인그레스 파이프라인
- **추천 헬스체크 엔드포인트**: `GET http://<HOST>:8080/v1/models`
- **검증 명령어**:
  ```bash
  curl -i http://localhost:8080/v1/models
  ```
- **정상 응답 (HTTP 200)**:
  ```http
  HTTP/1.1 200 OK
  server: envoy
  content-type: application/json
  x-envoy-upstream-service-time: 11

  {
    "object": "list",
    "data": [
      {
        "id": "agent-auto",
        "object": "model",
        "owned_by": "AgentRouter (Autonomous Dispatch)"
      },
      {
        "id": "meta-llama/Llama-3.1-8B-Instruct",
        "object": "model",
        "owned_by": "Envoy AI Gateway (Fast 8B Tier)"
      }
    ]
  }
  ```
- **주의 사항**:
  - Envoy 8080 포트는 AI 추론 트래픽 전용 라우팅 포트입니다.
  - `/api/` 프리픽스는 등록되어 있지 않으므로 `http://localhost:8080/api/v1/health` 호출 시 Envoy가 경로를 찾지 못해 `404 Not Found`를 반환합니다.
  - 별도의 API 키 없이도 게이트웨이 파이프라인 무결성을 즉시 검증할 수 있는 공식 경로는 **`/v1/models`**입니다.

---

### ③ Envoy Engine Management: Admin Console (`:9901`)
- **담당 역할**: Envoy 프록시 코어 엔진 런타임 상태 진단
- **헬스체크 엔드포인트**: `GET http://<HOST>:9901/ready`
- **검증 명령어**:
  ```bash
  curl -s http://localhost:9901/ready
  ```
- **정상 응답 (HTTP 200)**:
  ```text
  LIVE
  ```
- **참고 관리 엔드포인트**:
  - 전체 Prometheus 메트릭 수집: `http://localhost:9901/stats/prometheus`
  - 동적 클러스터/업스트림 헬스 상태: `http://localhost:9901/clusters`

---

### ④ Presentation: Admin Web Console (`:5173`)
- **담당 역할**: React 18 + Vite 웹 관리자 대시보드
- **헬스체크 엔드포인트**: `GET http://<HOST>:5173/`
- **검증 명령어**:
  ```bash
  curl -I http://localhost:5173/
  ```
- **정상 응답 (HTTP 200)**:
  ```http
  HTTP/1.1 200 OK
  Server: nginx/1.31.8
  Content-Type: text/html
  ```

---

### ⑤ Metastore: PostgreSQL 15 (`:5432`)
- **검증 도구**: `pg_isready` (PostgreSQL 내장 프로브 유틸리티)
- **검증 명령어**:
  ```bash
  docker exec -i ordinatio-postgres pg_isready -U postgres -d ordinatio_db
  ```
- **정상 응답 (Exit 0)**:
  ```text
  /var/run/postgresql:5432 - accepting connections
  ```

---

### ⑥ Quota & Cache: Redis 7 (`:6379`)
- **검증 도구**: `redis-cli ping`
- **검증 명령어**:
  ```bash
  docker exec -i ordinatio-redis redis-cli ping
  ```
- **정상 응답 (Exit 0)**:
  ```text
  PONG
  ```

---

## 3. 원스톱 호스트 자동 진단 명령어 (CLI Quick Reference)

어플라이언스 호스트에서 전체 서비스 무결성을 1초 만에 일괄 진단하려면 `ordinatio-ctl` 도구를 사용합니다.

```bash
# 전체 스택 DoD 헬스 프로브 일괄 검증
ordinatio-ctl verify
```

**출력 결과 예시:**
```
=== Ordinatio DoD 헬스 프로브 검증 ===
• [1/3] Backend REST API (/api/v1/health):                 PASS (HTTP 200)
• [2/3] Envoy AI Gateway (/ready):                         PASS (LIVE)
• [3/3] Frontend Admin Dashboard (http://localhost:5173/):   PASS (HTTP 200)
```

---

## 4. 흔히 혼동하기 쉬운 포인트 비교 (FAQ)

| 혼동 질문 | 설명 및 올바른 가이드 |
| :--- | :--- |
| **8000번 vs 8080번 차이가 무엇인가요?** | • **`8000`**: 백엔드 REST API (테넌트 생성, API 키 발급, 설정 제어)<br>• **`8080`**: AI 추론 Gateway (OpenAI Chat/Completions 트래픽 전달) |
| **8080번에 `/api/v1/health`를 찌르면 왜 404가 나나요?** | 8080번은 Envoy가 가로채서 OpenAI 라우트(`/v1/*`)만 백엔드로 포워딩합니다. `/api/*` 경로는 Envoy 라우팅 테이블에 매핑되지 않으므로 404가 반환됩니다. |
| **80번 포트는 왜 열리지 않나요?** | Ordinatio는 기업 인프라의 기존 80 포트(기존 웹서버, 리버스 프록시 등)와의 포트 충돌을 방지하기 위해 웹 UI를 전용 포트 **`5173`**으로 단독 격리하여 실행합니다. |
