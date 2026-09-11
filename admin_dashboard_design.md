# 고객사 자체 운영을 위한 AI 오케스트레이터 관리 툴 및 대시보드 상세 설계서

본 문서는 금융권 및 엔터프라이즈의 폐쇄망/온프레미스 환경에 설치되어 **고객사 IT/보안/FinOps 운영팀이 전체 AI 서비스 및 인프라를 자율적으로 통제하고 운영하기 위한 관리 툴(Admin Console)과 대시보드(Dashboard)** 의 UI/UX 구조, 화면 와이어프레임, 데이터 스키마 및 제어 API를 정의합니다.

---

## 1. 제품 개요 및 설계 원칙

### 1.1 핵심 설계 원칙
1. **에어갭(Air-Gapped) 폐쇄망 100% 자립형 아키텍처**
   - 외부 인터넷(CDN, Google Fonts 등) 종속성 제로: 모든 폰트, 아이콘, JS 번들을 로컬 호스팅
   - 외부 라이선스 콜백(Phone Home) 없이 자체 서명 검증 기반 동작
2. **역할 기반 분리 운영 (Role-Based Multi-Persona)**
   - 단일 대시보드 내에서 권한에 따라 화면과 조작 범위를 철저히 분리:
     - **인프라/시스템 관리자 (SRE/SysAdmin)**: GPU 노드 상태, 트래픽 라우팅, 패치 관리, 서포트 번들
     - **보안/컴플라이언스 관리자 (CISO/SecAdmin)**: PII 마스킹 규칙, 금융 감사 포렌식 뷰어, WORM 증적
     - **AI 서비스/플랫폼 운영자 (Platform Owner)**: 모델 카탈로그, 가상 API Key 발급, 쿼터 제어, 플레이그라운드
     - **재무/FinOps 관리자 (FinOps Manager)**: 부서별 토큰 사용량 정산, 예산 하드 캡(Hard Cap) 제어
3. **직관적인 비주얼 제어 (Low-Code / Visual Operations)**
   - 복잡한 K8s 매니페스트나 Envoy YAML 작성 없이, GUI에서 클릭과 슬라이더 조작만으로 카나리 배포, PII 룰 튜닝, 예산 할당 완결
4. **표준 모니터링 및 관제 스택 채택 (Prometheus & Grafana + OpenSearch)**
   - **시계열 수치 메트릭 (Metrics)**: K8s/클라우드 표준인 **Prometheus & Grafana**를 채택하여 Envoy 트래픽, vLLM 추론 지연 시간, NVIDIA GPU(DCGM) 상태를 실시간 시각화 및 Alertmanager 경보 연동
   - **비정형 감사 로그 (Audit Logs)**: **Kafka ➔ OpenSearch & S3 Object Lock** 파이프라인을 통해 금융 규제 준수용 PII 마스킹 로그 및 프롬프트 불변 감사 포렌식 관리
   - 어드민 콘솔 내에서 Grafana 대시보드를 임베디드(Kiosk iFrame)하거나 Keycloak SSO 단일 로그인으로 매끄럽게 연동

---

## 2. 정보 구조 (Information Architecture / Sitemap)

