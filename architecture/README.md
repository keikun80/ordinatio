# AI Orchestrator Architecture & Engineering Documentation Index

이 디렉토리는 AI 오케스트레이터 관리 포털 및 L7 제어 평면을 프로덕션 레벨로 구현하기 위한 **소프트웨어 공학 설계서, 단계별 구현 계획서(Implementation Plans), 자동화 테스트 결과 보고서 및 마일스톤 로드맵**을 보관합니다.  
모든 문서는 개발 생명주기 및 구현 순서에 따라 **`PRE_{번호}_...`** 접두사로 체계화되어 있습니다.

---

## 🗂️ 개발 단계별 전체 문서 인덱스 (Development Phase Map)

| 단계 번호 | 문서 파일명 | 문서 성격 및 핵심 범위 | 검증/진행 상태 |
| :---: | :--- | :--- | :---: |
| **PRE_00** | [PRE_00_comparison.md](./PRE_00_comparison.md) | **사전 벤치마킹 및 비교 분석서**<br>- aiorche vs LiteLLM vs Kong AI Gateway vs Envoy AI Gateway 4자 기술 비교<br>- 에어갭 자립성, 인지 라우팅, 보안 거버넌스, 라이선스 등 종합 분석 | 완료 |
| **PRE_01** | [PRE_01_dashboard_engineering_plan.md](./PRE_01_dashboard_engineering_plan.md) | **마스터 엔지니어링 계획서 (Master Blueprint)**<br>- FURPS+ 요구공학, Clean Architecture, DDD & DDL<br>- Phase 0 ~ Phase 6 마스터 로드맵, 테스팅 피라미드, 에어갭 릴리즈 파이프라인 | 최신 현행화 |
| **PRE_02** | [PRE_02_phase0_foundations_and_ai_gateway.md](./PRE_02_phase0_foundations_and_ai_gateway.md) | **Phase 0: 공통 아키텍처, 에어갭 환경 및 Envoy AI Gateway**<br>- 모노레포(`aiorche/`), FastAPI + uv, React 18 Glassmorphism, 헬스 프로브<br>- Envoy AI Gateway `ext_proc` gRPC 파이프라인 및 AgentRouter 2-Tier 관문 | **100% PASS**<br>(5/5 Tests) |
| **PRE_03** | [PRE_03_phase1_tenant_and_virtual_keys.md](./PRE_03_phase1_tenant_and_virtual_keys.md) | **Phase 1: 멀티 테넌시 거버넌스 및 가상 API Key 코어**<br>- 부서별 테넌트 분리, `sk-orch-` Argon2id 단방향 해싱<br>- 키 수정/파기/삭제 수명주기, 외부 연동 API 계층 | **100% PASS**<br>(15/15 Tests) |
| **PRE_04** | [PRE_04_phase2_model_catalog_and_routing_spec.md](./PRE_04_phase2_model_catalog_and_routing_spec.md) | **Phase 2 상세 설계: 모델 카탈로그 & Gateway 라우팅 규격**<br>- vLLM/Ollama/SGLang 멀티 엔진 지원, 실시간 헬스체크 프로빙<br>- L7 Envoy 게이트웨이 경로/헤더 기반 동적 라우팅 인터페이스 | 설계 완료 |
| **PRE_05** | [PRE_05_phase2_dynamic_routing_and_xds.md](./PRE_05_phase2_dynamic_routing_and_xds.md) | **Phase 2: 동적 모델 카탈로그 및 Envoy xDS 연동 결과**<br>- 모델 CRUD, 실시간 헬스체크 비동기 루프, 모델 종속 라우팅<br>- Envoy CDS/RDS xDS 제어 평면 및 클라이언트 게이트웨이 엔드포인트 | **100% PASS**<br>(23/23 Tests) |
| **PRE_06** | [PRE_06_phase3_observability_and_finops_plan.md](./PRE_06_phase3_observability_and_finops_plan.md) | **Phase 3 구현 계획서: 실시간 관측성 & FinOps 예산 거버넌스**<br>- WebSocket 텔레메트리 파이프라인, FinOps 정밀 단가표 산정<br>- Hard Cap 429 차단 인터셉터, Prometheus 메트릭 Exporter 설계 | 설계 완료 |
| **PRE_07** | [PRE_07_phase3_observability_and_finops_results.md](./PRE_07_phase3_observability_and_finops_results.md) | **Phase 3: 실시간 관측성 & FinOps 예산 거버넌스 결과**<br>- 1초 WebSocket 텔레메트리 & 관제 홈 실데이터 무깜빡임 연동<br>- 모델별 토큰 단가 자동 계산, Hard Cap 차단, UTF-8 BOM CSV 내보내기 | **100% PASS**<br>(26/26 Tests) |
| **PRE_08** | [PRE_08_phase4_pii_governance_and_worm_audit.md](./PRE_08_phase4_pii_governance_and_worm_audit.md) | **Phase 4: 인라인 PII 마스킹 & WORM 감사 포렌식 엔진**<br>- 정규식 기반 개인정보 탐지 (주민번호, 카드번호, 전화번호, 이메일)<br>- MASK / HASH / BLOCK 모드, SHA-256 체이닝 위변조 방지 WORM 로그 | **100% PASS**<br>(35/35 Tests) |
| **PRE_09** | [PRE_09_phase5_lifecycle_and_hotfix_engine.md](./PRE_09_phase5_lifecycle_and_hotfix_engine.md) | **Phase 5: 어플라이언스 수명주기 제어 및 RSA-4096 긴급 패치**<br>- 에어갭 오프라인 RSA-4096 서명 검증(`patch.tar.gz + patch.sig`)<br>- 4단계 무중단 핫픽스 롤링 및 자동 롤백, Zero-PII 서포트 번들 스트리밍 | **100% PASS**<br>(46/46 Tests) |
| **PRE_10** | [PRE_10_INTEGRATED_FUNCTIONAL_TEST_SPEC.md](./PRE_10_INTEGRATED_FUNCTIONAL_TEST_SPEC.md) | **Phase 0~5 통합 기능 테스트 스펙 (E2E 검증 명세)**<br>- 백엔드 명세 대비 구현 정합성 전수 판정표 (OK / ALT)<br>- 프론트엔드 전 화면 대화형 UI 요소 전수 점검 및 통신 컬러 매핑 규격 | 완료 |
| **PRE_11** | [PRE_11_REAL_DATA_INTEGRATION_PLAN.md](./PRE_11_REAL_DATA_INTEGRATION_PLAN.md) | **실데이터 및 온프레미스 LLM 백엔드 연동 계획서**<br>- Mock 시뮬레이션 데이터를 실제 DB 및 vLLM/Ollama 클러스터로 전환<br>- 스프린트 A~D 마일스톤 및 RACI 실행 계획표 | 실행 준비 |
| **PRE_12** | [PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md](./PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md) | **Phase 0~6 종합 총괄 보고서 (Executive Master Report)**<br>- Phase 0~6 전 모듈 아키텍처 및 94개 백엔드 테스트 100% 통과 매트릭스<br>- Standalone 7/7 PASS, strings.js 100% 현지화, Phase C/B/A 상용 하드닝 완료, 17대 아키텍처 결정(ADR-01~17) 총괄 | 최신 현행화 |
| **PRE_13** | [PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md](./PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md) | **Phase 0~6 엔지니어링 갭 분석서 (Gap Analysis)**<br>- 마스터 설계서 대비 Phase 0~6 핵심 런타임 구현율 100% 추적 감사<br>- Phase C/B/A 상용 하드닝(비루트, Alembic, Fernet 암호화, RoutingTab 모듈화, 401 인터셉터) 및 17대 ADR 전수 매핑 | 최신 현행화 |
| **PRE_14** | [PRE_14_GAP_MARKET_PLACE.md](./PRE_14_GAP_MARKET_PLACE.md) | **엔터프라이즈 AI 마켓플레이스 연동 갭 분석서**<br>- 사내 AI 모델 스토어 및 프라이빗 레지스트리 연동 아키텍처 갭 분석<br>- 모델 온보딩 자동화 및 멀티 테넌트 권한 배포 방안 | 분석 완료 |
| **PRE_15** | [PRE_15_Develop_milestone.md](./PRE_15_Develop_milestone.md) | **차세대 개발 마일스톤 (Milestone 6 ~ 8) 로드맵**<br>- M6: 프로덕션 릴리즈 패키징, 오프라인 Helm, 실시간 웹훅, WORM 불변 트리거<br>- M7: 에어갭 로컬 시맨틱 캐싱, 프롬프트 인젝션 방어, DB 정기 백업 & DR<br>- M8: 엔터프라이즈 SSO/RBAC, 모델 실시간 벤치마크, 스트리밍 PII 가드레일 | 최신 현행화 |
| **PRE_16** | [PRE_16_gateway_browser_test_troubleshooting_report.md](./PRE_16_gateway_browser_test_troubleshooting_report.md) | **웹브라우저 LLM 테스트 연동 및 게이트웨이 즉시 호출 장애 해결 보고서**<br>- Ollama 미다운로드 모델 기본 설정 불일치 해소<br>- Docker 네트워크 브릿지 격리 해제 및 호스트:컨테이너 포트(11435 vs 11434) 정정<br>- 라우팅 테스트 클라이언트 45초 타임아웃 패치 및 브라우저 E2E 검증(200 OK) 완료 | **검증 완료**<br>(E2E PASS) |
| **PRE_17** | [PRE_17_model_provider_options_and_url_builder_report.md](./PRE_17_model_provider_options_and_url_builder_report.md) | **LLM 서빙 모델 Provider 규격화 및 동적 엔드포인트 URL 조합기 구현 보고서**<br>- 6종 Provider(OpenAI, DeepSeek, Anthropic, Gemini, Cohere, Custom) 지원<br>- 베이스 도메인 기반 실시간 엔드포인트 URL 동적 조합기(Dynamic URL Builder)<br>- 백엔드 임의 정규화 롤백 & 직접 호출 보장, 백엔드 단위/통합 테스트 66개 100% 통과 | **100% PASS**<br>(66/66 Tests) |
| **PRE_18** | [PRE_18_model_health_check_timeout_report.md](./PRE_18_model_health_check_timeout_report.md) | **LLM 모델 헬스체크 타임아웃 수동 조절 기능 구현 및 검증 보고서**<br>- 전역 툴바 타임아웃 드롭다운(1.0s~30.0s) & localStorage 자동 영속화<br>- 모델별 개별 타임아웃 DB 컬럼(`health_check_timeout`) 및 등록/수정 모달 반영<br>- 백엔드 동적 타임아웃 쿼리 파라미터 및 `httpx` 타임아웃 예외 메시지 상세화, 66개 테스트 통과 | **100% PASS**<br>(66/66 Tests) |
| **PRE_19** | [PRE_19_system_prompt_governance_and_dynamic_injection_plan.md](./PRE_19_system_prompt_governance_and_dynamic_injection_plan.md) | **시스템 프롬프트 거버넌스 및 동적 주입 구현 계획서 (Engineering Plan)**<br>- 시스템 프롬프트 독립 카탈로그 및 1:1 타겟 바인딩 (라우팅 정책 / 가상 API Key / 테넌트)<br>- L7 Envoy AI Gateway (ext_proc) 기반 인라인 페이로드 변조 및 위계적 우선순위 해석 알고리즘<br>- 프론트엔드 시스템 프롬프트 관리 화면 UI/UX 및 실시간 토큰 계산기 설계 | **구현 완료**<br>(Phase 1~5) |
| **PRE_20** | [PRE_20_phase_system_prompt_implementation_and_test_results.md](./PRE_20_phase_system_prompt_implementation_and_test_results.md) | **시스템 프롬프트 거버넌스 & 동적 인라인 주입 구현 및 검증 결과서**<br>- DB 스키마/모델, RESTful API, L7 ext_proc 및 AgentRouter 테스트벤치 연동<br>- React 18 Vanilla CSS 관리 포털 대시보드 및 1:1 바인딩 마법사<br>- DoD 자동화 검증 스크립트(`verify-phase-system-prompt.sh`) 및 전체 78개 테스트 무회귀 검증 | **100% PASS**<br>(78/78 Tests) |
| **PRE_21** | [PRE_21_make_commands_test_plan.md](./PRE_21_make_commands_test_plan.md) | **전체 Make 명령어 테스트 계획서 (Make Commands Comprehensive Test Plan)**<br>- 모노레포 루트 및 aiorche 서브모듈 30여 개 Make 타겟 전수 인벤토리<br>- 3계층(로컬 CLI, Docker Compose, Kubernetes) 테스트 매트릭스 및 시나리오<br>- 안전성, 멱등성, 에어갭 컴플라이언스 및 Makefile 정합성 개선 방안 정의 | **계획 완료** |
| **PRE_22** | [PRE_22_make_commands_test_results.md](./PRE_22_make_commands_test_results.md) | **전체 Make 명령어 테스트 결과 보고서 (Make Commands Test Results)**<br>- 33개 Make 타겟 Dry-run 및 Tier 1~3 실환경 전수 검증 결과 (100% PASS)<br>- 백엔드 78개 Pytest 무회귀, Vite 빌드, Docker Compose 및 K8s 라이프사이클 증적<br>- 인메모리 테스트 격리 패치 및 Makefile 결함 해소 내역 기록 | **100% PASS**<br>(33/33 Targets) |
| **PRE_23** | [PRE_23_ui_taxonomy_and_element_specification.md](./PRE_23_ui_taxonomy_and_element_specification.md) | **UI 택소노미 체계 및 화면/기능 식별자 명세서 (UI Element Taxonomy & Spec)**<br>- 4대 식별자 계층(`Screen ID`, `Function ID`, `data-testid`, `Element Class`) 표준화<br>- 주요 관리 탭 컴포넌트 locator 주입 및 DevInspector(`Ctrl+Shift+D`) 실시간 오버레이 탑재<br>- E2E 테스트 및 원격 커뮤니케이션용 UI 요소 전수 인벤토리 매핑표 수립 | **구현 완료**<br>(Vite Build PASS) |
| **PRE_24** | [PRE_24_route_custom_path_finops_metering_and_tenant_mapping_report.md](./PRE_24_route_custom_path_finops_metering_and_tenant_mapping_report.md) | **라우트 커스텀 경로 디스패치, FinOps 실시간 계량 누적 및 테넌트 매핑 선택 UI 구현 보고서**<br>- Envoy L7 와일드카드 및 백엔드 동적 경로 디스패처(`/v1/{custom_path}`) 구현 (404 해소)<br>- `gemma2:2b` 오프라인 포트 정정(HTTP 11434) 및 헬스 200 OK 확보<br>- 추론 시 가상 API Key 및 부서(Tenant) 실시간 토큰/비용 원자적 누적 엔진 탑재<br>- 라우팅 스튜디오 내 기존 등록 테넌트 드롭다운 및 인터랙티브 뱃지 칩 매핑 UI 구현 | **100% PASS**<br>(78/78 Tests) |
| **PRE_25** | [PRE_25_all_menus_integrated_test_scenario_and_monitoring_plan.md](./PRE_25_all_menus_integrated_test_scenario_and_monitoring_plan.md) | **8대 전 메뉴 활용 및 모니터링 통합 테스트 시나리오 & 자동화 검증 계획서**<br>- 8대 전 메뉴(관제홈, 라우팅, 가상키/테넌트, 시스템프롬프트, FinOps, PII보안, 긴급패치, 프롬프트스튜디오) E2E 10단계 시나리오<br>- 자가진단, 테넌트/가상키 발급, 동적 라우팅, L7 프롬프트 주입, Presidio 마스킹, WORM 감사, 원자적 토큰 계량, Hotfix 무결성 전수 검증<br>- 원클릭 자동화 검증 러너(`verify-all-menus.sh`, `make verify-all-menus`) 10단계 100% PASS 검증 완료 | **100% PASS**<br>(10/10 Steps) |
| **PRE_26** | [PRE_26_user_authentication_and_rbac_specification.md](./PRE_26_user_authentication_and_rbac_specification.md) | **사용자 인증 및 역할 기반 권한 관리(RBAC) 아키텍처 및 구현 사양서**<br>- 100% 에어갭 로컬 DB(PostgreSQL) 기반 계정/세션 관리 및 Argon2id 해싱<br>- 3단계 역할(`SUPER_ADMIN`, `TENANT_ADMIN`, `VIEWER`), 1:1 테넌트 소속 스코프 통제<br>- 금융 3대 보안 제약(30분 미활동 만료, 5회 실패 시 15분 잠금, 단일 세션 중복 로그인 방지)<br>- 초기 슈퍼관리자 생성용 대화형 CLI(`make init-admin`) 부트스트랩 사양 정의 | **설계 완료** |
| **PRE_27** | [PRE_27_auth_rbac_implementation_plan_and_test_results.md](./PRE_27_auth_rbac_implementation_plan_and_test_results.md) | **사용자 인증 & RBAC 권한 통제 구현 및 검증 결과서**<br>- 100% 에어갭 로컬 DB(PostgreSQL), Argon2id 해싱, JWT 단일 활성 세션<br>- 30분 슬라이딩 활동 타이머, 5회 실패 시 15분 잠금, 3-Tier RBAC 통제<br>- React 18 Glassmorphism 로그인/사용자관리 UI, `make init-admin` CLI, `make verify-auth-rbac` 검증 | **100% PASS**<br>(85/85 Tests) |
| **PRE_28** | [PRE_28_commercial_packaging_and_enterprise_expansion_plan.md](./PRE_28_commercial_packaging_and_enterprise_expansion_plan.md) | **상용화 패키징 및 엔터프라이즈 확장 구축·테스트 계획서**<br>- Stage 1: 오프라인 라이선스(RSA-4096/HW바인딩), Helm 차트, 단일 tar.gz 인스톨러, 셋업 마법사<br>- Stage 2: 사내 디렉토리 연동(AD/LDAP, SAML/OIDC), TOTP MFA, 1-Click 암호화 백업/DR, 사내 알림 웹훅<br>- Stage 3: 시맨틱 캐싱(비용 40~60% 절감), L7 프롬프트 탈옥 방어 가드레일, 화이트라벨링, 엔터프라이즈 SDK<br>- 단계별 구축 계획, 세부 테스트 매트릭스, 자동화 검증 스크립트 규격 및 라이선스 티어링 정의 | **설계 완료** |
| **PRE_29** | [PRE_29_agent_router_dynamic_cluster_configuration_report.md](./PRE_29_agent_router_dynamic_cluster_configuration_report.md) | **AgentRouter 동적 Envoy 업스트림 클러스터 사용자 구성 및 시스템 하드코딩 제거 구현 보고서**<br>- 클러스터 고정 시스템 상수 및 `meta-llama` 하드코딩 모델 완전 제거<br>- 4대 지능형 라우팅 정책 내 동적 클러스터 `<input>` 편집 UI 및 모델 카탈로그 실시간 동적 바인딩<br>- 인텐트 분석 카드 메뉴 4종(복잡도, 티어, 타깃모델, 클러스터) 대화형 실시간 수동 에디트(Manual Override) 구현 | **100% PASS**<br>(85/85 Tests) |
| **PRE_30** | [PRE_30_remote_endpoint_telemetry_and_topology_resolution_report.md](./PRE_30_remote_endpoint_telemetry_and_topology_resolution_report.md) | **원격 URL 엔드포인트 실시간 텔레메트리 스크래핑 및 인프라 토폴로지 자동 식별 보고서**<br>- 로컬 호스트 RAM 강제 대입 결함 해소 및 vLLM Prometheus `/metrics` 실시간 스크래핑 엔진 탑재<br>- 원격 블랙박스 API graceful N/A 분기 및 엔드포인트 URL 기반 스마트 인프라 토폴로지 자동 판별<br>- `On-Prem K8s / k8s` 동어반복 제거, 프론트엔드 카드 중복 줄 정비 및 86개 테스트 100% 무회귀 통과 | **100% PASS**<br>(86/86 Tests) |
| **PRE_31** | [PRE_31_rhel_compatible_vagrant_installer_plan.md](./PRE_31_rhel_compatible_vagrant_installer_plan.md) | **RHEL 호환 계열 리눅스 단일 호스트 Standalone 모드 전자동 설치 스크립트 개발 계획서**<br>- 인프라 사전 요구사항(OS/방화벽/SELinux/Docker) 매뉴얼 분리 정의<br>- Standalone 배포 스크립트(`install.sh`) 4단계 파이프라인(레이아웃/시크릿, 이미지, DB/관리자, Systemd/헬스)<br>- 어플라이언스 수명주기 관리 CLI(`aiorche-ctl`) 및 Vagrant 테스트베드 연동 사양 정의 | **설계 완료** |
| **PRE_32** | [PRE_32_standalone_installer_implementation_and_test_results.md](./PRE_32_standalone_installer_implementation_and_test_results.md) | **RHEL 호환 계열 리눅스 Standalone 모드 전자동 설치 툴 및 Vagrant 테스트베드 구현·검증 결과 보고서**<br>- `PREREQUISITES.md` 인프라 매뉴얼 및 Standalone Docker Compose / .env 템플릿 완비<br>- `install.sh` 4단계 무인 설치 파이프라인 및 호스트 관리 CLI(`aiorche-ctl`) 8종 명령 구현<br>- Vagrantfile 멀티 배포판(EL_DISTRO) 연동 및 DoD 자동화 검증 스위트 7/7 전 항목 100% PASS 달성 | **100% PASS**<br>(7/7 Tests) |
| **PRE_33** | [PRE_33_security_review_and_hardening_report.md](./PRE_33_security_review_and_hardening_report.md) | **AI Orchestrator Standalone 어플라이언스 종합 보안 검토 및 하드닝 보고서**<br>- 5대 보안 통제 영역(네트워크 격리, RBAC/Argon2id, 암호화 키 관리, PII/WORM, SELinux/firewalld) 정밀 진단<br>- DB/Redis 루프백(`127.0.0.1`) 격리, .env 및 백업 아카이브 `chmod 600/700` 권한 통제 강화 완료<br>- 금융보안원 전자금융기반시설 기준 및 국정원 폐쇄망 보안 규격 충족 확인 | **검토 완료** |
| **PRE_34** | [PRE_34_frontend_ui_strings_localization_plan.md](./PRE_34_frontend_ui_strings_localization_plan.md) | **프론트엔드 UI 한글 텍스트 전수 `strings.js` 중앙 집중화 및 로컬라이제이션 엔지니어링 계획서**<br>- 14개 JSX 컴포넌트 내 하드코딩 한글 텍스트 100% 제거 및 `strings.*` 네임스페이스 계층화<br>- 다국어(i18n) 및 고객사 화이트라벨링 확장성 확보, 5단계 점진적 리팩토링 로드맵 수립<br>- `data-testid` UI 택소노미 보존 및 E2E 시나리오 100% 무회귀 빌드 검증 기준 정의 | **설계 완료** |
| **PRE_35** | [PRE_35_frontend_ui_strings_implementation_and_test_results.md](./PRE_35_frontend_ui_strings_implementation_and_test_results.md) | **프론트엔드 UI 한글 하드코딩 제거 및 `strings.js` 중앙 집중화 리팩토링 및 검증 보고서**<br>- `strings.js` 단일 진실 공급원 전면 확장 및 15개 UI 컴포넌트 한글 리터럴 100% 제거 (0건 달성)<br>- Vite 프로덕션 빌드 정상 완료(2.08s) 및 백엔드 86개 테스트 100% 무회귀 통과 | **100% PASS**<br>(Vite Build PASS) |
| **PRE_36** | [PRE_36_gap_resolution_and_enterprise_expansion_roadmap.md](./PRE_36_gap_resolution_and_enterprise_expansion_roadmap.md) | **아키텍처-구현 갭(GAP) 분석 기반 엔터프라이즈 상용화 개발 로드맵**<br>- 14대 잔여 GAP(DRM 라이선스, 셋업 마법사, Helm, 시맨틱 캐싱 등) 전수 분석<br>- 3대 마일스톤(Phase 7: DRM/온보딩, Phase 8: 시맨틱캐시/보안, Phase 9: 엔터프라이즈 융합) 상세 실행 계획 | **설계 완료** |
| **PRE_37** | [PRE_37_user_role_and_tenant_edit_engineering_plan.md](./PRE_37_user_role_and_tenant_edit_engineering_plan.md) | **사용자 및 계정 관리(UsersTab) Role 및 그룹(Tenant) 편집 기능 엔지니어링 계획서**<br>- 사용자 목록 내 ✏️ [수정] 모달 구현 및 Role/Tenant/이름/이메일 변경 파이프라인<br>- API 클라이언트 HTTP PATCH 정합화 및 strings.js 단일 진실 공급원 준수 | **구현 및 검증 완료**<br>(Vite & 86/86 PASS) |
| **PRE_38** | [PRE_38_dynamic_role_management_engineering_plan_and_test_results.md](./PRE_38_dynamic_role_management_engineering_plan_and_test_results.md) | **사용자 역할(Role) 추가·수정·삭제 동적 RBAC 관리 엔진 및 전 도메인 PBAC 구현 계획서 및 결과 보고서**<br>- 커스텀 Role 추가/수정/삭제 REST API 및 10대 도메인 · 17종 세부 권한(Permissions) 매트릭스<br>- 전 엔드포인트 PBAC(`require_permission`) 적용, 전 탭 UI 권한 가드 및 JWT 헤더 일원화<br>- Vite 빌드 및 백엔드 93개 테스트 100% 통과 | **구현 및 검증 완료**<br>(Vite & 93/93 PASS) |
| **PRE_39** | [PRE_39_all_domains_rbac_inspection_plan.md](./PRE_39_all_domains_rbac_inspection_plan.md) | **전 도메인(10대 도메인 · 17종 권한) RBAC/PBAC 적용 현황 4계층 정밀 검사 계획서**<br>- Axis 1(백엔드 수직 PBAC), Axis 2(테넌트 수평 격리), Axis 3(사이드바/헤더 메뉴 가시성), Axis 4(탭 내부 행/인라인 컨트롤 가드) 전수 감사 매트릭스<br>- 인라인 액션 버튼(PII 룰 행, 프롬프트 토글, 예산 긴급증액, 패치 롤백, 모델 수정/삭제, 사용자/역할 행) 세부 보완 계획 수립 | **계획 완료** |
| **PRE_40** | [PRE_40_standalone_offline_appliance_packaging_plan.md](./PRE_40_standalone_offline_appliance_packaging_plan.md) | **독립형 오프라인 어플라이언스 원클릭 패키징 및 구동 계획서 및 결과 보고서**<br>- `make prod-build` 시 5대 Docker 이미지, 배포용 Makefile, 설정 포함 단일 tar.gz 아카이브 자동 생성<br>- 고객사 대상 서버에서 압축 해제 후 `make up`만으로 오프라인 로드, 시크릿 생성, 5대 컨테이너 헬스체크 및 관리자 부트스트랩 완료<br>- `make verify-offline-bundle` E2E 자동화 검증 100% PASS 달성 | **100% PASS**<br>(DoD 검증 완료) |

