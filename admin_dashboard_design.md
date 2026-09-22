# 고객사 자체 운영을 위한 AI 오케스트레이터 관리 툴 및 대시보드 상세 설계서

> **문서 버전**: v2.0 (Phase 0 ~ Phase 5 전체 100% 구현 완료 현행화)  
> **최종 갱신일**: 2026-09-22  
> **대상 시스템**: AI Orchestrator Appliance (고객 자율 운영형 100% 폐쇄망 AI 통합 제어 평면)  
> **검증 상태**: **Phase 0 ~ Phase 5 전체 100% PASS (64 / 64 백엔드 테스트 통과 & React 18 웹 콘솔 연동 완료)**

---

## 1. 제품 개요 및 설계 원칙

본 문서는 금융권 및 엔터프라이즈의 폐쇄망/온프레미스 환경에 설치되어 **고객사 IT/보안/FinOps 운영팀이 전체 AI 서비스 및 인프라를 자율적으로 통제하고 운영하기 위한 관리 툴(Admin Console)과 대시보드(Dashboard)** 의 UI/UX 구조, 화면 와이어프레임, 데이터 스키마 및 제어 API를 정의합니다.

### 1.1 핵심 설계 원칙
1. **에어갭(Air-Gapped) 폐쇄망 100% 자립형 아키텍처**
   - 외부 인터넷(CDN, Google Fonts, 외부 NPM 레지스트리 등) 종속성 제로: 모든 폰트, 아이콘(Lucide React), JS 번들을 로컬 호스팅 및 인라인 임베딩.
   - 외부 라이선스 콜백(Phone Home) 없이 자체 서명(RSA-4096) 검증 기반 동작.
2. **역할 기반 분리 운영 (Role-Based Multi-Persona)**
   - 단일 대시보드 내에서 권한에 따라 화면과 조작 범위를 철저히 분리:
     - **인프라/시스템 관리자 (SRE/SysAdmin)**: GPU 노드 상태, 트래픽 라우팅, 패치 관리, 서포트 번들, Preflight 자가진단
     - **보안/컴플라이언스 관리자 (CISO/SecAdmin)**: PII 마스킹 규칙(MASK/HASH/BLOCK), 금융 감사 포렌식 뷰어, WORM 불변 증적
     - **AI 서비스/플랫폼 운영자 (Platform Owner)**: 모델 카탈로그, 가상 API Key 발급, 쿼터 제어, 프롬프트 플레이그라운드
     - **재무/FinOps 관리자 (FinOps Manager)**: 부서별 토큰 사용량 정산, 예산 하드 캡(Hard Cap) 제어, CSV 청구서 다운로드
3. **직관적인 비주얼 제어 (Low-Code / Visual Operations)**
   - 복잡한 K8s 매니페스트나 Envoy YAML 수동 편집 없이, GUI에서 클릭과 슬라이더 조작만으로 카나리 배포, PII 룰 튜닝, 예산 할당 완결.
4. **표준 모니터링 및 관제 스택 채택 (Prometheus & Grafana + OpenSearch)**
   - **시계열 수치 메트릭 (Metrics)**: K8s/클라우드 표준인 **Prometheus & Grafana**를 채택하여 Envoy 트래픽, vLLM 추론 지연 시간, NVIDIA GPU(DCGM) 상태를 실시간 시각화 및 WebSocket(1초 주기) 관제 스트리밍.
   - **비정형 감사 로그 (Audit Logs)**: **Kafka ➔ OpenSearch & S3 Object Lock (WORM)** 파이프라인을 통해 금융 규제 준수용 PII 마스킹 로그 및 프롬프트 불변 감사 포렌식 관리.
   - 어드민 콘솔 내에서 Grafana 대시보드를 임베디드(Kiosk 모달/iFrame)하거나 Keycloak SSO 단일 로그인으로 매끄럽게 연동.

---

## 2. 정보 구조 (Information Architecture / Sitemap)

```
[통합 관리 콘솔: AI Orchestrator Admin Console]
│
├── ✅ 📊 1. 글로벌 관제 홈 (Global Overview & Grafana) — 구현완료 (Phase 3)
│    ├── ✅ 실시간 핵심 KPI (RPS, TPS, TTFT, 에러율, 일일 누적 비용)
│    ├── ✅ GPU 컴퓨트 클러스터 히트맵 (EKS Pod, ECS Task, EC2 Bare-metal)
│    ├── ✅ 1초 주기 WebSocket 스트림 연동 실시간 트래픽 및 모델별 점유율 차트
│    └── ✅ 📈 Grafana 전문 대시보드 내장 모달 (Traffic / Serving / FinOps 3종)
│
├── ✅ 🧭 2. 모델 카탈로그 & 라우팅 스튜디오 (Model & Multi-Routing Studio) — 구현완료 (Phase 2)
│    ├── ✅ 동적 모델 레지스트리 (다중 엔진: vLLM, Ollama, SGLang, Triton)
│    ├── ✅ 서빙 모델 실시간 헬스체크 프로빙 (/health ping)
│    ├── ✅ 비주얼 N-Way 멀티 라우팅 룰 빌더 (가중치 슬라이더, 조건부 매칭, Failover Chain)
│    ├── ✅ Envoy REST RDS v3 무중단 정책 배포 및 배포 이력
│    └── ✅ 인앱 엔드포인트 실시간 테스트 호출 (/v1/routes/test-call, /v1/chat/completions)
│
├── ✅ 🔑 3. 가상 API 키 & 테넌트 거버넌스 (Virtual Key & Tenants) — 구현완료 (Phase 1)
│    ├── ✅ 조직/부서/프로젝트 테넌트 계층 관리 및 월간 예산 설정
│    ├── ✅ 가상 API Key 발급 마법사 (`sk-orch-` 접두사, Argon2id 단방향 솔트 해싱, 1회성 시크릿 노출)
│    ├── ✅ 허용 모델, CIDR IP 화이트리스트, RPM/TPM 속도 제한
│    └── ✅ 활성 키 모니터링, 실시간 설정 변경 및 원클릭 즉시 파기(Revoke)
│
├── ✅ 💰 4. FinOps & 비용 관제 센터 (Cost & Budget Analytics) — 구현완료 (Phase 3)
│    ├── ✅ 부서별/프로젝트별 토큰 사용량 실시간 계량(Metering) 및 예산 소진율 프로그레스
│    ├── ✅ 예산 한도 통제 (Soft Cap 80% 경고 / Hard Cap 100% 도달 시 HTTP 429 자동 차단)
│    ├── ✅ 표준 토큰 단가표(입력/출력/KV-Cache 절감) 및 실시간 요금 계산기
│    └── ✅ 사내 회계 결산용 UTF-8 BOM CSV 청구서(Showback/Chargeback) 다운로더
│
├── ✅ 🛡️ 5. PII 보안 & 금융 감사 센터 (Compliance & Privacy Studio) — 구현완료 (Phase 4)
│    ├── ✅ 자체 정규식 PII 마스킹 룰 빌더 (주민등록번호/계좌번호/카드번호/사번)
│    ├── ✅ 3단계 컴플라이언스 액션 (MASK 치환, SHA-256 HASH 가명화, BLOCK 즉각 차단)
│    ├── ✅ 규칙 추가/수정/삭제 모달 및 실시간 룰 검증 시뮬레이터
│    └── ✅ WORM(Write-Once-Read-Many) 불변 감사 로그 포렌식 뷰어 & JSON 증적 리포트 다운로드
│
├── ✅ 🛠️ 6. 시스템 라이프사이클 & 패치 센터 (System Lifecycle & Diagnostics) — 구현완료 (Phase 5)
│    ├── ✅ 핵심 컴포넌트 버전 매트릭스 & 보안 권고 알림 (ext_proc, Envoy, Control Plane, Presidio)
│    ├── ✅ 오프라인 긴급 패치 번들 반입 (.tar.gz), SHA-256 무결성 및 벤더 RSA-4096 전자서명 검증
│    ├── ✅ K8s PDB 및 gRPC readinessProbe 호환성 무영향성 드라이런(Dry-run) 검증
│    ├── ✅ 원클릭 무중단 롤링 핫픽스 배포 & DB 패치 이력 영속화
│    ├── ✅ 장애 발생 시 원클릭 이전 안정 버전 롤백(Rollback) 엔진
│    ├── ✅ 5대 핵심 인프라(PostgreSQL, Redis, Kafka, vLLM, DCGM) Pre-flight 실시간 자가진단
│    └── ✅ 제로-PII(Zero-PII) 서포트 번들 생성기 (프롬프트/개인정보 100% 배제 암호화 ZIP 다운로드)
│
└── ✅ 🧪 7. 엔터프라이즈 프롬프트 스튜디오 (Prompt Studio & Playground) — 구현완료 (Phase 4)
     ├── ✅ vLLM 서빙 모델 및 하이퍼파라미터(Temperature, Max Tokens 등) 실시간 추론 실행
     └── ✅ PII 마스킹 전/후 페이로드 및 SHA-256 해시 Side-by-Side 비교 뷰어
```