```
[통합 관리 콘솔: AI Orchestrator Admin]
│
├── 📊 1. 글로벌 관제 홈 (Global Overview & Grafana)
│    ├── 실시간 핵심 KPI (RPS, TPS, TTFT, 에러율, 일일 누적 비용)
│    ├── GPU 컴퓨트 클러스터 히트맵 (EKS Pod, ECS Task, EC2 Bare-metal)
│    ├── Prometheus 메트릭 연동 실시간 트래픽 및 모델별 점유율 차트
│    └── 📈 Grafana 전문 대시보드 바로가기 (Inference Deep-dive / GPU DCGM)
│
├── 🧭 2. 모델 카탈로그 & 라우팅 스튜디오 (Model & Routing Studio)
│    ├── 모델 레지스트리 (vLLM 파라미터, 컨텍스트 길이, 토큰 단가 관리)
│    ├── 비주얼 라우팅 룰 빌더 (카나리 가중치 슬라이더, Failover 설정)
│    └── xDS 무중단 정책 배포 및 배포 이력
│
├── 🔑 3. 가상 API 키 & 테넌트 거버넌스 (Virtual Key & Tenants)
│    ├── 조직/부서/프로젝트 3단계 계층 관리
│    ├── 가상 API Key 발급 마법사 (허용 모델, IP 화이트리스트, RPM/TPM 설정)
│    └── 활성 키 모니터링 및 원클릭 즉시 파기(Revoke)
│
├── 💰 4. FinOps & 비용 관제 센터 (Cost & Budget Analytics)
│    ├── 부서별/프로젝트별 토큰 사용량 실시간 계량(Metering)
│    ├── 예산 한도 설정 (Soft Cap 80% 알림 / Hard Cap 100% 자동 차단)
│    └── 회계 결산용 쇼백(Showback)/차지백(Chargeback) 리포트 다운로더
│
├── 🛡️ 5. PII 보안 & 금융 감사 센터 (Compliance & Privacy Studio)
│    ├── PII 마스킹 룰 빌더 (주민번호/계좌/카드 Regex & Presidio 임계값 튜닝)
│    ├── 실시간 PII 탐지 시뮬레이터 (사전 검증용)
│    └── 금융감독원 제출용 감사 포렌식 뷰어 & WORM 불변 증적 다운로드
│
├── 🛠️ 6. 시스템 라이프사이클 & 패치 센터 (System Lifecycle & Diagnostics)
│    ├── 컴포넌트 버전 매트릭스 & 보안 권고 알림
│    ├── 에어갭 오프라인 패치 번들 업로드 (.tar.gz) & 드라이런(Dry-run)
│    ├── 원클릭 무중단 롤링 핫픽스 적용 & 즉시 롤백(Rollback)
│    └── 제로-PII 서포트 번들 생성기 (기술지원 로그 암호화 추출)
│
└── 🧪 7. 엔터프라이즈 프롬프트 스튜디오 (Prompt Studio & Playground)
     ├── 멀티 모델 응답 비교 (Side-by-Side Playground)
     └── PII 마스킹 전/후 페이로드 비교 뷰어
```

---

## 3. 핵심 화면별 상세 와이어프레임 및 기능 명세

### 화면 1: 글로벌 관제 홈 대시보드 (Global Overview)

고객사 IT 운영팀이 클러스터의 실시간 건강 상태와 트래픽 부하를 한눈에 모니터링하는 메인 화면입니다.

```
+---------------------------------------------------------------------------------------------------------+
|  AI ORCHESTRATOR ADMIN  [고객사 로고]                     [운영 환경: 온프레미스 DC1]  (👤 홍길동 SRE팀장)  |
+---------------------------------------------------------------------------------------------------------+
| [대시보드]  [모델/라우팅]  [가상키/테넌트]  [FinOps비용]  [보안/감사]  [시스템패치]  [플레이그라운드]        |
+---------------------------------------------------------------------------------------------------------+
| 💡 실시간 주요 지표 (KPIs)                                                                              |
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
| [ 📈 Grafana 전문 대시보드 열기 (SSO 연동) ]   [ 🖥️ NVIDIA GPU DCGM 모니터링 ]   [ 🚦 Envoy 트래픽 관제 ]     |
+---------------------------------------------------------------------------------------------------------+
```

#### 💡 기본 사전 탑재(Pre-provisioned) Grafana 대시보드 3종 (Dashboards-as-Code)
솔루션 설치 시 K8s ConfigMap을 통해 Grafana에 자동으로 프로비저닝되는 공식 대시보드입니다.
1. **AI Gateway & Traffic Overview (Envoy & ext_proc)**
   - 메트릭 출처: `Envoy (:9901/stats/prometheus)`, `ext_proc (:9090/metrics)`
   - 주요 패널: 실시간 요청 수(RPS), 엔드-투-엔드 p50/p95/p99 지연 시간, HTTP 4xx/5xx 비율, Rate Limit(TPM/RPM) 쓰로틀링 발생 추이, Presidio PII 마스킹 처리 지연시간
