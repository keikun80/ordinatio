# Phase 0 ~ Phase 6 엔지니어링 갭 분석 및 구현 상태 점검 보고서 (현행화 완료)

**문서 번호**: ORDINATIO-GAP-ANALYSIS-20261120  
**기준 문서**: `architecture/PRE_01_dashboard_engineering_plan.md`, `architecture/PRE_15_Develop_milestone.md`, `architecture/PRE_36_gap_resolution_and_enterprise_expansion_roadmap.md`, `architecture/PRE_26_bifurcated_testing_strategy_local_vs_production.md`  
**분석 대상**: 상용급 모노레포(`ordinatio/`), 단일 어플라이언스 인스톨러(`install.sh`), 릴리즈 태그(`v1.0.2`), 이원화 테스트베드  
**작성 일자**: 2026-11-23 (최신 현행화: 114 Tests 100% PASS, 관리자 비밀번호 초기화, 테넌트 외래키 정규화, 모델등록 버튼 단일화, Envoy 8080 인그레스 자동 매핑, VPC 내부 DNS 10.10.0.2 연동, 이원화 테스트 전략 PRE_26 확립, GAP-07 로컬 시맨틱 캐시 구현 완료)  

---

## 1. 종합 점검 결과 요약 (Executive Summary)

마스터 엔지니어링 계획서(`PRE_01_dashboard_engineering_plan.md`) 및 최신 상용화 요구사항에 정의된 **Phase 0부터 Phase 6(기반 스택, L7 Gateway, 테넌트/가상키, xDS 라우팅, FinOps, PII/WORM, 핫픽스 엔진, 동적 시스템 프롬프트, 금융권 RBAC, Standalone 설치기, 프론트엔드 strings.js 현지화, ALB 신뢰 프록시, VPC 내부 DNS 해석 보장, 관리자 비밀번호 초기화, 로컬 vs 실환경 이원화 테스트 전략)**에 대해 구현 여부, 테스트 커버리지, 아키텍처적 차이점을 전수 조사 및 최신 현행화하였습니다.

- **핵심 런타임 기능 구현율**: **100% (Phase 0 ~ Phase 6 전 모듈 프로덕션 레디)**
  - 모노레포 아키텍처, 에어갭 헬스체크/자가진단, 멀티테넌트 격리, 가상키 라이프사이클(`sk-ord-`, Argon2id 단방향 해싱, 모델 카탈로그 공백 시 빈 상태 안내 및 실시간 동기화), 동적 모델 카탈로그, 6종 LLM Provider 규격화 및 동적 URL 조합기, 헬스체크 타임아웃 수동 조절(1.0s~30.0s), Envoy L7 xDS 멀티 라우팅 및 N-Way 가중치 분할, **120초 추론 타임아웃 및 10초 연결 타임아웃 분리(지능형 연결 실패 폴백 & 추론 대기)**, 1초 WebSocket 관제 스트림, FinOps 표준 과금, Hard Cap 100% 차단, UTF-8 BOM CSV 청구서 스트리밍, 자체 고속 PII 마스킹 엔진(MASK/HASH/BLOCK, 식별 항목 선택 시 정규식 자동 완성), WORM 불변 감사 로그 테이블, 감사 증적 JSON 내보내기, 에어갭 긴급 패치 관리자(RSA-4096 / SHA-256 서명 검증), 4단계 무중단 롤링 핫픽스 & 롤백 엔진, Zero-PII 서포트 번들 ZIP 생성기, 5대 인프라 Preflight 정밀 진단, 동적 시스템 프롬프트 거버넌스 및 L7 Envoy ext_proc 스트림 인라인 주입, 에어갭 자립형 금융권 RBAC(Argon2id + JWT, 3-Tier, 30분 활동만료, 5회 잠금, 단일 세션), RHEL 9 / Rocky Linux / Ubuntu 호환 Standalone 4단계 무인 설치 툴(`install.sh`) & `ordinatio-ctl` CLI 8종, 프론트엔드 UI 한글 100% strings.js 중앙 집중화, **AWS ALB/Nginx 신뢰 프록시(`ProxyHeadersMiddleware`, Envoy `xff_num_trusted_hops: 1`), 엔터프라이즈 클린 설치 모드(`SEED_DEMO_DATA=False`), 관리자 비밀번호 초기화 엔드포인트(`POST /api/v1/users/{id}/reset-password`), 테넌트 미선택 외래키 정규화, 모델등록 버튼 단일화, Envoy L7 포트(`8080`) 자동 매핑, VPC 내부 DNS Resolver(`10.10.0.2:53`) 등록, 로컬/실사용 이원화 테스트 체계(`PRE_26`)**.
- **자동화 테스트 검증율**: **114 / 114 백엔드 테스트 PASS (100%)** 및 Standalone **7 / 7 PASS (100%)**, 프론트엔드 Vite 프로덕션 빌드 PASS 달성. 게이트웨이 보안 키(진단 키) NoneType 결함 방어 및 업스트림 안정화를 통해 전체 회귀 테스트를 완전 완주함.
- **설계서 대비 아키텍처 대체 항목(ADR)**: 총 **20건** (ADR-01 ~ ADR-20 공식 최신화 완료).
- **상용 고도화 및 하드닝 (Phase C/B/A)**: **100% 완료** (비루트 컨테이너, Alembic 마이그레이션, UTC 시간대 정합화, RoutingTab 모듈화, 비인가 차단 강화, Upstream API Key Fernet 암호화/마스킹, 401 세션 인터셉터).
- **잔여 상용화·검증 거버넌스 과제 (GAP)**: 총 **13건** (제품 기능 12건 + 검증 증적 자동화 1건). GAP-07 로컬 시맨틱 캐싱 구현 완료.

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
| | **Anthropic ↔ OpenAI 양방향 Tool Calling & 에이전틱 스트리밍** | ✅ **구현 완료** | ✅ **테스트 완료** | [PRE-48] Claude Code 에이전틱 루프 100% 호환 |
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

