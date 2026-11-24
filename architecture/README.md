# Ordinatio Domain Architecture & Documentation Index

이 디렉토리는 Ordinatio의 **소프트웨어 공학 설계서, 도메인별 최신 구현 보고서, 아키텍처 결정서(ADR) 및 종합 로드맵**을 체계적으로 보관합니다.  
중복되거나 이전 단계에서 대체된 문서는 모두 정비되었으며, **시간적으로 가장 최근에 구현 및 검증된 핵심 문서만 도메인 단위로 구조화**되어 있습니다. 테스트와 검증에 관련된 모든 문서는 [`testdocs/`](./testdocs/README.md)에 별도로 분리 관리됩니다.

---

## 🗂️ 도메인별 최신 아키텍처 문서 체계 (Domain Map)

### 1. 00_core_and_blueprint (총괄 청사진 및 마스터 로드맵)
전사 아키텍처 청사진, 기술 비교 분석, 종합 성과 보고서 및 중장기 상용화 로드맵을 정의합니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [PRE_00_comparison.md](./00_core_and_blueprint/PRE_00_comparison.md) | **사전 벤치마킹 및 비교 분석서**<br>- ordinatio vs LiteLLM vs Kong AI vs Envoy AI 4자 아키텍처 비교 | 완료 |
| [PRE_01_dashboard_engineering_plan.md](./00_core_and_blueprint/PRE_01_dashboard_engineering_plan.md) | **마스터 엔지니어링 계획서 (Master Blueprint)**<br>- FURPS+ 요구공학, Clean Architecture, DDD, Phase 0~6 로드맵 | 최신 현행화 |
| [PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md](./00_core_and_blueprint/PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md) | **Phase 0~6 종합 총괄 보고서 (Executive Master Report)**<br>- 전 모듈 아키텍처 총괄, ADR-01~18 의사결정 기록 및 무회귀 성과 | 최신 현행화 |
| [PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md](./00_core_and_blueprint/PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md) | **Phase 0~6 엔지니어링 갭 분석서 (Gap Analysis)**<br>- 마스터 설계서 대비 런타임 구현율 100% 추적 및 상용 하드닝 완료 | 최신 현행화 |
| [PRE_15_Develop_milestone.md](./00_core_and_blueprint/PRE_15_Develop_milestone.md) | **차세대 개발 마일스톤 (Milestone 6 ~ 8) 로드맵** | 최신 현행화 |
| [PRE_36_gap_resolution_and_enterprise_expansion_roadmap.md](./00_core_and_blueprint/PRE_36_gap_resolution_and_enterprise_expansion_roadmap.md) | **엔터프라이즈 상용화 개발 로드맵 (Phase 7 ~ 9)**<br>- 셋업 마법사, Helm, 시맨틱 캐싱 등 14대 과제 로드맵; DRM은 P3 Deferred Backlog | 계획 완료 |

---

### 2. 01_gateway_and_routing (L7 AI Gateway & 지능형 라우팅)
Envoy AI Gateway Ingress, AgentRouter 동적 클러스터 바인딩, 커스텀 경로 디스패처 및 지능형 모델 라우팅을 정의합니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [ADR_17_envoy_l7_ingress_and_python_gateway.md](./01_gateway_and_routing/ADR_17_envoy_l7_ingress_and_python_gateway.md) | **Envoy L7 AI Gateway Ingress 및 Python Control Plane 아키텍처 결정** | 채택 완료 |
| [PRE_24_route_custom_path_finops_metering_and_tenant_mapping_report.md](./01_gateway_and_routing/PRE_24_route_custom_path_finops_metering_and_tenant_mapping_report.md) | **라우트 커스텀 경로 디스패치 & 테넌트 매핑**<br>- 동적 경로 디스패치(`/v1/{custom_path}`) 및 실시간 원자적 계량 연동 | **100% PASS** |
| [PRE_29_agent_router_dynamic_cluster_configuration_report.md](./01_gateway_and_routing/PRE_29_agent_router_dynamic_cluster_configuration_report.md) | **AgentRouter 동적 클러스터 구성 및 하드코딩 제거 최신 보고서**<br>- 인텐트 분석 기반 4대 지능형 라우팅 및 동적 클러스터 수동 에디트(Manual Override) | **100% PASS** |
| [PRE_48_anthropic_openai_tool_calling_translation_and_agentic_loop_resolution_report.md](./01_gateway_and_routing/PRE_48_anthropic_openai_tool_calling_translation_and_agentic_loop_resolution_report.md) | **Anthropic ↔ OpenAI 양방향 Tool Calling 변환 & Claude Code 에이전틱 루프 정지 결함 해결**<br>- 도구 정의 매핑, SSE 실시간 스트리밍 직렬화, 멀티턴 복원, x-api-key 인증 | **100% PASS** |