2. **vLLM & NVIDIA GPU Cluster Deep-Dive (Serving & Hardware)**
   - 메트릭 출처: `vLLM (:8000/metrics)`, `NVIDIA DCGM Exporter (:9400/metrics)`
   - 주요 패널: vLLM 대기 요청 수(`vllm:num_requests_waiting`), KV-Cache 메모리 점유율(`vllm:gpu_cache_usage_factor`), TTFT(Time to First Token), TPOT(Time per Output Token), GPU별 SM 가동률, GPU 온도 및 소비 전력
3. **FinOps & Token Metering Dashboard (Usage & Quotas)**
   - 메트릭 출처: `Orchestrator Control Plane Metrics`
   - 주요 패널: 가상 API Key별 / 테넌트별 시간당 입력·출력 토큰 소비량, 캐시 적중률(Prefix Cache Hit Rate), 예산 소진 속도 및 예측 번다운(Burn-down) 차트


---

### 화면 2: 모델 카탈로그 & 동적 라우팅 스튜디오 (Model & Routing Studio)

엔지니어가 K8s 설정 파일을 직접 만지지 않고, GUI 슬라이더로 신규 모델을 추가하거나 트래픽을 안전하게 카나리 분할 배포합니다.

```
+---------------------------------------------------------------------------------------------------------+
| 모델 카탈로그 및 동적 라우팅 제어                                        [+ 신규 서빙 모델 등록]        |
+---------------------------------------------------------------------------------------------------------+
| 📌 라우팅 정책 편집기 (Virtual Model Route: "financial-advisor-v1")                                     |
|                                                                                                         |
| 1. 트래픽 분할 비율 설정 (Canary Deployment Slider)                                                     |
|   [====================================================80%======|====================20%==============]   |
|   🔵 meta-llama/Llama-3.1-8B-Instruct (운영 안정 버전): 80%                                            |
|   🟣 meta-llama/Llama-3.1-8B-FineTuned-v2 (신규 검증 버전): 20%                                         |
|                                                                                                         |
| 2. 지능형 부하 분산 전략: (o) Least Queue Depth   ( ) Prefix-Cache Affinity   ( ) Round-Robin           |
|                                                                                                         |
| 3. 장애 대응 자동 우회 (Failover Policy)                                                                |
|   - 조건: 연속 503 에러 3회 발생 시 또는 큐 대기 시간 > 5000ms 초과 시                                 |
|   - 우회 대상: [ Amazon EC2 70B Fallback Pool  ▼ ] 로 즉시 자동 전환                                   |
|                                                                                                         |
| [ 변경 사항 드라이런(Dry-run) 검증 ]       [ 🚀 Envoy xDS 실시간 무중단 배포 (Zero-Downtime Apply) ]    |
+---------------------------------------------------------------------------------------------------------+
| 📋 등록된 백엔드 서빙 모델 풀 목록                                                                     |
| 모델명                          인프라       엔드포인트                상태    대기큐  GPU메모리   조치 |
| Llama-3.1-8B-Instruct           EKS Pods     http://vllm-llama8b:8000   🟢 정상  2 reqs  78%       [설정] |
| Llama-3.1-70B-Instruct          EC2 Bare     http://10.20.4.12:8000     🟢 정상  4 reqs  89%       [설정] |
| Qwen-2.5-Coder                  ECS Tasks    http://vllm-qwen:8000      🟡 경고  12reqs  94%       [설정] |
+---------------------------------------------------------------------------------------------------------+
```

---

### 화면 3: 가상 API 키 & 멀티 테넌트 거버넌스 (Virtual Key & Tenants)

