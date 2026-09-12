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
- ✅ **FR-01 (멀티 테넌트 & 가상키 거버넌스)** `구현완료 — Phase 1`: 사내 조직도 기반 테넌트 분리, 백엔드 GPU 주소 난독화 가상 API Key 발급, IP CIDR 화이트리스트, 슬라이딩 윈도우 기반 RPM/TPM 속도 제한 및 원클릭 키 즉시 파기(Revocation).
- ✅ **FR-02 (동적 멀티 라우팅 및 xDS 배포)** `구현완료 — Phase 2`: 다중 가상 라우트 프로필(Multi-Route Profiles CRUD), GUI 기반 N개 서빙 모델 동적 가중치 분할기(N-Target Multi-Weighted Traffic Splitter & Auto-Balance), 조건부 트래픽 매칭(테넌트 헤더 `x-orche-tenant`, URL 접두사 `/v1/routes/...`, 커스텀 헤더), 다단계 장애 우회 체인(Multi-tier Failover Chain), 대기 큐(Least Queue Depth) 및 Prefix-Cache 기반 지능형 분산, Envoy REST RDS v3(`discovery:routes`) 프로토콜을 통한 무중단 실시간 정책 컴파일 및 배포.
- ✅ **FR-03 (FinOps 비용 계량 & 예산 하드 캡)** `구현완료 — Phase 3`: 입력/출력/캐시 적중 토큰 단가별 실시간 비용 집계, 부서별 월간 예산 80% 경고 알림, 100% 도달 시 Envoy 레벨 즉시 차단(HTTP 429), 회계 결산용 CSV/Excel 청구서 내보내기.
- ✅ **FR-04 (컴플라이언스 & PII 보안 거버넌스)** `구현완료 — Phase 4`: 국내 금융 특화 정규표현식 및 Presidio 마스킹 엔진, 입력 프롬프트 실시간 마스킹 검증 시뮬레이터, WORM 불변 감사 추적(INSERT-only, SHA-256 해시) 및 감사 증적 뷰어.
- ✅ **FR-05 (에어갭 긴급 패치 및 자가진단)** `구현완료 — Phase 5`: 오프라인 서명 패치 번들(`.tar.gz`) 업로드, RSA-4096 서명 무결성 검증, 4단계 무중단 롤링 핫픽스 및 원클릭 롤백, 시스템 의존성 사전점검(Pre-Flight Check), Zero-PII 암호화 기술지원 번들 생성 및 다운로드.
- ✅ **FR-06 (엔터프라이즈 프롬프트 스튜디오)** `구현완료 — Phase 4`: 모델 파라미터 튜닝 및 테스트, 마스킹 전 원문과 마스킹 후 실제 vLLM 인입 페이로드의 Side-by-Side 비교 분석.

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
│  │  • PostgresRepository (SQLAlchemy/Postgres) • EnvoyXdsAdapter (REST RDS v3 Engine) │  │
│  │  • K8sClientAdapter (kubectl/manifests)      • TelemetryHub (WebSocket Streamer)  │  │
│  │  • PrometheusExporter (/metrics Scraper)    • CryptoVerifier (Argon2/RSA-4096)   │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
┌──────────────────────────────┐ ┌───────────────────────┐ ┌───────────────────────────┐
│     PostgreSQL 메타스토어     │ │  Envoy AI Gateway     │ │  K8s Cluster & Prometheus │
│ (테넌트, 가상키, 정책 저장소) │ │  (REST RDS v3 연동)   │ │  (5개 Pod 구동 및 수집)   │
└──────────────────────────────┘ └───────────────────────┘ └───────────────────────────┘
```

### 2.1 계층별 책임 및 설계 원칙 (Clean Architecture)
1. **Presentation Layer**:
   - HTTP 요청 파싱 및 가상키(`Authorization: Bearer sk-orch-...`) 검증
   - 실시간 메트릭 브로드캐스트를 위한 1초 주기 WebSocket 채널(`TelemetryHub`) 관리
2. **Application Layer**:
   - 각 유스케이스(가상키 발급/파기/수정, Envoy xDS 라우팅 배포, FinOps 과금 집계, CSV 스트리밍) 오케스트레이션 수행
   - 트랜잭션 경계 설정 및 예산 초과 원자적 제어
3. **Domain Layer**:
   - 외부 프레임워크에 종속되지 않는 순수 비즈니스 엔티티 및 유효성 검증 규칙
   - 예: 예산 초과(Hard Cap) 계산, IP CIDR 매칭, 카나리 가중치 100% 합산 검증, Argon2id 단방향 해싱
4. **Infrastructure Layer**:
   - PostgreSQL/SQLite DB 인터랙션, Envoy xDS v3 RouteConfiguration 변환기(`xds_generator.py`), K8s 5개 Pod 배포(`deploy/k8s/`) 형상 관리

### 2.2 주요 아키텍처 결정 기록 (Architectural Decision Records: ADR-01 ~ ADR-04)

본 시스템은 100% 에어갭 폐쇄망 어플라이언스의 운영 자립성과 단순성을 보장하기 위해 아래 4대 아키텍처 결정을 채택하여 구현되었습니다.

| 결정 번호 | 최적화 영역 | 기존 초기 구상 | 현행화된 프로덕션 아키텍처 | 채택 배경 및 엔지니어링 효과 |
| :---: | :---: | :--- | :--- | :--- |
| **ADR-01** | xDS 제어 평면 | `go-control-plane` gRPC ADS 서버 | **FastAPI Envoy REST RDS v3** (`/api/v1/xds/v3/discovery:routes`) | 별도 무거운 Go 데몬 의존성을 배제하고 Envoy 공식 `rest_api_provider`를 단일 백엔드에 통합하여 무중단 카나리 라우팅 구현 |
| **ADR-02** | 컴퓨팅 풀 관제 | K8s `InferencePool` 실시간 CRD Watcher | **Multi-Compute Pools 동적 상태 모델링** | 폐쇄망에서 K8s cluster-admin API 권한 종속성을 배제하고 `telemetry_hub`를 통한 1초 주기 실시간 관제 스트림 구축 |
| **ADR-03** | FinOps 과금 계량 | Apache Kafka 비동기 이벤트 컨슈머 | **Envoy L7 직접 보고 동기식 원자적 계량 API** (`POST /api/v1/external/usage/report`) | 분산 Kafka 클러스터 설치/운영 오버헤드 없이 단일 DB 트랜잭션으로 토큰/비용의 100% 원자적 일관성 및 초저지연 보장 |
| **ADR-04** | 전문 관제 대시보드 | Grafana Kiosk 모드 iFrame 직접 임베딩 | **전문 3종 내장 관제 패널 및 외부 Grafana 연동 링크** | Grafana 컨테이너 미구동 상태에서도 L7, GPU, FinOps 3대 화면을 자체 독립적으로 완벽 관제 가능 |

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

> **현재 진행 상태**: Phase 0 ~ Phase 5 구현 완료 ✅ | Phase 6 미구현 🚧

```
✅ [Phase 0: 기반 환경 구축] ──► ✅ [Phase 1: 인증 & 테넌트 코어] ──► ✅ [Phase 2: Envoy xDS 연동]
                                                                              │
