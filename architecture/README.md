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
| **PRE_12** | [PRE_12_PHASE_0_TO_5_COMPREHENSIVE_REPORT.md](./PRE_12_PHASE_0_TO_5_COMPREHENSIVE_REPORT.md) | **Phase 0~5 종합 총괄 보고서 (Executive Master Report)**<br>- Phase 0~5 전 모듈 아키텍처 및 46개 테스트 100% 통과 매트릭스<br>- 브라우저 E2E 실환경 시연 증적, 9대 아키텍처 결정 기록(ADR-01~09) 총괄 | 최신 현행화 |
| **PRE_13** | [PRE_13_GAP_ANALYSIS_PHASE_0_TO_5.md](./PRE_13_GAP_ANALYSIS_PHASE_0_TO_5.md) | **Phase 0~5 엔지니어링 갭 분석서 (Gap Analysis)**<br>- 마스터 설계서 대비 실제 구현율 100% 추적 감사<br>- 에어갭 최적화 아키텍처 결정(ADR) 전수 매핑 및 후속 Phase 6 연계 과제 | 최신 현행화 |
| **PRE_14** | [PRE_14_GAP_MARKET_PLACE.md](./PRE_14_GAP_MARKET_PLACE.md) | **엔터프라이즈 AI 마켓플레이스 연동 갭 분석서**<br>- 사내 AI 모델 스토어 및 프라이빗 레지스트리 연동 아키텍처 갭 분석<br>- 모델 온보딩 자동화 및 멀티 테넌트 권한 배포 방안 | 분석 완료 |
| **PRE_15** | [PRE_15_Develop_milestone.md](./PRE_15_Develop_milestone.md) | **차세대 개발 마일스톤 (Milestone 6 ~ 8) 로드맵**<br>- M6: 프로덕션 릴리즈 패키징, 오프라인 Helm, 실시간 웹훅, WORM 불변 트리거<br>- M7: 에어갭 로컬 시맨틱 캐싱, 프롬프트 인젝션 방어, DB 정기 백업 & DR<br>- M8: 엔터프라이즈 SSO/RBAC, 모델 실시간 벤치마크, 스트리밍 PII 가드레일 | 최신 현행화 |
| **PRE_16** | [PRE_16_gateway_browser_test_troubleshooting_report.md](./PRE_16_gateway_browser_test_troubleshooting_report.md) | **웹브라우저 LLM 테스트 연동 및 게이트웨이 즉시 호출 장애 해결 보고서**<br>- Ollama 미다운로드 모델 기본 설정 불일치 해소<br>- Docker 네트워크 브릿지 격리 해제 및 호스트:컨테이너 포트(11435 vs 11434) 정정<br>- 라우팅 테스트 클라이언트 45초 타임아웃 패치 및 브라우저 E2E 검증(200 OK) 완료 | **검증 완료**<br>(E2E PASS) |
| **PRE_17** | [PRE_17_model_provider_options_and_url_builder_report.md](./PRE_17_model_provider_options_and_url_builder_report.md) | **LLM 서빙 모델 Provider 규격화 및 동적 엔드포인트 URL 조합기 구현 보고서**<br>- 6종 Provider(OpenAI, DeepSeek, Anthropic, Gemini, Cohere, Custom) 지원<br>- 베이스 도메인 기반 실시간 엔드포인트 URL 동적 조합기(Dynamic URL Builder)<br>- 백엔드 임의 정규화 롤백 & 직접 호출 보장, 백엔드 단위/통합 테스트 66개 100% 통과 | **100% PASS**<br>(66/66 Tests) |
| **PRE_18** | [PRE_18_model_health_check_timeout_report.md](./PRE_18_model_health_check_timeout_report.md) | **LLM 모델 헬스체크 타임아웃 수동 조절 기능 구현 및 검증 보고서**<br>- 전역 툴바 타임아웃 드롭다운(1.0s~30.0s) & localStorage 자동 영속화<br>- 모델별 개별 타임아웃 DB 컬럼(`health_check_timeout`) 및 등록/수정 모달 반영<br>- 백엔드 동적 타임아웃 쿼리 파라미터 및 `httpx` 타임아웃 예외 메시지 상세화, 66개 테스트 통과 | **100% PASS**<br>(66/66 Tests) |
| **PRE_19** | [PRE_19_system_prompt_governance_and_dynamic_injection_plan.md](./PRE_19_system_prompt_governance_and_dynamic_injection_plan.md) | **시스템 프롬프트 거버넌스 및 동적 주입 구현 계획서 (Engineering Plan)**<br>- 시스템 프롬프트 독립 카탈로그 및 1:1 타겟 바인딩 (라우팅 정책 / 가상 API Key / 테넌트)<br>- L7 Envoy AI Gateway (ext_proc) 기반 인라인 페이로드 변조 및 위계적 우선순위 해석 알고리즘<br>- 프론트엔드 시스템 프롬프트 관리 화면 UI/UX 및 실시간 토큰 계산기 설계 | **구현 완료**<br>(Phase 1~5) |
| **PRE_20** | [PRE_20_phase_system_prompt_implementation_and_test_results.md](./PRE_20_phase_system_prompt_implementation_and_test_results.md) | **시스템 프롬프트 거버넌스 & 동적 인라인 주입 구현 및 검증 결과서**<br>- DB 스키마/모델, RESTful API, L7 ext_proc 및 AgentRouter 테스트벤치 연동<br>- React 18 Vanilla CSS 관리 포털 대시보드 및 1:1 바인딩 마법사<br>- DoD 자동화 검증 스크립트(`verify-phase-system-prompt.sh`) 및 전체 78개 테스트 무회귀 검증 | **100% PASS**<br>(78/78 Tests) |


