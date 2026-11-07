# AI Orchestrator 차세대 개발 마일스톤 및 기능 로드맵 설계서 (Develop_milestone.md)

**문서 번호**: AIORCHE-DEV-MILESTONE-20260925  
**문서 버전**: v2.3 (Phase 0 ~ Phase 5 상용 배포 및 78개 테스트 100% 통과, 시스템 프롬프트 거버넌스 반영)  
**문서 상태**: APPROVED / ACTIVE  
**대상 시스템**: AI Orchestrator (`aiorche`) 온프레미스 에어갭 어플라이언스  
**작성 일자**: 2026-09-25  

> 본 문서는 마스터 엔지니어링 계획서([`PRE_01_dashboard_engineering_plan.md`](./PRE_01_dashboard_engineering_plan.md)), 종합 결과 보고서([`PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md`](./PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md)), 갭 분석서([`PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md`](./PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md)), 시스템 프롬프트 거버넌스 결과서([`PRE_20_phase_system_prompt_implementation_and_test_results.md`](./PRE_20_phase_system_prompt_implementation_and_test_results.md)) 및 루트 문서([`Develop_milestone.md`](../Develop_milestone.md))와 완전히 상호 동기화되어 유지 관리됩니다.

---

## 1. 개요 및 배경 (Executive Summary)

본 문서는 현재까지 구현 및 상용 배포 검증이 완료된 **Phase 0부터 Phase 5, 그리고 신규 완성된 동적 시스템 프롬프트 거버넌스(78/78 백엔드 테스트 통과, K8s 5대 Pod 배포, React 18 웹 콘솔 연동 완료)** 위에, 금융·공공·엔터프라이즈 폐쇄망 인프라의 실제 프로덕션 운영 요건을 완벽히 충족하기 위해 도출된 **구현 완료/미구현 분류 체계 및 차세대 개발 마일스톤(Development Milestones 6~8)의 상세 실행 계획서**입니다.

### 1.1 순차적 구현 시 3대 불변 원칙 (3 Golden Invariants)
아키텍처 문서군(`architecture/`)을 기반으로 현재 프로젝트와 100% 동일하게 개발하기 위해서는 다음 원칙을 반드시 준수해야 합니다:
1. **ADR 우선 원칙**: `PRE_01`의 초기 구상(Kafka, Go xDS)보다 `PRE_12`/`PRE_13`의 **13대 아키텍처 결정(ADR-01 ~ ADR-13)** 최적화 설계(FastAPI REST RDS v3, 단일 DB 계량 API, 자체 정규식 PII)를 최우선 기준으로 채택.
2. **사전 통합 모델링**: Phase 2(모델 카탈로그 & 라우팅) 구축 시 `PRE_16`(타임아웃 45s), `PRE_17`(6종 Provider), `PRE_18`(헬스 타임아웃 1.0~30s)을 사전 통합하여 DB 스키마 번복 방지.
3. **독립 거버넌스 포함**: Phase 5 완료 후 `PRE_19`/`PRE_20`에 따라 시스템 프롬프트 1:1 바인딩 카탈로그 및 L7 Envoy ext_proc 인라인 주입 엔진을 순서대로 완성.

---

## 2. 아키텍처 기반 기능 구현 상태 전수 분류 (Feature Implementation Classification)