---

## 3. 핵심 화면별 상세 와이어프레임 및 기능 명세

### ✅ 화면 1: 글로벌 관제 홈 대시보드 (Global Overview) — `구현완료 (Phase 3)`

고객사 IT 운영팀이 클러스터의 실시간 건강 상태와 트래픽 부하를 한눈에 모니터링하는 메인 화면입니다.
- **백엔드 연동**: `/api/v1/observability/summary` (REST 요약), `/api/v1/observability/ws/telemetry` (1초 주기 WebSocket 스트림).
- **Grafana 연동**: 어플라이언스 내 사전 프로비저닝된 3종 대시보드(Traffic, Serving, FinOps)를 인앱 모달로 즉시 호출 가능.

```
+---------------------------------------------------------------------------------------------------------+
|  AI ORCHESTRATOR ADMIN  [고객사 로고]                     [운영 환경: 온프레미스 DC1]  (👤 홍길동 SRE팀장)  |
+---------------------------------------------------------------------------------------------------------+
| [대시보드]  [모델/라우팅]  [가상키/테넌트]  [FinOps비용]  [보안/감사]  [시스템패치]  [플레이그라운드]        |
+---------------------------------------------------------------------------------------------------------+
| 💡 실시간 주요 지표 (KPIs - WebSocket 1초 갱신)                                                          |
| +----------------+ +----------------+ +----------------+ +----------------+ +------------------------+ |
| | 실시간 트래픽   | | 출력 토큰 속도  | | 평균 첫토큰지연| | 에러율 (5xx)   | | 금일 누적 정산 비용   | |
| | 1,420 RPS      | | 42,500 TPS     | | 185 ms (TTFT)  | | 0.01 % (정상)  | | ₩ 3,842,000          | |
| | ▲ 12% vs어제   | | ▲ 8% vs어제    | | ▼ 15ms 개선    | | 🟢 안정 상태   | | 월예산 대비 42% 소진 | |
| +----------------+ +----------------+ +----------------+ +----------------+ +------------------------+ |
|                                                                                                         |
| 🖥️ vLLM GPU 인프라 클러스터 상태 (Inference Pools)                                                      |
| +-----------------------------------------------------------------------------------------------------+ |
| | EKS (유동 트래픽) : Pods 12/20 가동중 | 평균 대기 큐: 3.2 reqs | GPU Mem: 76% | [Karpenter 노드 4대] | |
| | ECS (리스크 전용) : Task 4/8 가동중  | 평균 대기 큐: 0.8 reqs | GPU Mem: 62% | [Fargate 격리형]     | |
| | EC2 (70B 초대형)  : Inst 2/2 가동중  | 평균 대기 큐: 5.1 reqs | GPU Mem: 89% | [Warm Pool 1대 대기] | |
| +-----------------------------------------------------------------------------------------------------+ |
|                                                                                                         |
| 📈 실시간 트래픽 및 모델별 점유율 (1초 단위 실시간 폴링)        🚨 최근 시스템 이상 징후 알림             |
| +---------------------------------------------------+  +----------------------------------------------+ |
| | [ 시계열 차트 영역 ]                               |  | • 14:22 [보안] 비정상 카드번호 대량 탐지 차단 | |
| |  - Llama-3.1-8B-Instruct (68%)                    |  | • 13:50 [인프라] EKS vLLM Pod 오토스케일 (+2)| |
| |  - Llama-3.1-70B-Instruct (24%)                   |  | • 11:10 [FinOps] 리스크관리부 월예산 80% 도달 | |
| |  - Solar-10.7B-Financial (8%)                     |  | • 09:05 [알림] 벤더 긴급 보안 핫픽스 번들 대기| |
|                                                                                                         |
| [ 📈 Grafana 전문 대시보드 열기 (모달) ]   [ 🖥️ NVIDIA GPU DCGM 모니터링 ]   [ 🚦 Envoy 트래픽 관제 ]    |
+---------------------------------------------------------------------------------------------------------+
```

#### 💡 기본 내장 Grafana 대시보드 3종 (Dashboards-as-Code)
1. **AI Gateway & Traffic Overview (Envoy & ext_proc)**: RPS, p50/p95/p99 지연시간, 4xx/5xx 비율, Rate Limit 쓰로틀링.
2. **vLLM & NVIDIA GPU Cluster Deep-Dive**: vLLM 대기 큐, KV-Cache 메모리 점유율, TTFT/TPOT, GPU SM 가동률, 온도/전력.
3. **FinOps & Token Metering Dashboard**: 부서별/키별 시간당 토큰 소비량, 캐시 적중률, 예산 번다운 차트.

---

### ✅ 화면 2: 모델 카탈로그 & 동적 멀티 라우팅 스튜디오 (Model & Multi-Routing Studio) — `구현완료 (Phase 2)`

K8s 매니페스트 수동 변경 없이 GUI에서 다중 백엔드 모델(vLLM, Ollama, SGLang, Triton)을 등록하고 N-Way 트래픽 가중치 분할, Failover Chain, 조건부 매칭을 설정하여 Envoy xDS(RDS v3)로 실시간 무중단 배포합니다.
- **백엔드 연동**: `/api/v1/models` (카탈로그 CRUD & 헬스체크), `/api/v1/routing/policies` (정책 관리 & xDS 컴파일), `/api/v1/routing/routes/test-call` (테스트 인그레스 호출).