┌─────────────────────────────────────────────────────────────────────────────┘
▼
✅ [Phase 3: 관제 & FinOps]  ──► ✅ [Phase 4: PII & 감사 연동]   ──► ✅ [Phase 5: 에어갭 패치 엔진]
                                                                              │
┌─────────────────────────────────────────────────────────────────────────────┘
▼
🚧 [Phase 6: E2E 통합 검증 & 에어갭 번들 릴리즈]
```

---

### ✅ Phase 0: 개발 환경 표준화 및 프로젝트 스캐폴딩 (Foundations) — `구현완료`
- **목표**: 모노레포 구조 수립, 빌드 도구 표준화 및 로컬 K8s 개발 환경(Kind/Tilt) 구성
- **주요 작업**:
  1. ✅ `dashboard/` 프로젝트 구조를 프론트엔드(`frontend/`)와 백엔드(`backend/`)로 분리 또는 모듈화
  2. ✅ 로컬 폐쇄망 에뮬레이션을 위한 Docker Compose 스택 구축 (Postgres, Redis, Envoy, Backend, Frontend)
  3. ✅ 코드 품질 표준화: ESLint, Prettier, Python-Black, pytest, Makefile 빌드 시스템 구성
- **완료 정의 (DoD)**: ✅ `docker-compose up` 명령어로 로컬에서 5개 컨테이너(Postgres, Redis, Envoy, Backend, Frontend)가 정상 구동. `make verify-phase0` 통과.

---

### ✅ Phase 1: 인증(Auth) 및 멀티 테넌트 메타데이터 코어 (Core Multi-Tenancy) — `구현완료`
- **목표**: Keycloak OIDC 연동 관리자 로그인 및 가상 API Key 수명주기 관리 백엔드/프론트엔드 연동
- **주요 작업**:
  1. **Backend**:
     - 🚧 Keycloak JWT 검증 미들웨어 작성 (`JWKS` 캐싱 및 RBAC 인가 필터) — *Keycloak 실제 연동은 미구현, 현재 Bearer Token 검증 로직으로 대체*
     - ✅ Database DDL 스크립트 작성 (`deploy/postgres/init.sql`)
     - ✅ 테넌트 및 가상 API Key CRUD REST API 구현 (`tenants.py`, `virtual_keys.py`)
     - ✅ 가상키 발급 시 `sk-orch-` 접두사 보안 토큰 생성 및 Argon2id 단방향 솔트 해싱 저장 로직 작성
  2. **Frontend**:
     - ✅ `VirtualKeysTab.jsx`를 실제 백엔드 REST API와 연동
     - ✅ 신규 가상키 발급 시 생성된 토큰을 단 1회 팝업으로 복사할 수 있는 클립보드 UI 구현
     - ✅ 키 비활성화(Revoke) 토글 시 백엔드 즉각 반영
- **완료 정의 (DoD)**: ✅ 신규 가상키 발급 ➔ DB 저장 ➔ 즉시 회수 토글 시 유효성 검증 테스트(Unit/Integration) 통과. `bash scripts/verify-phase1.sh` 100% 통과.

---

### ✅ Phase 2: Envoy xDS 연동 및 동적 멀티 라우팅 엔진 (Dynamic Multi-Routing & xDS Control Plane) — `구현완료`
- **목표**: 대시보드에서 다중 가상 라우트 프로필 관리, N개 모델 간 트래픽 가중치 분할, 조건부 트래픽 매칭(테넌트/헤더/경로), 다단계 장애 우회 체인을 설정하고, Envoy AI Gateway가 무중단 실시간 RDS v3 컴파일을 통해 즉시 트래픽을 분기/처리하도록 구현.
- **프로덕션 아키텍처 및 상세 작업**:
  1. **Backend**:
     - **Envoy L7 REST Route Discovery Service (RDS v3) 제어 평면 구현**: `/api/v1/xds/v3/discovery:routes`
       > **[ADR-01] Envoy REST RDS 채택 배경**: 폐쇄망/에어갭 단일 어플라이언스 환경에서 별도의 무거운 Go 데몬(`go-control-plane`) 의존성을 제거하고, Envoy 프록시가 표준 지원하는 `rest_api_provider` 기반 동적 RDS를 FastAPI 백엔드에 직접 통합하여 단일 프로세스/단일 컨테이너로 단순화하고 무중단 라우트 리비전 제어를 구현함.
     - **다중 가상 라우트 프로필 관리 도메인 모델 및 REST API (`app/models/routing_policy.py`, `app/api/v1/endpoints/routing.py`)**:
       - 프로필 CRUD (`GET/POST/PUT/DELETE /api/v1/routing/routes`)
       - 활성화 토글 (`POST /api/v1/routing/routes/{policy_id}/toggle-active`)
       - 우선순위(`priority`), 조건부 매칭 규칙(`match_conditions`: path prefix, headers, tenant_id), 다단계 장애 우회 체인(`failover_chain`), N개 타겟 모델 가중치(`traffic_weights`)
     - **Envoy v3 다중 RouteConfiguration 동적 변환기 개발 (`app/core/xds_generator.py`)**:
       - `generate_envoy_multi_route_configuration()`: 활성화된 모든 라우트 정책을 우선순위 순으로 정렬하여 Envoy `virtual_hosts[0].routes` 배열로 일괄 컴파일
       - 각 라우트별 접두사 매칭(`prefix: /v1/routes/{route_name}` 또는 custom path), 테넌트 매칭(`headers: [{name: x-orche-tenant, exact_match: ...}]`), 헤더 매칭 조건 컴파일
       - N개 타겟 모델 가중치 분할 매핑(`RouteAction.weighted_clusters`), Fallback 재시도 정책(`retry_policy`), 세션 스티키 `PrefixCacheAffinity` 일관 해시(`hash_policy: x-session-id`)
       - 기본 라우트(Default Fallback Route) 자동 보장으로 미매칭 트래픽 처리
       > **[ADR-05] N-Way 다중 라우트 프로필 및 조건부 xDS 매칭 아키텍처 채택 배경**: 단일 2개 모델 간 A/B 카나리 분할에 그치지 않고, 테넌트(부서)별 전용 라우트, 신규 모델 다자간 벤치마킹(N-Way Split), 경로 접두사 기반 라우팅을 단일 Envoy 리스너에서 동적으로 수용하기 위해 개별 라우트 프로필을 독립 엔티티화하고 Envoy Route Engine의 Prefix/Header Matcher 스펙에 1:1 매핑하도록 설계함.
     - **Multi-Compute Pools (EKS, ECS, EC2) 인프라 상태 및 큐 깊이 동적 수집**:
       > **[ADR-02] Multi-Compute Pools 메타데이터 상태 수집 채택 배경**: 에어갭 폐쇄망에서 K8s cluster-admin API 서버 권한 제약을 받지 않고 독립 가동되도록, vLLM 추론 풀 메타데이터(EKS, ECS, EC2)와 큐 깊이를 `telemetry_hub`가 실시간 동적 산출하여 WebSocket으로 브로드캐스팅하도록 최적화함.
     - `/api/v1/routing/deploy-canary` 및 `/api/v1/routing/routes` 등록/수정 시 새 xDS 리비전(`xds-rev-...`) 자동 발급 및 즉시 캐싱/배포
     - N-Way 모델 트래픽 분할 드라이런(Dry-run) 검증 시뮬레이터 API (`POST /api/v1/routing/dry-run`)
  2. **Frontend**:
     - **엔터프라이즈 멀티 라우팅 스튜디오 (`RoutingTab.jsx`)**:
       - 라우트 프로필 스위처(Route Switcher Tabs) 및 신규 라우트 생성/삭제 모달
       - N개 모델 타겟 동적 추가/제거 및 비주얼 스택 프로그레스 바 (100% 합계 실시간 검증 & 경고)
       - 원클릭 100% 균등 자동 분배(Auto-Balance) 버튼
       - 테넌트 헤더(`x-orche-tenant`), URL 경로 접두사, 커스텀 HTTP 헤더 조건부 매칭 빌더
       - 다단계 장애 우회 체인(Primary -> Secondary -> Fallback Pool) 시각적 카드
       - 드라이런(Dry-run) 사전 검증 모달 및 컴파일된 Envoy xDS JSON 페이로드 실시간 인스펙터
       - 리비전 번호(`xds-rev-...`) 실시간 배지 표출 및 Envoy 프록시 즉각 배포 연동
- **완료 정의 (DoD)**: ✅ 다중 라우트 프로필 생성/수정, N-Way 가중치 분할, Envoy REST RDS v3 컴파일 및 무중단 트래픽 분기 통합 테스트(`tests/test_routing.py`) 및 `bash scripts/verify-phase2.sh` 100% 통과.

---

### ✅ Phase 3: 관제, FinOps 과금 및 Prometheus/Grafana 통합 (Observability & FinOps) — `구현완료`
- **목표**: Prometheus 메트릭 연동, 실시간 WebSocket 지표 브로드캐스팅, 부서별 토큰 정산 엔진 구현
- **프로덕션 아키텍처 및 상세 작업**:
  1. **Backend**:
     - ✅ **1초 주기 실시간 텔레메트리 스트림 허브 (`app/core/telemetry_hub.py`)**: `ws://localhost:8000/api/v1/observability/ws`, 실시간 RPS, TPS, TTFT, 5xx 에러율, 누적 비용, Multi-Compute Pool 부하 브로드캐스트
     - ✅ **실시간 관제 요약 및 PromQL 프록시**: `GET /api/v1/observability/metrics/summary`, `POST /api/v1/observability/promql`
     - ✅ **Envoy L7 직접 보고 기반 원자적 토큰 계량 및 실시간 정산 API (`POST /api/v1/external/usage/report`)**:
       > **[ADR-03] Envoy L7 직접 보고 동기식 원자적 계량 API 채택 배경**: 분산 Kafka 클러스터 설치/운영 오버헤드를 배제하고, Envoy ext_proc 및 클라이언트가 추론 완료 즉시 단일 DB 트랜잭션으로 토큰과 비용을 원자적으로 증가시키도록 하여 초저지연과 완벽한 데이터 일관성을 달성함.
     - ✅ **Hard Cap 100% 자동 차단 엔진**: 부서 누적 사용액이 월간 예산의 100%에 도달하고 `is_hard_cap_enabled == True`인 경우, 가상키 검증 시 즉시 `HTTP 429 Too Many Requests` (`TENANT_HARD_CAP_EXCEEDED`) 반환
     - ✅ **사내 회계 결산용 동적 CSV 청구서 스트리밍**: `GET /api/v1/finops/invoices/export` (`StreamingResponse` + 한글 엑셀 호환 UTF-8 BOM `\uFEFF` 적용)
  2. **Frontend**:
     - ✅ `OverviewTab.jsx`의 KPI 카드 및 Compute Pool 상태를 WebSocket 실시간 스트림과 직접 바인딩 (`🟢 실시간 WebSocket (1s 스트림)` 배지)
     - ✅ `FinOpsTab.jsx`의 전사 AI 총 예산/지출/소진율/Run Rate 4종 집계 카드 및 부서별 프로그레스 바 실시간 바인딩
     - ✅ **Grafana 전문 관제 연동 (`GrafanaModal.jsx`)**:
       > **[ADR-04] 전문 3종 관제 뷰 자체 내장 및 사내 Grafana 연동 채택 배경**: 에어갭 폐쇄망에서 Grafana 별도 컨테이너 미구동 상태에서도 L7 트래픽, GPU DCGM, FinOps 3대 핵심 대시보드를 독립적으로 즉시 조회할 수 있도록 자체 내장 뷰를 탑재하고, 실제 운영 시 사내 Grafana로 연동 가능한 링크를 제공함.
     - ✅ 원클릭 실제 CSV 결산 청구서 스트리밍 다운로드 연동