마스터 아키텍처 및 소스코드 전수 검증 결과, 현재 상태를 **[구현 완료 (Implemented)]**와 **[미구현 (Unimplemented)]**으로 명확히 분류합니다.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             AI Orchestrator 기능 구현 상태 현황표                                  │
├─────────────────────────────────────────────────┬────────────────────────────────────────────────┤
│             ✅ 구현 완료 (Implemented: 100%)    │            🚧 미구현 (Unimplemented: 백로그)   │
├─────────────────────────────────────────────────┼────────────────────────────────────────────────┤
│ • L7 C++ Envoy Gateway Ingress & ext_proc 필터  │ • [미구현 1] 오프라인 Helm Chart & 단일 번들러 │
│ • AgentRouter 인텐트 인지 4대 자율 라우팅       │ • [미구현 2] 예산 80%/100% 실시간 웹훅 알림   │
│ • 멀티 서빙 엔진(vLLM/Ollama/SGLang) 카탈로그   │ • [미구현 3] 가상키 사내 CIDR IP 실시간 차단  │
│ • 6종 LLM Provider 규격화 & Dynamic URL Builder│ • [미구현 4] WORM 감사 DB 레벨 불변 트리거     │
│ • 모델 헬스체크 타임아웃 수동 조절 (1.0s~30.0s) │ • [미구현 5] 에어갭 로컬 시맨틱 캐싱 (Redis VSS)│
│ • 가상 API Key(Argon2id) & 테넌트 거버넌스      │ • [미구현 6] 프롬프트 인젝션 & 탈옥 방어 쉴드 │
│ • FinOps 토큰 과금, 1초 WebSocket, Hard Cap 429│ • [미구현 7] DB 정기 암호화 백업 & 원클릭 DR  │
│ • WORM 감사로그 테이블(INSERT-only) & JSON 포렌식│ • [미구현 8] 관리자 포털 Keycloak SSO & RBAC  │
│ • 자체 정규식 PII 인라인 마스킹 (MASK/HASH/BLOCK│ • [미구현 9] 모델 실시간 벤치마크 스튜디오    │
│ • RSA-4096 벤더 서명 검증, 무중단 핫픽스 & 롤백│ • [미구현 10] SSE 스트리밍 실시간 PII 인터셉터│
│ • 시스템 프롬프트 1:1 바인딩(ROUTE/KEY/TENANT) │ • [미구현 11] 부서 예산 인앱 증액 결재 플로우 │
│ • 백엔드 78개 단위/통합 테스트 (100% PASS)     │ • [미구현 12] 비동기 대량 배치 추론 큐         │
└─────────────────────────────────────────────────┴────────────────────────────────────────────────┘
```

### 2.1 구현 완료 상세 내역 (Implemented Features - As-Is)

1. ✅ **L7 게이트웨이 & AgentRouter (Phase 0 / Phase 0.1)**:
   - Envoy L7 C++ Ingress(Zero-Copy SSE) + ext_proc 보안 필터.
   - OpenAI 호환 엔드포인트(`/v1/routes`, `/v1/chat/completions`).
   - 프롬프트 인텐트/복잡도 실시간 분석(코딩·수학 vs 일상대화).
   - 4대 자율 라우팅 정책(QualityFirst, LeastCost, LatencyOptimized, SelfHealingFallback) 실시간 웹 UI 튜닝.
   - 세션/KV-Cache 어피니티, 슬라이딩 윈도우 TPM/RPM 레이트 리미터.
2. ✅ **모델 카탈로그 & 동적 xDS 배포 (Phase 2)**:
   - DB 기반 다중 서빙 엔진(vLLM, Ollama, SGLang, Triton, NIM) 카탈로그 등록/수정/삭제.
   - 실시간 헬스체크 프로빙(/health ping) 및 헬스체크 타임아웃(1.0s~30.0s) 수동 조절(DB 및 localStorage 영속화).
   - 활성 라우트 종속성 사전 차단 가드레일, Envoy REST RDS v3(`discovery:routes`) 무중단 동적 컴파일 푸시.
3. ✅ **LLM 서빙 모델 Provider 규격화 & Dynamic URL Builder (PRE-17/18)**:
   - 6종 Provider(OpenAI 호환, DeepSeek 공식, Anthropic Claude, Google Gemini, Cohere, 직접 지정) 선택 지원.
   - 베이스 도메인 입력 기반 실시간 엔드포인트 URL 동적 조합기(Dynamic URL Builder).
   - 타깃 엔드포인트 직접 호출 보장 및 원인 명시적 타임아웃 예외 메시지 반환.
4. ✅ **동적 시스템 프롬프트 거버넌스 & L7 인라인 주입 (PRE-19/20 - 신규 완성)**:
   - 독립 프롬프트 카탈로그 및 **1:1 유연 바인딩 [라우팅 정책 (ROUTE) / 가상 API Key (VIRTUAL_KEY) / 테넌트 (TENANT) / 전사 (GLOBAL)]**.
   - 위계적 우선순위(`VIRTUAL_KEY` > `ROUTE` > `TENANT` > `GLOBAL`) 및 3대 주입 모드(`PREPEND`, `OVERRIDE`, `FALLBACK_ONLY`).
   - L7 Envoy ext_proc 스트림 페이로드 변조 및 라우팅 테스트벤치 실시간 프롬프트 주입 연동.
   - 프론트엔드 전용 거버넌스 대시보드(`SystemPromptsTab.jsx`), 1:1 바인딩 마법사 모달, 실시간 글자수/토큰 카운터.
5. ✅ **가상 API Key & 테넌트 거버넌스 (Phase 1)**:
   - `sk-orch-` 접두사, Argon2id 솔트 단방향 해싱, 발급 시 단 1회 평문 노출 모달.
   - 키 수정/파기/영구 삭제 수명주기, 허용 모델 화이트리스트(`allowed_models`), 부서별 테넌트 격리.
6. ✅ **FinOps & 비용 관제 (Phase 3)**:
   - 원화(₩) 기준 테넌트 월간 예산 계량(Metering), 80% 조기 경보, 100% 하드 캡(Hard Cap) 도달 시 HTTP 429 즉시 차단.
   - 1초 주기 WebSocket 스트림 관제, WORM `audit_logs` + Envoy 실측 트래픽 기반 모델 점유율 산출, UTF-8 with BOM CSV 청구서 다운로드.
7. ✅ **컴플라이언스 & WORM 불변 감사 (Phase 4)**:
   - 자체 정규식 PII 인라인 탐지(주민등록번호/계좌/카드/전화/이메일, <1ms), 3단계 보안 액션(MASK/HASH/BLOCK).
   - WORM(Write-Once-Read-Many) 불변 감사 로그 테이블(INSERT-only) 적재, 감사 증적 JSON 내보내기.
8. ✅ **어플라이언스 라이프사이클 & 패치 관리 (Phase 5)**:
   - 오프라인 벤더 패치 번들(.tar.gz) SHA-256 무결성 및 RSA-4096 전자서명 검증.
   - 4단계 무중단 롤링 핫픽스 배포 & DB 이력 영속화, 원클릭 롤백, 5대 인프라 Preflight 실시간 자가진단, Zero-PII 서포트 번들 ZIP 생성기.
9. ✅ **테스트 및 인프라 검증 현황**:
   - 백엔드 전체 단위/통합 테스트 **78 / 78 건 (100% PASS)**.
   - 단계별 자동화 검증 스크립트(`scripts/verify-phase*.sh`, `scripts/verify-phase-system-prompt.sh`) 100% 통과.

---

## 3. 미구현 기능 상세 분석 및 차세대 마일스톤 계획 (Unimplemented Features & Next Milestones)

현재 미구현된 12개 세부 기능 과제를 엔지니어링 중요도, 의존성 관계, 비즈니스 영향도에 따라 **3개 마일스톤(Milestone 6 ~ 8)**으로 체계화하여 구체적인 구현 계획을 수립합니다.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     차세대 마일스톤 단계별 로드맵 (Roadmap)                                      │
├────────────────────────────────────────┬────────────────────────────────────────┬────────────────────────────────┤
│  Milestone 6: 릴리즈 패키징 & 가드레일  │   Milestone 7: 인지 보안 & 시맨틱 캐싱   │ Milestone 8: 엔터프라이즈 SSO   │
│               [P0 / Sprint 1]          │              [P0 / Sprint 2]           │          [P1 / Sprint 3]       │
├────────────────────────────────────────┼────────────────────────────────────────┼────────────────────────────────┤
│ 6.1 오프라인 Helm Chart & 번들러       │ 7.1 에어갭 로컬 시맨틱 캐싱 (Redis)    │ 8.1 Keycloak SSO & 4대 RBAC    │
│ 6.2 예산 80%/100% 웹훅 디스패처        │ 7.2 프롬프트 인젝션/탈옥 방어 쉴드     │ 8.2 모델 실시간 벤치마크 UI    │
│ 6.3 가상키 CIDR IP L7 차단 인포스먼트  │ 7.3 DB 정기 암호화 백업 & 원클릭 DR    │ 8.3 SSE 스트리밍 실시간 PII    │
│ 6.4 PostgreSQL WORM DB 레벨 불변트리거 │                                        │ 8.4 부서 예산 증액 승인 워크플로│
│ 6.5 Playwright E2E 자동화 스위트       │                                        │ 8.5 비동기 대량 배치 추론 큐   │
└────────────────────────────────────────┴────────────────────────────────────────┴────────────────────────────────┘
```

---

### 🔹 Milestone 6: 프로덕션 릴리즈 패키징 및 운영 가드레일 (P0 - 즉시 착수)

**목표**: 에어갭 폐쇄망 고객사 인프라에 30분 내 원클릭 설치를 보장하고, 예산 초과 알림 및 DB 레벨의 완전한 무결성을 확립.

#### 6.1 오프라인 Helm Chart & 에어갭 단일 설치 번들러 [미구현 1]
- **현 상태**: Docker Compose 로컬 스택 및 K8s 원시 매니페스트(`deploy/k8s/`)만 존재하며, 단일 Helm 릴리즈 패키지 부재.
- **구현 계획**:
  1. `deploy/helm/aiorche/`: Envoy, Backend, Frontend, Postgres, Redis를 하나의 Release로 묶는 표준 Helm v3 차트 개발 (`Chart.yaml`, `values.yaml`, `templates/`).
  2. `scripts/save-images.sh`: 베이스 이미지 및 앱 컨테이너 이미지를 단일 압축 아카이브(`aiorche-images-v1.0.tar.gz`)로 패키징.
  3. `scripts/load-images.sh`: 고객사 내부 폐쇄망 Docker Registry / Harbor 레지스트리로 일괄 Push.
  4. `scripts/preflight-check.sh`: CPU, GPU, 포트 충돌(8000, 5173, 8080, 5432, 6379), 볼륨 권한 검사 자동화.
- **DoD**: 단일 `helm install aiorche ./deploy/helm/aiorche` 명령으로 5개 Pod 정상 기동 및 트래픽 서빙 확인.

#### 6.2 예산 임계치 도달 실시간 웹훅(Webhook) 디스패처 [미구현 2]
- **현 상태**: 80% 경고 및 100% 하드캡 429 차단은 동작하나, 외부 사내 협업툴 알림 연동 미구현.
- **구현 계획**:
  1. 백엔드 모듈 `app/core/webhook_dispatcher.py` 구현.
  2. 지원 대상: 사내 Slack, Microsoft Teams, 사내 잔디(Jandi), 범용 HTTP Webhook.
  3. 발송 트리거: 부서(테넌트) 월간 예산 80% 도달 시 (WARNING), 100% 하드캡 차단 시 (CRITICAL).
  4. 재시도 메커니즘: 백오프(Exponential Backoff) 기반 최대 3회 재시도 및 실패 시 WORM 로그 기록.
- **DoD**: 단위 테스트에서 Mock 수신 서버로 JSON 알림 발송 검증 및 재시도 성공 확인.

#### 6.3 가상 API Key 사내 허용 IP(CIDR) 실시간 L7 강제 인포스먼트 [미구현 3]
- **현 상태**: DB `virtual_keys` 테이블에 `allowed_ip_cidrs` 컬럼만 존재하며, 실제 게이트웨이 레벨 대조 차단 로직 부재.
- **구현 계획**:
  1. L7 Envoy ext_proc 및 FastAPI `validate_virtual_key_endpoint`에서 클라이언트 Remote IP / `X-Forwarded-For` 추출.
  2. Python `ipaddress.ip_network` 기반 CIDR 대역 매칭 엔진 연동.
  3. 허용 대역 외 접근 시 즉시 `HTTP 403 Forbidden` (`IP_NOT_ALLOWED`) 반환 및 WORM 감사로그 적재.
- **DoD**: 등록된 CIDR 외 IP에서 가상키 호출 시 즉시 403 차단 및 포렌식 감사로그 적재 검증.

#### 6.4 PostgreSQL WORM 감사 테이블 DB 레벨 불변 트리거 [미구현 4]
- **현 상태**: 애플리케이션 레벨의 INSERT-only로 유지 중이나, DBA 계정 직접 조작에 대한 DB 레벨 방어 미적용.
- **구현 계획**:
  1. `deploy/postgres/init.sql` 및 패치 스크립트에 PostgreSQL `BEFORE UPDATE OR DELETE ON audit_logs` 차단 트리거 함수 구현:
     ```sql
     CREATE OR REPLACE FUNCTION enforce_worm_audit_logs()
     RETURNS TRIGGER AS $$
     BEGIN
         RAISE EXCEPTION 'WORM_VIOLATION: audit_logs 테이블은 법적 불변 감사 테이블이므로 UPDATE 또는 DELETE가 영구 금지됩니다.';
     END;
     $$ LANGUAGE plpgsql;

     CREATE TRIGGER trg_audit_logs_worm_protect
     BEFORE UPDATE OR DELETE ON audit_logs
     FOR EACH ROW EXECUTE FUNCTION enforce_worm_audit_logs();
     ```
  2. 금융감독원 전자금융감독규정 제13조(로그 무결성 보증) 100% 충족.
- **DoD**: psql에서 `UPDATE audit_logs SET ...` 또는 `DELETE FROM audit_logs` 실행 시 DB 에러 발생 및 차단 확인.

#### 6.5 Playwright 관리자 포털 E2E 자동화 테스트 스위트 [미구현 5]
- **현 상태**: 단위/통합 테스트(pytest 78개)와 브라우저 서브에이전트 수동 증적만 존재, 자동화 E2E 스위트 부재.
- **구현 계획**:
  1. `aiorche/tests-e2e/`: Playwright 기반 프론트엔드 E2E 테스트 스위트 구성.
  2. 7대 전 화면 탐색, 키 발급/삭제, 라우트 정책 생성, 프롬프트 바인딩, 긴급 패치 업로드 자동화 시나리오 작성.
- **DoD**: `npm run test:e2e` 단일 명령으로 전 시나리오 Headless 통과.

---

### 🔹 Milestone 7: 인지 보안 & 지능형 캐싱 (P0/P1 - 고도화)

**목표**: LLM 호출 비용 60% 절감(시맨틱 캐싱), 악의적 시스템 프롬프트 탈취 원천 차단, 재해 복구(DR) 자동화.

#### 7.1 에어갭 로컬 시맨틱 캐싱 엔진 (Air-Gapped Semantic Caching) [미구현 6]
- **현 상태**: 완전 미구현. 매 요청마다 LLM 서빙 엔진으로 직접 전달.
- **구현 계획**:
  1. 임베딩 런타임: 인터넷 없이 로컬에서 구동되는 경량 임베딩 모델(`BAAI/bge-m3` 또는 `all-MiniLM-L6-v2`)을 백엔드 내부 ONNX Runtime 또는 로컬 컨테이너로 서빙.
  2. Redis Vector Similarity Search (VSS) 기반 코사인 유사도 인덱스 구축.
  3. 동작 흐름:
     - 인입 프롬프트 벡터 생성 ➔ Redis 유사도 검색 (유사도 $\ge 0.95$).
     - 캐시 히트(HIT) 시: 저장된 완성 답변 즉시 반환 (`X-Orche-Cache: HIT`), 추론 비용 ₩0 처리.
     - 캐시 미스(MISS) 시: Envoy/AgentRouter로 정상 라우팅 후 결과 캐싱 (`X-Orche-Cache: MISS`).
  4. 웹 콘솔 연동: 라우팅 스튜디오에서 시맨틱 캐시 활성화 토글 및 유사도 임계치(0.90 ~ 0.99) 슬라이더 제공.
- **DoD**: 동일 의미 질의 시 5ms 이내 응답 반환 및 GPU 호출 수 0건 검증.

#### 7.2 프롬프트 인젝션 & 탈옥(Jailbreak) 방어 가드레일 [미구현 7]
- **현 상태**: PII(개인정보) 마스킹만 존재하며, 악의적인 시스템 프롬프트 탈취/우회 공격 방어 미구현.
- **구현 계획**:
  1. 인라인 방어 모듈 `app/core/guardrails/prompt_shield.py` 신설.
  2. 3단계 탐지 체계:
     - 1단계 (패턴 매칭): "Ignore previous instructions", "DAN Mode", "시스템 프롬프트를 출력해줘" 등 즉시 차단.
     - 2단계 (유사도 탐지): 알려진 탈옥(Jailbreak) 프롬프트 데이터셋과의 벡터 유사도 검사.
     - 3단계 (구조 엔트로피): 제로위드(Zero-width) 숨김 문자, Base64 난독화 패턴 탐지.
  3. 차단 시 동작: `HTTP 400 Bad Request` (`PROMPT_INJECTION_DETECTED`) 반환 및 WORM 감사로그에 `BLOCK_INJECTION` 플래그 적재.
- **DoD**: 탈옥 시도 10종 테스트셋 인입 시 100% 사전 차단 검증.

#### 7.3 데이터베이스 정기 백업 및 원클릭 재해 복구(DR) 스케줄러 [미구현 8]
- **현 상태**: 완전 미구현.
- **구현 계획**:
  1. 백엔드 모듈 `app/core/backup_manager.py` 및 CLI `scripts/backup-restore.sh` 구현.
  2. 스케줄링: 매일 자정 또는 6시간 주기로 PostgreSQL 전체 덤프 후 AES-256 암호화 압축 아카이브 보관.
  3. 원클릭 복구 CLI: `make restore-db BACKUP_FILE=aiorche_backup_YYYYMMDD.dump.enc`.
- **DoD**: 백업 파일 생성 ➔ DB 인위적 삭제 ➔ 원클릭 복원 후 데이터 100% 일치 확인.

---

### 🔹 Milestone 8: 엔터프라이즈 SSO & 운영 편의성 (P1/P2 - 확장)

**목표**: 사내 엔터프라이즈 SSO 통합, 세밀한 역할 통제(RBAC), 모델 간 실시간 성능 벤치마킹 환경 구축.

#### 8.1 관리자 포털 사내 SSO 연동 및 4단계 RBAC [미구현 9]
- **현 상태**: `keycloak/realm-export.json` 템플릿만 존재, 실제 백엔드 인증 인터셉터 및 프론트엔드 권한 제어 비활성.
- **구현 계획**:
  1. Keycloak OIDC / LDAP JWT 검증 미들웨어 활성화 (`app/core/auth.py`).
  2. 4단계 RBAC 역할 모델:
     - `SuperAdmin`: 전 시스템 제어, 핫픽스 롤아웃, 모델 풀 관리.
     - `TenantAdmin`: 소속 부서 가상키 발급/수정, 부서 예산/청구서 조회.
     - `Auditor (준법감시)`: PII 규칙 설정, WORM 감사로그 조회 및 포렌식 JSON 내보내기만 허용.
     - `Viewer`: 대시보드 실시간 지표 열람 전용 (수정/삭제 권한 원천 차단).
  3. 프론트엔드 UI: 로그인 계정 역할에 따른 메뉴 자동 필터링 및 권한 없는 버튼 비활성화.
- **DoD**: 역할별 토큰 전달 시 인가되지 않은 엔드포인트 호출에 대해 `403 Forbidden` 반환 검증.

#### 8.2 모델 실시간 벤치마크 스튜디오 (Model Benchmark Studio) [미구현 10]
- **현 상태**: 완전 미구현.
- **구현 계획**:
  1. 라우팅 탭 내 **[모델 벤치마크 스튜디오]** 서브 패널 추가.
  2. 3대 표준 평가 시나리오:
     - 단문 질의 (Short Prompt, 50 토큰): TTFT(초저지연 응답시간) 측정.
     - 장문 추론 (Reasoning Heavy, 1,000 토큰): TPS(초당 토큰 생성 속도) 측정.
     - 동시 다발 부하 (Concurrent 10): 큐 대기열 및 GPU 처리량 측정.
  3. 모델별 레이더 차트 및 가성비(Cost-Performance) 비교 지표 시각화.
- **DoD**: 5대 서빙 모델에 대해 원클릭 벤치마크 수행 후 결과 비교 리포트 출력.

#### 8.3 SSE 스트리밍 실시간 토큰 가드레일 (Streaming Token Interceptor) [미구현 11]
- **현 상태**: 요청 인입 시점의 사전 PII 검사만 지원하며, 스트리밍 생성 중 실시간 가드레일 미구현.
- **구현 계획**:
  1. Envoy ext_proc 스트리밍 응답 필터 모드 연동.
  2. 슬라이딩 윈도우 버퍼(100자) 단위로 정규식 PII 패턴 실시간 검사.
  3. 위반 감지 시 즉시 스트림 중단(`event: error\ndata: [RESPONSE_TRUNCATED_BY_PII_GUARD]\n\n`).
- **DoD**: LLM이 답변 중 주민등록번호를 출력하는 순간 스트림 즉각 절단 검증.

#### 8.4 부서 예산 증액 결재 워크플로우 & 비동기 배치 추론 큐 [미구현 12]
- **현 상태**: 완전 미구현.
- **구현 계획**:
  1. **예산 증액 요청 플로우**: 100% 차단된 부서 관리자가 FinOps 화면에서 `[예산 증액 요청]` 제출 ➔ SuperAdmin 승인 시 즉각 한도 상향 및 429 차단 해제.
  2. **비동기 대량 배치 큐**: `POST /api/v1/batch/completions` 엔드포인트 ➔ Redis Queue 워커가 심야 시간대 순차 처리 ➔ 완료 웹훅 통보.
- **DoD**: 예산 증액 승인 E2E 및 100건 배치 비동기 완료 검증.

---

## 4. 차세대 마일스톤 종합 실행 매트릭스 (DoD & Priority)

| 마일스톤 | 우선순위 | 기능 명칭 | 분류 | 난이도 | 완료 정의 (DoD) |
| :---: | :---: | :--- | :---: | :---: | :--- |
| **M6** | **P0** | **오프라인 Helm 차트 & 패키징 번들러** | 미구현 | 중 | `helm install` 및 `save-images.sh`로 에어갭 100% 정상 기동 |
| **M6** | **P0** | **예산 80%/100% 실시간 웹훅 알림** | 미구현 | 하 | 임계치 도달 시 Slack/Teams 모의 엔드포인트로 JSON 전송 단위 테스트 PASS |
| **M6** | **P0** | **가상키 사내 CIDR IP L7 차단** | 미구현 | 하 | 허용 대역 외 IP 요청 시 403 차단 및 WORM 감사로그 적재 검증 |
| **M6** | **P0** | **PostgreSQL WORM DB 레벨 불변 트리거** | 미구현 | 하 | psql에서 `UPDATE audit_logs` 실행 시 DB 예외 발생 및 거부 검증 |
| **M6** | **P1** | **Playwright E2E 자동화 테스트 스위트** | 미구현 | 중 | 전 화면 및 주요 워크플로우 자동화 E2E 스위트 Headless 통과 |
| **M7** | **P0** | **에어갭 로컬 시맨틱 캐싱 (Redis VSS)** | 미구현 | 중 | 유사 질의(>95%) 시 LLM 미호출, 응답시간 <5ms, `X-Orche-Cache: HIT` 검증 |
| **M7** | **P0** | **프롬프트 인젝션 & 탈옥 방어 가드레일** | 미구현 | 중 | 시스템 프롬프트 탈취 패턴 10종 인입 시 100% 400 차단 검증 |
| **M7** | **P1** | **DB 정기 암호화 백업 & 원클릭 DR** | 미구현 | 하 | 백업 스크립트 실행 후 DB 삭제 ➔ 복원 후 데이터 100% 무결성 검증 |
| **M8** | **P1** | **관리자 포털 Keycloak SSO & 4대 RBAC** | 미구현 | 상 | 4대 역할(SuperAdmin/TenantAdmin/Auditor/Viewer) 권한 분리 테스트 통과 |
| **M8** | **P1** | **모델 실시간 벤치마크 스튜디오** | 미구현 | 중 | 웹 UI에서 모델별 벤치마크 실행 후 TTFT/TPS 레이더 차트 출력 |
| **M8** | **P1** | **SSE 스트리밍 실시간 PII 인터셉터** | 미구현 | 상 | 답변 출력 중 개인정보 출력 시 즉각 스트림 Truncate 검증 |
| **M8** | **P2** | **부서 예산 인앱 증액 결재 워크플로우** | 미구현 | 중 | 증액 요청 ➔ 관리자 승인 ➔ 예산 즉시 증액 및 429 차단 해제 E2E 검증 |
| **M8** | **P2** | **비동기 대량 배치 추론 큐** | 미구현 | 중 | 100건 배치 등록 ➔ Redis Queue 워커 순차 처리 후 상태 완료 확인 |

---

## 5. 단계별 스프린트 실행 계획 (Sprint Roadmap)

1. **Sprint 1 (Milestone 6 완료 - 프로덕션 패키징 & 운영 가드레일 확립)**:
   - Helm v3 차트 개발 및 `scripts/save-images.sh`, `scripts/load-images.sh` 패키징 파이프라인 수립.
   - 예산 도달 Webhook 디스패처 및 가상키 CIDR IP 차단 엔진 장착.
   - WORM 테이블 DB 레벨 불변 트리거 적용.
   - `scripts/verify-phase6.sh` 작성 및 DoD 전수 통과.
2. **Sprint 2 (Milestone 7 완료 - 지능형 캐싱 & 인지 보안 가드레일)**:
   - 로컬 경량 임베딩 런타임 및 Redis VSS 기반 시맨틱 캐시 엔진 장착.
   - 프롬프트 인젝션 & 탈옥 탐지기(`prompt_shield.py`) L7 ext_proc 필터 체인 탑재.
   - DB 정기 암호화 백업 및 DR 스케줄러 스크립트 완성.
3. **Sprint 3 (Milestone 8 완료 - 엔터프라이즈 SSO & 고도화 스튜디오)**:
   - Keycloak OIDC/LDAP 4단계 RBAC 미들웨어 및 UI 역할별 뷰 제어.
   - 모델 실시간 벤치마크 스튜디오 UI 및 성능 측정 API 완성.
   - 실시간 스트리밍 PII 가드레일 및 예산 증액 승인 플로우 완성.