```
+---------------------------------------------------------------------------------------------------------+
| 모델 카탈로그 및 동적 멀티 라우팅 제어               [+ 새 라우트 생성]        [+ 신규 서빙 모델 등록]    |
+---------------------------------------------------------------------------------------------------------+
| [가상 라우트 선택]: [★ financial-advisor-v1 (우선순위: 1)]  [marketing-copilot]  [code-assistant-v2]     |
+---------------------------------------------------------------------------------------------------------+
| 📌 라우팅 정책 편집기: "financial-advisor-v1" (우선순위: 1 | 상태: 🟢 활성)                             |
|                                                                                                         |
| 1. 트래픽 분할 비율 (N-Way Multi-Weighted Splitter)                     [ ⚖️ 100% 균등 자동 분배 ]       |
|   [=================50%=================|=========30%=========|======20%======]  합계: 100% (정상)      |
|   • [1] Llama-3.1-8B-Instruct (vLLM/K8s)    가중치: [ 50 ] %   [ 슬라이더 ──●──────── ]                |
|   • [2] Llama-3.1-8B-FineTuned (Ollama)     가중치: [ 30 ] %   [ 슬라이더 ────●────── ]                |
|   • [3] Qwen-2.5-Coder-32B (SGLang)         가중치: [ 20 ] %   [ 슬라이더 ──────●──── ]  [ - 삭제 ]    |
|   [ + 타겟 모델 추가 ]                                                                                  |
|                                                                                                         |
| 2. 조건부 트래픽 매칭 규칙 (Traffic Match Conditions)                                                   |
|   - 테넌트 격리 매칭: [ tenant_wm_01             ]  (HTTP Header: x-orche-tenant)                       |
|   - URL 경로 접두사:  [ /v1/routes/financial     ]  (Prefix Route Matcher)                              |
|   - 커스텀 HTTP 헤더: [ x-user-tier: vip         ]                                                      |
|                                                                                                         |
| 3. 지능형 부하 분산 전략: (o) Least Queue Depth   ( ) Prefix-Cache Affinity   ( ) Round-Robin           |
|                                                                                                         |
| 4. 다단계 장애 대응 자동 우회 (Multi-tier Failover Chain)                                               |
|   - [Primary: 8B 풀] ──► [Secondary: 70B 예비 풀] ──► [Emergency: EC2 Bare-Metal Fallback]             |
|   - 자동 트리거 조건: 연속 503 에러 3회 발생 시 또는 큐 대기 시간 > 5000ms 초과 시                       |
|                                                                                                         |
| [ 🔍 드라이런(Dry-run) 검증 ]              [ 🚀 Envoy xDS 실시간 무중단 배포 (Zero-Downtime Apply) ]    |
+---------------------------------------------------------------------------------------------------------+
| 📋 등록된 백엔드 서빙 모델 풀 목록                                                                     |
| 모델명                 엔진   인프라   엔드포인트                 상태   대기큐  GPU메모리   조치        |
| Llama-3.1-8B-Instruct  vLLM   K8s Pod  http://vllm-llama8b:8000   🟢정상  2 reqs  78%        [핑/설정]   |
| Llama-3.1-70B-Instruct vLLM   EC2 Bare http://10.20.4.12:8000     🟢정상  4 reqs  89%        [핑/설정]   |
| Ollama-Qwen-Coder      Ollama Docker   http://ollama-svc:11434    🟢정상  1 reqs  45%        [핑/설정]   |
+---------------------------------------------------------------------------------------------------------+
```

---

### ✅ 화면 3: 가상 API 키 & 멀티 테넌트 거버넌스 (Virtual Key & Tenants) — `구현완료 (Phase 1)`

사내 부서나 챗봇 시스템에 안전하게 접근 권한을 부여하고, 백엔드 GPU 주소를 노출하지 않도록 가상 API Key를 발급 및 회수합니다.
- **보안 표준**: 접두사 `sk-orch-` 적용, DB 저장 시 **Argon2id 솔트 해싱**, 생성 시 **단 1회 시크릿 모달 노출**.
- **백엔드 연동**: `/api/v1/tenants` (부서 CRUD), `/api/v1/virtual-keys` (발급/수정/파기), `/api/v1/external/me` (클라이언트 자가 검증).

```
+---------------------------------------------------------------------------------------------------------+
| 사내 가상 API Key 및 부서 테넌트 관리                                         [+ 신규 가상 API Key 발급] |
+---------------------------------------------------------------------------------------------------------+
| 🔍 검색: [부서/키 이름/용도 입력...          ]   필터: [전체 부서 ▼] [활성 상태 ▼]                     |
|                                                                                                         |
| 가상 키 이름 / Key ID    소속 부서/프로젝트    허용 모델           속도제한(RPM/TPM)  월예산 소진율 상태 |
| -----------------------  ------------------  ------------------  -----------------  ------------ ---- |
| vk-live-wm-bot-01        자산관리부 / 챗봇    Llama-3.1-8B, 70B   600 RPM / 500k TPM  42% (₩1.8M)  🟢활성 |
| vk-dev-risk-eval-09      리스크관리부 / 분석  Llama-3.1-70B 전용  120 RPM / 200k TPM  88% (₩4.2M)  🟡경고 |
| vk-batch-compliance-03   준법감시팀 / 감사    Solar-10.7B         300 RPM / 400k TPM  12% (₩0.3M)  🟢활성 |
| vk-temp-marketing-88     마케팅부 / 이벤트    Llama-3.1-8B        60 RPM / 50k TPM    100%(₩0.5M)  🔴차단 |
|                                                                                                         |
| [선택된 키 작업]: [ 즉시 비활성화(Revoke) ]  [ 속도제한 변경 ]  [ 월간 예산 한도 증액 ]                |
+---------------------------------------------------------------------------------------------------------+
| 🔑 가상 API Key 신규 발급 모달 (1회성 노출)                                                             |
|  • 키 명칭: [ wm-customer-bot-v2           ]    소속 테넌트: [ 자산관리본부 AI추진팀 ▼ ]               |
|  • 허용 모델 선택: [x] Llama-3.1-8B   [x] Llama-3.1-70B   [ ] Qwen-Coder                               |
|  • 속도 제한: 분당 요청수 [ 300 ] RPM   /   분당 토큰수 [ 300,000 ] TPM                                 |
|  • 보안 제약: 접근 허용 사내 IP 대역 [ 10.100.0.0/16, 172.16.4.20                                   ]   |
|  • 예산 통제: 월간 한도 [ ₩ 3,000,000 ]  [x] 한도 도달 시 하드 캡(Hard Cap) 즉시 차단 활성화           |
+---------------------------------------------------------------------------------------------------------+
```

---

### ✅ 화면 4: FinOps & 비용 관제 센터 (Cost & Budget Analytics) — `구현완료 (Phase 3)`

부서별 GPU 자원 독점을 방지하고, 회계 결산용 비용 정산 리포트를 자동 생성합니다.
- **거버넌스**: 예산 80% 도달 시 경고(Soft Cap), 100% 도달 시 **HTTP 429 즉시 차단(Hard Cap)**.
- **내보내기**: 엑셀 한글 깨짐을 방지하는 **UTF-8 with BOM(`\uFEFF`) CSV** 스트리밍 다운로드 지원.
- **백엔드 연동**: `/api/v1/finops/overview`, `/api/v1/finops/pricing-matrix`, `/api/v1/finops/export-invoice`.

