# AI 오케스트레이터 관리 포털(Dashboard) 실구현 엔지니어링 계획서
## Software Engineering Implementation & Architecture Blueprint

본 문서는 Mock 수준으로 검증된 대시보드를 **실제 금융권 및 엔터프라이즈의 폐쇄망/온프레미스 환경에 상용 배포 가능한 프로덕션 레벨 소프트웨어**로 구현하기 위한 엔지니어링 계획서입니다.  
소프트웨어 공학(Software Engineering) 방법론에 기반하여 요구공학, 도메인 주도 설계(DDD), 클린 아키텍처, 단계별 개발 생명주기(SDLC), 테스팅 피라미드 및 에어갭 릴리즈 파이프라인을 정의합니다.

---

## 목차 (Table of Contents)
1. [요구공학 및 품질 속성 (Requirements Engineering & FURPS+)](#1-요구공학-및-품질-속성-requirements-engineering--furps)
2. [시스템 및 소프트웨어 아키텍처 (System & Software Architecture)](#2-시스템-및-소프트웨어-아키텍처-system--software-architecture)
3. [도메인 모델 및 데이터 영속성 설계 (Domain-Driven Design & Persistence)](#3-도메인-모델-및-데이터-영속성-설계-domain-driven-design--persistence)
4. [단계별 구현 로드맵 (Phased Implementation Roadmap: Phase 0 ~ 6)](#4-단계별-구현-로드맵-phased-implementation-roadmap-phase-0--6)
5. [품질 보증 및 테스팅 전략 (Quality Assurance & Testing Strategy)](#5-품질-보증-및-테스팅-전략-quality-assurance--testing-strategy)
6. [에어갭 패키징 및 릴리즈 엔지니어링 (Air-Gapped Release Engineering)](#6-에어갭-패키징-및-릴리즈-엔지니어링-air-gapped-release-engineering)

---

## 1. 요구공학 및 품질 속성 (Requirements Engineering & FURPS+)

### 1.1 기능적 요구사항 (Functional Requirements: FR)
- **FR-01 (멀티 테넌트 & 가상키 거버넌스)**: 사내 조직도 기반 테넌트 분리, 백엔드 GPU 주소 난독화 가상 API Key 발급, IP CIDR 화이트리스트, 슬라이딩 윈도우 기반 RPM/TPM 속도 제한 및 원클릭 키 즉시 파기(Revocation).
- **FR-02 (동적 라우팅 및 xDS 배포)**: GUI 슬라이더 기반 카나리 트래픽 분할, 대기 큐(Least Queue Depth) 및 Prefix-Cache 기반 지능형 분산, 장애 시 예비 풀 자동 우회(Failover), Envoy xDS(ADS) 프로토콜을 통한 무중단 실시간 정책 배포.
- **FR-03 (FinOps 비용 계량 & 예산 하드 캡)**: 입력/출력/캐시 적중 토큰 단가별 실시간 비용 집계, 부서별 월간 예산 80% 경고 알림, 100% 도달 시 Envoy 레벨 즉시 차단(HTTP 429), 회계 결산용 CSV/Excel 청구서 내보내기.
- **FR-04 (컴플라이언스 & PII 보안 거버넌스)**: 국내 금융 특화 정규표현식 및 Presidio NER 모델 튜닝, 입력 프롬프트 실시간 마스킹 검증 시뮬레이터, Kafka-OpenSearch 파이프라인 연동 감사 추적 및 S3 Object Lock(WORM) 증적 뷰어.
- **FR-05 (에어갭 긴급 패치 및 자가진단)**: 오프라인 서명 패치 번들(`.tar.gz`) 업로드, RSA-4096 서명 무결성 검증, K8s RollingUpdate 기반 무중단 핫픽스 및 원클릭 롤백, 시스템 의존성 사전점검(Pre-Flight Check), Zero-PII 암호화 기술지원 번들 생성.
- **FR-06 (엔터프라이즈 프롬프트 스튜디오)**: 모델 파라미터 튜닝 및 테스트, 마스킹 전 원문과 마스킹 후 실제 vLLM 인입 페이로드의 Side-by-Side 비교 분석.

### 1.2 비기능적 요구사항 (Non-Functional Requirements: FURPS+ 모델)
| 분류 | 속성 | 목표 기준 (Target SLA / SLO) | 검증 방법 |
| :--- | :--- | :--- | :--- |
| **Functionality** | 보안성 (Security) | • OWASP Top 10 취약점 제로<br>• 가상 API Key는 bcrypt/Argon2 단방향 해시로만 DB 저장<br>• Zero-PII 서포트 번들 내 프롬프트 및 개인정보 유출 0건 | SonarQube 정적 분석, 보안 모의해킹 검증 |
| **Usability** | 편의성 (UX) | • 정책 변경 ➔ xDS 배포 완료까지 3클릭 이내 완결<br>• 시각적 카나리 슬라이더 및 터미널 로그 실시간 피드백 | 사용성 테스트, 운영자 작업 완료 시간 측정 |
| **Reliability** | 고가용성 (HA) | • Control Plane API 가용성 99.9% (멀티 파드 + HPA)<br>• 패치 배포 중 데이터 플레인(Envoy/vLLM) 장애 전파율 0% | K8s Pod Chaos 테스트, RollingUpdate 중 부하 테스트 |
| **Performance** | 성능 & 지연시간 | • Control Plane API p95 응답 시간 &lt; 100ms<br>• xDS 동적 정책 배포 반영 지연 &lt; 200ms<br>• 실시간 지표 웹소켓 브로드캐스트 주기 1~2초 유지 | k6 부하 테스트, Envoy stats 모니터링 |
| **Supportability** | 폐쇄망 자립성 | • **100% Air-Gapped**: 외부 CDN, 외부 레지스트리, 폰트 다운로드 의존성 0건<br>• 오프라인 라이선스 검증 (외부 통신 배제) | 완전 격리된 에어갭 네트워크 테스트베드 검증 |

---

## 2. 시스템 및 소프트웨어 아키텍처 (System & Software Architecture)

대시보드 시스템은 프론트엔드 SPA와 백엔드 컨트롤 플레인이 분리된 **BFF(Backend for Frontend) 패턴** 및 **헥사고날(Hexagonal / Clean) 아키텍처**를 채택합니다.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 사용자 브라우저 (Admin SPA)                              │
│         Next.js 14+ / React 18 Standalone (TanStack Query, Zustand, Apache ECharts)     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ (HTTPS REST / WebSocket)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        컨트롤 플레인 백엔드 (Go / FastAPI Core)                          │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Presentation Layer (REST Controllers, WebSocket Hub, Keycloak OIDC Guards)   │  │
│  └────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                           │                                            │
│  ┌────────────────────────────────────────▼─────────────────────────────────────────┐  │
│  │ 2. Application Layer (Use Cases: IssueKey, DeployXds, ApplyPatch, MeterTokens)   │  │
│  └────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                           │                                            │
│  ┌────────────────────────────────────────▼─────────────────────────────────────────┐  │
│  │ 3. Domain Layer (Entities & Rules: VirtualKey, Tenant, RoutingPolicy, PiiRule)   │  │
│  └────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                           │                                            │
│  ┌────────────────────────────────────────▼─────────────────────────────────────────┐  │
│  │ 4. Infrastructure Layer (Adapters & External Drivers)                            │  │
│  │  • PostgresRepository (GORM/SQLAlchemy)     • EnvoyXdsAdapter (go-control-plane) │  │
│  │  • K8sClientAdapter (client-go)              • PrometheusClient (PromQL Proxy)   │  │
│  │  • OpenSearchClient (Audit Log Proxy)       • CryptoVerifier (RSA-4096 Engine)   │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
┌──────────────────────────────┐ ┌───────────────────────┐ ┌───────────────────────────┐
│     PostgreSQL 메타스토어     │ │  Envoy AI Gateway     │ │  K8s API & Prometheus     │
│ (테넌트, 가상키, 정책 저장소) │ │  (gRPC xDS v3 ADS)    │ │  (롤링 배포 및 지표 수집)  │
└──────────────────────────────┘ └───────────────────────┘ └───────────────────────────┘
```

### 2.1 계층별 책임 및 설계 원칙 (Clean Architecture)
1. **Presentation Layer**:
   - HTTP 요청 파싱, Keycloak JWT 토큰 기반 역할(RBAC: SysAdmin, SecAdmin, FinOps) 검증
   - 실시간 메트릭 및 터미널 롤아웃 로그 전송을 위한 WebSocket 채널 관리
2. **Application Layer**:
   - 각 유스케이스(가상키 발급, xDS 라우팅 배포, 핫픽스 롤링 적용)의 오케스트레이션 수행
   - 트랜잭션 경계 설정(`@transactional`) 및 이벤트 발행
3. **Domain Layer**:
   - 외부 프레임워크에 종속되지 않는 순수 비즈니스 엔티티 및 유효성 검증 규칙
   - 예: 예산 초과 계산 로직, IP CIDR 매칭 로직, 슬라이딩 윈도우 쿼터 계산식
4. **Infrastructure Layer**:
   - PostgreSQL DB 인터랙션, `go-control-plane` 라이브러리를 통한 Envoy xDS v3 ADS 서버 구동, K8s SDK를 통한 Deployment 리소스 조작

---

## 3. 도메인 모델 및 데이터 영속성 설계 (Domain-Driven Design & Persistence)

실제 프로덕션 데이터베이스(`PostgreSQL 15+`)에 적용되는 정규화된 DDL 및 인덱스 설계입니다.

```sql
-- 테넌트 (사내 부서 및 조직)
CREATE TABLE tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    department_code VARCHAR(32) NOT NULL UNIQUE,
    monthly_budget_krw NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    is_hard_cap_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 가상 API Key 테이블 (해시 저장으로 평문 노출 차단)
CREATE TABLE virtual_keys (
    key_id VARCHAR(64) PRIMARY KEY,
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,            -- UI 표시용 접두사 (예: vk-live-wm-*)
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
    name VARCHAR(128) NOT NULL,
    allowed_models JSONB NOT NULL DEFAULT '[]'::jsonb,
    allowed_ip_cidrs JSONB NOT NULL DEFAULT '[]'::jsonb,
    rpm_limit INT NOT NULL DEFAULT 120,
    tpm_limit INT NOT NULL DEFAULT 200000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_virtual_keys_tenant ON virtual_keys(tenant_id);
CREATE INDEX idx_virtual_keys_prefix ON virtual_keys(key_prefix);

-- 서빙 모델 카탈로그 및 단가 테이블
CREATE TABLE model_catalogs (
    model_id VARCHAR(128) PRIMARY KEY,
    alias VARCHAR(64) NOT NULL UNIQUE,
    backend_infra VARCHAR(32) NOT NULL,         -- 'EKS', 'ECS', 'EC2'
    target_endpoint VARCHAR(255) NOT NULL,
    input_price_per_1k NUMERIC(10, 4) NOT NULL DEFAULT 0.8,
    output_price_per_1k NUMERIC(10, 4) NOT NULL DEFAULT 2.4,
    cache_discount_ratio NUMERIC(5, 4) NOT NULL DEFAULT 0.25,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 동적 라우팅 정책 테이블 (xDS 버전 제어)
CREATE TABLE routing_policies (
    policy_id VARCHAR(64) PRIMARY KEY,
    route_name VARCHAR(128) NOT NULL UNIQUE,
    traffic_weights JSONB NOT NULL,             -- [{"model_id": "...", "weight": 80}]
    load_balancing_strategy VARCHAR(32) NOT NULL DEFAULT 'LeastQueueDepth',
    failover_model_id VARCHAR(128) REFERENCES model_catalogs(model_id),
    xds_revision VARCHAR(64) NOT NULL,
    deployed_by VARCHAR(64) NOT NULL,
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PII 보안 룰셋 테이블
CREATE TABLE pii_rules (
    rule_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,           -- 'RRN', 'ACCOUNT', 'CARD', 'EMP_ID'
    regex_pattern TEXT NOT NULL,
    confidence_threshold NUMERIC(3, 2) NOT NULL DEFAULT 0.85,
    action VARCHAR(32) NOT NULL DEFAULT 'MASK', -- 'MASK', 'HASH', 'BLOCK'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 핫픽스 및 패치 릴리즈 히스토리
CREATE TABLE patch_histories (
    patch_id VARCHAR(64) PRIMARY KEY,
    bundle_filename VARCHAR(255) NOT NULL,
    target_component VARCHAR(64) NOT NULL,
    installed_version VARCHAR(32) NOT NULL,
    previous_version VARCHAR(32) NOT NULL,
    rsa_signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_status VARCHAR(32) NOT NULL,        -- 'SUCCESS', 'ROLLED_BACK', 'FAILED'
    applied_by VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. 단계별 구현 로드맵 (Phased Implementation Roadmap)

소프트웨어 공학의 애자일(Iterative & Incremental) 개발 방식을 적용하여 7개 단계로 분할 구현합니다.

```
[Phase 0: 기반 환경 구축] ──► [Phase 1: 인증 & 테넌트 코어] ──► [Phase 2: Envoy xDS 연동]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[Phase 3: 관제 & FinOps]  ──► [Phase 4: PII & 감사 연동]   ──► [Phase 5: 에어갭 패치 엔진]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[Phase 6: E2E 통합 검증 & 에어갭 번들 릴리즈]
```

---

### Phase 0: 개발 환경 표준화 및 프로젝트 스캐폴딩 (Foundations)
- **목표**: 모노레포 구조 수립, 빌드 도구 표준화 및 로컬 K8s 개발 환경(Kind/Tilt) 구성
- **주요 작업**:
  1. `dashboard/` 프로젝트 구조를 프론트엔드(`frontend/`)와 백엔드(`backend/`)로 분리 또는 모듈화
  2. 로컬 폐쇄망 에뮬레이션을 위한 Docker Compose 스택 구축 (Postgres, Redis, Envoy, Keycloak)
  3. 코드 품질 표준화: ESLint, Prettier, Go-golangci-lint / Python-Black, Husky Git hooks 구성
- **완료 정의 (DoD)**: `docker-compose up` 명령어로 로컬에서 DB, 프록시, 인프라 컨테이너가 1분 내 구동될 것.

---

### Phase 1: 인증(Auth) 및 멀티 테넌트 메타데이터 코어 (Core Multi-Tenancy)
- **목표**: Keycloak OIDC 연동 관리자 로그인 및 가상 API Key 수명주기 관리 백엔드/프론트엔드 연동
- **주요 작업**:
  1. **Backend**:
     - Keycloak JWT 검증 미들웨어 작성 (`JWKS` 캐싱 및 RBAC 인가 필터)
     - Database Migration 스크립트 작성 (Flyway 또는 Golang-migrate)
     - 테넌트 및 가상 API Key CRUD REST API 구현
     - 가상키 발급 시 32자리 보안 토큰 생성 및 Argon2 단방향 해싱 저장 로직 작성
  2. **Frontend**:
     - `VirtualKeysTab.jsx`를 실제 백엔드 REST API(`TanStack Query`)와 연동
     - 신규 가상키 발급 시 생성된 토큰을 단 1회 팝업으로 복사할 수 있는 클립보드 UI 구현
     - 키 비활성화(Revoke) 토글 시 백엔드 즉각 반영
- **완료 정의 (DoD)**: 신규 가상키 발급 ➔ DB 저장 ➔ 즉시 회수 토글 시 유효성 검증 테스트(Unit/Integration) 통과.

---

### Phase 2: Envoy xDS 연동 및 동적 라우팅 엔진 (Dynamic xDS Control Plane)
- **목표**: 대시보드에서 카나리 슬라이더 및 라우팅 변경 시 Envoy 프록시가 무중단으로 실시간 반영
- **주요 작업**:
  1. **Backend**:
     - `go-control-plane` 기반 gRPC xDS v3 Aggregated Discovery Service (ADS) 구현
     - Envoy의 `RouteConfiguration` 및 `Cluster` 동적 생성 로직 작성
     - 카나리 가중치 분할 매핑: `RouteAction.weighted_clusters` 설정 변환기 개발
     - 대기 큐 메트릭과 연계된 Gateway API `InferencePool` 상태 확인 어댑터 개발
     - `/api/v1/routing/deploy` 호출 시 xDS 캐시 스냅샷 갱신 및 리비전 태깅
  2. **Frontend**:
     - `RoutingTab.jsx`의 슬라이더 조작 값을 API로 전송하고, 리비전 번호(`xds-rev-...`)를 수신받아 실시간 반영
     - 드라이런(Dry-run) 사전 검증 API 호출 및 에러 검출 UI 구현
- **완료 정의 (DoD)**: 카나리 슬라이더를 80:20으로 변경 배포 시, Envoy 프록시 트래픽이 다운타임 없이 즉시 80:20으로 분기되는 통합 테스트 검증.

---

### Phase 3: 관제, FinOps 과금 및 Prometheus/Grafana 통합 (Observability & FinOps)
- **목표**: Prometheus 메트릭 연동, 실시간 WebSocket 지표 브로드캐스팅, 부서별 토큰 정산 엔진 구현
- **주요 작업**:
  1. **Backend**:
     - Prometheus PromQL Proxy 엔드포인트 구현 (Envoy RPS, TTFT, vLLM 큐 깊이 쿼리)
     - 실시간 지표(RPS, TPS, 큐)를 관리자 브라우저로 1초마다 푸시하는 WebSocket Hub 구현
     - Kafka 토큰 소비 이벤트 컨슈머 작성: 입력/출력/캐시 토큰 집계 및 일일 정산 테이블 적재
     - 예산 100% 초과 테넌트에 대해 Envoy Rate Limit Rule 동적 차단(HTTP 429) 트리거
     - 결산 청구서 CSV/Excel 동적 스트리밍 생성 엔진 개발
  2. **Frontend**:
     - `OverviewTab.jsx`의 KPI 카드를 WebSocket 실시간 스트림과 바인딩
     - `FinOpsTab.jsx`의 부서별 예산 소진율 실시간 표시 및 실제 CSV 청구서 다운로드 연동
     - `GrafanaModal.jsx` 내부에 실제 Grafana Kiosk 모드 iFrame 또는 임베디드 API 연동
- **완료 정의 (DoD)**: 가상키로 1만 토큰 소비 발생 시, FinOps 정산 데이터가 3초 내 실시간 갱신되고 CSV 파일로 결산 내역이 정확히 출력될 것.

---

### Phase 4: PII 보안 거버넌스 및 WORM 감사 포렌식 (Compliance & Forensics)
- **목표**: Microsoft Presidio 룰셋 동기화, 실시간 프롬프트 마스킹 시뮬레이터 및 감사 로그 뷰어 연동
- **주요 작업**:
  1. **Backend**:
     - PII 정규식 및 임계치 설정을 `ext_proc` 보안 엔진의 Presidio 설정 파일/Redis로 핫 리로드 배포
     - `/api/v1/compliance/simulate` 엔드포인트 구현: Presidio 엔진을 직접 호출하여 5ms 이내 마스킹 결과 및 지연시간 반환
     - OpenSearch 연동 감사 로그 검색 API 구현 (사번, 키ID, 타임스탬프 기반 다이나믹 필터링)
     - S3 Object Lock에 저장된 불변 감사 증적 메타데이터 검증기 작성
  2. **Frontend**:
     - `ComplianceTab.jsx`의 시뮬레이터에 실시간 API 바인딩
     - 금융감독원 실태 점검 제출용 감사 증적 PDF 다운로드 기능 구현
- **완료 정의 (DoD)**: 주민등록번호 입력 시 2ms 이내로 마스킹 결과가 반환되고, 해당 건이 WORM 감사 로그 테이블에 무결하게 적재될 것.

---

### Phase 5: 에어갭 긴급 패치 관리자 & 서포트 엔진 (Lifecycle & Patch Management)
- **목표**: 폐쇄망에서 벤더가 전달한 서명된 `.tar.gz` 패치 번들을 원클릭으로 롤링 배포 및 롤백 제어
- **주요 작업**:
  1. **Backend**:
     - 멀티파트 파일 업로드 스트리밍 및 SHA-256 / RSA-4096 벤더 공개키 서명 검증 모듈 개발
     - OCI 컨테이너 이미지 아카이브를 고객사 프라이빗 레지스트리(Harbor)에 자동 `push`하는 도커 클라이언트 어댑터 작성
     - K8s Client-go 연동: `ext_proc` Deployment 롤링 업데이트 트리거 및 PodDisruptionBudget 감시
     - 배포 단계별 로그(Surge 생성 ➔ readinessProbe ➔ Drain)를 프론트엔드로 WebSocket 스트리밍
     - 실패 시 자동 롤백 및 관리자 원클릭 롤백 엔드포인트 개발
     - **Zero-PII 서포트 번들 엔진**: 프롬프트 원문은 100% 필터링하고 시스템 에러 로그 및 메타데이터만 암호화 ZIP으로 생성
  2. **Frontend**:
     - `LifecycleTab.jsx`의 파일 업로드, 서명 상태 배지, 터미널 스트리밍 로그 및 롤백 버튼 연동
- **완료 정의 (DoD)**: 패치 파일 업로드 ➔ 서명 검증 통과 ➔ 롤링 배포 중 vLLM 추론 트래픽이 1건의 실패도 없이 신규 버전으로 전환 완료될 것.

---

### Phase 6: E2E 통합 검증, 보안 감사 및 에어갭 패키징 (Release Engineering)
- **목표**: 전체 컴포넌트 통합 테스트, 정적 보안 분석(SAST) 및 폐쇄망용 단일 배포 아티팩트 제작
- **주요 작업**:
  1. Playwright 기반 관리자 전 플로우 E2E 자동화 시나리오 구축
  2. 에어갭 환경을 위한 로컬 폰트/에셋 자체 호스팅 번들링 (`next/font/local`)
  3. Helm Chart 및 KOTS(Kubernetes Off-The-Shelf) 패키징: 단일 `helm install ai-orchestrator-admin ./helm` 지원
  4. 오프라인 이미지 번들 스크립트 작성 (`save-images.sh` / `load-images.sh`)
- **완료 정의 (DoD)**: 외부 인터넷이 차단된 클린 VM/K8s 노드에서 단일 번들 파일로 10분 내 전체 대시보드가 정상 설치 및 가동될 것.

---

## 5. 품질 보증 및 테스팅 전략 (Quality Assurance & Testing Strategy)

소프트웨어 품질을 보장하기 위해 **테스팅 피라미드(Testing Pyramid)** 원칙을 철저히 준수합니다.

```
       /\
      /  \      E2E Tests (Playwright) - 10%
     /────\     
    /      \    Integration Tests (Testcontainers, DB, xDS) - 30%
   /────────\   
  /          \  Unit Tests (Jest/Vitest, Go Test, Pytest) - 60%
 /────────────\
```

### 5.1 계층별 테스트 명세
1. **단위 테스트 (Unit Tests, 목표 커버리지 > 85%)**:
   - 가상키 토큰 해싱, 슬라이딩 윈도우 속도 제한 산식, PII 마스킹 정규식 매칭, FinOps 단가 계산기
   - 도구: `Vitest` (프론트엔드), `go test` / `pytest` (백엔드)
2. **통합 테스트 (Integration Tests)**:
   - `Testcontainers`를 활용하여 실제 격리된 PostgreSQL 및 Redis 컨테이너를 기동한 상태에서 CRUD 및 트랜잭션 롤백 테스트
   - Envoy xDS ADS 서버와 모의 Envoy 프록시 간의 스냅샷 버전 푸시 및 수신 테스트
3. **종단간 테스트 (E2E Tests - Playwright)**:
   - 시나리오 1: 관리자 로그인 ➔ 가상키 신규 발급 ➔ 키 기반 API 요청 성공 확인
   - 시나리오 2: 카나리 슬라이더 80:20 변경 ➔ xDS 배포 ➔ Envoy 트래픽 분기 확인
   - 시나리오 3: 에어갭 핫픽스 번들 업로드 ➔ 롤링 배포 ➔ 무중단 버전 갱신 확인
4. **정적 코드 분석 및 보안 검사 (SAST / Container Scanning)**:
   - SonarQube: 코드 복잡도, 중복도, 버그 취약점 정량 측정
   - Trivy / Grype: 컨테이너 이미지 내 CVE 취약점 0건(Critical/High 제로) 검증

---

## 6. 에어갭 패키징 및 릴리즈 엔지니어링 (Air-Gapped Release Engineering)

고객사 설치형 엔터프라이즈 솔루션의 특성에 맞춘 패키징 및 배포 체계입니다.

### 6.1 배포 산출물 디렉토리 구조 (Air-Gapped Appliance Package)
```
ai-orchestrator-admin-v1.2.0-offline.tar.gz
├── images/                        # 오프라인 OCI 컨테이너 이미지 아카이브
│   ├── orchestrator-ui-v1.2.0.tar
│   ├── orchestrator-api-v1.2.0.tar
│   └── envoy-ai-gateway-v1.31.tar
├── helm/                          # K8s 배포용 Helm 차트
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
├── db/                            # DB 초기화 및 마이그레이션 SQL
│   ├── init-schema.sql
│   └── migrations/
├── scripts/                       # 관리자용 편의 스크립트
│   ├── install.sh                 # 원클릭 설치 스크립트
│   ├── load-images.sh             # 고객사 사내 레지스트리(Harbor) 이미지 푸시
│   └── preflight-check.sh         # 사전 점검 스크립트
├── licenses/                      # 제3자 오픈소스 라이선스 고지서 (Apache 2.0 / MIT)
└── RELEASE_NOTES.md               # 릴리즈 노트 및 SHA-256 체크섬
```

### 6.2 오프라인 설치 프로세스 (Customer On-Premise Flow)
1. 고객사 폐쇄망 망연계 솔루션을 통해 `ai-orchestrator-admin-v1.2.0-offline.tar.gz` 반입
2. SHA-256 무결성 검증: `sha256sum -c CHECKSUM`
3. 사내 프라이빗 레지스트리(Harbor)에 이미지 적재: `./scripts/load-images.sh --registry harbor.customer.co.kr`
4. Helm을 통한 원클릭 배포: `helm install ai-orchestrator ./helm -f my-values.yaml`
5. 사내 브라우저에서 `https://ai-orchestrator.customer.co.kr` 접속 후 즉시 운영 시작

---

## 7. 결론 및 산출물 보관 안내

본 엔지니어링 계획서는 단순한 화면 구현을 넘어, **실제 대규모 금융권 인프라에서 무중단으로 동작하는 소프트웨어를 구축하기 위한 표준 소프트웨어 공학 절차**를 담고 있습니다.

- **산출물 위치**: `/Users/jason/project/오케스트레이터/dashboard_arch/dashboard_engineering_plan.md`
- **다음 추천 액션**: 본 엔지니어링 계획서 승인 후, **Phase 0(개발 환경 및 모노레포 구조 세팅)** 및 **Phase 1(인증 & 가상키 백엔드 API 구현)**부터 순차적으로 코딩을 진행할 수 있습니다.
