# AI Orchestrator 차세대 개발 마일스톤 및 기능 로드맵 설계서 (Develop_milestone.md)

**문서 번호**: AIORCHE-DEV-MILESTONE-20260914  
**문서 상태**: APPROVED / ACTIVE  
**대상 시스템**: AI Orchestrator (`aiorche`) 온프레미스 에어갭 어플라이언스  
**작성 일자**: 2026-09-14  

상세 설계 문서는 [`architecture/Develop_milestone.md`](file:///Users/jason/project/오케스트레이터/architecture/Develop_milestone.md)에도 동일하게 유지 관리됩니다.

---

## 1. 개요 및 배경 (Executive Summary)

본 문서는 현재까지 구현 완료된 Phase 0부터 Phase 5까지의 상용급 AI 오케스트레이터 기반 위에, 금융·공공·엔터프라이즈 폐쇄망 인프라의 실제 프로덕션 운영 요건을 완벽히 충족하기 위해 도출된 **차세대 기능 로드맵 및 단계별 개발 마일스톤(Development Milestones)**을 정의한 공식 소프트웨어 공학적 설계 명세서입니다.

### 1.1 현재 구현 상태 점검 요약 (As-Is Status)
- **L7 게이트웨이 & AgentRouter**: Envoy L7 C++ Ingress(Zero-Copy SSE) + ext_proc, 인텐트/복잡도 실시간 분석(코딩·수학 vs 일상대화), 4대 자율 라우팅 정책(QualityFirst, LeastCost, LatencyOptimized, SelfHealingFallback) 웹 UI 실시간 튜닝, 세션/KV-Cache 어피니티, 슬라이딩 윈도우 TPM/RPM 레이트 리미터 (완료 ✅)
- **모델 카탈로그**: DB 모델 카탈로그 관리, 다중 서빙 엔진(vLLM, Ollama, SGLang, Triton) 연동, 라우트 종속성 안전 삭제 가드, 시스템 전 메뉴 등록 모델 강제 바인딩 (완료 ✅)
- **가상 API Key & 테넌트 거버넌스**: Argon2id 솔트 단방향 해싱, 단 1회 평문 노출, 파기된 키 영구 삭제 가드레일, 모델 화이트리스트(`allowed_models`), 부서별 테넌트 격리 (완료 ✅)
- **FinOps & 비용 통제**: 원화(₩) 기준 테넌트 예산, 80% 조기 경보, 100% 하드 캡(Hard Cap) 429 차단, UTF-8 BOM CSV 청구서 다운로드 (완료 ✅)
- **컴플라이언스 & WORM 감사**: 초경량 자체 정규식 인라인 PII 마스킹(MASK/HASH/BLOCK, <2ms), WORM 불변 감사 로그 테이블(INSERT-only), 포렌식 JSON 내보내기 (완료 ✅)
- **어플라이언스 생애주기**: RSA-4096 서명 오프라인 핫픽스 번들, 4단계 무중단 롤링 패치/롤백 엔진, Zero-PII 서포트 번들 ZIP 다운로드, 5대 인프라 Preflight 자가진단 (완료 ✅)
- **통합 웹 콘솔**: 7대 실데이터 통합 관제 스튜디오 내장 (완료 ✅)

---

## 2. 차세대 개발 마일스톤 로드맵 (Milestones Overview)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        AI Orchestrator 차세대 개발 마일스톤                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────┼────────────────────────────────────────┐
  ▼                                        ▼                                        ▼
[Milestone 6: 프로덕션 릴리즈 패키징]     [Milestone 7: 인지 보안 & 시맨틱 캐싱]    [Milestone 8: 엔터프라이즈 SSO & 고도화]
 - 오프라인 Helm Chart 패키징             - 에어갭 로컬 시맨틱 캐싱                 - 사내 SSO (Keycloak/LDAP) 연동
 - 단일 이미지 아카이브 번들러             - 프롬프트 인젝션 & 탈옥 방어             - 모델 실시간 벤치마크 스튜디오
 - 예산 80%/100% 실시간 웹훅 알림         - 가상키 CIDR IP 실시간 차단             - 스트리밍 실시간 PII 가드레일
 - WORM 감사 테이블 DB 레벨 변조 방지     - DB 정기 백업 & 원클릭 DR 스케줄러       - 비동기 대량 배치 큐 & 예산 승인
```

---

## 3. 마일스톤별 상세 설계 및 구현 사양

### Milestone 6: 프로덕션 릴리즈 패키징 및 운영 알림 (P0 핵심 과제)

#### 6.1 오프라인 Helm Chart & 에어갭 단일 설치 번들 (Phase 6 본과제)
- **목표**: 인터넷이 완전히 단절된 고객사 K8s 클러스터 또는 단일 노드에 30분 이내에 100% 자동 설치 완료.
- **세부 사양**:
  1. `deploy/helm/aiorche/`: Envoy, Backend, Frontend, Postgres, Redis를 단일 릴리즈로 배포하는 표준 Helm v3 차트 작성.
  2. `scripts/save-images.sh`: 베이스 이미지 및 앱 컨테이너 이미지를 단일 압축 파일(`aiorche-images-v1.0.tar.gz`)로 아카이빙.
  3. `scripts/load-images.sh`: 고객사 내부 폐쇄망 Docker/Harbor 레지스트리로 일괄 Push.
  4. 단일 인프라 사전 검증 스크립트(`scripts/preflight-check.sh`): CPU, GPU, 포트 충돌, 볼륨 권한 검사 자동화.

#### 6.2 예산 임계치 도달 실시간 웹훅(Webhook) 디스패처
- **목표**: 특정 부서 테넌트의 월간 예산이 80%(소프트 경보) 또는 100%(하드 캡 차단) 도달 시 사내 운영진에 즉각 자동 통보.
- **세부 사양**:
  1. 백엔드 모듈 `app/core/webhook_dispatcher.py` 구현.
  2. Webhook 발송 대상: 사내 Slack, Microsoft Teams, 사내 잔디(Jandi), 범용 HTTP Webhook, 사내 SMTP 이메일.
  3. 메시지 페이로드: 부서명, 부서 코드, 월간 예산 한도(₩), 현재 누적 지출액(₩), 초과 시점, 차단 조치 결과.
  4. 재시도 메커니즘: 네트워크 지연 시 최대 3회 지수 백오프(Exponential Backoff) 재시도.

#### 6.3 가상 API Key 사내 허용 IP(CIDR) 실시간 강제 인포스먼트
- **목표**: DB에 저장된 `allowed_ip_cidrs`를 L7 게이트웨이 관문에서 실시간 대조하여 사내 인가 단말/서버 외 접근 차단.
- **세부 사양**:
  1. L7 Envoy ext_proc 및 FastAPI `validate_virtual_key_endpoint`에서 `X-Forwarded-For` 또는 클라이언트 Remote IP를 추출.
  2. Python `ipaddress.ip_network` 기반 CIDR 매칭 로직 탑재.
  3. 허용 대역 외 접근 시 `HTTP 403 Forbidden` (`IP_NOT_ALLOWED: 인가되지 않은 IP 대역에서의 접근입니다`) 즉시 차단 및 WORM 감사 로그 기록.

#### 6.4 PostgreSQL WORM 감사 테이블 DB 레벨 불변 트리거 (Immutability Hardening)
- **목표**: 애플리케이션 레벨의 INSERT-only를 넘어, DB 관리자(DBA) 권한으로도 `audit_logs` 레코드를 수정/삭제할 수 없도록 강제.
- **세부 사양**:
  1. `deploy/postgres/init.sql`에 PostgreSQL `BEFORE UPDATE OR DELETE ON audit_logs` 차단 트리거 함수 구현:
     ```sql
     CREATE OR REPLACE FUNCTION enforce_worm_audit_logs()
     RETURNS TRIGGER AS $$
     BEGIN
         RAISE EXCEPTION 'WORM_VIOLATION: audit_logs 테이블은 법적 불변 감사 테이블이므로 UPDATE 또는 DELETE가 영구 금지됩니다.';
     END;
     $$ LANGUAGE plpgsql;
     ```
  2. 금융감독원 전자금융감독규정 제13조(로그 무결성 보증) 100% 충족.

---

### Milestone 7: 인지 방어 & 에어갭 시맨틱 캐싱 (P0/P1 지능화 과제)

#### 7.1 에어갭 로컬 시맨틱 캐싱 엔진 (Air-Gapped Semantic Caching)
- **목표**: 유사한 의미의 반복 프롬프트에 대해 LLM 호출 없이 Redis Vector 캐시에서 5ms 이내 응답 반환 (GPU 부하 60% 절감).
- **세부 사양**:
  1. 임베딩 런타임: 인터넷 연결 없이 로컬에서 구동되는 경량 임베딩 모델(예: `BAAI/bge-m3` 또는 `all-MiniLM-L6-v2`)을 백엔드 내부 ONNX Runtime 또는 로컬 컨테이너로 서빙.
  2. Redis Vector Similarity Search (VSS) 또는 Cosine Distance 인덱스 구축.
  3. 동작 흐름:
     - 인입 프롬프트 임베딩 벡터 생성 -> Redis 유사도 검색 (코사인 유사도 $\ge 0.95$).
     - 캐시 히트(Hit) 시: 저장된 완성 답변 즉각 반환 (`X-Orche-Cache: HIT`), 비용 ₩0 처리.
     - 캐시 미스(Miss) 시: Envoy/AgentRouter로 정상 라우팅 후 결과 캐싱 (`X-Orche-Cache: MISS`).
  4. 웹 콘솔 연동: 라우팅 스튜디오에서 시맨틱 캐시 활성화 토글 및 임계치(0.90 ~ 0.99) 슬라이더 제공.

#### 7.2 프롬프트 인젝션 & 탈옥(Jailbreak) 방어 가드레일
- **목표**: 기업 내부 AI 에이전트를 겨냥한 시스템 프롬프트 탈취, 기밀 유출, 악의적 가이드라인 우회 공격 원천 차단.
- **세부 사양**:
  1. 인라인 방어 모듈 `app/core/guardrails/prompt_shield.py` 신설.
  2. 3단계 탐지 체계:
     - 1단계 (정규식/휴리스틱): "Ignore previous instructions", "DAN Mode", "시스템 프롬프트를 출력해줘", "System Prompt Revealing" 패턴 즉시 차단.
     - 2단계 (유사도 기반 탐지): 알려진 탈옥(Jailbreak) 프롬프트 데이터셋과의 벡터 유사도 검사.
     - 3단계 (구조적 엔트로피 검사): 인비저블 문자, 베이스64/이진 난독화 패턴 탐지.
  3. 차단 시 동작: `HTTP 400 Bad Request` (`PROMPT_INJECTION_DETECTED: 악의적인 프롬프트 인젝션 패턴이 감지되었습니다`) 반환 및 WORM 감사 로그에 위반 플래그(`is_blocked=True, action_taken=BLOCK_INJECTION`) 적재.

#### 7.3 데이터베이스 정기 백업 및 원클릭 재해 복구(DR) 스케줄러
- **목표**: 랜섬웨어 공격, 디스크 파손, 인적 실수 발생 시 1분 이내에 DB를 정상 상태로 복원.
- **세부 사양**:
  1. `app/core/backup_manager.py` 및 CLI `scripts/backup-restore.sh` 구현.
  2. 스케줄링: 매일 자정 또는 6시간 주기로 PostgreSQL 전체 덤프 후 AES-256 암호화 압축 아카이브.
  3. 원클릭 복구 CLI: `make restore-db BACKUP_FILE=aiorche_backup_20260914.dump.enc`.

---

### Milestone 8: 엔터프라이즈 SSO, 모델 벤치마크 & 운영 편의성 (P1/P2 확장 과제)

#### 8.1 관리자 포털 사내 SSO 연동 및 역할 기반 접근 제어 (RBAC)
- **목표**: 사내 인증 체계(Keycloak, Active Directory/LDAP, SAML 2.0)와 연동하여 관리자 계정별 권한 통제.
- **세부 사양**:
  1. 4단계 RBAC 역할 모델:
     - `SuperAdmin`: 전 시스템 설정, 패치 롤아웃, 라우팅 정책 편집, 모델 카탈로그 관리.
     - `TenantAdmin`: 소속 부서(테넌트)의 가상 API Key 발급/수정, 부서 예산 및 인보이스 조회.
     - `Auditor (준법감시)`: PII 규칙 설정, WORM 감사 로그 조회 및 포렌식 JSON 내보내기만 허용.
     - `Viewer`: 실시간 모니터링 대시보드 열람 전용 (수정 권한 없음).
  2. 프론트엔드 UI: 로그인한 계정의 역할에 따라 접근 불가 메뉴 자동 숨김 및 비활성화.

#### 8.2 모델 실시간 벤치마크 스튜디오 (Model Benchmark Studio)
- **목표**: 등록된 5대 모델 풀에 대해 객관적인 실제 성능(TTFT, TPS, GPU 큐 대기시간)을 직접 측정하고 비교.
- **세부 사양**:
  1. 프론트엔드 라우팅 탭 내 **[모델 벤치마크 스튜디오]** 서브 패널 신설.
  2. 3가지 표준 평가 시나리오 제공:
     - 단문 질의 (Short Prompt, 50 토큰): TTFT(초저지연 응답시간) 측정.
     - 장문 추론 (Reasoning Heavy, 1,000 토큰): 토큰 생성 속도(Tokens Per Second, TPS) 측정.
     - 동시 다발 부하 (Concurrent 10 Concurrency): GPU 메모리 점유율 및 큐 대기열 측정.
  3. 레이더 차트 및 비교 테이블을 통해 5대 모델 간의 비용 대 성능(Cost-Performance Ratio) 시각화.

#### 8.3 SSE 스트리밍 실시간 토큰 가드레일 (Streaming Token Interceptor)
- **목표**: 생성형 AI가 답변을 스트리밍 출력하는 도중에 개인정보나 금융 기밀이 출력되면 실시간으로 스트림을 절단(Drop).
- **세부 사양**:
  1. Envoy ext_proc 스트리밍 응답 필터 모드 연동.
  2. 슬라이딩 윈도우 버퍼(100자) 단위로 정규식 PII 패턴 실시간 검사.
  3. 탐지 시 스트림 즉각 종료(`event: error\ndata: [RESPONSE_TRUNCATED_BY_PII_GUARD]\n\n`).

#### 8.4 부서 예산 인앱 증액 요청 및 결재 워크플로우 (Budget Top-up Workflow)
- **목표**: 하드 캡(100%)에 도달하여 서비스가 차단된 부서가 관리자에게 공식 증액을 요청하고 원클릭 승인하는 기능.
- **세부 사양**:
  1. FinOps 탭 내 `[예산 증액 요청]` 버튼 추가.
  2. 사유(예: "분기 여신심사 이벤트로 일시적 트래픽 급증") 및 요청 금액(₩) 입력.
  3. SuperAdmin이 승인 시 해당 테넌트의 `monthly_budget_krw`가 자동 증액되고 즉각 429 차단 해제.

#### 8.5 비동기 대량 배치 추론 큐 (Async Batch Queueing)
- **목표**: 실시간 응답이 필요 없는 대용량 문서 분석 작업을 위한 백그라운드 큐.
- **세부 사양**:
  1. `POST /api/v1/batch/completions` 엔드포인트: 요청 접수 후 즉시 `batch_job_id` 반환.
  2. Redis Queue 워커가 심야 시간대 또는 GPU 여유 시간에 순차 처리.
  3. 완료 시 콜백 웹훅 발송 또는 `GET /api/v1/batch/{job_id}`로 결과 일괄 다운로드.

---

## 4. 우선순위 매트릭스 및 완료 정의 (Definition of Done)

| 마일스톤 | 우선순위 | 기능 명칭 | 난이도 | 완료 정의 (DoD) |
| :---: | :---: | :--- | :---: | :--- |
| **M6** | **P0** | **오프라인 Helm 차트 & 패키징** | 중 | 단일 helm install 및 `save-images.sh`로 폐쇄망 정상 기동 검증 |
| **M6** | **P0** | **예산 80%/100% 웹훅 알림** | 하 | 예산 초과 시 모의 Webhook 엔드포인트로 JSON 페이로드 발송 단위 테스트 PASS |
| **M6** | **P0** | **가상키 CIDR IP 실시간 차단** | 하 | 허용 IP 외 요청 시 403 반환 및 감사로그 적재 검증 |
| **M6** | **P0** | **WORM 감사 DB 레벨 불변 트리거** | 하 | psql에서 `UPDATE audit_logs` 시도 시 DB 트리거 Exception 발생 검증 |
| **M7** | **P0** | **에어갭 로컬 시맨틱 캐싱** | 중 | 유사 질의(>95%) 시 LLM 미호출, 응답시간 <5ms, `X-Orche-Cache: HIT` 검증 |
| **M7** | **P0** | **프롬프트 인젝션 & 탈옥 방어** | 중 | 시스템 프롬프트 탈취 시도 10종 패턴 인입 시 100% 400 차단 검증 |
| **M7** | **P1** | **DB 정기 백업 & 원클릭 DR** | 하 | 백업 스크립트 실행 후 DB 삭제 -> 복원 후 전체 데이터 무결성 검증 |
| **M8** | **P1** | **관리자 포털 SSO / RBAC** | 상 | 4대 역할(SuperAdmin/TenantAdmin/Auditor/Viewer) 권한 분리 테스트 통과 |
| **M8** | **P1** | **모델 실시간 벤치마크 스튜디오** | 중 | 웹 UI에서 5대 모델 동시 벤치마크 실행 후 TTFT/TPS 레이더 차트 출력 |
| **M8** | **P1** | **스트리밍 실시간 PII 가드레일** | 상 | 답변 출력 중 주민번호 출력 시 즉각 스트림 Truncate 검증 |
| **M8** | **P2** | **부서 예산 충전 결재 워크플로우** | 중 | 요청 접수 -> 관리자 승인 -> 한도 즉시 반영 및 차단 해제 E2E 검증 |
| **M8** | **P2** | **비동기 대량 배치 추론 큐** | 중 | 100건 배치 등록 -> 비동기 워커 순차 처리 후 상태 완료 확인 |

---

## 5. 단계별 릴리즈 일정 및 검증 계획

1. **Sprint 1 (Milestone 6 완료 - 프로덕션 패키징 & 운영 가드레일)**:
   - Helm v3 차트 개발 및 `scripts/save-images.sh` 패키징 파이프라인 수립.
   - 예산 도달 Webhook 디스패처 및 가상키 CIDR IP 차단기 장착.
   - WORM 테이블 DB 레벨 불변 트리거 적용.
   - `scripts/verify-phase6.sh` 작성 및 DoD 전수 통과.
2. **Sprint 2 (Milestone 7 완료 - 지능형 캐싱 & 인지 보안)**:
   - 로컬 경량 임베딩 런타임 및 Redis VSS 기반 시맨틱 캐시 엔진 장착.
   - 프롬프트 인젝션 & 탈옥 탐지기(`prompt_shield.py`) 필터 체인 탑재.
   - DB 정기 암호화 백업 및 DR 스크립트 완성.
3. **Sprint 3 (Milestone 8 완료 - 엔터프라이즈 SSO & 고도화 스튜디오)**:
   - Keycloak OIDC/LDAP 4단계 RBAC 미들웨어 및 UI 역할별 뷰 제어.
   - 모델 실시간 벤치마크 스튜디오 UI 및 성능 측정 API 완성.
   - 실시간 스트리밍 PII 가드레일 및 예산 증액 승인 플로우 완성.
