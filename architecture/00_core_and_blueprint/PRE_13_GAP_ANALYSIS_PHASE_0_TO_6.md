# Phase 0 ~ Phase 6 엔지니어링 갭 분석 및 구현 상태 점검 보고서 (현행화 완료)

**문서 번호**: ORDINATIO-GAP-ANALYSIS-20261117  
**기준 문서**: `architecture/PRE_01_dashboard_engineering_plan.md`, `architecture/PRE_15_Develop_milestone.md`, `architecture/PRE_36_gap_resolution_and_enterprise_expansion_roadmap.md`  
**분석 대상**: 상용급 모노레포(`ordinatio/`), 단일 어플라이언스 인스톨러(`install.sh`), 릴리즈 태그(`v1.0.2`)  
**작성 일자**: 2026-11-17 (최신 현행화: 102 Tests PASS, Read 120s / Connect 10s 타임아웃 분리, ALB 신뢰 프록시, 클린 설치 모드 완결)  

---

## 1. 종합 점검 결과 요약 (Executive Summary)

마스터 엔지니어링 계획서(`PRE_01_dashboard_engineering_plan.md`) 및 최신 상용화 요구사항에 정의된 **Phase 0부터 Phase 6(기반 스택, L7 Gateway, 테넌트/가상키, xDS 라우팅, FinOps, PII/WORM, 핫픽스 엔진, 동적 시스템 프롬프트, 금융권 RBAC, Standalone 설치기, 프론트엔드 strings.js 현지화, ALB 신뢰 프록시, 엔터프라이즈 클린 모드)**에 대해 구현 여부, 테스트 커버리지, 아키텍처적 차이점을 전수 조사 및 최신 현행화하였습니다.

- **핵심 런타임 기능 구현율**: **100% (Phase 0 ~ Phase 6 전 모듈 프로덕션 레디)**
  - 모노레포 아키텍처, 에어갭 헬스체크/자가진단, 멀티테넌트 격리, 가상키 라이프사이클(`sk-ord-`, Argon2id 단방향 해싱, 모델 카탈로그 공백 시 빈 상태 안내 및 실시간 동기화), 동적 모델 카탈로그, 6종 LLM Provider 규격화 및 동적 URL 조합기, 헬스체크 타임아웃 수동 조절(1.0s~30.0s), Envoy L7 xDS 멀티 라우팅 및 N-Way 가중치 분할, **120초 추론 타임아웃 및 10초 연결 타임아웃 분리(지능형 연결 실패 폴백 & 추론 대기)**, 1초 WebSocket 관제 스트림, FinOps 표준 과금, Hard Cap 100% 차단, UTF-8 BOM CSV 청구서 스트리밍, 자체 고속 PII 마스킹 엔진(MASK/HASH/BLOCK, 식별 항목 선택 시 정규식 자동 완성), WORM 불변 감사 로그 테이블, 감사 증적 JSON 내보내기, 에어갭 긴급 패치 관리자(RSA-4096 / SHA-256 서명 검증), 4단계 무중단 롤링 핫픽스 & 롤백 엔진, Zero-PII 서포트 번들 ZIP 생성기, 5대 인프라 Preflight 정밀 진단, 동적 시스템 프롬프트 거버넌스 및 L7 Envoy ext_proc 스트림 인라인 주입, 에어갭 자립형 금융권 RBAC(Argon2id + JWT, 3-Tier, 30분 활동만료, 5회 잠금, 단일 세션), RHEL 9 / Rocky Linux / Ubuntu 호환 Standalone 4단계 무인 설치 툴(`install.sh`) & `ordinatio-ctl` CLI 8종, 프론트엔드 UI 한글 100% strings.js 중앙 집중화, **AWS ALB/Nginx 신뢰 프록시(`ProxyHeadersMiddleware`, Envoy `xff_num_trusted_hops: 1`), 엔터프라이즈 클린 설치 모드(`SEED_DEMO_DATA=False`)**.
