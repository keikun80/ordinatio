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
- 🏆 **[PHASE_0_TO_3_COMPREHENSIVE_REPORT.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/PHASE_0_TO_3_COMPREHENSIVE_REPORT.md)**:
  - Phase 0 ~ Phase 3 구현 내역 및 아키텍처 총괄 요약
  - 26개 백엔드 단위/통합 테스트 100% 통과 매트릭스
  - Kubernetes 클러스터 5개 핵심 Pod 배포 상태 현황
  - 브라우저 E2E 실환경 시연 녹화 및 스크린샷 증적 목록
- 🔍 **[GAP_ANALYSIS_PHASE_0_TO_3.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/GAP_ANALYSIS_PHASE_0_TO_3.md)**:
  - 마스터 설계서 대비 Phase 0~3 세부 기능 구현율 및 정합성 감사
  - 미구현(Unimplemented) 및 아키텍처 대체(Alternative: ADR-01 ~ ADR-04) 기능 7개 항목 상세 분석
  - 에어갭 최적화 아키텍처 결정 기록(ADR) 전 설계 문서 현행화 완료 내역
  - 미테스트 시나리오 및 후속 Phase 4 연계 권장 조치 사항

---

## 🗂️ 단계별 구현 계획서 및 테스트 결과 보고서 (Phased Reports)

| 단계 | 파일 링크 | 주요 엔지니어링 범위 | 검증 상태 |
| :--- | :--- | :--- | :---: |
| **Phase 0** | [phase0_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase0_implementation_plan_and_test_results.md) | 에어갭 공통 아키텍처, 헬스 프로브, 사전점검, 무결성 번들 | **100% PASS** (5/5 Tests) |
| **Phase 1** | [phase1_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase1_implementation_plan_and_test_results.md) | 테넌트 거버넌스, `sk-orch-` Argon2id 해싱, 키 수정 영속화, 외부 연동 API | **100% PASS** (15/15 Tests) |
| **Phase 2** | [phase2_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase2_implementation_plan_and_test_results.md) | 동적 모델 카탈로그, Envoy L7 xDS 제어 평면, 카나리 80:20 분할, K8s Pod 배포 | **100% PASS** (20/20 Tests) |
| **Phase 3** | [phase3_implementation_plan.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase3_implementation_plan.md)<br>[phase3_implementation_plan_and_test_results.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/phase3_implementation_plan_and_test_results.md) | 1초 WebSocket 텔레메트리, 표준 토큰 과금, Hard Cap 429 차단, UTF-8 BOM CSV | **100% PASS** (26/26 Tests) |