## 3. 19대 아키텍처 대체 결정 기록 (ADR-01 ~ ADR-19 최신화)

에어갭 폐쇄망 및 단일 어플라이언스 자립 운영을 위해 채택된 18대 아키텍처 결정(ADR)입니다:

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
18. **[ADR-18]** 외부 퍼블릭 DNS 의존 및 브라우저 포트 복사 ➔ **VPC 폐쇄망 전용 내부 DNS(`10.10.0.2:53`) 바인딩 & 프론트엔드 웹 UI 포트와 Envoy L7 게이트웨이 인그레스 포트(`:8080`) 분리 자동 매핑**  
    - *결정 사유*: 외부 UDP 53이 차단된 AWS VPC/에어갭 환경에서 도커 데몬 및 컨테이너가 VPC Resolver를 통해 업스트림 도메인을 안정적으로 해석하도록 보장하고, 웹 UI 접속 포트(5137/5173)가 API 엔드포인트 URL로 오인 노출되지 않도록 게이트웨이 포트(`8080`)로 강제 분리.
19. **[ADR-19]** 브라우저 기반 수동 테스트 종속 ➔ **외부 설정 파일(`test_config.json`) 기반 무인 E2E 통합 자동화 러너 채택**  
    - *결정 사유*: 웹 브라우저 UI 없이도 운영자가 실제 운영 LLM 서빙 엔드포인트 URL, 모델 ID, 서빙 엔진, 관리자 인증 정보를 JSON 설정 파일로 손쉽게 주입하여 8대 전 메뉴의 수명주기(자가진단, 테넌트, 가상키, 라우팅, 프롬프트, PII, 인앱 추론, 게이트웨이 인그레스, WORM 감사, FinOps 과금, 핫픽스 검증)를 원클릭 무인 검증할 수 있도록 지원.
20. **[ADR-20]** 클라이언트 단독 처리 불가 및 Envoy L7 조작 한계 ➔ **Anthropic ↔ OpenAI 양방향 프로토콜 변환 및 실시간 SSE 에이전틱 도구 스트리밍 엔진 채택**  
    - *결정 사유*: Claude Code 등 Anthropic Messages 규격을 사용하는 에이전트 CLI와 온프레미스 vLLM(OpenAI 규격) 간의 도구 호출(`tools`), `tool_use`/`tool_calls` 스트리밍 청크 직렬화, 멀티턴 `tool_result` 문맥 복원을 게이트웨이가 전담하여 에이전틱 루프 정지 결함 완전 해소 ([PRE-48](../01_gateway_and_routing/PRE_48_anthropic_openai_tool_calling_translation_and_agentic_loop_resolution_report.md)).

---

## 4. 미구현(GAP) 기능 상세 분석 및 유사도별 재배치 (잔여 GAP-01 ~ GAP-15)

마스터 로드맵(`PRE_36`)에 정의된 잔여 상용화 과제 14종을 **업무 영역 및 유사도**에 따라 4대 도메인으로 체계적으로 재배치하였습니다:

### 검증 증적 정합성 GAP 분석

현재 `114`개 테스트를 단일 진실 공급원(SSOT)으로 전수 동기화 완료하였으며, Standalone 7/7 및 Vite 프로덕션 빌드와 함께 일치시켰다. 향후 릴리즈 파이프라인에서 테스트 실행 시 보고서 수치를 자동 주입하는 생성기(GAP-15)를 유지 관리한다.

| GAP ID | 기능명 | 대상 마일스톤 | 엔지니어링 명세 및 잔여 작업 | 중요도 |
| :---: | :--- | :---: | :--- | :---: |
| **GAP-15** | 검증 증적·문서 수치 단일화 | Milestone 6 | `pytest --collect-only` 기반 현재 테스트 수 산출, 모든 `verify-phase*.sh` 하드코딩 안내 제거, 보고서/README에 생성 시각·명령·결과를 자동 삽입하는 증적 생성기를 구현 | **P1** |

### 도메인 1: 온보딩 & 라이선스 거버넌스 (Onboarding & Licensing)
| GAP ID | 기능명 | 대상 마일스톤 | 엔지니어링 명세 및 잔여 작업 | 중요도 |
| :---: | :--- | :---: | :--- | :---: |
| **GAP-01** | 오프라인 DRM 라이선스 엔진 | Deferred Backlog | RSA-4096 서명 `.lic` 파싱, CPU/MAC/UUID 하드웨어 핑거프린트 바인딩, 허용 RPS/테넌트 통제 | **P3 (최하위)** |
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

현재 **Phase 0부터 Phase 6까지의 핵심 런타임 제어 평면은 구축되어 있으며, 114개 백엔드 테스트(100% PASS)와 Standalone 7개 검증(100% PASS)을 모두 완주했습니다.** 게이트웨이 호출 및 시맨틱 캐시 연동 결함이 완전 해소되어 프로덕션 릴리즈 게이트를 통과했습니다.

- **차기 엔지니어링 우선순위**:
  1. **예산 임계치 웹훅 & SIEM 연동 (`GAP-04`)**: 금융권 전산망 보안 관제 센터와의 이벤트 연동 구현.
  2. **검증 증적·문서 수치 단일화 (`GAP-15`)**: 테스트 수·실행 시각·명령을 자동 산출하여 릴리즈 판정 근거를 단일화.
  3. **오프라인 DRM 라이선스 엔진 (`GAP-01`)**: 모든 현재 상용화·운영 GAP 완료 후에만 착수하는 P3 Deferred Backlog.