---

## 🧭 순차적 구현 가이드라인 (Sequential Implementation & Reproducibility Guide)

본 아키텍처 문서군을 기반으로 현재 프로젝트(`aiorche/`, 93개 테스트 100% PASS)와 **완전히 동일한 프로덕션 시스템을 단 한 번의 재작업 없이 개발하기 위한 공식 실행 순서 및 불변 원칙**입니다.

### 1. 단계별 최적 개발 순서 (9단계 파이프라인)

```
[Step 1: 청사진 & 기준] PRE_00 (비교) ➔ PRE_01 (마스터 청사진) + PRE_12/13 (ADR-01~13 필수 교차 참조)
       ▼
[Step 2: 런타임 기반] PRE_02 (Phase 0: FastAPI, 모노레포, Envoy C++ ext_proc gRPC, AgentRouter)
       ▼
[Step 3: 멀티 테넌시] PRE_03 (Phase 1: 테넌트, 가상키 sk-orch-, Argon2id, 외부 연동 REST)
       ▼
[Step 4: 서빙 & 라우팅] PRE_04, PRE_05 (Phase 2: 모델 카탈로그, Envoy REST RDS v3 동적 가중치)
       │ ※ 필수: PRE_16(타임아웃 45s), PRE_17(6종 Provider), PRE_18(헬스 타임아웃 1.0~30s) 동시 모델링
       ▼
[Step 5: FinOps & 관제] PRE_06, PRE_07 (Phase 3: 토큰 계량, 1초 WebSocket 관제 허브, Hard Cap 429)
       ▼
[Step 6: 컴플라이언스] PRE_08 (Phase 4: 정규식 PII 인라인 마스킹, WORM 불변 감사테이블)
       ▼
[Step 7: 어플라이언스] PRE_09 (Phase 5: RSA-4096 서명 패치, 롤링 핫픽스 & 롤백, Preflight, Zero-PII)
       ▼
[Step 8: 프롬프트 거버넌스] PRE_19, PRE_20 (시스템 프롬프트 1:1 바인딩 & L7 ext_proc 인라인 주입)
       ▼
[Step 9: 종합 검증] PRE_10 (E2E 테스트 스펙), PRE_11 (실데이터 전환), PRE_15 (차세대 마일스톤)
```