---

### 3. 02_observability_and_finops (실시간 관측성 및 예산 거버넌스)
vLLM Prometheus `/metrics` 스크래핑, 인프라 토폴로지 자동 판별 및 실시간 WebSocket 텔레메트리, 시계열 누적 그래프를 다룹니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [PRE_30_remote_endpoint_telemetry_and_topology_resolution_report.md](./02_observability_and_finops/PRE_30_remote_endpoint_telemetry_and_topology_resolution_report.md) | **원격 URL 엔드포인트 텔레메트리 스크래핑 및 스마트 토폴로지 자동 식별**<br>- vLLM 실시간 스크래핑, 원격 블랙박스 graceful N/A 분기 및 k8s/Docker 판별 | **100% PASS** |
| [PRE_49_overview_kpi_cumulative_graph_engineering_plan.md](./02_observability_and_finops/PRE_49_overview_kpi_cumulative_graph_engineering_plan.md) | **통합 운영 관제 대시보드 KPI 카드 누적 그래프(Cumulative Area Sparkline) 엔지니어링 계획서**<br>- 5대 카드별 누적 시계열 지표 정의, 100% Zero-Dependency SVG Area Sparkline 컴포넌트, 시계열 롤업 API 및 3단계 로드맵 | **계획 완료** |

---

### 4. 03_security_and_governance (보안, PII 마스킹, WORM 포렌식 & 하드닝)
고속 정규식 PII 인라인 마스킹, SHA-256 체이닝 불변 WORM 감사 로그 및 금융권 보안 하드닝을 정의합니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [PRE_08_phase4_pii_governance_and_worm_audit.md](./03_security_and_governance/PRE_08_phase4_pii_governance_and_worm_audit.md) | **인라인 PII 마스킹 & WORM 감사 포렌식 엔진**<br>- 개인정보 탐지(주민번호/카드/전화/이메일), MASK/HASH/BLOCK, WORM 로그 | **100% PASS** |
| [PRE_33_security_review_and_hardening_report.md](./03_security_and_governance/PRE_33_security_review_and_hardening_report.md) | **Ordinatio 종합 보안 검토 및 하드닝 보고서**<br>- 루프백 격리, .env 권한(600), SSRF 방어, X-Forwarded-For 스푸핑 방어 | **검토 완료** |

---

### 5. 04_prompt_governance (시스템 프롬프트 독립 거버넌스)
라우팅 정책, 가상키, 테넌트 1:1 바인딩 카탈로그 및 Envoy L7 ext_proc 인라인 페이로드 동적 주입을 정의합니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [PRE_20_phase_system_prompt_implementation_and_test_results.md](./04_prompt_governance/PRE_20_phase_system_prompt_implementation_and_test_results.md) | **시스템 프롬프트 거버넌스 & 동적 인라인 주입 최신 구현 보고서**<br>- DB 스키마, 1:1 바인딩 카탈로그, L7 ext_proc 스트림 페이로드 인라인 주입 | **100% PASS** |

---

### 6. 05_auth_and_rbac (사용자 인증, 동적 역할 & 세부 PBAC)
에어갭 로컬 PostgreSQL 기반 Argon2id 단방향 해싱, 동적 Role CRUD, 10대 도메인 17종 세부 권한(PBAC)을 정의합니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [PRE_38_dynamic_role_management_engineering_plan_and_test_results.md](./05_auth_and_rbac/PRE_38_dynamic_role_management_engineering_plan_and_test_results.md) | **동적 역할(Role) CRUD 및 10대 도메인 · 17종 세부 권한 PBAC 최신 구현 보고서**<br>- 커스텀 Role 추가/수정/삭제, 백엔드 require_permission 전면 적용, 전 탭 UI 가드 | **100% PASS** |
| [PRE_39_all_domains_rbac_inspection_plan.md](./05_auth_and_rbac/PRE_39_all_domains_rbac_inspection_plan.md) | **전 도메인 RBAC/PBAC 4계층 정밀 감사 기준서**<br>- 수직 PBAC, 수평 테넌트 격리, 메뉴 가시성, 인라인 컨트롤 감사 규격 | **기준 수립** |