- **완료 정의 (DoD)**: ✅ 가상키 추론 보고(usage report) 시 토큰 및 비용이 원자적으로 즉시 집계되고, 100% 예산 초과 시 HTTP 429 즉시 차단(Hard Cap) 및 한글 엑셀 호환 UTF-8 BOM CSV 청구서가 정상 스트리밍 다운로드되는 통합 테스트(`tests/test_finops_observability.py`) 및 `bash scripts/verify-phase3.sh` 통과.

---

### ✅ Phase 4: PII 보안 거버넌스 및 WORM 감사 포렌식 (Compliance & Forensics) — `구현완료`
- **목표**: 금융 PII 정규식 및 Presidio 마스킹 엔진, 실시간 프롬프트 마스킹 시뮬레이터 및 WORM 감사 포렌식 로그 뷰어 연동
- **주요 작업**:
  1. **Backend**:
     - ✅ 자체 정규식 PII 탐지·마스킹 엔진 (`app/core/pii_engine.py`): MASK/HASH/BLOCK 지원, 서브 밀리초 지연
     - ✅ PII Rule 및 Audit Log ORM 모델 (`app/models/pii_rule.py`, `app/models/audit_log.py`)
     - ✅ `/api/v1/compliance/rules` (CRUD), `/simulate` (실시간 마스킹 & WORM 로그 생성), `/audit-logs` (필터링), `/stats` 엔드포인트 구현
     - ✅ WORM 불변 감사 로그 테이블 및 SHA-256 원문/마스킹 페이로드 무결성 해시 보관
     - ✅ 단위 및 통합 테스트 8종 (`tests/test_compliance.py`) 100% 통과
  2. **Frontend**:
     - ✅ `ComplianceTab.jsx`: 실시간 Presidio/정규식 마스킹 시뮬레이터, 규칙 셋 동적 CRUD(등록 모달 및 인앱 안전 삭제 확인 모달, 낙관적 UI 갱신), WORM 감사 포렌식 뷰어 & 리포트 JSON 다운로드
     - ✅ `PromptStudioTab.jsx`: Side-by-Side PII 마스킹 비교 뷰 및 SHA-256 무결성 해시 표기
