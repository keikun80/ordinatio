# aiorche - Enterprise AI Orchestration Platform

AI 오케스트레이터의 관리 포털(Dashboard)과 컨트롤 플레인(Control Plane)의 프로덕션 엔지니어링 프로젝트입니다.
금융권 및 엔터프라이즈의 망분리/온프레미스(Air-Gapped) 환경을 지원하며, 헥사고날(Clean) 아키텍처와 도메인 주도 설계(DDD)를 따릅니다.

---

## 디렉토리 구조 (Directory Structure)

```
aiorche/
├── Makefile                       # 빌드, 린트, 테스트 및 로컬 스택 통합 제어
├── docker-compose.yml             # 에어갭 에뮬레이션 스택 (Postgres, Redis, Envoy, Keycloak)
├── .env.example                   # 환경 변수 템플릿
├── backend/                       # Python FastAPI 기반 Control Plane API
│   ├── pyproject.toml             # Python 프로젝트 설정 & 의존성
│   ├── app/
│   │   ├── main.py                # FastAPI 진입점 및 미들웨어
│   │   ├── core/                  # 설정, 보안, Keycloak OIDC
│   │   ├── api/v1/                # REST API 엔드포인트
│   │   ├── db/                    # SQLAlchemy 세션 & 베이스
│   │   └── models/                # ORM 도메인 모델
│   └── tests/                     # pytest 단위/통합 테스트
├── frontend/                      # React 18 + Vite 기반 엔터프라이즈 관리 콘솔
│   ├── package.json
│   ├── vite.config.js
│   ├── src/                       # 7대 핵심 관리 모듈 UI
│   └── Dockerfile
├── deploy/                        # 인프라 설정 및 DDL
│   ├── envoy/envoy.yaml           # Envoy AI Gateway L7 프록시 설정
│   ├── postgres/init.sql          # PostgreSQL 도메인 DDL 스키마
│   └── keycloak/realm-export.json # Keycloak 인증 템플릿
└── scripts/                       # 개발 및 검증 자동화 스크립트
    ├── dev-setup.sh               # 개발 환경 원클릭 세팅
    └── verify-phase0.sh           # Phase 0 완료 정의(DoD) 검증 스크립트
```

---

## 빠른 시작 (Quick Start)

### 1. 개발 환경 초기화
```bash
make setup
```

### 2. 백엔드 및 프론트엔드 로컬 실행
```bash
# 백엔드 실행 (포트 8000, OpenAPI Docs: http://localhost:8000/docs)
make run-backend

# 프론트엔드 실행 (포트 5173, Web UI: http://localhost:5173)
make run-frontend
```

### 3. 테스트 및 Phase 0 검증
```bash
make test
make verify-phase0
```