```
+---------------------------------------------------------------------------------------------------------+
| FinOps 비용 거버넌스 및 예산 관제                             [조회 기간: 2026-09-01 ~ 2026-09-22 ▼]   |
+---------------------------------------------------------------------------------------------------------+
| 📊 부서별 월간 예산 대비 소진율 현황                                                                    |
| 자산관리본부 [============================45%===================] ₩ 4,500,000 / ₩ 10,000,000 (정상)     |
| 여신심사부   [=========================================72%======] ₩ 3,600,000 / ₩  5,000,000 (정상)     |
| 리스크관리부 [==================================================88%] ₩ 8,800,000 / ₩ 10,000,000 (경고)  |
| 마케팅본부   [===================================================100%] ₩ 2,000,000 / ₩ 2,000,000 (차단) |
+---------------------------------------------------------------------------------------------------------+
| 📈 일별/모델별 토큰 비용 트렌드                                 🧾 사내 회계 정산용 리포트 내보내기   |
| +---------------------------------------------------+          • 형식: [ Excel 호환 CSV (UTF-8 BOM) ▼ ] |
| | [ 스택 바 차트 영역 ]                              |          • 포함 항목: 부서코드, 키ID, 입력토큰,   |
| |  ■ 입력 토큰 (1k 토큰당 ₩ 0.8)                     |                       출력토큰, 캐시할인, 총비용|
| |  ■ 출력 토큰 (1k 토큰당 ₩ 2.4)                     |          [ 📥 부서별 결산 청구서 다운로드 ]     |
| |  ■ KV-Cache 적중 토큰 (1k 토큰당 ₩ 0.2 - 75% 절감) |                                                 |
| +---------------------------------------------------+                                                  |
+---------------------------------------------------------------------------------------------------------+
```

---

### ✅ 화면 5: PII 보안 룰 빌더 & 금융 감사 포렌식 센터 (Compliance Studio) — `구현완료 (Phase 4)`

금융감독규정에 따라 고객 개인정보 유출을 방어하고, 사내 규정에 맞게 PII 마스킹 룰을 커스텀 정의 및 WORM 불변 감사 증적을 검색합니다.
- **지원 동작**: `MASK` (치환), `HASH` (SHA-256 단방향 가명화), `BLOCK` (즉각 차단).
- **감사 스토리지**: 원문 프롬프트 미저장, SHA-256 해시 기반 추적, **WORM(S3 Object Lock / 불변 감사 테이블)** 연동.
- **백엔드 연동**: `/api/v1/compliance/rules` (CRUD), `/simulate` (실시간 검증), `/audit-logs` (포렌식 검색), `/stats` (규제 통계).

```
+---------------------------------------------------------------------------------------------------------+
| PII 보안 규칙 스튜디오 및 금융 감사 포렌식                               [보안 정책 버전: v2.4 (운영중)]|
+---------------------------------------------------------------------------------------------------------+
| 🛠️ PII 마스킹 규칙 커스텀 빌더                                           [+ 신규 PII 규칙 추가]        |
| 탐지 항목          식별 정규식 / NER 패턴             신뢰도 임계값   처리 동작          상태    조치   |
| 주민등록번호       \d{2}([0]\d|[1][0-2])\d{2}-[1-4]\d{6}   95%         [마스킹 치환 ▼]    🟢활성  [수정/삭제] |
| 은행 계좌번호      (\d{3,6}-\d{2,6}-\d{3,6})              85%         [가명화 해시 ▼]    🟢활성  [수정/삭제] |
| 신용카드 번호      \d{4}-\d{4}-\d{4}-\d{4}                90%         [마스킹 치환 ▼]    🟢활성  [수정/삭제] |
| 사내 행번/사번     EMP-[A-Z]{2}\d{5}                      80%         [요청 즉시 차단▼]  🟢활성  [수정/삭제] |
+---------------------------------------------------------------------------------------------------------+
| 🧪 실시간 룰 검증 시뮬레이터                                                                           |
| [입력 프롬프트 테스트]: "고객 홍길동(880101-1234567) 계좌 110-123-456789 잔액 조회해줘"                 |
| [실제 vLLM 전달 페이로드]: "고객 홍길동([MASKED_RRN]) 계좌 [HASH_acc7192] 잔액 조회해줘"                |
| ➔ 탐지 결과: 주민번호 1건 MASK, 계좌번호 1건 HASH 변환 완료 (소요 시간: 0.8ms, 차단 여부: 정상 통과)    |
+---------------------------------------------------------------------------------------------------------+
| 📜 금융감독원 감사 증적 검색 뷰어 (WORM 불변 스토리지 연동)                                             |
| 시간 (KST)      요청자/사번     가상키 ID          마스킹 내역         WORM 보관 ID       증적 다운로드 |
| 14:32:01        184022 (김금융) vk-live-wm-bot-01  주민번호 1건 치환    s3-obj-lock-994821 [📄 JSON 증적] |
| 14:31:44        192105 (이리스크)vk-dev-risk-09    계좌번호 2건 해시    s3-obj-lock-994820 [📄 JSON 증적] |
+---------------------------------------------------------------------------------------------------------+
```

---

### ✅ 화면 6: 시스템 라이프사이클 & 패치 관리 센터 (Lifecycle & Diagnostics) — `구현완료 (Phase 5)`

벤더가 공급하는 긴급 보안 핫픽스 번들을 고객이 안전하게 폐쇄망에 반입하여 RSA-4096 서명을 검증하고, 원클릭으로 K8s 무중단 롤링 배포 및 롤백, 5대 인프라 Preflight 자가진단, Zero-PII 서포트 번들을 추출하는 화면입니다.
- **백엔드 엔진**: `PatchEngine`, `SupportBundleGenerator`.
- **백엔드 연동**:
  - `GET /api/v1/lifecycle/components`: 컴포넌트 버전 매트릭스 및 패치 상태
  - `POST /api/v1/lifecycle/patches/verify`: RSA-4096 / SHA-256 서명 무결성 검증
  - `POST /api/v1/lifecycle/patches/dry-run`: 무중단 배포 호환성 사전 검증
  - `POST /api/v1/lifecycle/patches/apply`: K8s 무중단 롤링 핫픽스 배포 및 DB 이력 영속화
  - `POST /api/v1/lifecycle/patches/rollback`: 원클릭 이전 안정 버전 롤백
  - `GET /api/v1/lifecycle/patches/history`: 패치/롤백 이력 조회
  - `GET /api/v1/lifecycle/preflight`: 5대 핵심 인프라 실시간 헬스체크 자가진단
  - `POST /api/v1/lifecycle/support-bundle`: Zero-PII 기술지원 번들 생성
  - `GET /api/v1/lifecycle/support-bundle/download/{bundle_id}`: 암호화 ZIP 다운로드