- **완료 정의 (DoD)**: ✅ 주민등록번호, 계좌, 카드, 사번 입력 시 5ms 이내로 마스킹 결과가 반환되고, 해당 건이 WORM 감사 로그 테이블에 무결하게 적재됨 (`scripts/verify-phase4.sh` 통과).

---

### ✅ Phase 5: 에어갭 긴급 패치 관리자 & 서포트 엔진 (Lifecycle & Patch Management) — `구현완료`
- **목표**: 폐쇄망에서 벤더가 전달한 서명된 `.tar.gz` 패치 번들을 원클릭으로 롤링 배포 및 롤백 제어
- **주요 작업**:
  1. **Backend**:
     - ✅ 멀티파트 파일 업로드 및 SHA-256 / RSA-4096 벤더 공개키 서명 검증 모듈 개발 (`patch_engine.py`)
     - ✅ 4단계 무중단 롤링 핫픽스 파이프라인 (Signature Verify ➔ Dry-run ➔ Staging ➔ Commit) 구축
     - ✅ 배포 단계별 상세 핫픽스 로그 및 버전 갱신 (`ext_proc` `v1.2.1-hotfix`)
     - ✅ 실패 시 자동 원복 및 관리자 원클릭 롤백(`POST /patches/rollback`) 엔드포인트 개발
     - ✅ **Zero-PII 서포트 번들 엔진**: 프롬프트 원문은 100% 필터링하고 시스템 에러 로그 및 메타데이터만 실제 ZIP 아카이브로 생성/다운로드
     - ✅ 5대 핵심 인프라(PostgreSQL, Redis, Envoy, ext_proc, vLLM) Preflight 정밀 진단 API
  2. **Frontend**:
     - ✅ `LifecycleTab.jsx`의 파일 업로드, RSA-4096 서명 검증 배지, 터미널 스트리밍 로그, 원클릭 핫픽스 배포 및 롤백 연동