사내 부서나 챗봇 시스템에 안전하게 접근 권한을 부여하고, 백엔드 GPU 주소를 노출하지 않도록 가상 API Key를 발급 및 회수합니다.

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
| 🔑 가상 API Key 신규 발급 모달 (Quick Preview)                                                          |
|  • 키 명칭: [ wm-customer-bot-v2           ]    소속 테넌트: [ 자산관리본부 AI추진팀 ▼ ]               |
|  • 허용 모델 선택: [x] Llama-3.1-8B   [x] Llama-3.1-70B   [ ] Qwen-Coder                               |
|  • 속도 제한: 분당 요청수 [ 300 ] RPM   /   분당 토큰수 [ 300,000 ] TPM                                 |
|  • 보안 제약: 접근 허용 사내 IP 대역 [ 10.100.0.0/16, 172.16.4.20                                   ]   |
|  • 예산 통제: 월간 한도 [ ₩ 3,000,000 ]  [x] 한도 도달 시 하드 캡(Hard Cap) 즉시 차단 활성화           |
+---------------------------------------------------------------------------------------------------------+
```

---

### 화면 4: FinOps & 비용 관제 센터 (Cost & Budget Analytics)

부서별 GPU 자원 독점을 방지하고, 회계 결산용 비용 정산 리포트를 자동 생성합니다.

```
+---------------------------------------------------------------------------------------------------------+
| FinOps 비용 거버넌스 및 예산 관제                             [조회 기간: 2026-09-01 ~ 2026-09-11 ▼]   |
+---------------------------------------------------------------------------------------------------------+
| 📊 부서별 월간 예산 대비 소진율 현황                                                                    |
| 자산관리본부 [============================45%===================] ₩ 4,500,000 / ₩ 10,000,000 (정상)     |
| 여신심사부   [=========================================72%======] ₩ 3,600,000 / ₩  5,000,000 (정상)     |
| 리스크관리부 [==================================================88%] ₩ 8,800,000 / ₩ 10,000,000 (경고)  |
| 마케팅본부   [===================================================100%] ₩ 2,000,000 / ₩ 2,000,000 (차단) |
+---------------------------------------------------------------------------------------------------------+
| 📈 일별/모델별 토큰 비용 트렌드                                 🧾 사내 회계 정산용 리포트 내보내기   |
| +---------------------------------------------------+          • 형식: [ Excel (.xlsx) ▼ ]              |
| | [ 스택 바 차트 영역 ]                              |          • 포함 항목: 부서코드, 키ID, 입력토큰,   |
| |  ■ 입력 토큰 (1k 토큰당 ₩ 0.8)                     |                       출력토큰, 캐시할인, 총비용|
| |  ■ 출력 토큰 (1k 토큰당 ₩ 2.4)                     |          [ 📥 부서별 결산 청구서 다운로드 ]     |
| |  ■ KV-Cache 적중 토큰 (1k 토큰당 ₩ 0.2 - 75% 절감) |                                                 |
| +---------------------------------------------------+                                                  |
+---------------------------------------------------------------------------------------------------------+
```

---

### 화면 5: PII 보안 룰 빌더 & 금융 감사 포렌식 센터 (Compliance Studio)

금융감독규정에 따라 고객 개인정보 유출을 방어하고, 사내 규정에 맞게 PII 마스킹 룰을 커스텀 정의 및 감사 증적을 검색합니다.

```
+---------------------------------------------------------------------------------------------------------+
| PII 보안 규칙 스튜디오 및 금융 감사 포렌식                               [보안 정책 버전: v2.4 (운영중)]|
+---------------------------------------------------------------------------------------------------------+
| 🛠️ PII 마스킹 규칙 커스텀 빌더                                                                         |
| 탐지 항목          식별 정규식 / NER 패턴             신뢰도 임계값   처리 동작          상태    테스트 |
| 주민등록번호       \d{2}([0]\d|[1][0-2])\d{2}-[1-4]\d{6}   95%         [마스킹 치환 ▼]    🟢활성  [검증] |
| 은행 계좌번호      (\d{3,6}-\d{2,6}-\d{3,6})              85%         [가명화 해시 ▼]    🟢활성  [검증] |
| 신용카드 번호      \d{4}-\d{4}-\d{4}-\d{4}                90%         [마스킹 치환 ▼]    🟢활성  [검증] |
| 사내 행번/사번     EMP-[A-Z]{2}\d{5}                      80%         [요청 즉시 차단▼]  🟢활성  [검증] |
+---------------------------------------------------------------------------------------------------------+
| 🧪 실시간 룰 검증 시뮬레이터                                                                           |
| [입력 프롬프트 테스트]: "고객 홍길동(880101-1234567) 계좌 110-123-456789 잔액 조회해줘"                 |
| [실제 vLLM 전달 페이로드]: "고객 홍길동([MASKED_RRN_1]) 계좌 [HASH_ACC_9f2a] 잔액 조회해줘"              |
| ➔ 탐지 결과: 주민번호 1건 마스킹, 계좌번호 1건 해시 변환 완료 (소요 시간: 1.2ms)                       |
+---------------------------------------------------------------------------------------------------------+
| 📜 금융감독원 감사 증적 검색 뷰어 (WORM 불변 스토리지 연동)                                             |
| 시간 (KST)      요청자/사번     가상키 ID          마스킹 내역         WORM 보관 ID       증적 다운로드 |
| 14:32:01        184022 (김금융) vk-live-wm-bot-01  주민번호 1건 치환    s3-obj-lock-994821 [📄 감사보고서]|
| 14:31:44        192105 (이리스크)vk-dev-risk-09    계좌번호 2건 해시    s3-obj-lock-994820 [📄 감사보고서]|
+---------------------------------------------------------------------------------------------------------+
```

---

### 화면 6: 시스템 라이프사이클 & 패치 관리 센터 (Lifecycle & Patch Console)

벤더(작성자)가 공급하는 긴급 보안 핫픽스 번들을 고객이 안전하게 폐쇄망에 반입하여 원클릭으로 롤링 배포 및 자가 진단하는 화면입니다.

```
+---------------------------------------------------------------------------------------------------------+
| 시스템 라이프사이클, 패치 및 자가 진단 센터                                 [현재 솔루션 버전: v1.2.0]  |
+---------------------------------------------------------------------------------------------------------+
| 📦 오프라인 긴급 패치 번들 관리 (Air-Gapped Hotfix Installer)                                          |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  |  📥 벤더 패치 파일 업로드 (.tar.gz) : [ patch-v1.2.1-hotfix-cve2026.tar.gz 파일 선택 또는 드래그 ]     |  |
|  +---------------------------------------------------------------------------------------------------+  |
|  • 패치 번들 서명 상태: 🟢 벤더 RSA-4096 서명 검증 성공 (신뢰할 수 있는 벤더 공식 핫픽스)             |
|  • 대상 모듈: `ext_proc` 보안 엔진 (Presidio PII 취약점 패치)  *vLLM GPU 클러스터 영향 없음           |
|                                                                                                         |
|  [ 1. 드라이런(Dry-Run) 영향도 사전 검증 ]    [ 2. 🚀 무중단 롤링 핫픽스 배포 ]    [ ⏪ 이전 버전 롤백 ] |
+---------------------------------------------------------------------------------------------------------+
| 🩺 원클릭 시스템 자가 진단 (Pre-Flight Health Check)                                                    |
| [▶ 전체 진단 실행] ➔  PostgreSQL 연결: 🟢정상 (1ms)   |   Redis Cluster 응답: 🟢정상 (0.4ms)             |
|                        Kafka 이벤트 버스: 🟢정상 (지연0) |   vLLM 노드 응답: 🟢3대 정상 가동중            |
+---------------------------------------------------------------------------------------------------------+
| 🧰 기술지원용 제로-PII 서포트 번들 생성기 (Zero-PII Support Bundle)                                     |
| "고객사의 프롬프트 원문, 사용자 개인정보(PII)는 100% 제외하고, 오케스트레이터의 시스템 에러 로그 및      |
| 설정 상태 메타데이터만 안전하게 암호화하여 벤더 기술 지원팀에 전달할 수 있는 ZIP 파일을 생성합니다."   |
|                                                                                                         |
| [ 🔒 Zero-PII 암호화 서포트 번들 생성 및 다운로드 (support-bundle-20260911.zip) ]                       |
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
│   통합 어드민 웹 콘솔 (Next.js 14+)   │       │   전문 모니터링 콘솔 (Grafana OSS)       │
│ • 테넌트, 가상키, FinOps 정산        │◄──────┤ • 3대 사전 탑재 대시보드               │
│ • PII 룰 빌더, 긴급 패치 인스톨러    │(임베딩)│ • Envoy L7 / vLLM / GPU DCGM 시계열 관제│
└───────────────────┬──────────────────┘       └───────────────────▲────────────────────┘
                    │ (Internal REST / gRPC)                       │ (PromQL 질의)
                    ▼                                              ▼
