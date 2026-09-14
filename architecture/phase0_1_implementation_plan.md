# PHASE 0.1: Envoy AI Gateway (ext_proc 기반) 및 AgentRouter 전환 엔지니어링 구현 설계서
## Next-Gen Air-Gapped AI Gateway & Cognitive Multi-Agent Routing Architecture

---

## 1. 개요 및 배경 (Overview & Motivation)

본 문서는 **Phase 0.1**의 정식 엔지니어링 설계서로서, 기존의 정적 L7 프록시(Envoy Proxy)를 CNCF 공식 표준 아키텍처인 **Envoy AI Gateway (`ext_proc` 기반)**와 지능형 에이전트 분기 엔진인 **AgentRouter**로 전면 전환하기 위한 기술 아키텍처, 프로토콜 및 구현 명세를 정의합니다.

### 1.1 핵심 전환 목표
1. **Envoy AI Gateway 표준 수용 (`ext_proc` gRPC 파이프라인)**:
   - Envoy C++ 코어 수정이나 복잡한 Wasm 개발 없이, Envoy 공식 표준인 **`ext_proc` (External Processor) 양방향 gRPC 스트림**을 통해 LLM 요청/응답을 실시간 인터셉트.
   - L7 수준에서 **OpenAI 규격 스키마 검증, 토큰 단위 레이트 리미팅(TPM), 스트리밍(SSE) 지연 최적화, TTFT(Time To First Token) 메트릭 자동 수집** 구현.
2. **지능형 AgentRouter 2-Tier 결합**:
   - `ext_proc` 인터셉션 단계에서 **AgentRouter**가 프롬프트의 인텐트, 추론 복잡도, 도구 호출(Tool Calling) 요구 조건을 실시간 분석하여 최적의 모델(8B vs 72B vs 특화 에이전트)로 동적 분기.
3. **100% 에어갭(Air-Gapped) 오프라인 자립성**:
   - 외부 SaaS나 외부 레지스트리 의존성 0건. 온프레미스 단일 어플라이언스(Docker Compose / K8s 사이드카) 내에서 완결.

---

## 2. 시스템 아키텍처 및 데이터 플로우 (Architecture & Data Flow)

### 2.1 2-Tier 계층 구조: L7 인프라 관문(Envoy) + 인지 지능 엔진(AgentRouter)

```
[클라이언트 애플리케이션]
       │ (HTTP POST /v1/chat/completions with sk-orch-* Key)
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Envoy AI Gateway (L7 High-Performance Data Plane)                         │
│    • Envoy C++ Ingress (Port 8080)                                          │
│    • mTLS, Connection Pooling, Zero-Copy SSE Stream Passthrough             │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────┐     │
│    │ Envoy HTTP ext_proc Filter (Bidirectional gRPC Stream)           │     │
│    └───────────────────────┬──────────────────────────▲───────────────┘     │
└────────────────────────────┼──────────────────────────┼─────────────────────┘
                             │ (1) ProcessingRequest    │ (4) ProcessingResponse
                             ▼ (Headers & Body)         │     (Route Header Override)
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. AI Gateway ext_proc Service + AgentRouter Engine (Control/Cognitive)     │
│                                                                             │
│    [ ext_proc gRPC Server (Python/FastAPI) ]                                │
│       ├── ① Virtual Key & Token Rate Limiting Check (Argon2id, Redis TPM)   │
│       ├── ② PII Pre-Masking Engine (국내 개인정보 실시간 난독화)             │
│       │                                                                     │
│       └── ③ AgentRouter Core Dispatcher                                     │
│             ├── Intent & Complexity Classifier (8B Fast vs 72B Reasoning)   │
│             ├── Budget-aware Policy Engine (테넌트 잔여 예산 연동)          │
│             ├── Tool-Calling & Sub-Agent Chain Resolver                     │
│             └── Session / KV-Cache Affinity (x-session-id 해시)             │
│                                                                             │
│    [ 결과: x-orche-upstream-cluster 헤더 주입 및 Envoy로 반환 ]              │
└─────────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼ (2) 선택된 최적 업스트림으로 초고속 전달
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. 온프레미스 추론 클러스터 (Upstream Model Pool)                           │
│    ├── vLLM Fast Cluster (Llama-3-8B / Qwen-2.5-7B)                         │
│    ├── vLLM Reasoning Cluster (DeepSeek-R1 / Qwen-72B)                      │
│    └── Private Ollama / Embedding Service                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 세부 설계 명세 (Detailed Specifications)

### 3.1 Envoy AI Gateway 설정 (`ext_proc` 구성)
`aiorche/deploy/envoy/envoy-ai-gateway.yaml`에 적용되는 표준 Envoy 필터 체인:

```yaml
http_filters:
- name: envoy.filters.http.ext_proc
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.ext_proc.v3.ExternalProcessor
    grpc_service:
      envoy_grpc:
        cluster_name: agent_router_ext_proc
    processing_mode:
      request_header_mode: SEND
      response_header_mode: SEND
      request_body_mode: BUFFERED
      response_body_mode: STREAMED
    message_timeout: 0.5s