- **완료 정의 (DoD)**: ✅ 패치 파일 업로드 ➔ 서명 검증 통과 ➔ 롤링 배포 및 롤백 파이프라인, Zero-PII ZIP 다운로드 및 Preflight 진단 `verify-phase5.sh` 100% 통과 (43/43 Tests PASS).

---

### 🚧 Phase 6: E2E 통합 검증, 보안 감사 및 에어갭 패키징 (Release Engineering) — `미구현`
- **목표**: 전체 컴포넌트 통합 테스트, 정적 보안 분석(SAST) 및 폐쇄망용 단일 배포 아티팩트 제작
- **주요 작업**:
  1. 🚧 Playwright 기반 관리자 전 플로우 E2E 자동화 시나리오 구축
  2. 🚧 에어갭 환경을 위한 로컬 폰트/에셋 자체 호스팅 번들링 (`next/font/local`)
  3. 🚧 Helm Chart 및 KOTS(Kubernetes Off-The-Shelf) 패키징: 단일 `helm install ai-orchestrator-admin ./helm` 지원
  4. 🚧 오프라인 이미지 번들 스크립트 작성 (`save-images.sh` / `load-images.sh`)
- **완료 정의 (DoD)**: 🚧 외부 인터넷이 차단된 클린 VM/K8s 노드에서 단일 번들 파일로 10분 내 전체 대시보드가 정상 설치 및 가동될 것.

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
1. ✅ **단위 테스트 (Unit Tests, 목표 커버리지 > 85%)** — `구현완료 (27개 pytest 테스트)`:
   - ✅ 가상키 토큰 해싱, Argon2id 검증, 테넌트 CRUD, 라우팅 CRUD, xDS 컴파일, FinOps 단가 계산기, Hard Cap 차단, CSV 내보내기
   - 도구: `pytest` (백엔드), `Vite build` (프론트엔드 빌드 검증)
