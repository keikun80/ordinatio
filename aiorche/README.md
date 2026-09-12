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

### 3. 단계별 검증 (DoD Automated Verification)
```bash
# 전체 단위/통합 테스트 실행 (pytest 27개 테스트)
make test

# 단계별 완료 정의(DoD) 자동화 검증
make verify-phase0    # Phase 0: 기반 환경 및 에어갭 패키징 무결성
bash scripts/verify-phase1.sh   # Phase 1: 테넌트 거버넌스 및 가상 API Key
bash scripts/verify-phase2.sh   # Phase 2: Envoy xDS 동적 멀티 라우팅 및 N-Way 분할
bash scripts/verify-phase3.sh   # Phase 3: FinOps 비용 계량 및 실시간 관제 스트림
```

---

## 핵심 아키텍처 및 구현 모듈 (Key Modules)

### 구현 진행 현황 요약
| Phase | 설명 | 상태 | DoD 검증 |
| :---: | :--- | :---: | :---: |
| **Phase 0** | 개발 환경 표준화 및 프로젝트 스캐폴딩 | ✅ 완료 | `make verify-phase0` 통과 |
| **Phase 1** | 인증, 멀티 테넌트 및 가상 API Key 코어 | ✅ 완료 | `verify-phase1.sh` 통과 |
| **Phase 2** | Envoy xDS 연동 및 동적 멀티 라우팅 엔진 | ✅ 완료 | `verify-phase2.sh` 100% 통과 |
| **Phase 3** | 관제, FinOps 과금 및 실시간 관제 허브 | ✅ 완료 | `verify-phase3.sh` 통과 |
| **Phase 4** | PII 보안 거버넌스 및 WORM 감사 포렌식 | ✅ 완료 | `make verify-phase4` 통과 |
| **Phase 5** | 에어갭 긴급 패치 관리자 & 서포트 엔진 | 🚧 미구현 | — |
| **Phase 6** | E2E 통합 검증, 보안 감사 및 에어갭 패키징 | 🚧 미구현 | — |

---

1. ✅ **Phase 1: 멀티 테넌트 & 가상 API Key 거버넌스** — `구현완료`
   - 사내 조직/부서별 테넌트 격리 및 할당량 통제
   - 난독화 가상 API Key(`sk-orch-...`) 발급 및 Argon2id 단방향 솔트 해시 보관
   - IP CIDR 화이트리스트 및 슬라이딩 윈도우 RPM/TPM 속도 제한
2. ✅ **Phase 2: Envoy xDS 연동 및 동적 멀티 라우팅 스튜디오** — `구현완료`
   - 다중 가상 라우트 프로필(Multi-Route Profiles CRUD) 및 우선순위(`priority`) 정렬
   - N개 서빙 모델 동적 가중치 분할기(N-Target Multi-Weighted Splitter) & 100% 균등 자동 분배(Auto-Balance)
   - 조건부 트래픽 매칭(`x-orche-tenant` 테넌트 격리, URL 접두사 `/v1/routes/...`, 커스텀 HTTP 헤더)
   - 다단계 장애 대응 자동 우회 체인 (Primary ➔ Secondary ➔ Emergency Fallback Pool)
   - Envoy L7 REST Route Discovery Service (RDS v3) 제어 평면 통합 (`/api/v1/xds/v3/discovery:routes`)
3. ✅ **Phase 3: FinOps 비용 계량 & 실시간 관제 허브** — `구현완료`
   - 1초 주기 WebSocket 텔레메트리 스트림 허브 (`/api/v1/observability/ws`)
   - 토큰 및 실시간 비용 원자적 정산 API (`POST /api/v1/external/usage/report`)
   - 예산 100% 소진 시 Envoy 레벨 즉각 차단(Hard Cap HTTP 429)
   - 사내 회계 결산용 UTF-8 BOM 한글 호환 CSV 청구서 스트리밍 내보내기
4. ✅ **Phase 4: PII 보안 거버넌스 및 감사 포렌식** — `구현완료`
   - 자체 정규식 PII 탐지·마스킹 엔진 (`app/core/pii_engine.py`) 및 Presidio 어댑터
   - MASK 치환, HASH(SHA-256 가명화), BLOCK(즉시 차단) 조치 액션 지원
   - 실시간 프롬프트 마스킹 시뮬레이션 및 WORM 불변 감사 로그 테이블 적재
   - `ComplianceTab.jsx`: 실시간 Presidio 마스킹 검증, PII 룰셋 동적 CRUD(등록 모달 & 인앱 안전 삭제 확인 모달), WORM 감사 포렌식 뷰어 & JSON 리포트 다운로드
   - `PromptStudioTab.jsx`: Side-by-Side PII 마스킹 비교 및 SHA-256 원문/마스킹 페이로드 무결성 해시 표기
5. 🚧 **Phase 5: 에어갭 긴급 패치 관리자** — `미구현`
   - RSA-4096 서명 검증, K8s 롤링 배포, Zero-PII 서포트 번들 엔진
   - 프론트엔드 `LifecycleTab.jsx`에 Mock UI만 구현 완료
6. 🚧 **Phase 6: E2E 통합 검증 및 에어갭 패키징** — `미구현`
   - Playwright E2E, Helm Chart, 오프라인 이미지 번들, SAST/컨테이너 스캔

## 쿠버네티스 Pod 관리 (Kubernetes Operations)

루트 디렉토리 또는 `aiorche/` 디렉토리에서 다음 명령어를 통해 쿠버네티스 Pod 라이프사이클을 손쉽게 제어할 수 있습니다.

### 1. 스택 배포 및 해제
```bash
# 쿠버네티스 전체 스택 배포 및 롤아웃 대기
make k8s-up         # 또는 make k8s-deploy

# 쿠버네티스 전체 리소스 삭제
make k8s-down       # 또는 make k8s-delete
```

### 2. Pod 시작 및 중지 (일시 정지 / 재개)
> [!NOTE]
> `k8s-stop`은 DB 볼륨, ConfigMap, Service 등 클러스터 상태를 그대로 유지한 채 Pod(컨테이너)만 안전하게 0개로 축소(Pause)하여 컴퓨팅 자원을 반환합니다. `k8s-start`는 이를 다시 1개로 복구(Resume)합니다.

```bash
# 모든 Pod 일시 중지 (scale to 0)
make k8s-stop

# 모든 Pod 다시 시작 (scale to 1 및 롤아웃 대기)
make k8s-start

# 모든 Pod 롤링 무중단 재시작
make k8s-restart

# Pod 및 서비스 상태 확인
make k8s-status

# Pod 통합 로그 스트리밍
make k8s-logs
```

### 3. 개별 서비스 단위 제어
특정 서비스의 Pod만 독립적으로 시작/중지할 수 있습니다:
- **Backend**: `make k8s-start-backend` / `make k8s-stop-backend`
- **Frontend**: `make k8s-start-frontend` / `make k8s-stop-frontend`
- **Envoy Gateway**: `make k8s-start-envoy` / `make k8s-stop-envoy`
- **Database (PostgreSQL & Redis)**: `make k8s-start-db` / `make k8s-stop-db`

