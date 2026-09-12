# AI Orchestrator 프로젝트 규칙 및 개발 가이드라인

본 프로젝트는 고객사 인프라에 100% 설치되어 운영되는 **고객 자율 운영형 폐쇄망(Air-Gapped) 어플라이언스**입니다.
모든 에이전트는 아래의 아키텍처 원칙과 엔지니어링 표준을 반드시 준수해야 합니다.

## 1. 핵심 아키텍처 원칙 (Core Architectural Invariants)
1. **100% 에어갭 / 오프라인 자립성**:
   - 외부 인터넷, 외부 CDN, 외부 SaaS 인증/원격 측정(Telemetry) 호출을 절대 포함하지 않습니다.
   - 모든 프론트엔드/백엔드 의존성은 폐쇄망 내부 패키지 및 로컬 번들링으로 해결합니다.
2. **고객 주도 운영 모델**:
   - 모든 제어 평면, 테넌트 관리, 가상 API Key, 모델 라우팅, PII 마스킹, 감사 로그 관리는 고객사 운영팀이 직접 통제합니다.
   - 벤더(개발사)는 오케스트레이터의 **긴급 보안 패치/핫픽스 번들**만 오프라인 서명(.tar.gz + RSA-4096) 형태로 제공합니다.
3. **디렉토리 역할 분리**:
   - `dashboard_arch/`: 소프트웨어 공학적 설계 문서, 단계별 엔지니어링 계획서 (`dashboard_engineering_plan.md`).
   - `dashboard/`: 초기 기획 및 UI 프로토타입/Mock 애플리케이션.
   - `aiorche/`: **실제 상용급 구현 모노레포** (`backend/`, `frontend/`, `deploy/`, `scripts/`, `Makefile`, `docker-compose.yml`).

## 2. 단계별 구현 및 검증 원칙 (Phased Engineering & DoD)
- 모든 기능 구현은 `dashboard_arch/dashboard_engineering_plan.md`의 Phase(0~4) 정의에 따라 순차적으로 진행합니다.
- 각 단계 완료 시 반드시 Definition of Done(DoD) 자동화 검증 스크립트(`scripts/verify-phase*.sh`) 및 `make test`를 통과해야 합니다.

## 3. 아키텍처 문서 및 종합 보고서 동기화 표준 (Documentation Synchronization Invariants)
각 Phase(단계)의 구현/검증이 완료되거나 주요 결함 해결/기능 수정이 발생했을 때, 에이전트는 사용자의 별도 요청 없이 아래 문서들을 **반드시 원스톱으로 동시 현행화**해야 합니다:
1. **단계별 개별 보고서**: `dashboard_arch/phase{N}_implementation_plan_and_test_results.md` 작성 및 검증 증적 기록.
2. **종합 총괄 보고서 (Comprehensive Report)**:
   - `dashboard_arch/PHASE_0_TO_{N}_COMPREHENSIVE_REPORT.md`로 **완료된 최신 Phase({N})에 맞춰 파일명 변경(리네이밍) 및 구버전 파일 삭제**.
   - 다이어그램, 단계별 핵심 성과, 전체 테스트 매트릭스(PASS 건수), 브라우저 E2E 증적, ADR 기록 전면 업데이트.
3. **엔지니어링 갭 분석서 (Gap Analysis)**:
   - `dashboard_arch/GAP_ANALYSIS_PHASE_0_TO_{N}.md`로 **완료된 최신 Phase({N})에 맞춰 파일명 변경(리네이밍) 및 구버전 파일 삭제**.
   - Phase 0부터 {N}까지의 요구사항 대비 구현율(100%), ADR-01~0N, 미구현/미테스트 및 권장 과제 전면 현행화.
4. **디렉토리 인덱스 및 마스터 계획서 동기화**:
   - `dashboard_arch/README.md`, `dashboard_arch/dashboard_engineering_plan.md`, `aiorche/README.md` 내 상태 배지, 파일 링크, 테스트 통과 수치 즉각 일치화.

## 4. 기술 스택별 표준 규칙
1. **Backend (Python)**:
   - 의존성 및 가상환경 관리는 반드시 `uv`를 사용합니다 (`uv sync`, `uv run pytest`).
   - 시스템 Python과의 충돌을 방지하기 위해 테스트 및 CLI 실행 시 `uv run` 또는 `.venv/bin/`을 항상 사용합니다.
   - Pydantic 환경설정은 V2 표준(`model_config = SettingsConfigDict(...)`)을 준수합니다.
   - 가상 API Key는 `sk-orch-` 접두사를 가지며, DB 저장 시 Argon2id 단방향 솔트 해싱을 적용합니다.
2. **Frontend (React + Vite)**:
   - React 18 + Vite + Lucide React 기반 모듈식 구조를 유지합니다.
   - 에어갭 환경을 위해 순수 Vanilla CSS 기반 커스텀 디자인 시스템(Glassmorphism, Dark Slate Theme)을 유지합니다.
3. **Gateway & Infra**:
   - L7 AI Gateway는 Envoy(xDS 동적 제어)를 사용합니다.
   - 스택 관리는 `aiorche/Makefile`의 표준 타깃(`make setup`, `make test`, `make run-backend`, `make run-frontend`, `make verify-phase0`)을 활용합니다.
