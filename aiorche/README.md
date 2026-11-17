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

### 3. 단계별 검증 및 관리 도구 (DoD Automated Verification & Management)
```bash
# 전체 단위/통합 테스트 실행 (pytest 102개 테스트 100% 통과)
make test

# 초기 관리자 계정 대화형 생성 CLI
make init-admin

# 단계별 완료 정의(DoD) 자동화 검증
make verify-phase0    # Phase 0: 기반 환경 및 에어갭 패키징 무결성
make verify-phase0_1  # Phase 0.1: Envoy AI Gateway (ext_proc) & AgentRouter 지능형 분기
bash scripts/verify-phase1.sh   # Phase 1: 테넌트 거버넌스 및 가상 API Key
bash scripts/verify-phase2.sh   # Phase 2: Envoy xDS 동적 멀티 라우팅 및 N-Way 분할
bash scripts/verify-phase3.sh   # Phase 3: FinOps 비용 계량 및 실시간 관제 스트림
bash scripts/verify-phase4.sh   # Phase 4: PII 보안 거버넌스 및 WORM 감사 포렌식
bash scripts/verify-phase5.sh   # Phase 5: 에어갭 긴급 패치 관리자 & 서포트 엔진
bash scripts/verify-phase-system-prompt.sh # 시스템 프롬프트 거버넌스 & 동적 주입 엔진
make verify-auth-rbac # 사용자 인증 및 RBAC (Argon2id+JWT, 금융권 보안제약, 93 Tests)
make verify-standalone-install # Phase 6: Standalone 설치 툴 및 Vagrant 검증 (7/7 PASS)
```

---

## 핵심 아키텍처 및 구현 모듈 (Key Modules)

### 구현 진행 현황 요약
| Phase | 설명 | 상태 | DoD 검증 |
| :---: | :--- | :---: | :---: |
| **Phase 0** | 개발 환경 표준화 및 프로젝트 스캐폴딩 | ✅ 완료 | `make verify-phase0` 통과 |
| **Phase 0.1** | Envoy AI Gateway (ext_proc) & AgentRouter 인지 지능 엔진 | ✅ 완료 | `make verify-phase0_1` 통과 |
| **Phase 1** | 인증, 멀티 테넌트 및 가상 API Key 코어 | ✅ 완료 | `verify-phase1.sh` 통과 |
| **Phase 2** | Envoy xDS 연동 및 동적 멀티 라우팅 엔진 | ✅ 완료 | `verify-phase2.sh` 100% 통과 |
| **Phase 3** | 관제, FinOps 과금 및 실시간 관제 허브 | ✅ 완료 | `verify-phase3.sh` 통과 |
| **Phase 4** | PII 보안 거버넌스 및 WORM 감사 포렌식 | ✅ 완료 | `make verify-phase4` 통과 |
| **Phase 5** | 에어갭 긴급 패치 관리자 & 서포트 엔진 | ✅ 완료 | `bash scripts/verify-phase5.sh` 통과 |
| **시스템 프롬프트** | 동적 시스템 프롬프트 거버넌스 & L7 인라인 주입 | ✅ 완료 | `verify-phase-system-prompt.sh` 통과 |
| **사용자 인증 & RBAC** | 로컬 자립형 금융권 인증(Argon2id+JWT) 및 동적 RBAC/PBAC | ✅ 완료 | `make test` 통과 (102 Tests) |
| **Phase 6: Standalone** | RHEL 9 호환 Standalone 설치 툴(install.sh) & aiorche-ctl CLI | ✅ 완료 | `make verify-standalone-install` (7/7 PASS) |
| **Phase 6: 현지화** | 15개 UI 컴포넌트 한글 리터럴 제거 & strings.js 일원화 | ✅ 완료 | `npm run build` (Vite Build PASS) |

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
   - 이종 서빙 런타임(vLLM, Ollama, SGLang, Triton, NIM) 카탈로그 & 활성 정책 종속성 검증 기반 안전 삭제(`DELETE /api/v1/models/{id}`)
   - 6종 Provider 규격화(OpenAI, DeepSeek, Anthropic, Gemini, Cohere, 직접 지정) 및 실시간 Dynamic URL Builder
   - 헬스체크 타임아웃 수동 조절(1.0s~30.0s) & `localStorage` 영속화 및 모델별 개별 DB 설정/예외 상세화
   - 실시간 모델 풀 헬스체크 프로빙(`GET /models/health-check`, `POST /models/{id}/health`) 및 Envoy 게이트웨이 대화형 테스트 호출 모달
