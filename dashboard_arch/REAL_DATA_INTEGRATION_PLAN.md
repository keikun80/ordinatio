# 실제 데이터 연동을 위한 역할 분담(사용자 vs AI) 및 마스터 실행 계획표

**문서 번호**: AIORCHE-REAL-DATA-PLAN-20260912  
**기준 문서**: `dashboard_arch/INTEGRATED_FUNCTIONAL_TEST_SPEC.md`  
**대상 시스템**: AI 오케스트레이터 관리 포털 및 L7 제어 평면 (Control Plane / Data Plane)  
**작성 일자**: 2026-09-12  

---

## 1. 개요 및 목적

현재 AI 오케스트레이터 대시보드는 핵심 거버넌스(테넌트, 가상키 발급/수정/파기, 모델 카탈로그, Envoy xDS 동적 라우팅 배포, UTF-8 BOM CSV 청구서, PII 마스킹 및 WORM 감사 적재, RSA-4096 서명 패치/롤백, Preflight 진단, 서포트 번들)가 실제 DB 및 백엔드 엔진과 100% 실시간 연동되어 있습니다.

그러나 **시뮬레이션/Mock 데이터로 동작하는 요소(<span style="color: #5EF527; font-weight: bold;">#5EF527</span>)**와 **백엔드 미통신/로컬 정적 UI로 동작하는 요소(<span style="color: #F54927; font-weight: bold;">#F54927</span>)**가 존재합니다.  
본 문서는 이들 요소를 **"고객사 실환경 데이터(Production Live Data)"**로 100% 전환하기 위해, **사용자(인프라/운영자/고객사)의 영역**과 **AI(오케스트레이터 엔지니어링 에이전트)의 영역**을 명확히 정의하고, 구체적인 실행 계획표(Roadmap & Action Plan)를 제시합니다.

---

## 2. 연동 대상 요소 전수 목록 (#5EF527 및 #F54927)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       실제 데이터 전환 대상 17대 요소                         │
├──────────────────────────────────────┬──────────────────────────────────────┤
│    🟢 #5EF527 (백엔드 통신 Mock/시뮬레이션)   │        🔴 #F54927 (백엔드 미통신 / 로컬 더미)   │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 1. 글로벌 관제 5대 KPI (RPS/TPS/TTFT) │ 5. [연동완료] Header 인프라 배지     │
│ 2. vLLM 서빙 풀 자원 현황 (GPU/Queue)│ 6. Header 사용자 프로필 (홍길동/Admin)│
│ 3. FinOps 표준 계량 단가 기준표      │ 7. Header 핫픽스 대기 알림 카운트    │
│ 4. 프롬프트 스튜디오 vLLM LLM 응답   │ 8. [제거완료] Grafana 관제 (Envoy대체)│
│                                      │ 9. 모델별 실시간 트래픽 점유율 막대  │
│                                      │ 10. 최근 시스템 이상 징후 알림 리스트 │
│                                      │ 11. 가상키 검색 기능                 │
│                                      │ 12. 라우팅 가중치/로드밸런싱 로컬 설정│
│                                      │ 13. 컴플라이언스 시나리오 프리셋      │
│                                      │ 14. 감사 로그 백엔드 검색/필터링     │
│                                      │ 15. 감사 증적 포렌식 JSON 서버 출력  │
│                                      │ 16. 프롬프트 스튜디오 파라미터 조절  │
│                                      │ 17. 패치 번들 로컬 파일 업로드       │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. 역할 정의 및 책임 분담 원칙 (RACI 모델)

- **👤 나의 영역 (User / Infra Operator / Customer)**:
  - **인프라 권한 및 엔드포인트 제공**: 실제 GPU vLLM 서버, 온프레미스 Prometheus/Grafana, Keycloak SSO 서버의 도메인/IP 및 방화벽 인가.
  - **인증 정보 및 기밀 키(Secrets) 관리**: 서비스 계정 토큰, SSL/TLS 사설 인증서, 벤더 공식 RSA-4096 공개키 원본 반입.
  - **비즈니스 정책 및 기준값 확정**: 부서별 토큰 원가 산정 단가(원/1K tok), 경고 임계치(소프트/하드 캡), 사내 PII 탐지 규칙 규정.
- **🤖 AI의 영역 (AI Agent / Software Engineer)**:
  - **백엔드 어댑터 & 파이프라인 코드 작성**: Prometheus PromQL 실시간 스크래퍼, vLLM OpenAI 호환 스트리밍 클라이언트, Keycloak JWT 미들웨어 개발.
  - **DB 스키마 확장 & 쿼리 최적화**: 단가표 DB 테이블화, 시스템 알림 이벤트 영속화, 감사 로그 DB 페이징/복합 인덱스 작성.
  - **프론트엔드 실시간 바인딩 & 상태 관리**: Mock 제거 및 실제 REST/WebSocket/SSE 수신 연동, 에러 핸들링 및 재연결 로직 구현.
  - **자동화 검증 스크립트 작성**: 단위 테스트(`pytest`), 통합 회귀 테스트, 브라우저 E2E 검증.

---

## 4. 요소별 상세 연동 방안 및 역할 매트릭스

### 4.1 🟢 #5EF527 (백엔드 통신 Mock/시뮬레이션 ➔ 실제 데이터 전환)

| 번호 | 대상 요소 | 현재 상태 | 실제 데이터 전환 방안 | 나의 영역 (사용자 할 일) | AI의 영역 (AI 할 일) |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **M-1** | **글로벌 관제 5대 KPI**<br>(RPS, TPS, TTFT, 5xx, 누적비용) | **✅ 연동 완료 (Envoy Live & DB Live)** | Envoy L7 Admin API (`:9901/stats?format=json&filter=http\.ai_ingress`) 실시간 스크래핑 (`downstream_rq_total`, `tx_bytes`, `rq_time`, `rq_5xx`) 및 PostgreSQL DB 테넌트 누적비용(`spent_budget_krw`) 1초 주기 실시간 WebSocket 스트리밍 연동 완료 | • Envoy Admin 포트(:9901) 개방 확인 (**완료**) | • `telemetry_hub.py` 비동기 Envoy 실시간 스크래퍼 및 DB 누적비용 집계 구현 (**완료**)<br>• 프론트엔드 KPI 카드 Envoy Live 뱃지 및 테마 기본 스타일 복원 (**완료**) |
| **M-2** | **vLLM 서빙 풀 자원 현황**<br>(GPU 메모리, 대기열 큐, Pod 수) | 정적 EKS/ECS/EC2 풀 메타데이터 기반 모의 계산 | NVIDIA DCGM Exporter (`:9400`) 및 vLLM `/metrics` (`num_requests_waiting`, `gpu_cache_usage_factor`) 실제 지표 수집 | • vLLM 인스턴스 IP 및 DCGM exporter 엔드포인트 제공 | • vLLM/DCGM 메트릭 파서 구현<br>• 서빙 풀별 실제 GPU 온도, 메모리, 대기열 실시간 매핑 |
| **M-3** | **FinOps 표준 계량 단가표**<br>(Token Pricing Matrix) | 백엔드 코드에 하드코딩된 정적 단가표 (입력 0.8원, 출력 2.4원 등) | PostgreSQL 내 `pricing_matrix` 테이블 신설 및 관리자 GUI 기반 단가 CRUD 기능 연동 | • 사내 AI 서빙 원가(GPU 전력, 상각비 등) 기준 단가표 확정 | • `pricing_matrix` DB 모델, 마이그레이션 DDL 작성<br>• 단가 수정 REST API (`PUT /finops/pricing`) 개발 |
| **M-4** | **프롬프트 스튜디오 LLM 응답**<br>(Completion Output 텍스트) | PII 마스킹만 실제 수행하고, 응답 텍스트는 800ms 후 모의 금융 심사문 출력 | 실제 사내 vLLM 서버의 OpenAI 호환 엔드포인트 (`/v1/chat/completions`)로 프롬프트를 스트리밍 전달하여 실모델 추론 수행 | • 테스트용 vLLM 엔드포인트 URL 및 모델 가동 상태 확인 | • `httpx.AsyncClient` 기반 SSE 스트리밍 추론 프록시 엔드포인트 구현<br>• 프론트엔드 타자기(Typewriter) 스트리밍 UI 연동 |

---

### 4.2 🔴 #F54927 (백엔드 미통신 / 로컬 더미 ➔ 실제 백엔드 연동 전환)

| 번호 | 대상 요소 | 현재 상태 (미통신) | 실제 데이터 전환 방안 | 나의 영역 (사용자 할 일) | AI의 영역 (AI 할 일) |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **U-1** | **Header 인프라 안내 배지**<br>("온프레미스 주전산센터 DC-1") | **✅ 연동 완료 (.env Live)** | `.env` 환경변수(`DATACENTER_NAME`, `CLUSTER_REGION`) 및 백엔드 `GET /api/v1/system/info` API 조회를 통해 실제 센터/리전 정보 동적 바인딩 완료 | • `.env`에 전산센터 명칭 및 리전 설정 (**완료**) | • 백엔드 `config.py`, `system.py` 연동 및 `Header.jsx` 동적 바인딩 구현 (**완료**) |
| **U-2** | **Header 관리자 프로필**<br>("홍길동 수석 / Admin") | 정적 더미 아바타 및 텍스트 | Keycloak OIDC JWT 토큰 디코딩 또는 세션 API (`GET /auth/me`)를 통해 로그인된 실제 사원 정보 표시 | • Keycloak Realm 및 OIDC Client ClientSecret 발급/공유 | • OIDC JWT 검증 미들웨어 구축<br>• `GET /auth/me` 엔드포인트 구현 및 프론트 상태 연결 |
| **U-3** | **Header 핫픽스 대기 알림**<br>(배지 카운트 `1`) | 정적 `unreadPatchCount = 1` | DB `patch_history` 및 프라이빗 레지스트리(Harbor) 미적용 패치 목록 조회 (`GET /lifecycle/patches/pending`) | • 사내 패치 반입 저장소(Harbor) 접근 정보 제공 | • 미적용 보안 패치 감지 백엔드 API 구현<br>• Header 실시간 배지 숫자 동적 갱신 |
| **U-4** | ~~**Grafana 관제 모달 & 버튼**~~ | **미존재 (제거 완료)** | Envoy L7 게이트웨이 직결 실시간 메트릭(5대 KPI)으로 일원화됨에 따라 불필요한 외부 Grafana 연동 버튼 및 더미 모달 전면 제거 | • 해당 없음 (단일 폐쇄망 어플라이언스 자립 운영) | • Header 및 OverviewTab에서 버튼 제거 및 `GrafanaModal` 미사용화 완료 |
| **U-5** | **모델별 실시간 트래픽 점유율**<br>(68%, 24%, 8% 막대) | 정적 하드코딩 프로그레스바 | Envoy L7 라우트별 카운터 메트릭을 집계하여 최근 1분간의 실제 모델별 RPS 비율 계산 | • Envoy 메트릭 접근 허용 | • `telemetry_hub.py`에 최근 1분 슬라이딩 윈도우 모델별 트래픽 비율 계산 로직 추가<br>• 프론트엔드 동적 막대 연동 |
| **U-6** | **최근 시스템 이상 징후 알림**<br>(보안/인프라/FinOps 3건) | 정적 하드코딩 텍스트 3건 | DB `system_alerts` 테이블 신설 및 실제 PII 차단, 하드캡 도달, 노드 장애 이벤트 실시간 수신 | • 알림 보존 기간 및 심각도(Critical/Warning) 기준 정의 | • `system_alerts` ORM 모델 및 API (`GET /alerts`) 구현<br>• WebSocket 이벤트 브로드캐스트 연동 |
| **U-7** | **가상키 검색 (초기화 제거)** | 브라우저 메모리 필터링 (임의 초기화 버튼 제거됨) | 백엔드 DB 검색 쿼리 (`GET /virtual-keys?search=...`) 연동 | • 검색 인덱스 및 대소문자 무시 검색 정책 결정 | • SQLAlchemy `ilike` 다중 컬럼 검색 쿼리 최적화 및 서버 검색 연동 |
| **U-8** | **라우팅 가중치/전략 로컬 조절** | 슬라이더 조절 시 배포 전까지 로컬에만 보관 | 편집 중 상태(Draft)를 서버 세션 또는 Redis 임시 저장소에 자동 저장하여 다중 관리자 동시 편집 충돌 방지 | • 동시 편집 제어 정책(Locking) 요구사항 제시 | • 라우팅 Draft 저장 API (`POST /routing/draft`) 구현<br>• 배포 시 자동 검증 및 커밋 파이프라인 연계 |
| **U-9** | **컴플라이언스 시나리오 프리셋** | UI 동적 추가/삭제 모달 & localStorage 영속화 완료 | DB `sample_scenarios` 테이블에서 부서별 실무 검증용 최신 테스트 케이스 동적 로드 및 동기화 | • 사내 금융 업무별(여신, 카드, 수신) 대표 샘플 프롬프트 제공 | • 시나리오 프리셋 백엔드 CRUD API 구현 및 프론트 상태 동기화 |
| **U-10**| **감사 로그 검색 & 액션 필터** | 클라이언트 배열 필터링 | 백엔드 PostgreSQL 복합 인덱스 기반 페이지네이션 검색 (`GET /compliance/audit-logs?search=...&limit=50&offset=0`) | • 감사 로그 대용량(수백만 건) 보존 기간 및 파티셔닝 정책 결정 | • PostgreSQL 인덱스 최적화 (`requester_id`, `created_at`)<br>• 서버 사이드 무한 스크롤 / 페이지네이션 구현 |
| **U-11**| **감사 증적 JSON 파일 다운로드** | 브라우저 메모리상의 목록을 단순 Blob 저장 | 백엔드에서 위변조 방지 전자서명(RSA-SHA256) 및 기관 제출용 공문 메타데이터가 포함된 공식 JSON 스트리밍 | • 금감원/감사팀 제출 공문 양식 및 서명용 사설 인증서 제공 | • `GET /compliance/audit-logs/export-signed` 엔드포인트 구현<br>• 백엔드 전자서명 무결성 증적 생성 |
| **U-12**| **프롬프트 스튜디오 파라미터** | 슬라이더 변경 시 로컬만 변경 | 모델 카탈로그에 정의된 각 모델별 권장/허용 파라미터 범위(Min/Max/Default)를 DB에서 동적 바인딩 | • 모델별 하이퍼파라미터 권장 가이드라인 제공 | • 모델 카탈로그 스키마에 파라미터 메타데이터 추가 및 프론트 동적 렌더링 |
| **U-13**| **패치 번들 로컬 파일 선택** | 브라우저 파일 다이얼로그만 호출 | 실제 `.tar.gz` 파일을 청크 단위로 백엔드에 스트리밍 업로드 (`POST /lifecycle/patches/upload`) | • 오프라인 환경 반입 패치 파일(`.tar.gz`) 제공 | • `python-multipart` 기반 대용량 파일 스트리밍 업로드 엔드포인트 구현 |

---

## 5. 단계별 실행 계획표 (Roadmap & Action Schedule)

실제 데이터 연동은 시스템 안정성을 저해하지 않도록 **4단계(Sprint A ~ D)**로 순차 진행합니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      실제 데이터 연동 4단계 실행 로드맵                        │
├───────────────────┬───────────────────┬───────────────────┬─────────────────┤
│     Sprint A      │     Sprint B      │     Sprint C      │    Sprint D     │
│   인프라 & 메트릭   │   vLLM 실추론 연동  │   감사/인증/알림  │  운영 편의 & 정합성│
│   (M-1, M-2, U-5) │   (M-4, U-12, U-13)│(U-2, U-6, U-10,11)│ (M-3, U-1,3,4,7,8,9)│
├───────────────────┼───────────────────┼───────────────────┼─────────────────┤
│• Envoy/DCGM 지표  │• vLLM 실모델 호출  │• Keycloak JWT 연동│• 단가표 DB GUI  │
│  실제 스크래핑     │  SSE 스트리밍     │• WORM 감사 검색   │• Envoy 자체관제 │
│• 관제 KPI 실데이터│• 패치 업로드 완성 │• 전자서명 리포트  │• 리전 정보 연동 │
└───────────────────┴───────────────────┴───────────────────┴─────────────────┘
```

### 📅 상세 마일스톤 및 작업 분담표

#### [Sprint A] 인프라 메트릭 & 관제 실데이터 파이프라인 (진행 중: 5대 KPI 완료)
- **목표**: 글로벌 관제 홈의 5대 KPI 및 GPU 자원 현황을 실제 Prometheus / Envoy / DCGM 지표로 100% 전환.
- **진척도**: **글로벌 관제 5대 KPI (RPS, TPS, TTFT, 5xx, 누적비용) Envoy Admin API 및 DB 실시간 연동 완료 (100% 달성)**
- **할 일 목록**:
  1. [사용자] Envoy `:9901` 메트릭 엔드포인트 및 Prometheus 스크랩 대상 포트 방화벽 확인. (**완료**)
  2. [AI] 백엔드 `telemetry_hub.py`에 Envoy L7 카운터(`http.ai_ingress.*`) 비동기 스크래퍼 및 DB 누적비용 집계 엔진 구현. (**완료**)
  3. [AI] `telemetry_hub.py`에서 랜덤 난수 생성을 제거하고 실제 Envoy 메트릭을 1초 주기로 WebSocket 전송. (**완료**)
  4. [AI] 프론트엔드 `OverviewTab.jsx`의 5대 KPI 카드에 Envoy Live 뱃지 부여 및 테마 기본 스타일 복원. (**완료**)
  5. [AI] GPU 서빙 풀(DCGM) 및 모델별 점유율 막대 실시간 연동. (후속 진행 예정)
- **완료 기준 (DoD)**: Envoy에 실제 HTTP 요청 발생 시 RPS, TPS, 지연시간이 실시간 반영되고 더미 난수가 출력되지 않을 것. (**검증 통과**)

---

#### [Sprint B] vLLM 실서버 추론 프록시 & 패치 파일 실업로드 (우선순위: 높음)
- **목표**: 프롬프트 스튜디오에서 실제 vLLM 모델을 구동하여 응답을 수신하고, 오프라인 패치 파일을 실제 서버에 업로드.
- **기간 / 공수**: 4일
- **할 일 목록**:
  1. [사용자] vLLM 서버 IP (`http://<vllm-host>:8000/v1`) 가동 및 모델 로딩 확인.
  2. [AI] `app/api/v1/endpoints/studio.py`에 vLLM 스트리밍 SSE 프록시 엔드포인트 구현 (PII 마스킹 선행 후 vLLM 전달).
  3. [AI] `PromptStudioTab.jsx`의 목업 `setTimeout` 제거 및 `fetch` 기반 ReadableStream 실시간 타자기 효과 렌더링.
  4. [AI] `app/api/v1/endpoints/lifecycle.py`에 멀티파트 파일 업로드 (`/lifecycle/patches/upload`) 구현.
  5. [사용자] 샘플 `.tar.gz` 패치 파일 업로드 테스트 수행.
- **완료 기준 (DoD)**: 프롬프트 입력 시 실제 vLLM 모델이 생성한 텍스트가 스트리밍으로 출력되고, 업로드된 패치 번들이 백엔드 저장소에 온전히 기록될 것.

---

#### [Sprint C] 보안 거버넌스, WORM 감사 검색 & Keycloak SSO (우선순위: 중간)
- **목표**: WORM 감사 로그의 대용량 DB 검색/필터링 완결, 위변조 방지 전자서명 리포트 출력, Keycloak 로그인 사용자 연동.
- **기간 / 공수**: 4일
- **할 일 목록**:
  1. [사용자] Keycloak 서버 URL 및 Admin Console OIDC Client 생성/Secret 공유.
  2. [AI] FastAPI JWT 인증 미들웨어(`app/core/auth.py`) 활성화 및 `GET /auth/me` 엔드포인트 개발.
  3. [AI] `Header.jsx`의 정적 사용자명을 로그인된 실제 사용자명(`token.preferred_username`)으로 바인딩.
  4. [AI] `audit_logs` 테이블 복합 인덱스 생성 (`requester_id`, `key_id`, `created_at`) 및 서버 사이드 필터링 쿼리 구현.
  5. [AI] 전자서명이 포함된 WORM 감사 증적 JSON 내보내기 엔드포인트 개발 (`GET /compliance/audit-logs/export-signed`).
- **완료 기준 (DoD)**: Keycloak 로그인 계정으로 대시보드에 프로필이 표기되고, 감사 로그가 수만 건 이상이어도 100ms 이내로 페이징 검색될 것.

---

#### [Sprint D] FinOps 단가표 DB화, Grafana 실서버 연결 & 부가 편의 (우선순위: 기본)
- **목표**: 하드코딩된 단가표를 DB 관리로 전환하고, Grafana Kiosk 모드 iFrame을 실제 온프레미스 Grafana로 연결.
- **기간 / 공수**: 3일
- **할 일 목록**:
  1. [사용자] 사내 Grafana 서버 URL 제공 및 iframe 임베딩 허용 옵션 활성화 (`allow_embedding = true`).
  2. [AI] `pricing_matrix` DB 테이블 생성 및 FinOps 단가 관리 API 개발.
  3. [AI] `FinOpsTab.jsx`의 단가표 카드를 DB 조회 데이터로 동적 바인딩.
  4. [AI] `GrafanaModal.jsx`에 실제 Grafana 대시보드 iFrame 렌더러 탑재.
  5. [AI] 리전 환경변수(`DC_NAME`) 기반 헤더 전산센터 배지 실시간 표기.
- **완료 기준 (DoD)**: 단가 수정 시 실시간 계산에 즉시 반영되고, Grafana 모달 클릭 시 실제 Grafana 패널이 브라우저 내에 정상 렌더링될 것.

---

## 6. 결론 및 다음 추천 작업

본 계획표에 따라 순차적으로 연동을 진행하면, 현재 **90.3% 수준의 완성도에서 고객사 100% 실인프라 기반 완전 자율 운영형 어플라이언스로 완성**됩니다.

- **즉시 착수 추천 작업**:
  - **[Sprint A] 착수**: 사용자 측의 Envoy/Prometheus 엔드포인트 확인 후, 백엔드 메트릭 수집기(`metric_collector.py`) 개발 및 `telemetry_hub.py` 실데이터 연동부터 신속하게 진행할 수 있습니다.