- name: envoy.filters.http.router
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
```

### 3.2 AgentRouter 코어 엔진 설계 (`backend/app/core/agent_router/`)

1. **`classifier.py` (인텐트 및 복잡도 판별기)**:
   - **프롬프트 메트릭**: 토큰 길이, 코드 블록(```) 여부, SQL/수학 기호, 다단계 추론 키워드("단계별로", "증명", "분석").
   - **도구 호출 탐지**: `tools` 파라미터 또는 Function Calling 스키마 존재 여부.
   - **판별 결과**: `COMPLEXITY_LIGHT` (8B 경량 분기), `COMPLEXITY_HEAVY` (72B 추론 분기), `AGENT_WORKFLOW` (특화 에이전트 체인).

2. **`policy_engine.py` (4대 라우팅 정책)**:
   - `QualityFirst`: 복잡도가 높으면 무조건 고성능 대형 모델로 전송.
   - `LeastCost`: 단순 질의는 초경량 모델로 보내고, 테넌트 예산 80% 초과 시 고비용 모델을 경제형 모델로 강제 다운그레이드.
   - `LatencyOptimized`: 실시간 헬스체크 및 EWMA(지수 이동평균) 지연시간 기준 가장 빠른 인스턴스로 분기.
   - `SelfHealingFallback`: 1차 모델에서 5xx 오류 또는 Timeout 발생 시 0.5초 내 백업 모델 클러스터로 자동 재시도.

3. **`affinity.py` (세션 & KV-Cache 어피니티)**:
   - 클라이언트 요청의 `x-session-id` 또는 프롬프트 접두사 해시(`x-prompt-hash`)를 계산하여, vLLM의 Prefix Caching이 유지된 특정 워커 노드로 일관 라우팅.

### 3.3 xDS 동적 제어 평면 연동 (`xds_generator.py`)
- AgentRouter에서 동적으로 도출한 클러스터 목록과 헤더 매칭 규칙을 Envoy의 Dynamic RouteConfiguration 규격으로 실시간 동기화.
- 업스트림 서빙 모델 상태(Healthy/Unhealthy)를 모니터링하여 가용하지 않은 모델을 라우팅 풀에서 즉시 배제.

---

## 4. 구현 및 마이그레이션 작업 분할 (WBS)

| 단계 | 구분 | 상세 작업 내용 | 대상 파일 |
| :--- | :--- | :--- | :--- |
| **Step 1** | 인프라 | Envoy AI Gateway `ext_proc` 설정 템플릿 및 포트 정의 | `deploy/envoy/envoy-ai-gateway.yaml`, `docker-compose.yml` |
| **Step 2** | 백엔드 | `ext_proc` gRPC 서버 및 OpenAI 스키마 검증기 구현 | `backend/app/core/ext_proc_server.py` |
| **Step 3** | 백엔드 | AgentRouter 인텐트/복잡도 분류기 및 정책 엔진 개발 | `backend/app/core/agent_router/*.py` |
| **Step 4** | 백엔드 | 토큰 기반 레이트 리미팅(TPM) 및 TTFT 메트릭 방출 연동 | `backend/app/core/token_limiter.py`, `telemetry_hub.py` |
| **Step 5** | 프론트 | 라우팅 탭 내 AgentRouter 정책 제어 및 인텐트 모니터링 UI | `frontend/src/components/RoutingTab.jsx` |
| **Step 6** | 검증 | 단위/통합 테스트 및 자동화 검증 스크립트 작성 | `backend/tests/test_agent_router.py`, `scripts/verify-phase0_1.sh` |

---

## 5. 완료 정의 및 검증 기준 (Definition of Done: DoD)

1. **`ext_proc` gRPC 통신 무결성**:
   - Envoy L7 ➔ `ext_proc` ➔ Envoy ➔ Upstream vLLM 파이프라인의 엔드투엔드 레이턴시 오버헤드가 **2ms 이하** 유지.
2. **지능형 라우팅 분기 검증**:
   - 단순 텍스트 질의 인입 시 `cluster_fast_8b`로 분기, 코딩/추론 질의 인입 시 `cluster_reasoning_72b`로 자동 분기 확인.
3. **토큰 단위 레이트 리미팅 (TPM)**:
   - 가상키 토큰 한도 초과 시 Envoy 레벨에서 즉각 HTTP 429 반환 확인.
4. **자동화 검증 스크립트 통과**:
   - `bash aiorche/scripts/verify-phase0_1.sh` 실행 시 100% PASS 증적 확보.
   - `make test` 기존 테스트 스위트 회귀 제로(All PASS).