3. ✅ **Phase 3: FinOps 비용 계량 & 실시간 관제 허브** — `구현완료`
   - 1초 주기 WebSocket 텔레메트리 스트림 허브 (`/api/v1/observability/ws`)
   - 글로벌 관제 홈 100% 실데이터 연동(PostgreSQL `model_catalogs` DB + host OS 메모리 + Envoy live 큐)
   - WORM `audit_logs` 불변 감사 테이블 집계와 Envoy live RPS를 결합한 모델별 트래픽 점유율 실측
   - 프론트엔드 수명주기 디커플링(`useRef`)을 통한 지표 요약 모드 깜빡임(Zero-Flicker) 결함 완벽 해결
   - 토큰 및 실시간 비용 원자적 정산 API (`POST /api/v1/external/usage/report`)
   - 예산 100% 소진 시 Envoy 레벨 즉각 차단(Hard Cap HTTP 429)
   - 사내 회계 결산용 UTF-8 BOM 한글 호환 CSV 청구서 스트리밍 내보내기
4. ✅ **Phase 4: PII 보안 거버넌스 및 감사 포렌식** — `구현완료`
   - 자체 정규식 PII 탐지·마스킹 엔진 (`app/core/pii_engine.py`) 및 Presidio 어댑터
   - MASK 치환, HASH(SHA-256 가명화), BLOCK(즉시 차단) 조치 액션 지원
   - 실시간 프롬프트 마스킹 시뮬레이션 및 WORM 불변 감사 로그 테이블 적재
   - `ComplianceTab.jsx`: 실시간 Presidio 마스킹 검증, PII 룰셋 동적 CRUD(등록 모달 & 인앱 안전 삭제 확인 모달), WORM 감사 포렌식 뷰어 & JSON 리포트 다운로드
   - `PromptStudioTab.jsx`: Side-by-Side PII 마스킹 비교 및 SHA-256 원문/마스킹 페이로드 무결성 해시 표기
5. ✅ **Phase 5: 에어갭 긴급 패치 관리자 & 서포트 엔진** — `구현완료`
   - RSA-4096 / SHA-256 서명 검증 및 4단계 무중단 롤링 핫픽스 엔진
   - 장애 발생 시 이전 버전으로 즉시 원복하는 원클릭 롤백 파이프라인 (`POST /patches/rollback`)
   - 개인정보 완전 필터링 Zero-PII 서포트 번들 암호화 ZIP 생성 및 즉시 다운로드
   - 5대 핵심 인프라(Postgres, Redis, Envoy, ext_proc, vLLM) Preflight 정밀 자가진단
   - 프론트엔드 `LifecycleTab.jsx`: 실시간 터미널 스트리밍 로그, 버전 배지 갱신 및 원클릭 배포 연동
6. ✅ **Phase 6: Standalone 무인 패키징, 보안 하드닝 및 UI 현지화** — `구현완료`
   - RHEL 9 호환 4단계 무인 설치 파이프라인(`install.sh`), 호스트 관리 CLI(`aiorche-ctl`), Vagrant 멀티 배포판 테스트베드
   - 127.0.0.1 루프백 포트 격리 및 파일 퍼미션(600/700) 하드닝 (`PRE_33` 보안 검토 통과)
   - 15개 프론트엔드 UI 컴포넌트 한글 리터럴 100% 제거 및 `strings.js` 중앙 집중화 (`PRE_35`)
   - 차세대 엔터프라이즈 확장(오프라인 DRM 라이선스, Helm Chart, 시맨틱 캐싱 등)은 `PRE_28` 상용화 로드맵 참조

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