- **자동화 테스트 검증율**: **102 / 102 백엔드 테스트 100% PASS** (`cd ordinatio/backend && uv run pytest -v`) + **7 / 7 Standalone 설치 검증 100% PASS** (`make verify-standalone-install`) + **Vite 프로덕션 빌드 PASS (번들 경량화 및 코드 스플리팅)**.
- **설계서 대비 아키텍처 대체 항목(ADR)**: 총 **17건** (ADR-01 ~ ADR-17 공식 최신화 완료).
- **상용 고도화 및 하드닝 (Phase C/B/A)**: **100% 완료** (비루트 컨테이너, Alembic 마이그레이션, UTC 시간대 정합화, RoutingTab 모듈화, 비인가 차단 강화, Upstream API Key Fernet 암호화/마스킹, 401 세션 인터셉터).
- **잔여 상용화 엔터프라이즈 과제 (GAP)**: 총 **14건** (유사도별 4대 도메인으로 체계적 재배치 완료).

---

## 2. Phase 0 ~ Phase 6 세부 기능별 구현 및 테스트 현황 매트릭스

| 도메인 / 단계 | 설계서 요구 기능 | 실제 구현 상태 | 자동화 테스트 여부 | 비고 |
| :--- | :--- | :---: | :---: | :--- |
| **Phase 0: 기반 인프라** | 모노레포 구조 및 빌드 도구 표준화 | ✅ **구현 완료** | ✅ **테스트 완료** | `uv`, Vite, Makefile, docker-compose |
| | K8s 5개 Pod 배포 매니페스트 | ✅ **구현 완료** | ✅ **테스트 완료** | `ordinatio` 네임스페이스 5개 Pod |
| | Liveness/Readiness 프로브 API | ✅ **구현 완료** | ✅ **테스트 완료** | `test_health_check`, `test_readiness_check` |
| | 5대 인프라 Preflight 자가진단 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_system_info`, `GET /system/preflight` |
| | Zero-PII 서포트 번들 암호화 생성 | ✅ **구현 완료** | ✅ **테스트 완료** | `POST /api/v1/system/support-bundle` |
| **Phase 1: 테넌시 & 가상키** | 테넌트(부서) CRUD REST API | ✅ **구현 완료** | ✅ **테스트 완료** | `test_tenant_lifecycle` (GET/POST/PATCH) |
| | 가상 API Key 발급/수명주기/파기 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_virtual_key_*` (발급, 파기, 수정) |
| | `sk-ord-` 생성 & Argon2id 해싱 | ✅ **구현 완료** | ✅ **테스트 완료** | 단 1회 노출 모달 및 DB 단방향 해싱 |
| | 사내 AI 클라이언트 자가진단 API | ✅ **구현 완료** | ✅ **테스트 완료** | `GET /api/v1/external/me`, `/models` |
| | L7 게이트웨이 사용량 보고 API | ✅ **구현 완료** | ✅ **테스트 완료** | `POST /api/v1/external/usage/report` |
| | 사내 ERP 부서 예산/하드캡 제어 | ✅ **구현 완료** | ✅ **테스트 완료** | `PATCH /api/v1/external/tenants/{id}/budget` |
| | Prometheus `/metrics` 엔드포인트 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_prometheus_metrics_scrape` |
| | 가상키 생성 UI 모델 카탈로그 실시간 연동 | ✅ **구현 완료** | ✅ **E2E 완료** | 모델 미등록 시 바로가기 & 실시간 재조회 |
| **Phase 2: L7 xDS & 라우팅** | 서빙 모델 카탈로그 CRUD & 다중 엔진 (vLLM/Ollama/SGLang/Triton) | ✅ **구현 완료** | ✅ **테스트 완료** | `test_model_catalog_crud` (종속성 차단) |
| | 모델 서빙 풀 실시간 헬스체크 & 수동 타임아웃 조절(1.0s~30.0s) | ✅ **구현 완료** | ✅ **테스트 완료** | `test_model_serving_health_check` |
| | 6종 LLM Provider 규격화 & Dynamic URL 조합기 | ✅ **구현 완료** | ✅ **테스트 완료** | `PRE_17` 직접 프록시 호출 |
| | Envoy L7 전용 라우팅 엔드포인트 및 실시간 테스트콜 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_route_test_call_endpoint` |
| | OpenAI 규격 L7 인그레스 (`/v1/routes`, `/v1/chat/completions`) | ✅ **구현 완료** | ✅ **테스트 완료** | `test_gateway_openai_chat_completions_ingress` |
| | 동적 멀티 라우팅 프로필 CRUD & RDS 라우트 병합 컴파일 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_multi_route_crud_and_xds_compilation` |
| | N개 타깃 멀티 가중치 분할기 | ✅ **구현 완료** | ✅ **테스트 완료** | N-Way 동적 가중치 분할 & Auto-Balance |
| | Envoy xDS v3 RouteConfiguration | ✅ **구현 완료** | ✅ **테스트 완료** | `test_xds_discovery_routes_endpoint` |
| | Prefix-Cache Affinity 해시 정책 | ✅ **구현 완료** | ✅ **테스트 완료** | `x-session-id` 일관 해싱 라우팅 |
| | 드라이런(Dry-run) 사전 검증 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_dry_run_validation` |
| | AgentRouter 4대 자율 라우팅 정책 & 수동 오버라이드 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_agent_router.py` (11종 테스트) |
| | **Connect 10s / Read 120s 타임아웃 분리 및 폴백** | ✅ **구현 완료** | ✅ **테스트 완료** | `routing.py` vLLM 대용량 생성 완결 대기 |
| **Phase 3: 관측성 & FinOps** | 1초 WebSocket 텔레메트리 스트림 & 관제 홈 실데이터 연동 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_observability_websocket_telemetry` |
| | 지표 요약 수명주기 디커플링 (Zero-Flicker) | ✅ **구현 완료** | ✅ **E2E 완료** | [ADR-09] 컴포넌트 마운트 분리 |
| | FinOps 표준 토큰 계량 단가표 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_finops_overview_and_pricing` |
| | Hard Cap 100% 도달 시 429 차단 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_hard_cap_enforcement_blocks_traffic` |
| | 사내 결산 청구서 UTF-8 BOM CSV | ✅ **구현 완료** | ✅ **테스트 완료** | `test_finops_csv_invoice_export` |
| | 원격 Prometheus 스크래핑 & 토폴로지 자동 식별 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_remote_endpoint_metrics_and_na_fallback` |
| **Phase 4: 컴플라이언스 & PII** | 초경량 인라인 PII 마스킹 엔진 (<2ms) | ✅ **구현 완료** | ✅ **테스트 완료** | `pii_engine.py` (MASK/HASH/BLOCK) |
| | PII 룰셋 동적 CRUD API & 안전 삭제 확인 모달 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_compliance_rules_crud` |
| | 실시간 프롬프트 마스킹 시뮬레이터 | ✅ **구현 완료** | ✅ **테스트 완료** | `POST /api/v1/compliance/simulate` |
| | WORM 불변 감사 로그 적재 (INSERT-only) | ✅ **구현 완료** | ✅ **테스트 완료** | 원문 비저장, SHA-256 무결성 해시 기록 |
| | 규제 준수 대시보드 통계 & 포렌식 JSON 내보내기 | ✅ **구현 완료** | ✅ **테스트 완료** | `GET /api/v1/compliance/stats` |
| | **PII 규칙 생성 시 정규식 자동 완성 매핑** | ✅ **구현 완료** | ✅ **E2E 완료** | `DEFAULT_ENTITY_REGEX_MAP` 자동 연동 |
| **Phase 5: 핫픽스 & 라이프사이클** | RSA-4096 서명 오프라인 패치 검증기 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_patch_signature_verification_success` |
| | 4단계 무중단 롤링 핫픽스 엔진 & 원클릭 원복 롤백 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_patch_apply_and_version_update`, 롤백 |
| | DB 연동 패치 이력(PatchHistory) 감사 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_patch_history_retrieval` |
| | 에어갭 5대 인프라 Preflight 정밀 진단 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_lifecycle_preflight_check`, ZIP 생성 |
| **시스템 프롬프트 거버넌스** | 독립 시스템 프롬프트 카탈로그 & 1:1 유연 바인딩 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_system_prompts_crud_and_bindings` |
| | L7 Envoy ext_proc 스트림 인라인 주입 (3대 모드) | ✅ **구현 완료** | ✅ **테스트 완료** | `test_ext_proc_server_injects_prompt_into_body` |
| **Auth, RBAC & 보안 하드닝** | 에어갭 자립형 로컬 Argon2id + JWT 인증 | ✅ **구현 완료** | ✅ **테스트 완료** | `test_login_success_and_me` |
| | 3-Tier 역할 인가 (`SUPER_ADMIN`/`TENANT_ADMIN`/`VIEWER`) | ✅ **구현 완료** | ✅ **테스트 완료** | `test_rbac_super_admin_vs_tenant_admin` |
| | 금융권 3대 보안 제약 (30분 슬라이딩, 5회 잠금, 단일 세션) | ✅ **구현 완료** | ✅ **테스트 완료** | `test_account_lockout_after_5_failures` |
| | 동적 Role 관리 & 10대 도메인 17종 세부 권한(PBAC) | ✅ **구현 완료** | ✅ **테스트 완료** | `test_roles.py` (7종 테스트 전수 PASS) |
| | **AWS ALB / Nginx 신뢰 프록시 헤더 보안 검증** | ✅ **구현 완료** | ✅ **테스트 완료** | `test_proxy_headers.py` (4종 테스트 PASS) |
| | **게이트웨이 P0 보안 검증 (모의키 차단, SSRF 방어, XFF 스푸핑 방어)** | ✅ **구현 완료** | ✅ **테스트 완료** | `test_gateway_security_p0.py` (8종 PASS) |
| **Phase 6: 배포 & 현지화** | RHEL 9 호환 Standalone `install.sh` 무인 설치기 & `ordinatio-ctl` | ✅ **구현 완료** | ✅ **테스트 완료** | 4단계 파이프라인, DoD 7/7 PASS |
| | 15개 UI 컴포넌트 한글 100% strings.js 중앙 집중화 | ✅ **구현 완료** | ✅ **검증 완료** | 정적 스캔 잔여 0건, Vite 빌드 통과 |
| | **엔터프라이즈 순수 클린 설치 모드 (`SEED_DEMO_DATA=False`)** | ✅ **구현 완료** | ✅ **검증 완료** | 데모 시드 데이터 배제, 초기 관리자만 생성 |

---

## 3. 17대 아키텍처 대체 결정 기록 (ADR-01 ~ ADR-17 최신화)

에어갭 폐쇄망 및 단일 어플라이언스 자립 운영을 위해 채택된 17대 아키텍처 결정(ADR)입니다:

1. **[ADR-01]** gRPC ADS ➔ **FastAPI REST RDS v3 (`discovery:routes`)**
2. **[ADR-02]** K8s InferencePool CRD Watcher ➔ **DB 서빙 풀 + WebSocket 실시간 텔레메트리**
3. **[ADR-03]** Apache Kafka 비동기 큐 ➔ **단일 DB 트랜잭션 동기식 원자적 계량 API**
4. **[ADR-04]** Grafana Kiosk iFrame ➔ **React Vanilla CSS 순수 관제 패널 뷰**
5. **[ADR-05]** 대용량 spaCy NER ➔ **초경량 자체 정규식 PII 인라인 엔진 (<2ms)**
6. **[ADR-06]** Kafka/OpenSearch/S3 WORM ➔ **PostgreSQL INSERT-only WORM 불변 감사 테이블 (`audit_logs`)**
7. **[ADR-07]** K8s Deployment Rolling ➔ **단일 어플라이언스 컴포넌트 레지스트리 핫픽스 엔진**
8. **[ADR-08]** 단일 vLLM HTTP 엔드포인트 ➔ **이종 서빙 런타임 카탈로그 & Envoy 이중 인그레스**
9. **[ADR-09]** 정적 하드코딩 모델 점유율 ➔ **WORM 감사 DB 집계 실데이터 점유율 산출**
10. **[ADR-10]** 조기 타임아웃(3s) & 고정 타임아웃(45s) ➔ **Connect 10.0s / Read 120.0s 분리 및 연결 오류 폴백 체인**  
    - *개정 사유*: 대규모 LLM(vLLM) 토큰 생성 지연(7~15초 이상)을 온전히 대기하기 위해 Read 타임아웃을 120초로 상향하고, 도커 내부망 호스트 연결 실패 시 다음 루프백 후보 호스트로 즉시 전환되도록 분기 처리 개선.
11. **[ADR-11]** 단일 OpenAI URL 스트립 ➔ **6종 Provider 규격화 & Dynamic URL 조합기**
12. **[ADR-12]** 3.0초 단일 헬스체크 타임아웃 ➔ **1.0s~30.0s 수동 조절 & 개별 DB 영속화**
13. **[ADR-13]** 클라이언트 자체 시스템 프롬프트 의존 ➔ **L7 ext_proc 동적 시스템 프롬프트 인라인 주입**
14. **[ADR-14]** 일괄 On-Prem K8s 표기 ➔ **원격 Prometheus 스크래핑 & 토폴로지 자동 식별**
15. **[ADR-15]** 외부 Keycloak OIDC SSO 종속 ➔ **에어갭 로컬 자립형 Argon2id + JWT 3-Tier RBAC**
16. **[ADR-16]** 고정 3-Tier 시스템 역할 ➔ **DB 기반 동적 커스텀 Role 추가/수정/삭제 및 세부 권한(Permissions) 매트릭스 엔진**
17. **[ADR-17]** Envoy gRPC ext-proc 인라인 인터셉트 ➔ **Envoy L7 역방향 프록시 + Python FastAPI 인텔리전트 제어 평면 게이트웨이 역할 분리**

---

## 4. 미구현(GAP) 기능 상세 분석 및 유사도별 재배치 (GAP-01 ~ GAP-14)

마스터 로드맵(`PRE_36`)에 정의된 잔여 상용화 과제 14종을 **업무 영역 및 유사도**에 따라 4대 도메인으로 체계적으로 재배치하였습니다:

### 도메인 1: 온보딩 & 라이선스 거버넌스 (Onboarding & Licensing)
| GAP ID | 기능명 | 대상 마일스톤 | 엔지니어링 명세 및 잔여 작업 | 중요도 |
| :---: | :--- | :---: | :--- | :---: |
| **GAP-01** | 오프라인 DRM 라이선스 엔진 | Stage 1 | RSA-4096 서명 `.lic` 파싱, CPU/MAC/UUID 하드웨어 핑거프린트 바인딩, 허용 RPS/테넌트 통제 | **P0 (필수)** |
| **GAP-02** | 브라우저 최초 셋업 마법사 | Stage 1 | 미설치 시 `/setup` 자동 리다이렉트 ➔ 3단계(라이선스, 슈퍼관리자, Preflight) 웹 UI 위저드 | **P1** |
| **GAP-03** | 엔터프라이즈 Helm Chart & 번들러 | Stage 1 | `deploy/helm/ordinatio/` (K8s HPA, 외장 DB) 및 `package-airgap-release.sh` 이미지 패키징 | **P1** |

### 도메인 2: 보안, 인증 & 네트워크 인프라 (Security & Infrastructure)
| GAP ID | 기능명 | 대상 마일스톤 | 엔지니어링 명세 및 잔여 작업 | 중요도 |
| :---: | :--- | :---: | :--- | :---: |
| **GAP-04** | 예산 임계치 웹훅 & SIEM Syslog | Stage 2 | Hard Cap 차단, 계정 잠금 발생 시 Teams, Slack, SMTP 웹훅 및 RFC 5424 Syslog 스트리밍 | **P1** |
| **GAP-05** | 사내 LDAP/Active Directory & MFA | Stage 2 | 사내 LDAPS 연동, 그룹 매핑(`CN=AI_Admins`), SAML 2.0 / OIDC SSO, Google OTP RFC 6238 TOTP | **P1** |
| **GAP-08** | L7 실시간 프롬프트 탈옥 쉴드 | Stage 3 | Envoy ext_proc 단계에서 "Ignore previous instructions", DAN 모드 실시간 탐지/차단(403) | **P1** |
| **GAP-13** | 가상키 사내 CIDR IP 실시간 차단 | Milestone 6 | L7 Envoy ext_proc 인그레스 헤더(`x-forwarded-for`) 기반 사내 IP 대역 엄격 차단 연동 점검 | **P1** |

### 도메인 3: LLM 인텔리전스 & 고속 추론 최적화 (Intelligence & High Performance)
| GAP ID | 기능명 | 대상 마일스톤 | 엔지니어링 명세 및 잔여 작업 | 중요도 |
| :---: | :--- | :---: | :--- | :---: |
| **GAP-07** | 에어갭 로컬 시맨틱 캐싱 엔진 | Stage 3 | 로컬 임베딩 모델(bge-small) + Redis Vector Store 코사인 유사도 검색 (비용 40~60% 절감) | **P0 (세일즈)** |
| **GAP-14** | 비동기 대량 배치(Batch) 추론 큐 | Milestone 8 | OpenAI Batch API 호환 대량 문서/데이터셋 비동기 작업 큐 및 상태 조회 API | **P2** |

### 도메인 4: FinOps, 컴플라이언스 & 백업/DR (FinOps & Compliance Ops)
| GAP ID | 기능명 | 대상 마일스톤 | 엔지니어링 명세 및 잔여 작업 | 중요도 |
| :---: | :--- | :---: | :--- | :---: |
| **GAP-06** | 1-클릭 암호화 DB 백업/복원(DR) | Stage 2 | AES-256-GCM 암호화 DB 덤프 자동 스케줄링, UI/CLI 1-클릭 시점 복원(PITR, RTO 15분) | **P1** |
| **GAP-09** | 화이트라벨링(OEM) 커스텀 브랜딩 | Stage 3 | 고객사 로고 업로드, 파비콘 동적 교체, 시스템 명칭 및 프라이머리 컬러 팔레트 동적 변경 | **P2** |
| **GAP-10** | 부서별 월간 정산서 자동 PDF/Excel | Stage 3 | 매월 1일 자정 테넌트별 사용량/비용 집계 후 금융 표준 PDF 및 Excel(.xlsx) 리포트 자동 생성 | **P2** |
| **GAP-11** | 다국어 클라이언트 전용 SDK 배포 | Stage 3 | `ordinatio-sdk-python` (wheel 번들), `ordinatio-sdk-java` (Spring Boot Starter), `ordinatio-sdk-ts` | **P2** |
| **GAP-12** | WORM 감사 PostgreSQL DB 트리거 | Milestone 6 | `audit_logs` 테이블 레코드에 대한 DB 관리자 레벨의 강제 UPDATE/DELETE 거부 트리거 함수 | **P2** |

---

## 5. 결론 및 권장 엔지니어링 액션

현재 **Phase 0부터 Phase 6까지의 핵심 런타임 제어 평면은 100% 구축 및 무회귀 검증(102개 테스트 100% PASS, Standalone 7개 PASS, strings.js 현지화 100%, install.conf 외부화 및 v1.0.2 릴리즈 태깅 완료)**되어 상용 환경에 즉시 무인 설치 및 자율 운영이 가능한 상태입니다.

- **차기 엔지니어링 우선순위**:
  1. **오프라인 DRM 라이선스 엔진 (`GAP-01`)**: 온프레미스 B2B 라이선스 키 검증 및 CPU/MAC 핑거프린트 바인딩 구현.
  2. **에어갭 로컬 시맨틱 캐싱 엔진 (`GAP-07`)**: 로컬 bge-small 임베딩 모델과 벡터 캐시를 통한 토큰 비용 절감 구현.
  3. **예산 임계치 웹훅 & SIEM 연동 (`GAP-04`)**: 금융권 전산망 보안 관제 센터와의 이벤트 연동 구현.