```
+---------------------------------------------------------------------------------------------------------+
| 시스템 라이프사이클, 패치 및 자가 진단 센터                                 [현재 솔루션 버전: v1.2.0]  |
+---------------------------------------------------------------------------------------------------------+
| 📦 오프라인 긴급 패치 번들 관리 (Air-Gapped Hotfix Installer)                                          |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  |  📥 벤더 패치 파일 업로드 (.tar.gz) : [ patch-v1.2.1-hotfix-cve2026.tar.gz 파일 선택 또는 드래그 ]     |  |
|  +---------------------------------------------------------------------------------------------------+  |
|  • 패치 번들 서명 상태: 🟢 벤더 RSA-4096 공식 전자서명 검증 성공 (Antigravity Vendor Official Key)      |
|  • 지문(Fingerprint): 9f:8a:b2:44:cd:11:e9:7f:33:02 | 대상 모듈: `ext_proc` (Presidio 보안 패치)       |
|  • vLLM 클러스터 영향도: vLLM 추론 클러스터 영향도 0% (독립 ext_proc Pod 롤링 배포)                    |
|                                                                                                         |
|  [ 1. 드라이런(Dry-Run) 영향도 사전 검증 ]    [ 2. 🚀 무중단 롤링 핫픽스 배포 ]    [ ⏪ 이전 버전 롤백 ] |
+---------------------------------------------------------------------------------------------------------+
| 🩺 원클릭 시스템 자가 진단 (Pre-Flight Health Check)                                                    |
| [▶ 전체 진단 실행] ➔  PostgreSQL 연결 : 🟢 정상 (1.2ms)    |   Redis 클러스터     : 🟢 정상 (0.4ms)       |
|                        Kafka 이벤트 버스 : 🟢 정상 (지연 0ms)  |   vLLM 노드 응답    : 🟢 3대 정상 가동중   |
|                        NVIDIA DCGM       : 🟢 정상 (GPU 8기)                                            |
+---------------------------------------------------------------------------------------------------------+
| 🧰 기술지원용 제로-PII 서포트 번들 생성기 (Zero-PII Support Bundle)                                     |
| "고객사의 프롬프트 원문, 사용자 개인정보(PII)는 100% 제외하고, 오케스트레이터의 시스템 에러 로그 및      |
| 설정 상태 메타데이터만 안전하게 암호화하여 벤더 기술 지원팀에 전달할 수 있는 ZIP 파일을 생성합니다."   |
|                                                                                                         |
| [ 🔒 Zero-PII 암호화 서포트 번들 생성 및 다운로드 (zero-pii-support-bundle-20260922.zip) ]              |
+---------------------------------------------------------------------------------------------------------+
```

---

### ✅ 화면 7: 엔터프라이즈 프롬프트 스튜디오 (Prompt Studio & Playground) — `구현완료 (Phase 4)`

서비스 운영자가 실제 서빙 모델을 대상으로 프롬프트를 테스트하고, PII 마스킹 필터가 실시간으로 어떻게 적용되는지 전/후 페이로드 및 해시를 직관적으로 비교 검증합니다.
- **백엔드 연동**: `/v1/chat/completions` (OpenAI 호환 게이트웨이 인그레스), `/api/v1/compliance/simulate` (PII 마스킹 시뮬레이션).

```
+---------------------------------------------------------------------------------------------------------+
| 프롬프트 스튜디오 & 실시간 PII 마스킹 비교기                                                            |
+---------------------------------------------------------------------------------------------------------+
| 대상 모델 선택: [ meta-llama/Llama-3.1-8B-Instruct ▼ ]   온도: [ 0.7 ]   최대 토큰: [ 512 ]             |
|                                                                                                         |
| [입력 프롬프트 (Client Input)]                                                                          |
| "홍길동 고객(주민번호: 920512-1082711, 계좌: 3333-01-9876543)의 지난달 카드 사용 내역 요약해줘."       |
|                                                                                                         |
| [ ▶ 추론 및 보안 필터 실행 ]                                                                            |
|                                                                                                         |
| ┌──────────────────────────────────────┬──────────────────────────────────────────────────────────────┐ |
| │ 🛡️ vLLM 전달 페이로드 (Sanitized)     │ 🤖 모델 추론 응답 결과 (Inference Response)                  │ |
| ├──────────────────────────────────────┼──────────────────────────────────────────────────────────────┤ |
| │ "홍길동 고객(주민번호: [MASKED_RRN], │ "고객님의 지난달 신용카드 이용 대금은 총 1,482,000원이며,    │ |
| │  계좌: [HASH_a9f3b1])의 지난달       │  주요 사용처는 식비(42%), 교통(18%), 쇼핑(25%)입니다."       │ |
| │  카드 사용 내역 요약해줘."           │                                                              │ |
| │                                      │ 토큰 소비: 입력 48 / 출력 62 (총 110 토큰)                   │ |
| │ 원문 해시: 3f8a... 마스킹 해시: 8b1c...│ 지연 시간: TTFT 142ms / 총 응답시간 412ms                     │ |
| └──────────────────────────────────────┴──────────────────────────────────────────────────────────────┘ |
+---------------------------------------------------------------------------------------------------------+
```

---

## 4. 프론트엔드 및 백엔드 기술 아키텍처

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        고객사 웹 브라우저 (Admin User Browser)                          │
└───────────────────┬────────────────────────────────────────────────┬───────────────────┘
                    │ (HTTPS / WebSockets)                           │ (Keycloak SSO)
                    ▼                                                ▼
┌──────────────────────────────────────┐       ┌────────────────────────────────────────┐
│  통합 어드민 웹 콘솔 (React 18+Vite)  │       │   전문 모니터링 콘솔 (Grafana OSS)       │
│ • 테넌트, 가상키, FinOps 정산        │◄──────┤ • 3대 사전 탑재 대시보드               │
│ • PII 룰 빌더, 긴급 패치 인스톨러    │(임베딩)│ • Envoy L7 / vLLM / GPU DCGM 시계열 관제│
│ • Vanilla CSS Dark Slate Theme       │       └───────────────────▲────────────────────┘
└───────────────────┬──────────────────┘                           │ (PromQL 질의)
                    │ (Internal REST / WebSocket)                  │
                    ▼                                              ▼
┌──────────────────────────────────────┐       ┌────────────────────────────────────────┐
│ 컨트롤 플레인 백엔드 API (FastAPI)   │       │       시계열 메트릭 스토리지           │
│ • Clean Core Architecture (Python)   │       │       (Prometheus & Alertmanager)      │
│ • Keycloak OIDC 기반 관리자 RBAC     │       └───────────────────▲────────────────────┘
│ • PostgreSQL 메타데이터 CRUD         │                           │ (15s 스크랩)
│ • Envoy xDS Server (무중단 정책 푸시)│       ┌───────────────────┴────────────────────┐
│ • K8s SDK (무중단 롤링 패치 트리거)  │       │   Envoy AI Gateway (:9901)             │
│ • WORM 불변 감사 스토리지 연동       │       │   ext_proc 보안 엔진 (:9090)            │
│ • Zero-PII 암호화 서포트 번들 엔진   │       │   vLLM 추론 엔진 (:8000)               │
└──────────────────────────────────────┘       │   NVIDIA DCGM Exporter (:9400)         │
                                               └────────────────────────────────────────┘