┌──────────────────────────────────────┐       ┌────────────────────────────────────────┐
│ 컨트롤 플레인 백엔드 API (FastAPI/Go)  │       │       시계열 메트릭 스토리지           │
│ • Keycloak OIDC 기반 관리자 RBAC     │       │       (Prometheus & Alertmanager)      │
│ • PostgreSQL 메타데이터 CRUD         │       └───────────────────▲────────────────────┘
│ • Envoy xDS Server (무중단 정책 푸시)│                           │ (15s 스크랩)
│ • K8s SDK (무중단 롤링 패치 트리거)  │       ┌───────────────────┴────────────────────┐
│ • OpenSearch 연동 (감사 로그 뷰어)   │       │   Envoy AI Gateway (:9901)             │
└──────────────────────────────────────┘       │   ext_proc 보안 엔진 (:9090)            │
                                               │   vLLM 추론 엔진 (:8000)               │
                                               │   NVIDIA DCGM Exporter (:9400)         │
                                               └────────────────────────────────────────┘
```

---

## 5. 컨트롤 플레인 메타데이터 데이터베이스 스키마 (PostgreSQL DDL)

관리 툴에서 사용하는 핵심 설정 데이터를 영구 보관하는 스키마 구조입니다.

```sql
-- 1. 테넌트 (고객사 사내 부서/본부)
CREATE TABLE tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    department_code VARCHAR(32) NOT NULL UNIQUE,
    monthly_budget_krw NUMERIC(15, 2) DEFAULT 0.00,
    is_hard_cap_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 가상 API Key