---

### 7. 06_ui_and_presentation (UI 택소노미 & 로컬라이제이션)
React 18 Vanilla CSS 커스텀 디자인 시스템, 4대 UI 식별자 계층 및 strings.js 단일 진실 공급원을 정의합니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [PRE_23_ui_taxonomy_and_element_specification.md](./06_ui_and_presentation/PRE_23_ui_taxonomy_and_element_specification.md) | **UI 택소노미 체계 및 화면/기능 식별자 명세서**<br>- 4대 식별자 계층(Screen ID, Function ID, data-testid, Element Class) 표준화 | **구현 완료** |
| [PRE_35_frontend_ui_strings_implementation_and_test_results.md](./06_ui_and_presentation/PRE_35_frontend_ui_strings_implementation_and_test_results.md) | **프론트엔드 UI 한글 하드코딩 제거 및 strings.js 중앙 집중화 최신 보고서**<br>- 15개 UI 컴포넌트 하드코딩 0건 달성 및 화이트라벨링/i18n 기반 구축 | **100% PASS** |

---

### 8. 07_appliance_and_packaging (스탠드얼론 어플라이언스 & 패키징)
에어갭 단일 tar.gz 오프라인 아카이브, `make up` 원클릭 기동 및 RSA-4096 서명 핫픽스 엔진을 정의합니다.

| 문서 파일 | 핵심 내용 및 범위 | 상태 |
| :--- | :--- | :---: |
| [PRE_09_phase5_lifecycle_and_hotfix_engine.md](./07_appliance_and_packaging/PRE_09_phase5_lifecycle_and_hotfix_engine.md) | **어플라이언스 수명주기 제어 및 RSA-4096 긴급 패치 엔진**<br>- RSA-4096 서명 오프라인 패치 검증, 4단계 무중단 롤링 핫픽스 & 롤백 | **100% PASS** |
| [PRE_40_standalone_offline_appliance_packaging_plan.md](./07_appliance_and_packaging/PRE_40_standalone_offline_appliance_packaging_plan.md) | **독립형 오프라인 어플라이언스 원클릭 패키징 및 구동 보고서**<br>- `make prod-build` ➔ 단일 tar.gz 번들 생성 ➔ 타깃 서버 `make up` 원클릭 기동 | **100% PASS** |
| [PRE_45_standalone_appliance_release_engineering_plan.md](./07_appliance_and_packaging/PRE_45_standalone_appliance_release_engineering_plan.md) | **오프라인 어플라이언스 릴리즈 엔지니어링 계획서**<br>- 5단계 릴리즈 생명주기, 이중 체크섬, RSA-4096 서명, 고객사 전입 검증기 및 make release 자동화 | **구현 및 검증 완료** |
| [RELEASE_NOTES_0.1.5.md](./07_appliance_and_packaging/RELEASE_NOTES_0.1.5.md) | **Ordinatio 0.1.5 공식 상용 릴리즈 노트**<br>- LLM 모델 카탈로그 관리 체계 혁신 (Model Name 도입, Route Alias 선택적 자동 동기화, vLLM 업스트림 매핑 최적화 및 UI/UX 직관화) | **0.1.5 GA (최신 공식 릴리즈)** |
| [RELEASE_NOTES_0.1.4.md](./07_appliance_and_packaging/RELEASE_NOTES_0.1.4.md) | **Ordinatio 0.1.4 공식 상용 릴리즈 노트**<br>- Standalone 프론트엔드 Nginx 403 볼륨 마운트 결함 수정, L7 AI Gateway SSE 300초 스트리밍 확장 및 114 Tests 100% PASS | **0.1.4 GA** |
| [PRE_46_install_dns_registry_and_evidence_sync_implementation_and_test_results.md](./07_appliance_and_packaging/PRE_46_install_dns_registry_and_evidence_sync_implementation_and_test_results.md) | **사용자 지정 DNS·오프라인 번들 우선/외부 레지스트리 fallback 및 114건 검증 증적 수치 정합화** | **100% PASS** |
| [PRE_47_semantic_cache_implementation_and_test_results.md](./07_appliance_and_packaging/PRE_47_semantic_cache_implementation_and_test_results.md) | **에어갭 로컬 시맨틱 캐시, 테넌트 격리 및 FinOps 절감 관측** | **100% PASS** |
| [OFFLINE_INSTALL_GUIDE.md](./07_appliance_and_packaging/OFFLINE_INSTALL_GUIDE.md) | **폐쇄망(Air-Gapped) 원클릭 오프라인 설치 및 운영 매뉴얼** | **배포 완료** |
| [SECURITY_AUDIT_REPORT.md](./07_appliance_and_packaging/SECURITY_AUDIT_REPORT.md) | **엔터프라이즈 보안 감사 보고서 (공급망 서명, Non-root, WORM, Argon2id)** | **감사 통과** |