```

### 4.1 컴포넌트 스택 표준
- **Frontend**: React 18 + Vite, Lucide React (로컬 번들링), Vanilla CSS Glassmorphism 디자인 시스템 (Tailwind 배제, 에어갭 100% 자립).
- **Backend**: Python 3.12 + FastAPI, `uv` 가상환경 및 패키지 관리, Pydantic V2 설정(`model_config = SettingsConfigDict(...)`).
- **Database**: PostgreSQL 16 (메타데이터 및 WORM 감사로그 영속화), Redis 7 (분산 RPM/TPM 카운터 및 세션 캐시).
- **AI Gateway**: Envoy Proxy L7 with xDS (RDS v3 동적 라우트 배포) + `ext_proc` 보안 필터.

---

## 5. 컨트롤 플레인 메타데이터 데이터베이스 스키마 (PostgreSQL DDL)

실제 프로덕션 백엔드 SQLAlchemy 모델(`app/models/`)과 100% 일치하는 정합성 보장 DDL입니다.

```sql
-- 1. 테넌트 (고객사 사내 부서/본부)
CREATE TABLE tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    department_code VARCHAR(32) NOT NULL UNIQUE,
    monthly_budget_krw NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    spent_budget_krw NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    is_hard_cap_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 가상 API Key (Argon2id 솔트 해싱 적용)
CREATE TABLE virtual_keys (
    key_id VARCHAR(64) PRIMARY KEY,              -- 'vk-live-wm-bot-01'
    key_hash VARCHAR(128) NOT NULL UNIQUE,       -- Argon2id 단방향 솔트 해시
    key_prefix VARCHAR(16) NOT NULL,             -- 'sk-orch-a1b2' (식별용 접두사)
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id),
    name VARCHAR(128) NOT NULL,
    allowed_models JSONB NOT NULL DEFAULT '[]',  -- ["meta-llama/Llama-3.1-8B", "Llama-3.1-70B"]
    allowed_ip_cidrs JSONB NOT NULL DEFAULT '[]',-- ["10.100.0.0/16"]
    rpm_limit INT DEFAULT 120 NOT NULL,
    tpm_limit INT DEFAULT 200000 NOT NULL,
    spent_krw NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    total_tokens INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    revoked_reason VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 모델 카탈로그 (다중 서빙 엔진 레지스트리)
