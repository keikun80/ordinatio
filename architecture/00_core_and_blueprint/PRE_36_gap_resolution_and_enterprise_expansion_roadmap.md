# PRE_36: 아키텍처-구현 갭(GAP) 분석 기반 엔터프라이즈 상용화 개발 로드맵 (Gap Resolution & Enterprise Expansion Roadmap)

**문서 번호**: ORDINATIO-DEV-ROADMAP-20261106  
**기준 문서**: `architecture/PRE_01_dashboard_engineering_plan.md`, `architecture/PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md`, `architecture/PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md`, `architecture/PRE_28_commercial_packaging_and_enterprise_expansion_plan.md`  
**대상 시스템**: Ordinatio Appliance (100% 폐쇄망 엔터프라이즈 AI 통합 제어 평면)  
**작성 일자**: 2026-11-06 (Phase 0~6 완결 기반 차세대 확장 로드맵)  

---

## 1. 개요 및 배경 (Executive Summary)

현재 Ordinatio는 **Phase 0부터 Phase 6까지의 핵심 런타임 제어 평면(L7 C++ Envoy Gateway, AgentRouter 4대 자율 라우팅, 6종 Provider 동적 URL 조합기, 가상키/테넌트 거버넌스, 1초 WebSocket 관제, PII 마스킹/WORM 감사, RSA-4096 핫픽스, 시스템 프롬프트 L7 인라인 주입, 금융권 RBAC 인증, Standalone 무인 설치기, 프론트엔드 strings.js 100% 현지화)**을 100% 완비하고, 86개 백엔드 단위/통합 테스트 및 7개 Standalone 설치 검증을 무회귀 통과한 프로덕션 레디 상태입니다.

그러나 본 제품을 금융사, 공공기관, 대기업 전산실 등에 **실제 유료 상용 소프트웨어(Commercial Enterprise Appliance)**로 판매·공급하기 위해서는, 마스터 아키텍처 문서군에 정의된 잔여 상용화 과제 14종(GAP-01 ~ GAP-14)을 체계적으로 해결해야 합니다.

본 로드맵은 **도출된 14개 GAP을 기술적 난이도, 비즈니스 가치, 의존성 관계에 따라 3개 마일스톤(Phase 7 ~ 9)으로 체계화하여, 프로덕션 상용 제품으로 완성하기 위한 구체적인 개발 실행 계획**을 정의합니다.

---