---

## 🧪 테스트 및 실증 검증 문서 ([testdocs/](./testdocs/README.md))

테스트 명세, Make 타겟 검증 및 3대 리눅스 배포판 가상머신 실환경 설치 증적은 [`testdocs/`](./testdocs/README.md)에 보관되어 있습니다:

- [PRE_10_INTEGRATED_FUNCTIONAL_TEST_SPEC.md](./testdocs/PRE_10_INTEGRATED_FUNCTIONAL_TEST_SPEC.md): 통합 기능 테스트 스펙 (E2E 검증 명세)
- [PRE_21_make_commands_test_plan.md](./testdocs/PRE_21_make_commands_test_plan.md): 전체 Make 명령어 테스트 계획서
- [PRE_22_make_commands_test_results.md](./testdocs/PRE_22_make_commands_test_results.md): 전체 Make 명령어 테스트 결과 보고서 (33/33 PASS)
- [PRE_25_all_menus_integrated_test_scenario_and_monitoring_plan.md](./testdocs/PRE_25_all_menus_integrated_test_scenario_and_monitoring_plan.md): 8대 전 메뉴 통합 시나리오 자동 검증 계획서 (10/10 PASS)
- [PRE_26_bifurcated_testing_strategy_local_vs_production.md](./PRE_26_bifurcated_testing_strategy_local_vs_production.md): 로컬 vs 실사용 환경 이원화 테스트 전략 및 품질 게이트 계획서 (신규 확정)
- [PRE_27_multipass_based_unified_testing_architecture_and_migration_plan.md](./PRE_27_multipass_based_unified_testing_architecture_and_migration_plan.md): Multipass 기반 크로스 플랫폼(Win11/Mac) 통합 테스트베드 아키텍처 및 마이그레이션 계획서 (신규 확정)
- [PRE_41_rocky_linux_vagrant_offline_installation_test_results.md](./testdocs/PRE_41_rocky_linux_vagrant_offline_installation_test_results.md): Rocky Linux 9 가상머신 오프라인 설치 실증 보고서
- [PRE_42_ubuntu_24_vagrant_offline_installation_test_plan.md](./testdocs/PRE_42_ubuntu_24_vagrant_offline_installation_test_plan.md): Ubuntu 24.04 LTS 가상머신 오프라인 설치 계획서
- [PRE_43_ubuntu_24_vagrant_offline_installation_test_results.md](./testdocs/PRE_43_ubuntu_24_vagrant_offline_installation_test_results.md): Ubuntu 24.04 LTS 가상머신 오프라인 설치 실증 보고서
- [PRE_44_amazon_linux_2023_vagrant_offline_installation_test_results.md](./testdocs/PRE_44_amazon_linux_2023_vagrant_offline_installation_test_results.md): Amazon Linux 2023 가상머신 오프라인 설치 실증 보고서
- [PRE_50_source_code_analysis_and_test_suite_alignment_report.md](./testdocs/PRE_50_source_code_analysis_and_test_suite_alignment_report.md): 소스코드 전수 분석 기반 실제 구현 정합화 및 테스트 스위트 전면 현행화 보고서 (114/114 Tests 100% PASS)

---

## 🗑️ 정비 및 중복 제거 감사 기록 (Deduplication Audit Log)

최신 도메인 문서에 완전 흡수/대체되어 안전하게 삭제된 구버전 중복 문서 목록 (총 22건):

