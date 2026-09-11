# AI Orchestrator Dashboard Architecture & Engineering Documentation

이 디렉토리는 AI 오케스트레이터 관리 툴 및 대시보드를 프로덕션 레벨로 실구현하기 위한 소프트웨어 공학 설계 및 엔지니어링 계획 문서를 보관합니다.

## 문서 목록
- 📄 **[dashboard_engineering_plan.md](file:///Users/jason/project/오케스트레이터/dashboard_arch/dashboard_engineering_plan.md)**: 
  - **요구공학 (FURPS+)**: 기능/비기능 요구사항 분석
  - **시스템 및 소프트웨어 아키텍처**: 헥사고날(Clean) 아키텍처 및 계층별 책임 분리
  - **도메인 주도 설계(DDD) & PostgreSQL DDL**: 정규화된 프로덕션 스키마 및 인덱스
  - **단계별 구현 로드맵 (Phase 0 ~ Phase 6)**: 세부 개발 태스크, 검증 기준, 완료 정의(DoD)
  - **품질 보증 & 테스팅 전략**: 테스팅 피라미드(Unit, Testcontainers 통합, Playwright E2E)
  - **에어갭 릴리즈 엔지니어링**: 오프라인 Helm/OCI 아카이브 패키징 및 무결성 검증 체계