2. 🚧 **통합 테스트 (Integration Tests)** — `부분 구현`:
   - ✅ SQLite 인메모리 DB를 활용한 CRUD 및 트랜잭션 테스트
   - 🚧 `Testcontainers`를 활용한 실제 PostgreSQL/Redis 격리 통합 테스트
   - 🚧 Envoy xDS ADS 서버와 모의 Envoy 프록시 간의 스냅샷 버전 푸시 및 수신 테스트
3. 🚧 **종단간 테스트 (E2E Tests - Playwright)** — `미구현`:
   - 🚧 시나리오 1: 관리자 로그인 ➔ 가상키 신규 발급 ➔ 키 기반 API 요청 성공 확인
   - 🚧 시나리오 2: 카나리 슬라이더 80:20 변경 ➔ xDS 배포 ➔ Envoy 트래픽 분기 확인
   - 🚧 시나리오 3: 에어갭 핫픽스 번들 업로드 ➔ 롤링 배포 ➔ 무중단 버전 갱신 확인
4. 🚧 **정적 코드 분석 및 보안 검사 (SAST / Container Scanning)** — `미구현`:
   - 🚧 SonarQube: 코드 복잡도, 중복도, 버그 취약점 정량 측정
   - 🚧 Trivy / Grype: 컨테이너 이미지 내 CVE 취약점 0건(Critical/High 제로) 검증

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