---

### 2. 동일한 구현을 보장하는 3대 불변 원칙 (3 Golden Invariants)

1. **원칙 1: ADR 우선 원칙 (Architecture Decision First)**
   - `PRE_01`의 초기 구상(Kafka, Go xDS 데몬, 500MB spaCy Presidio)을 그대로 구현하지 말고, [`PRE_12`](./PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md) 및 [`PRE_13`](./PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md)의 **ADR-01 ~ ADR-15** 최적화 설계를 최우선 기준으로 채택합니다:
     - `FastAPI REST RDS v3` (`/api/v1/xds/v3/discovery:routes`)
     - 단일 DB 트랜잭션 동기식 원자적 계량 API (`POST /api/v1/external/usage/report`)
     - 자체 고속 정규식 PII 마스킹 엔진 (`<1ms`)
     - WORM 불변 테이블 (`audit_logs`) INSERT-only & SHA-256 해시 증적
     - L7 Envoy ext_proc 스트림 페이로드 인라인 주입 엔진

2. **원칙 2: 모델 카탈로그 사전 통합 모델링 (Pre-Integrated Schema Modeling)**
   - Step 4 (Phase 2 모델 카탈로그) 구현 시, 초기 `PRE_04`/`PRE_05` 명세만으로 DB 테이블을 생성하면 추후 마이그레이션이 발생합니다.
   - 반드시 [`PRE_16`](./PRE_16_gateway_browser_test_troubleshooting_report.md)(45초 LLM 추론 타임아웃 및 루프백 차단), [`PRE_17`](./PRE_17_model_provider_options_and_url_builder_report.md)(6종 Provider 및 Dynamic URL 조합기), [`PRE_18`](./PRE_18_model_health_check_timeout_report.md)(헬스체크 타임아웃 1.0s~30.0s 개별 제어)의 컬럼 및 파라미터를 **Phase 2 초기 구축 시점에 함께 모델링**해야 합니다.