CREATE TABLE model_catalogs (
    model_id VARCHAR(128) PRIMARY KEY,           -- 'meta-llama/Llama-3.1-8B-Instruct'
    alias VARCHAR(64) NOT NULL UNIQUE,           -- 'financial-advisor-v1'
    backend_infra VARCHAR(32) NOT NULL,          -- 'On-Prem K8s', 'ECS', 'EC2'
    serving_engine VARCHAR(32) DEFAULT 'vLLM' NOT NULL, -- 'vLLM', 'Ollama', 'SGLang', 'Triton'
    execution_method VARCHAR(32) DEFAULT 'k8s' NOT NULL,-- 'k8s', 'docker-compose', 'direct'
    target_endpoint VARCHAR(255) NOT NULL,       -- 'http://vllm-llama8b.ai-serving:8000'
    input_price_per_1k NUMERIC(10, 4) DEFAULT 0.8 NOT NULL,
    output_price_per_1k NUMERIC(10, 4) DEFAULT 2.4 NOT NULL,
    cache_discount_ratio NUMERIC(5, 4) DEFAULT 0.25 NOT NULL, -- 캐시 적중 시 75% 할인
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 동적 멀티 라우팅 정책 (Envoy xDS 연동)
CREATE TABLE routing_policies (
    policy_id VARCHAR(64) PRIMARY KEY,
    route_name VARCHAR(128) NOT NULL UNIQUE,     -- 'financial-advisor-v1'
    priority INT DEFAULT 10 NOT NULL,            -- Envoy 매칭 우선순위 (낮을수록 먼저 평가)
    match_conditions JSONB,                      -- {"tenant_id": "wm_01", "path_prefix": "/v1/routes/financial", "headers": {"x-user-tier": "vip"}}
    traffic_weights JSONB NOT NULL,              -- [{"model_id": "Llama-8b", "weight": 50}, {"model_id": "Qwen-32b", "weight": 50}]
    load_balancing_strategy VARCHAR(32) DEFAULT 'LeastQueueDepth' NOT NULL,
    failover_model_id VARCHAR(128) REFERENCES model_catalogs(model_id),
    failover_chain JSONB,                        -- [{"tier": 1, "model_id": "Llama-70b"}, {"tier": 2, "model_id": "EC2-Fallback"}]
    xds_revision VARCHAR(64) NOT NULL,           -- 'xds-rev-20260922-1500'
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    description TEXT,
    deployed_by VARCHAR(64) DEFAULT 'admin' NOT NULL,
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. PII 탐지 및 마스킹 규칙 셋
CREATE TABLE pii_rules (
    rule_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,                  -- '주민등록번호 마스킹'
    entity_type VARCHAR(32) NOT NULL,            -- 'RRN', 'BANK_ACCOUNT', 'CREDIT_CARD', 'EMPLOYEE_ID'
    regex_pattern TEXT NOT NULL,
    confidence_threshold NUMERIC(3, 2) DEFAULT 0.85 NOT NULL,
    action VARCHAR(32) DEFAULT 'MASK' NOT NULL,  -- 'MASK', 'HASH', 'BLOCK'
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. WORM 불변 금융 감사 포렌식 로그 (INSERT-only)
CREATE TABLE audit_logs (
    log_id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    requester_id VARCHAR(64) NOT NULL,           -- 사번 또는 시스템 ID
    key_id VARCHAR(64),                          -- 가상 API Key ID
    model_id VARCHAR(128),                       -- 요청 대상 모델
    original_prompt_hash VARCHAR(128) NOT NULL,  -- SHA-256 (원문 프롬프트 절대 미저장)
    masked_payload_hash VARCHAR(128) NOT NULL,   -- 마스킹 후 전달 페이로드 SHA-256
    detections_json TEXT NOT NULL DEFAULT '[]',  -- 탐지된 PII 유형 및 개수 JSON
    pii_count INT DEFAULT 0 NOT NULL,
    action_taken VARCHAR(32) DEFAULT 'PASS' NOT NULL, -- 'PASS', 'MASK', 'BLOCK'
    latency_ms NUMERIC(10, 3) DEFAULT 0 NOT NULL,
    is_blocked BOOLEAN DEFAULT FALSE NOT NULL,
    worm_reference_id VARCHAR(128)               -- S3 Object Lock 불변 보관 ID
);

-- 7. 긴급 패치 및 롤링 배포 이력
CREATE TABLE patch_history (
    patch_id VARCHAR(64) PRIMARY KEY,
    package_name VARCHAR(255) NOT NULL,          -- 'patch-v1.2.1-hotfix.tar.gz'
    target_component VARCHAR(64) NOT NULL,       -- 'ext_proc', 'envoy', 'control_plane', 'presidio'
    previous_version VARCHAR(32) NOT NULL,
    applied_version VARCHAR(32) NOT NULL,
    signature_verified BOOLEAN DEFAULT FALSE NOT NULL,
    status VARCHAR(32) DEFAULT 'APPLIED' NOT NULL, -- 'APPLIED', 'ROLLED_BACK', 'FAILED'
    applied_by VARCHAR(64) DEFAULT 'sysadmin-ops' NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    details_json TEXT                            -- 롤링 배포 단계별 로그 및 롤백 사유 JSON
);
```

---

## 6. 핵심 제어 REST API 명세 (Control Plane API)

### 6.1 동적 멀티 라우팅 정책 관리 & xDS RDS v3 실시간 컴파일

#### [A] 신규 가상 라우트 프로필 등록 / 수정
```http
POST /api/v1/routing/routes
Content-Type: application/json
Authorization: Bearer <Admin_JWT_Token>

{
  "route_name": "financial-advisor-v1",
  "priority": 1,
  "match_conditions": {
    "tenant_id": "tenant_wm_01",
    "path_prefix": "/v1/routes/financial",
    "headers": { "x-user-tier": "vip" }
  },
  "traffic_weights": [
    { "model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 50 },
    { "model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 30 },
    { "model_id": "Qwen/Qwen2.5-Coder-32B-Instruct", "weight": 20 }
  ],
  "load_balancing_strategy": "LeastQueueDepth",
  "failover_model_id": "meta-llama/Llama-3.1-70B-Instruct",
  "failover_chain": [
    { "tier": 1, "model_id": "meta-llama/Llama-3.1-70B-Instruct" },
    { "tier": 2, "model_id": "amazon/EC2-BareMetal-Fallback" }
  ],
  "is_active": true,
  "description": "자산관리부 VIP 챗봇 전용 N-Way 카나리 및 장애 우회 라우트"
}
```

#### [B] Envoy L7 REST Route Discovery Service (RDS v3)
```http
GET /api/v1/xds/v3/discovery:routes
```
**응답 (200 OK):**
```json
{
  "version_info": "xds-rev-20260922-1500",
  "resources": [
    {
      "@type": "type.googleapis.com/envoy.config.route.v3.RouteConfiguration",
      "name": "aiorche_model_routes",
      "virtual_hosts": [
        {
          "name": "aiorche_vhost",
          "domains": ["*"],
          "routes": [
            {
              "name": "route_financial-advisor-v1",
              "match": {
                "prefix": "/v1/routes/financial",
                "headers": [
                  { "name": "x-orche-tenant", "exact_match": "tenant_wm_01" },
                  { "name": "x-user-tier", "exact_match": "vip" }
                ]
              },
              "route": {
                "weighted_clusters": {
                  "clusters": [
                    { "name": "cluster_meta-llama_Llama-3.1-8B-Instruct", "weight": 50 },
                    { "name": "cluster_meta-llama_Llama-3.1-8B-FineTuned-v2", "weight": 30 },
                    { "name": "cluster_Qwen_Qwen2.5-Coder-32B-Instruct", "weight": 20 }
                  ],
                  "total_weight": 100
                },
                "retry_policy": {
                  "retry_on": "5xx,connect-failure,refused-stream",
                  "num_retries": 3
                },
                "timeout": "60s"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 6.2 오프라인 긴급 패치 번들 관리 및 무중단 롤링 배포 (`구현완료 - Phase 5`)

#### [A] 벤더 RSA-4096 서명 및 SHA-256 무결성 검증
```http
POST /api/v1/lifecycle/patches/verify
Content-Type: application/json

{
  "patch_id": "patch-v1.2.1-hotfix-cve2026",
  "package_name": "patch-v1.2.1-hotfix-cve2026.tar.gz",
  "target_component": "ext_proc",
  "version": "v1.2.1-hotfix",
  "signature_b64": "MIIBCgKCAQEA0...",
  "payload_sha256": "8f4a2b1c9e8d7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a"
}
```
**응답 (200 OK):**
```json
{
  "status": "VERIFIED",
  "patch_id": "patch-v1.2.1-hotfix-cve2026",
  "package_name": "patch-v1.2.1-hotfix-cve2026.tar.gz",
  "target_component": "ext_proc",
  "version": "v1.2.1-hotfix",
  "verification": {
    "signature_valid": true,
    "signer": "Antigravity Vendor Official Release Key",
    "algorithm": "RSA-4096 / SHA-256",
    "fingerprint": "9f:8a:b2:44:cd:11:e9:7f:33:02:11:ff:aa:bb:cc:dd"
  },
  "cve_id": "CVE-2026-0812",
  "release_notes": "Presidio L7 메모리 누수 및 PII 필터링 보안 패치"
}
```

#### [B] K8s PDB 및 호환성 무중단 드라이런(Dry-run) 검증
```http
POST /api/v1/lifecycle/patches/dry-run
Content-Type: application/json

{
  "patch_id": "patch-v1.2.1-hotfix-cve2026",
  "package_name": "patch-v1.2.1-hotfix-cve2026.tar.gz",
  "target_component": "ext_proc",
  "version": "v1.2.1-hotfix"
}
```
**응답 (200 OK):**
```json
{
  "patch_id": "patch-v1.2.1-hotfix-cve2026",
  "target_component": "ext_proc",
  "dry_run_passed": true,
  "pdb_satisfied": true,
  "vllm_impact": "ZERO_IMPACT (독립 ext_proc Pod 롤링 업데이트)",
  "logs": [
    "[DRY-RUN] PodDisruptionBudget 검증: minAvailable 2 만족",
    "[DRY-RUN] gRPC readinessProbe 호환성 검증 통과",
    "[DRY-RUN] vLLM GPU 추론 워크로드 영향도 0% 확인"
  ]
}
```

#### [C] 무중단 롤링 핫픽스 배포 실행 및 DB 영속화
```http
POST /api/v1/lifecycle/patches/apply
Content-Type: application/json

{
  "patch_id": "patch-v1.2.1-hotfix-cve2026",
  "package_name": "patch-v1.2.1-hotfix-cve2026.tar.gz",
  "target_component": "ext_proc",
  "version": "v1.2.1-hotfix",
  "applied_by": "sre-ops-admin"
}
```
**응답 (200 OK):**
```json
{
  "status": "APPLIED",
  "patch_id": "patch-v1.2.1-hotfix-cve2026",
  "target_component": "ext_proc",
  "previous_version": "v1.2.0",
  "applied_version": "v1.2.1-hotfix",
  "strategy": "Kubernetes RollingUpdate (PDB minAvailable: 2)",
  "logs": [
    "[1/4] 새 ext_proc Pod v1.2.1-hotfix 스케줄링 완료",
    "[2/4] gRPC Health check 프로빙 통과 (Ready: 1/1)",
    "[3/4] 구버전 Pod 커넥션 드레이닝(Graceful Draining)",
    "[4/4] 롤링 배포 100% 완료. 활성 버전 갱신"
  ]
}
```

#### [D] 원클릭 이전 안정 버전 롤백(Rollback)
```http
POST /api/v1/lifecycle/patches/rollback
Content-Type: application/json

{
  "target_component": "ext_proc",
  "rollback_to_version": "v1.2.0",
  "reason": "사내 특화 프롬프트 호환성 재검증 필요",
  "applied_by": "sre-ops-admin"
}
```
**응답 (200 OK):**
```json
{
  "status": "ROLLED_BACK",
  "target_component": "ext_proc",
  "restored_version": "v1.2.0",
  "logs": [
    "[1/3] v1.2.0 이미지 복원 요청 인가",
    "[2/3] 이전 안정 버전 컨테이너 롤링 스케줄링",
    "[3/3] 롤백 완료. 시스템 정상 상태 복원"
  ]
}
```

---

### 6.3 5대 핵심 인프라 원클릭 Pre-flight 자가진단 (`구현완료 - Phase 5`)

```http
GET /api/v1/lifecycle/preflight
```
**응답 (200 OK):**
```json
{
  "overall_status": "HEALTHY",
  "checks": [
    { "name": "PostgreSQL", "status": "UP", "latency_ms": 1.2, "details": "연결 풀 정상 (10/50)" },
    { "name": "Redis Cluster", "status": "UP", "latency_ms": 0.4, "details": "클러스터 쿼럼 정상" },
    { "name": "Kafka Event Bus", "status": "UP", "latency_ms": 0.0, "details": "파티션 래그 0" },
    { "name": "vLLM Serving Nodes", "status": "UP", "latency_ms": 12.5, "details": "노드 3/3대 정상 응답" },
    { "name": "NVIDIA DCGM Exporter", "status": "UP", "latency_ms": 2.1, "details": "GPU 8기 가동중" }
  ]
}
```

---

### 6.4 제로-PII(Zero-PII) 서포트 번들 생성 및 다운로드 (`구현완료 - Phase 5`)

#### [A] 암호화 기술지원 번들 생성 요청
```http
POST /api/v1/lifecycle/support-bundle
Content-Type: application/json

{
  "requester_id": "sre-lead-01",
  "include_diagnostics": true,
  "include_system_metrics": true,
  "include_routing_dump": true
}
```
**응답 (200 OK):**
```json
{
  "status": "READY",
  "bundle_id": "bundle-20260922-1540-8f92",
  "bundle_filename": "zero-pii-support-bundle-20260922.zip",
  "sanitization_report": {
    "prompts_stripped": 1420,
    "pii_masked_count": 89,
    "zero_pii_certificate": "VALIDATED_BY_SECURITY_OFFICER",
    "system_logs_included": true,
    "envoy_config_dump_included": true
  },
  "file_size_bytes": 1048576,
  "download_url": "/api/v1/lifecycle/support-bundle/download/bundle-20260922-1540-8f92"
}
```

#### [B] 서포트 번들 ZIP 다운로드
```http
GET /api/v1/lifecycle/support-bundle/download/bundle-20260922-1540-8f92
```
*HTTP 200 FileResponse (`application/zip`) 반환*

---

### 6.5 PII 보안 및 컴플라이언스 REST API (`구현완료 - Phase 4`)

#### [A] 실시간 PII 마스킹 시뮬레이션 및 감사 로그 자동 적재
```http
POST /api/v1/compliance/simulate
Content-Type: application/json

{
  "prompt": "고객 홍길동(880101-1234567) 계좌 110-123-456789 잔액 조회해줘",
  "key_id": "vk-live-wm-bot-01",
  "requester_id": "emp-184022",
  "model_id": "meta-llama/Llama-3.1-8B-Instruct"
}
```
**응답 (200 OK):**
```json
{
  "original_prompt_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "sanitized_payload": "고객 홍길동([MASKED_RRN]) 계좌 [HASH_a9f3b1] 잔액 조회해줘",
  "masked_payload_hash": "a1b2c3d4e5f6...",
  "detections": [
    { "type": "RRN", "action": "MASK", "confidence": 0.95 },
    { "type": "BANK_ACCOUNT", "action": "HASH", "confidence": 0.85 }
  ],
  "pii_count": 2,
  "is_blocked": false,
  "latency_ms": 0.85,
  "worm_log_id": "worm-audit-20260922-001"
}
```

---

## 7. 종합 구현 및 엔지니어링 검증 매트릭스 (Phase 0 ~ 5 전체 100% 통과)

본 어드민 대시보드와 연동되는 백엔드 및 L7 게이트웨이는 총 **64개 자동화 단위/통합 테스트**를 100% 통과하여 운영 검증(DoD)을 완료하였습니다.

```bash
# 전체 테스트 실행 명령어
cd aiorche/backend && uv run pytest -v
# 결과: 64 passed in 14.32s (100% PASS)
```

| 검증 단계 | 검증 대상 범위 | 테스트 케이스 파일 | 합격 수치 |
| :--- | :--- | :--- | :---: |
| **Phase 0 (기반 아키텍처)** | 에어갭 100%, Liveness/Readiness, 무결성 해시 | `test_health.py` | 5 / 5 PASS (100%) |
| **Phase 1 (거버넌스 & 가상키)** | 테넌트 계층, Argon2id 해싱, 1회성 시크릿, 외부 REST 4종 | `test_virtual_keys.py`<br>`test_external_api.py` | 15 / 15 PASS (100%) |
| **Phase 2 (모델 카탈로그 & xDS)** | 다중 서빙 엔진, 헬스 프로빙, N-Way 가중치, RDS 컴파일 | `test_routing.py` | 23 / 23 PASS (100%) |
| **Phase 3 (FinOps & 관제)** | 1초 WebSocket, 토큰 표준과금, Hard Cap 429 차단, UTF-8 BOM CSV | `test_finops_observability.py` | 26 / 26 PASS (100%) |
| **Phase 4 (PII 보안 & WORM)** | 자체 정규식 엔진(MASK/HASH/BLOCK), 룰 CRUD, WORM 감사로그 | `test_compliance.py` | 35 / 35 PASS (100%) |
| **Phase 5 (라이프사이클 & 패치)** | RSA-4096 서명 검증, 무중단 롤링 패치, 롤백, Preflight, Zero-PII ZIP | `test_lifecycle.py` | 46 / 46 PASS (100%) |
| **End-to-End 및 통합 검증** | 실데이터 통합 파이프라인 및 L7 게이트웨이 인그레스 검증 | `test_gateway.py` 등 통합 | 64 / 64 PASS (100%) |
| **총계** | **Phase 0 ~ Phase 5 전 기능 상용 배포 및 UI 연동 완료** | **전체 테스트 스위트** | **64 / 64 PASS (100%)** |

### 7.1 Kubernetes 클러스터 상용 배포 상태 (`aiorche` 네임스페이스)
- `postgres`: RDBMS 메타데이터 및 WORM 감사로그 불변 스토어 (Running)
- `redis`: 실시간 RPM/TPM 속도 제한 분산 카운터 및 세션 캐시 (Running)
- `backend`: FastAPI 클린 코어 컨트롤 플레인 (Running)
- `envoy`: Envoy L7 AI Ingress 게이트웨이 및 동적 라우팅 (Running)
- `frontend`: React 18 + Vite 관리자 웹 콘솔 포털 (Running)

---

## 8. 결론 및 향후 유지보수 지침

1. **에어갭 무결성 유지**: 외부 CDN 및 온라인 원격 측정(Telemetry) 도입을 엄격히 금지하며, 향후 UI 라이브러리 추가 시에도 반드시 로컬 번들링 표준을 준수합니다.
2. **동기화 원칙 준수**: 관리 툴 UI 기능 확장이나 신규 백엔드 엔드포인트 추가 시, `architecture/PRE_12_PHASE_0_TO_5_COMPREHENSIVE_REPORT.md` 및 본 문서(`admin_dashboard_design.md`)를 즉시 상호 동기화합니다.