### 구현 진행 현황 요약
| Phase | 설명 | 상태 | DoD 검증 |
| :---: | :--- | :---: | :---: |
| **Phase 0** | 개발 환경 표준화 및 프로젝트 스캐폴딩 | ✅ 완료 | `make verify-phase0` 통과 |
| **Phase 1** | 인증, 멀티 테넌트 및 가상 API Key 코어 | ✅ 완료 | `verify-phase1.sh` 통과 |
| **Phase 2** | Envoy xDS 연동 및 동적 멀티 라우팅 엔진 | ✅ 완료 | `verify-phase2.sh` 100% 통과 |
| **Phase 3** | 관제, FinOps 과금 및 Prometheus/Grafana 통합 | ✅ 완료 | `verify-phase3.sh` 통과 |
| **Phase 4** | PII 보안 거버넌스 및 WORM 감사 포렌식 | ✅ 완료 | `verify-phase4.sh` 통과 |
| **Phase 5** | 에어갭 긴급 패치 관리자 & 서포트 엔진 | ✅ 완료 | `verify-phase5.sh` 100% 통과 |
| **Phase 6** | E2E 통합 검증, 보안 감사 및 에어갭 패키징 | 🚧 미구현 | — |

- **산출물 위치**: `/Users/jason/project/오케스트레이터/dashboard_arch/dashboard_engineering_plan.md`
- **다음 추천 액션**: **Phase 6 (E2E 통합 검증, 보안 감사 및 에어갭 패키징)** 구현 진행.
