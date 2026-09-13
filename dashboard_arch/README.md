# AI Orchestrator Dashboard Architecture & Engineering Documentation

이 디렉토리는 AI 오케스트레이터 관리 포털 및 L7 제어 평면을 프로덕션 레벨로 구현하기 위한 **소프트웨어 공학 설계서, 단계별 구현 계획서(Implementation Plans) 및 자동화 테스트 결과 보고서(Test Results)**를 보관합니다.

---

## 📑 마스터 엔지니어링 계획서
- 📄 **[dashboard_engineering_plan.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/dashboard_engineering_plan.md)**: 
  - **요구공학 (FURPS+)**: 기능/비기능 요구사항 분석
  - **시스템 및 소프트웨어 아키텍처**: 헥사고날(Clean) 아키텍처 및 계층별 책임 분리
  - **도메인 주도 설계(DDD) & PostgreSQL DDL**: 정규화된 프로덕션 스키마 및 인덱스
  - **단계별 구현 로드맵 (Phase 0 ~ Phase 6)**: 세부 개발 태스크, 검증 기준, 완료 정의(DoD)
  - **품질 보증 & 테스팅 전략**: 테스팅 피라미드(Unit, Testcontainers 통합, Playwright E2E)
  - **에어갭 릴리즈 엔지니어링**: 오프라인 Helm/OCI 아카이브 패키징 및 무결성 검증 체계

---

## 📊 종합 총괄 보고서 (Executive Master Report)
- 🏆 **[PHASE_0_TO_5_COMPREHENSIVE_REPORT.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/PHASE_0_TO_5_COMPREHENSIVE_REPORT.md)**:
  - Phase 0 ~ Phase 5 구현 내역 및 아키텍처 총괄 요약
  - 46개 백엔드 단위/통합 테스트 100% 통과 매트릭스
  - 에어갭 오프라인 RSA-4096 서명 긴급 패치 및 4단계 롤링 핫픽스/롤백 파이프라인
  - Zero-PII 서포트 번들 실제 ZIP 다운로드 스트리밍
  - 브라우저 E2E 실환경 시연 녹화 및 스크린샷 증적 목록
  - 8대 아키텍처 결정 기록(ADR-01 ~ ADR-08) 총괄 정리
- 🔍 **[GAP_ANALYSIS_PHASE_0_TO_5.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/GAP_ANALYSIS_PHASE_0_TO_5.md)**:
  - 마스터 설계서 대비 Phase 0~5 세부 기능 구현율 및 정합성 감사 (Phase 0~5 100% 완료)
  - 미구현(Unimplemented) 및 아키텍처 대체(Alternative: ADR-01 ~ ADR-07) 기능 상세 분석
  - 에어갭 최적화 아키텍처 결정 기록(ADR) 전 설계 문서 현행화 완료 내역
  - 미테스트 시나리오 및 후속 Phase 6 연계 권장 조치 사항
- 🧪 **[INTEGRATED_FUNCTIONAL_TEST_SPEC.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/INTEGRATED_FUNCTIONAL_TEST_SPEC.md)**:
  - 백엔드 설계 명세 대비 전수 구현 비교 분석 (OK / ALT / 미구현 판정표)
  - 프론트엔드 전 화면 대화형 요소 전수 점검 (클릭, 추가, 수정, 삭제)
  - 통신 상태별 컬러 매핑 (`#F54927`: 백엔드 미통신, `#5EF527`: 백엔드 통신-Mock/시뮬레이션, 기본: 정상 실시간 연동)
- 🗺️ **[REAL_DATA_INTEGRATION_PLAN.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/REAL_DATA_INTEGRATION_PLAN.md)**:
  - #5EF527(Mock) 및 #F54927(미통신) 요소를 실제 데이터로 전환하기 위한 역할 분담 (나의 영역 vs AI의 영역)
  - 4대 스프린트(Sprint A~D) 마일스톤 로드맵 및 상세 실행 계획표 (RACI)

- 🌐 **[MODEL_CATALOG_AND_GATEWAY_ROUTING_SPEC.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/MODEL_CATALOG_AND_GATEWAY_ROUTING_SPEC.md)**:
  - 모델 카탈로그 서빙 풀 및 Envoy L7 게이트웨이 동적 라우팅 아키텍처 상세 설계서
  - vLLM / Ollama / SGLang / Triton 멀티 엔진 및 k8s / docker-compose / direct 구동 방식 규격
  - 실시간 비동기 헬스체크 프로빙 파이프라인 (루프백/타임아웃/레이턴시 측정)
  - Envoy L7 게이트웨이 경로 기반(`prefix_rewrite`) 및 헤더 기반(`x-orche-route`) 라우팅 엔드포인트 규격
  - 관리자 웹 콘솔 UI 연동 가이드 및 실시간 게이트웨이 테스트 호출 프록시 아키텍처

---

## 🗂️ 단계별 구현 계획서 및 테스트 결과 보고서 (Phased Reports)

| 단계 | 파일 링크 | 주요 엔지니어링 범위 | 검증 상태 |
| :--- | :--- | :--- | :---: |
| **Phase 0** | [phase0_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase0_implementation_plan_and_test_results.md) | 에어갭 공통 아키텍처, 헬스 프로브, 사전점검, 무결성 번들 | **100% PASS** (5/5 Tests) |
| **Phase 1** | [phase1_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase1_implementation_plan_and_test_results.md) | 테넌트 거버넌스, `sk-orch-` Argon2id 해싱, 키 수정 영속화, 외부 연동 API | **100% PASS** (15/15 Tests) |
| **Phase 2** | [phase2_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase2_implementation_plan_and_test_results.md)<br>[MODEL_CATALOG_AND_GATEWAY_ROUTING_SPEC.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/MODEL_CATALOG_AND_GATEWAY_ROUTING_SPEC.md) | 동적 모델 카탈로그(vLLM/Ollama), 실시간 헬스체크, Envoy L7 xDS 제어 평면, 게이트웨이 API 엔드포인트 노출 | **100% PASS** (23/23 Tests, 전체 46 Tests) |
| **Phase 3** | [phase3_implementation_plan.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase3_implementation_plan.md)<br>[phase3_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase3_implementation_plan_and_test_results.md) | 1초 WebSocket 텔레메트리, 표준 토큰 과금, Hard Cap 429 차단, UTF-8 BOM CSV | **100% PASS** (26/26 Tests) |
| **Phase 4** | [phase4_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase4_implementation_plan_and_test_results.md) | 인라인 PII 마스킹 엔진, MASK/HASH/BLOCK, WORM 감사 포렌식, SHA-256 증적 | **100% PASS** (35/35 Tests) |
| **Phase 5** | [phase5_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase5_implementation_plan_and_test_results.md) | RSA-4096 서명 오프라인 패치, 롤링 핫픽스/롤백, Zero-PII ZIP 번들, Preflight 진단 | **100% PASS** (46/46 Tests) |
