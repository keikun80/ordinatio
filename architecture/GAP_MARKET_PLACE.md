# AI Gateway 및 LLM Gateway 시장 비교 분석 및 포지셔닝 보고서 (Marketplace Gap Analysis)

본 문서는 엔터프라이즈 AI/LLM 인프라 시장의 대표적인 게이트웨이 솔루션 4종(LiteLLM, Envoy AI Gateway, Portkey, Kong AI Gateway)의 기술적 특성을 심층 비교하고, 본 프로젝트(**AI Orchestrator**)의 아키텍처적 포지셔닝 및 차별화 요소를 분석하여 기술합니다.

---

## 1. 대표 솔루션 4종 개요

| 솔루션 | 개발 주체 / 라이선스 | 주 언어 / 코어 엔진 | 주요 지향점 |
| :--- | :--- | :--- | :--- |
| **LiteLLM** | BerriAI / Apache 2.0 & Commercial | Python (FastAPI/Uvicorn) | 100+ LLM API의 OpenAI 단일 규격화, 가상 키 및 팀별 예산 관리 |
| **Envoy AI Gateway** | CNCF (Envoy Project) / Apache 2.0 | C++ / Go (Envoy L7 코어) | K8s/클라우드 네이티브 초고성능 트래픽 제어, xDS 동적 라우팅 |
| **Portkey AI Gateway** | Portkey.ai / Apache 2.0 & Commercial | TypeScript / Node.js (Rust 코어) | 경량 프록시, 프롬프트 엔지니어링 관리, 관측성(Tracing) 및 가드레일 |
| **Kong AI Gateway** | Kong Inc. / Apache 2.0 & Enterprise | Nginx / OpenResty (Lua, Go) | 기존 엔터프라이즈 API Gateway에 AI 전용 플러그인(Proxy, Guard) 결합 |

---

## 2. 심층 기술 비교 매트릭스

| 평가 지표 | LiteLLM | Envoy AI Gateway | Portkey | Kong AI Gateway | **AI Orchestrator (본 프로젝트)** |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **코어 엔진 / 런타임** | Python (FastAPI) | C++ (Envoy Proxy) | TS / Node.js (Rust 코어) | C / OpenResty (Nginx) | **Envoy L7 (C++) + FastAPI (Python)** |
| **API 인터페이스** | OpenAI 호환 엔드포인트 | L7 HTTP 필터 체인 | OpenAI 호환 + 전용 SDK | REST API + 플러그인 | **OpenAI 호환 v1 REST + Envoy L7** |
| **처리지연 (Latency Overhead)** | 보통 (~5~15ms) | **초저지연 (< 1~2ms)** | 매우 우수 (~2~5ms) | **초저지연 (< 2~3ms)** | **초저지연 L7 바이패스 (< 2ms)** |
| **동적 라우팅 메커니즘** | 코드/설정 기반 가중치 분산 | **xDS 실시간 동적 라우팅** | 카나리 배포, 조건부 라우팅 | 업스트림 타깃 라운드로빈 | **Envoy xDS 동적 클러스터 제어** |
| **보안 및 접근 제어** | 가상 API Key, 예산/토큰 한도 | mTLS, RBAC, Envoy 보안필터 | 키 볼트, 가드레일 연동 | OIDC, SAML, Kong WAF | **Argon2id 가상키(`sk-orch-`), mTLS** |
| **데이터 보호 (PII)** | Presidio 내장 마스킹 | 외부 WASM 필터 연동 필요 | 가드레일 모듈 연동 | 외부 플러그인 연동 | **국내/국제 표준 PII 실시간 마스킹** |
| **관측성 (Observability)** | OpenTelemetry, Prometheus | Envoy Access Log, StatsD | OpenTelemetry, 전용 대시보드 | Kong Vitals, Datadog 연동 | **내장 FinOps 토큰 계량 & 감사로그** |
| **프론트엔드 관제 UI** | 제공 (LiteLLM Admin UI) | 기본 미제공 (CLI/K8s CRD) | 클라우드 SaaS / 일부 OSS UI | Kong Manager (Enterprise) | **에어갭 특화 React 다크 테마 대시보드** |
| **100% 에어갭 (폐쇄망) 적합도** | **상** (단일 컨테이너 자립) | **중상** (컨트롤러 인프라 필요) | **중** (상용 기능은 SaaS 의존) | **상** (온프레미스 검증) | **최상 (100% 오프라인 자립 어플라이언스)** |