## 2. 현행화된 14대 아키텍처 GAP 매트릭스

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     Ordinatio 아키텍처 GAP 분류 및 마일스톤 매핑                                      │
├───────────────────────────────────────┬───────────────────────────────────────┬────────────────────────────────────────┤
│     Phase 7: 상용 판매 기반 & 온보딩    │     Phase 8: 세일즈 킬러 & 인지 보안    │     Phase 9: 엔터프라이즈 인프라 융합    │
│              [P0 / Sprint 1]          │              [P0 / Sprint 2]          │              [P1 / Sprint 3]           │
├───────────────────────────────────────┼───────────────────────────────────────┼────────────────────────────────────────┤
│ • [GAP-01] 오프라인 DRM 라이선스 엔진 │ • [GAP-07] 에어갭 로컬 시맨틱 캐싱   │ • [GAP-05] 사내 LDAP/AD & TOTP MFA     │
│ • [GAP-02] 브라우저 최초 셋업 마법사 │ • [GAP-08] L7 프롬프트 탈옥 쉴드      │ • [GAP-06] 1-클릭 암호화 DB 백업 & DR  │
│ • [GAP-03] 엔터프라이즈 Helm Chart    │ • [GAP-13] 가상키 사내 CIDR IP 차단   │ • [GAP-09] 화이트라벨링(OEM) 커스텀    │
│ • [GAP-12] WORM DB 레벨 거부 트리거   │ • [GAP-04] 예산 웹훅 & SIEM Syslog    │ • [GAP-10] 부서별 월간 PDF/Excel 정산서│
│                                       │                                       │ • [GAP-11] 다국어 클라이언트 전용 SDK  │
│                                       │                                       │ • [GAP-14] 비동기 대량 배치 추론 큐    │
└───────────────────────────────────────┴───────────────────────────────────────┴────────────────────────────────────────┘
```

---

## 3. 단계별 상세 개발 로드맵 (Phased Implementation Plan)

### 3.1 Phase 7 (Sprint 1) [P0]: 상용 B2B 판매 기반 구축 및 무인 온보딩 (Commercial DRM & Onboarding)
- **목표**: 유료 고객사 납품을 위한 오프라인 라이선스 DRM 검증, 브라우저 대화형 최초 셋업 마법사, K8s 엔터프라이즈 Helm 패키징 완료.
- **기간**: Sprint 1 (2주)

#### 세부 엔지니어링 작업 명세
1. **[GAP-01] 오프라인 DRM 라이선스 엔진 (`backend/app/core/license_engine.py`)**:
   - `ordinatio-license.lic` 파일 규격 정의 (페이로드 JSON + RSA-4096 / Ed25519 서명).
   - CPU Processor ID + MAC Address + UUID 조합의 단방향 하드웨어 핑거프린트 바인딩 (`hardware_fingerprint.py`).
   - L7 게이트웨이 `ext_proc` 및 백엔드 미들웨어에 허용 RPS(`max_rps`) 및 테넌트 수 초과 차단 인터셉터 탑재.
   - 만료 후 14일 Grace Period 통제 및 대시보드 상단 갱신 경고 배너 렌더링.
2. **[GAP-02] 브라우저 기반 최초 셋업 마법사 (`frontend/src/components/SetupWizard.jsx`)**:
   - 시스템 최초 기동 시 라이선스 및 슈퍼관리자가 없으면 `/setup`으로 자동 라우팅.
   - 3단계 위저드: Step 1 (라이선스 업로드 & 유효성 검증) ➔ Step 2 (슈퍼관리자 생성) ➔ Step 3 (5대 인프라 Preflight 진단) ➔ 관제 홈 진입.
3. **[GAP-03] 엔터프라이즈 Helm Chart 및 오프라인 번들러 (`deploy/helm/ordinatio/`)**:
   - `values.yaml` 매개변수화 (외장 PostgreSQL/Oracle 연동, HPA 오토스케일링, Non-Root Security Context).
   - `scripts/package-airgap-release.sh` 및 `load-images.sh` 원클릭 오프라인 이미지 번들링 스크립트 작성.
4. **[GAP-12] WORM 감사 로그 PostgreSQL DB 레벨 UPDATE/DELETE 거부 트리거 (`deploy/postgres/init.sql`)**:
   - `audit_logs` 테이블에 `BEFORE UPDATE OR DELETE` 발생 시 `RAISE EXCEPTION`을 발생시키는 PostgreSQL Function/Trigger 등록.
   - DB 슈퍼유저의 강제 조작 시도 원천 차단.

- **완료 정의 (DoD)**:
  - 위조/변조 라이선스 파일 인입 시 기동 차단 및 정품 라이선스 하드웨어 일치 검증 단위 테스트 5종 통과.
  - 브라우저 최초 접속 시 `/setup` 마법사 3단계 완료 및 관제 홈 자동 전환 E2E 검증.
  - `helm lint` 및 `helm template` 무오류 통과.
  - `make verify-phase7` 자동화 검증 스크립트 100% PASS.

---

### 3.2 Phase 8 (Sprint 2) [P0]: 세일즈 킬러 피처 및 인지 보안 강화 (ROI & Security Guardrails)
- **목표**: 고객사 B2B 세일즈 시 가시적 토큰 비용 절감(40~60%)을 입증하는 시맨틱 캐싱과 L7 프롬프트 탈옥 방어 쉴드, 사내 관제망(SIEM) 연동 구축.
- **기간**: Sprint 2 (2주)

#### 세부 엔지니어링 작업 명세
1. **[GAP-07] 에어갭 로컬 시맨틱 캐싱(Semantic Cache) 엔진 (`backend/app/core/semantic_cache.py`)**:
   - 에어갭 온디바이스 로컬 임베딩 모델(bge-small-en-v1.5 / all-MiniLM-L6-v2, CPU 추론 <5ms) 탑재.
   - Redis Vector Store(VSS) 또는 인메모리 HNSW 인덱스를 통한 코사인 유사도 검색.
   - 유사도 임계치(기본값: `0.92`) 초과 시 LLM 서빙 호출을 바이패스하고 **10ms 이내 캐시 즉시 반환**.
   - FinOps 관제 탭에 절감된 누적 토큰 수 및 절감 비용(₩) 실시간 시각화.
2. **[GAP-08] L7 실시간 프롬프트 탈옥(Jailbreak) 및 인젝션 방어 쉴드 (`backend/app/core/jailbreak_shield.py`)**:
   - Envoy `ext_proc` gRPC 단계에서 인입 프롬프트를 실시간 분석.
   - "Ignore previous instructions", "DAN 모드 활성화", "시스템 프롬프트를 출력하라" 등 시스템 지침 탈취 시도 실시간 탐지.
   - Base64 인코딩, 유니코드 변조, Leetspeak 자동 정규화 후 매칭 ➔ 탐지 시 `HTTP 403` 차단 및 WORM 감사 적재.
3. **[GAP-13] 가상 API Key 사내 CIDR IP 실시간 차단 인터셉터**:
   - L7 Envoy ext_proc 인그레스의 `x-forwarded-for` 및 클라이언트 소켓 IP를 가상키의 `allowed_ips`(CIDR)와 실시간 매칭.
   - 비인가 IP 인입 시 즉각 `HTTP 403` 거부.
4. **[GAP-04] 예산 임계치 웹훅 & SIEM Syslog 디스패처 (`backend/app/core/alert_dispatcher.py`)**:
   - 테넌트 예산 80%/100% 소진, 5회 비밀번호 오류 잠금, PII 차단 발생 시 비동기 웹훅 발송 (Microsoft Teams, Slack, 사내 SMTP).
   - RFC 5424 표준 포맷으로 사내 통합 보안 관제(Splunk, QRadar)에 UDP/TCP Syslog 실시간 스트리밍.

- **완료 정의 (DoD)**:
  - 동일/유사 질문 인입 시 LLM 서빙 생략 및 15ms 이내 응답 반환, 절감 비용 누적 검증.
  - 탈옥 시도 프롬프트 10종에 대한 `HTTP 403` 차단율 100% 검증.
  - Mock Webhook 서버에 3초 이내 Alert JSON 정상 수신 확인.
  - `make verify-phase8` 자동화 검증 스크립트 100% PASS.

---

### 3.3 Phase 9 (Sprint 3) [P1]: 엔터프라이즈 인프라 융합, 고가용성(DR) & OEM (Enterprise Convergence & OEM)
- **목표**: 사내 인사 계정(Active Directory/LDAP, SAML/OIDC) 융합, 1-클릭 암호화 백업/DR, 화이트라벨링 및 월간 정산서 리포팅 완성.
- **기간**: Sprint 3 (2주)

#### 세부 엔지니어링 작업 명세
1. **[GAP-05] 사내 LDAP/Active Directory & SAML 2.0/OIDC SSO & TOTP MFA**:
   - LDAPS 기반 Bind & Search 파이프라인 (`backend/app/core/ldap_auth.py`).
   - 사내 그룹 ➔ ordinatio 역할/테넌트 자동 매핑 (`CN=AI_Admins` ➔ `SUPER_ADMIN`).
   - SAML 2.0 / OIDC SP 메타데이터 자동 생성 (`/api/v1/auth/sso/metadata.xml`).
   - 관리자 계정 필수 RFC 6238 표준 TOTP 2단계 인증 및 QR 코드 출력 (`mfa_totp.py`).
2. **[GAP-06] 1-클릭 암호화 DB 백업 및 재해 복구(DR) 파이프라인 (`backend/app/core/backup_engine.py`)**:
   - `pg_dump` + AES-256-GCM 암호화 백업 아카이브(`.enc`) 일일 자동 스케줄링.
   - 관리자 웹 화면 및 CLI(`ordinatio-ctl restore`) 기반 1-클릭 시점 복원(PITR, RTO 15분 / RPO 1시간 충족).
3. **[GAP-09] 화이트라벨링(OEM) 관리자 포털 (`frontend/src/components/BrandingSettingsModal.jsx`)**:
   - 고객사 로고(SVG/PNG) 업로드 및 브라우저 파비콘(Favicon) 동적 교체.
   - 포털 시스템 명칭(예: "KB금융그룹 GenAI 오케스트레이션 포털") 및 프라이머리 테마 액센트 컬러 동적 변경.
4. **[GAP-10] 부서별 월간 과금 정산서 자동 PDF/Excel 발행 엔진**:
   - 매월 1일 자정 테넌트별 사용량/비용 집계 후 금융 표준 포맷의 PDF 청구서 및 Excel(.xlsx) 리포트 자동 생성.
5. **[GAP-11] 다국어 클라이언트 전용 SDK 배포**:
   - `ordinatio-sdk-python` (에어갭 wheel 파일 배포).
   - `ordinatio-sdk-java` (Spring Boot 3.x Starter).
   - `ordinatio-sdk-ts` (TypeScript 클라이언트).
6. **[GAP-14] 비동기 대량 배치(Batch) 추론 큐 (`backend/app/core/batch_queue.py`)**:
   - 대량 문서/데이터셋 비동기 작업 큐 및 상태 폴링 엔드포인트 (`/v1/batches`).

- **완료 정의 (DoD)**:
  - Mock LDAP 서버 기반 로그인 및 그룹 매핑 역할 획득 검증.
  - 암호화 백업 생성 및 복원 후 DB 정합성 100% 일치 확인.
  - 고객사 로고 및 테마 컬러 동적 반영 UI 검증.
  - `make verify-phase9` 자동화 검증 스크립트 100% PASS.

---

## 4. 품질 보증 및 테스팅 매트릭스 확장 계획

각 Phase가 완료될 때마다 기존 86개 테스트에 대한 회귀 방지와 신규 기능에 대한 단위/통합 테스트를 추가합니다:

| Phase | 신규 추가 테스트 대상 | 목표 테스트 수 | 회귀 검증 목표 |
| :---: | :--- | :---: | :---: |
| **현재 (Phase 0~6)** | 핵심 런타임, L7 Gateway, RBAC, Standalone, strings.js | **86개 PASS** | 100% PASS 유지 |
| **Phase 7 (Sprint 1)** | 라이선스 서명/만료/위변조 차단, 셋업 마법사, DB WORM 트리거 | **+12개 (총 98개)** | 86개 기존 무회귀 |
| **Phase 8 (Sprint 2)** | 시맨틱 캐시 유사도 매칭/절감액 산정, 탈옥 인젝션 차단, 웹훅 디스패치 | **+14개 (총 112개)** | 98개 기존 무회귀 |
| **Phase 9 (Sprint 3)** | LDAP/TOTP MFA 인증, 암호화 백업/복원 RTO, PDF/Excel 리포트 생성 | **+12개 (총 124개)** | 112개 기존 무회귀 |

---

## 5. 결론 및 향후 실행 가이드

1. **상용화 준비도**: 현재 Phase 0~6까지의 완성으로 고객사 단일 호스트 폐쇄망 서버에 즉시 설치 가능한 기술적 토대가 구축되었습니다.
2. **차기 실행 제언**: 유료 고객사 라이선스 체결을 위한 **Phase 7 (Sprint 1: 오프라인 DRM 라이선스 엔진 + 셋업 마법사 + Helm Chart)**을 즉시 착수할 것을 권장합니다.