| 삭제된 구버전 파일 | 대체 및 최신 흡수 문서 | 삭제 사유 |
| :--- | :--- | :--- |
| `RELEASE_NOTES_v1.0.0.md` | `RELEASE_NOTES_0.1.3.md` | 초기 v1.0.0 릴리즈 노트로 단일 공식 릴리즈 노트(0.1.3)로 통합 및 이전 버전 삭제 정책 적용 |
| `RELEASE_NOTES_v1.0.1.md` | `RELEASE_NOTES_0.1.3.md` | v1.0.1 릴리즈 노트로 단일 공식 릴리즈 노트(0.1.3)로 통합 및 이전 버전 삭제 정책 적용 |
| `RELEASE_NOTES_v1.0.2.md` | `RELEASE_NOTES_0.1.3.md` | v1.0.2 릴리즈 노트로 단일 공식 릴리즈 노트(0.1.3)로 통합 및 이전 버전 삭제 정책 적용 |
| `PRE_02_phase0_foundations_and_ai_gateway.md` | `PRE_01`, `PRE_12`, `PRE_40` | 초기 기초 설계로 마스터 계획서 및 스탠드얼론 패키징에 완전 흡수 |
| `PRE_03_phase1_tenant_and_virtual_keys.md` | `PRE_38`, `PRE_39` | 초기 3역할 사양으로 동적 Role CRUD 및 PBAC에 완전 대체 |
| `PRE_04_phase2_model_catalog_and_routing_spec.md` | `PRE_24`, `PRE_29` | 정적 모델 라우팅 사양으로 동적 클러스터 및 커스텀 경로에 대체 |
| `PRE_05_phase2_dynamic_routing_and_xds.md` | `PRE_24`, `PRE_29` | 초기 RDS xDS 실험문서로 최신 AgentRouter 구현체에 완전 대체 |
| `PRE_06_phase3_observability_and_finops_plan.md` | `PRE_24`, `PRE_30` | 초기 FinOps 계획으로 원자적 실시간 계량 및 텔레메트리에 흡수 |
| `PRE_07_phase3_observability_and_finops_results.md` | `PRE_24`, `PRE_30` | 초기 FinOps 결과로 최신 텔레메트리 스크래핑 문서에 대체 |
| `PRE_11_REAL_DATA_INTEGRATION_PLAN.md` | `PRE_25`, `PRE_30` | 9월 13일자 초기 Mock-to-Real 계획으로 실제 DB 구현 완료되어 소멸 |
| `PRE_14_GAP_MARKET_PLACE.md` | `PRE_13`, `PRE_36` | 마켓플레이스 초기 메모로 마스터 갭 분석서 및 로드맵에 흡수 |
| `PRE_16_gateway_browser_test_troubleshooting_report.md` | `PRE_12`, `PRE_29` | Ollama 포트 초기 트러블슈팅 메모로 최신 종합보고서에 포함 |
| `PRE_17_model_provider_options_and_url_builder_report.md` | `PRE_29`, `PRE_30` | 초기 프로바이더 분기로 동적 클러스터 및 스마트 토폴로지에 대체 |
| `PRE_18_model_health_check_timeout_report.md` | `PRE_29`, `PRE_30` | 타임아웃 수동 조절 초기로 최신 모델 카탈로그 구현체에 흡수 |
| `PRE_19_system_prompt_governance_and_dynamic_injection_plan.md` | `PRE_20` | 시스템 프롬프트 계획서로 최종 구현 및 검증 결과서(`PRE_20`)에 흡수 |
| `PRE_26_user_authentication_and_rbac_specification.md` | `PRE_38` | 정적 3역할 RBAC 사양으로 동적 Role 관리 엔진에 완전 대체 |
| `PRE_27_auth_rbac_implementation_plan_and_test_results.md` | `PRE_38`, `PRE_39` | 정적 RBAC 결과서로 10대 도메인 17종 세부 PBAC 구현에 대체 |
| `PRE_28_commercial_packaging_and_enterprise_expansion_plan.md` | `PRE_36`, `PRE_40` | 초기 패키징 계획으로 엔터프라이즈 로드맵 및 스탠드얼론 번들에 대체 |
| `PRE_31_rhel_compatible_vagrant_installer_plan.md` | `PRE_40` | 초기 셸 인스톨러 계획으로 단일 tar.gz 번들 원클릭 배포에 대체 |
| `PRE_32_standalone_installer_implementation_and_test_results.md` | `PRE_40` | 초기 install.sh 결과로 최신 standalone make up 엔진에 완전 대체 |
| `PRE_34_frontend_ui_strings_localization_plan.md` | `PRE_35` | UI 문자열 계획서로 strings.js 전면 적용 결과서(`PRE_35`)에 흡수 |
| `PRE_37_user_role_and_tenant_edit_engineering_plan.md` | `PRE_38` | 사용자 편집 중간 계획서로 최종 동적 Role CRUD 엔진에 흡수 |