---

## 3. 시장 포지셔닝 맵 (Architectural Positioning Map)

```
                        [초고성능 인프라 / L7 Proxy 지향]
                                       ▲
                                       │
                                       │    ★ Envoy AI Gateway
                                       │
                ★ 본 프로젝트           │
              (AI Orchestrator)        │
                                       │    ★ Kong AI Gateway
                                       │
[100% 폐쇄망 / 고객 자율 통제] ────────┼────────────────────────► [클라우드 / SaaS 연계 지향]
                                       │
                                       │    ★ LiteLLM Proxy
                                       │
                                       │    ★ Portkey AI Gateway
                                       │
                                       ▼
                         [애플리케이션 기능 / 프롬프트 관리 지향]
```

---

## 4. 본 프로젝트(AI Orchestrator)의 핵심 차별화 요소 (Differentiators)

### 1) 100% 에어갭(Air-Gapped) 오프라인 자립성
- **외부 통신 완전 차단**: 외부 인터넷, 외부 CDN, 외부 원격 측정(Telemetry), SaaS 라이선스 서버 호출이 일체 존재하지 않습니다.
- **로컬 에셋 번들링**: 프론트엔드 폰트, 아이콘(Lucide React), CSS 디자인 시스템 전체가 에어갭 환경에 번들링되어 폐쇄망 내에서 무결하게 렌더링됩니다.

### 2) Envoy 고성능 L7 코어와 제어 평면(Control Plane)의 완벽 결합
- **LiteLLM의 편의성 + Envoy의 고성능**: 
  - LiteLLM처럼 가상 API Key 발급, 테넌트 예산 한도 관리, PII 마스킹을 제공하면서도,
  - 트래픽 처리 관문은 C++ 기반 Envoy L7 엔진의 xDS 동적 라우팅을 채택하여 Python 단일 계층 게이트웨이의 레이턴시 병목을 원천 해소했습니다.

### 3) 고객 주도 자율 거버넌스 및 FinOps 관제
- 중앙 관리자가 모든 테넌트, 사용자, 모델 엔드포인트(vLLM, TGI, 자체 서빙 LLM), 토큰 사용량, 비용을 단일 대시보드에서 실시간 모니터링합니다.
- 데이터베이스(PostgreSQL), 캐시/세션(Redis), Envoy L7 프록시, 백엔드 API 서버가 일체형 어플라이언스 형태로 구동됩니다.

### 4) 오프라인 무결성 핫픽스 수용 체계 (ADR 준수)
- 벤더(개발사)가 인터넷 원격 접속을 할 수 없는 폐쇄망 환경을 고려하여, **RSA-4096 비대칭 서명 + SHA-256 검증 기반의 오프라인 패치 번들(.tar.gz)** 수용 엔진을 내장하고 있습니다.

---

## 5. 결론 및 요약

| 구분 | 일반 오픈소스/상용 게이트웨이 (LiteLLM, Portkey, Kong 등) | 본 프로젝트 (AI Orchestrator) |
| :--- | :--- | :--- |
| **운영 전제 조건** | 인터넷 연결 또는 클라우드 SaaS 관리 콘솔 연동 전제 | **100% 외부 차단 폐쇄망(온프레미스/전산실) 전제** |
| **아키텍처 형태** | 단순 프록시 라이브러리 또는 범용 API Gateway | **풀스택 올인원 AI 운영 어플라이언스** |
| **유지보수 체계** | `pip install`, `npm update`, SaaS 자동 롤아웃 | **오프라인 RSA-4096 암호화 서명 핫픽스 번들** |
| **핵심 타깃** | 클라우드 기반 스타트업, 일반 SaaS 기업 | **국방, 금융, 공공, 제조 등 보안 민감 폐쇄망 엔터프라이즈** |