CREATE TABLE virtual_keys (
    key_id VARCHAR(64) PRIMARY KEY,              -- 'vk-live-wm-bot-01'
    key_hash VARCHAR(128) NOT NULL UNIQUE,       -- bcrypt/argon2 단방향 해시
    tenant_id VARCHAR(64) REFERENCES tenants(tenant_id),
    name VARCHAR(128) NOT NULL,
    allowed_models JSONB NOT NULL,               -- ["meta-llama/Llama-3.1-8B", "Llama-3.1-70B"]
    allowed_ip_cidrs JSONB DEFAULT '[]',         -- ["10.100.0.0/16"]
    rpm_limit INT DEFAULT 120,
    tpm_limit INT DEFAULT 200000,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 모델 레지스트리 및 백엔드 풀
CREATE TABLE model_endpoints (
    model_id VARCHAR(128) PRIMARY KEY,           -- 'meta-llama/Llama-3.1-8B-Instruct'
    alias VARCHAR(64) NOT NULL,                  -- 'financial-advisor-v1'
    backend_type VARCHAR(32) NOT NULL,           -- 'EKS', 'ECS', 'EC2'
    target_url VARCHAR(255) NOT NULL,            -- 'http://vllm-llama8b.ai-serving:8000'
    input_price_per_1k NUMERIC(10, 4) DEFAULT 0.8,
    output_price_per_1k NUMERIC(10, 4) DEFAULT 2.4,
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. 동적 라우팅 정책 (xDS 연동)
CREATE TABLE routing_policies (
    policy_id VARCHAR(64) PRIMARY KEY,
    route_name VARCHAR(128) NOT NULL,            -- 'financial-advisor-v1'
    traffic_weights JSONB NOT NULL,              -- [{"model_id": "Llama-8b-v1", "weight": 80}, {"model_id": "Llama-8b-v2", "weight": 20}]
    load_balancing_strategy VARCHAR(32) DEFAULT 'LeastQueueDepth',
    fallback_model_id VARCHAR(128) REFERENCES model_endpoints(model_id),
    updated_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. PII 탐지 규칙 셋
CREATE TABLE pii_rules (
    rule_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,                  -- '주민등록번호 마스킹'
    entity_type VARCHAR(32) NOT NULL,            -- 'RRN', 'BANK_ACCOUNT', 'CREDIT_CARD'
    regex_pattern TEXT,
    confidence_threshold NUMERIC(3, 2) DEFAULT 0.85,
    action VARCHAR(32) DEFAULT 'MASK',           -- 'MASK', 'HASH', 'BLOCK'
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 긴급 패치 및 배포 이력
CREATE TABLE patch_history (
    patch_id VARCHAR(64) PRIMARY KEY,
    package_name VARCHAR(255) NOT NULL,          -- 'patch-v1.2.1-hotfix.tar.gz'
    target_component VARCHAR(64) NOT NULL,       -- 'ext_proc', 'envoy', 'cp_api'
    previous_version VARCHAR(32) NOT NULL,
    applied_version VARCHAR(32) NOT NULL,
    signature_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(32) NOT NULL,                  -- 'APPLIED', 'ROLLED_BACK', 'FAILED'
    applied_by VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 6. 핵심 제어 REST API 명세 (Control Plane API)

### 6.1 xDS 무중단 라우팅 정책 실시간 배포
```http
POST /api/v1/routing/deploy
Content-Type: application/json
Authorization: Bearer <Admin_JWT_Token>

{
  "route_name": "financial-advisor-v1",
  "traffic_weights": [
    { "model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 80 },
    { "model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 20 }
  ],
  "strategy": "LeastQueueDepth",
  "fallback_model_id": "meta-llama/Llama-3.1-70B-Instruct"
}
```
**응답 (200 OK):**
```json
{
  "status": "SUCCESS",
  "message": "xDS 동적 라우팅 정책이 Envoy AI Gateway에 무중단 실시간 배포되었습니다.",
  "version_info": "xds-rev-20260911-1422"
}
```

### 6.2 오프라인 긴급 패치 번들 업로드 및 롤링 배포 트리거
```http
POST /api/v1/lifecycle/patches/apply
Content-Type: multipart/form-data
Authorization: Bearer <Admin_JWT_Token>

[Form Data]
file: patch-v1.2.1-hotfix.tar.gz
dry_run: false
```
**응답 (200 OK):**
```json
{
  "status": "APPLYING",
  "patch_id": "patch-20260911-01",
  "component": "ext_proc",
  "target_version": "v1.2.1-hotfix",
  "verification": {
    "signature_valid": true,
    "signer": "Antigravity Vendor Official Release Key"
  },
  "strategy": "Kubernetes RollingUpdate (PDB minAvailable: 2)",
  "tracking_url": "/api/v1/lifecycle/patches/patch-20260911-01/status"
}
```

### 6.3 제로-PII 서포트 번들 생성 요청
```http
POST /api/v1/diagnostics/support-bundle
Authorization: Bearer <Admin_JWT_Token>
```
**응답 (200 OK):**
```json
{
  "status": "READY",
  "bundle_filename": "support-bundle-20260911-1430.zip",
  "sanitization_report": {
    "prompts_stripped": 1420,
    "pii_masked_count": 89,
    "system_metrics_included": true,
    "envoy_config_dump_included": true
  },
  "download_url": "/api/v1/diagnostics/support-bundle/download"
}
```