3. **원칙 3: 시스템 프롬프트 독립 거버넌스 통합 (System Prompt Governance)**
   - Step 7(Phase 5) 완료 후, 반드시 [`PRE_19`](./PRE_19_system_prompt_governance_and_dynamic_injection_plan.md) 및 [`PRE_20`](./PRE_20_phase_system_prompt_implementation_and_test_results.md)을 순서대로 진행하여, 라우팅 정책(ROUTE)/가상키(VIRTUAL_KEY)/테넌트(TENANT) 1:1 바인딩 카탈로그와 Envoy L7 ext_proc 인라인 주입 미들웨어를 구축합니다.

---

### 3. 단계별 자동화 DoD 검증 파이프라인

각 단계가 완료될 때마다 아래 스크립트를 순차 실행하여 100% PASS를 확인하며 진행합니다:

```bash
# Phase 0 & 0.1: 기반 환경 및 AgentRouter L7 게이트웨이
make verify-phase0
make verify-phase0_1

# Phase 1: 멀티 테넌시 & 가상 API Key
bash scripts/verify-phase1.sh

# Phase 2: Envoy xDS 동적 멀티 라우팅
bash scripts/verify-phase2.sh

# Phase 3: FinOps 비용 계량 & 1초 관제 스트림
bash scripts/verify-phase3.sh

# Phase 4: PII 인라인 보안 & WORM 포렌식
make verify-phase4

# Phase 5: 에어갭 긴급 패치 관리자 & 서포트 엔진
bash scripts/verify-phase5.sh

# 시스템 프롬프트: 거버넌스 및 동적 인라인 주입
bash scripts/verify-phase-system-prompt.sh

# 사용자 인증 및 RBAC 권한 통제 (DoD)
make verify-auth-rbac

# Standalone 모드 설치 툴 및 Vagrant 프로비저닝 (DoD)
make verify-standalone-install

# 백엔드 전체 회귀 테스트 (93개 테스트 100% PASS)
cd backend && uv run pytest -v
```


