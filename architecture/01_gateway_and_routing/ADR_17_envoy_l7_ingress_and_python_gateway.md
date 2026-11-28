# ADR-17: Envoy L7 인그레스 역방향 프록시와 Python FastAPI 인텔리전트 게이트웨이의 역할 분리

- **상태**: 승인됨 (Accepted)
- **일자**: 2026-11-07
- **결정자**: Ordinatio 아키텍처 팀
- **관련 문서**: [PRE_01_dashboard_engineering_plan.md](file:///Users/jason/project/오케스트레이터/architecture/PRE_01_dashboard_engineering_plan.md), [PRE_05_dynamic_routing_and_xds.md](file:///Users/jason/project/오케스트레이터/architecture/PRE_05_dynamic_routing_and_xds.md), [PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md](file:///Users/jason/project/오케스트레이터/architecture/PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md)

---

## 1. 배경 및 문제 제기 (Context)

초기 아키텍처 청사진에서는 Envoy 프록시가 분산 gRPC ADS(Aggregated Discovery Service) 서버로부터 라우팅 테이블(RDS/CDS)을 실시간 수신하고, 모든 트래픽 인터셉트를 `ext_proc`(외부 gRPC 프로세싱) 필터에 위임하여 PII 마스킹, 가상 키 인증, 시스템 프롬프트 주입을 처리하는 완전 분산형 서비스 메시 구조를 설계하였습니다.

그러나 **100% 고객 자율 운영형 폐쇄망(Air-Gapped) 어플라이언스** 환경에서는 다음과 같은 중대한 엔지니어링 한계가 식별되었습니다:
1. **분산 컴포넌트 복잡도 과다**: 무거운 Go/Java 기반 xDS 제어 평면 데몬(`go-control-plane`)과 별도의 gRPC ext-proc 사이드카 프로세스는 폐쇄망 고객사 인프라에 불필요한 리소스(RAM 2GB+ 추가 소모)와 장애 지점(SPOF)을 만듭니다.
2. **트랜잭션 일관성 및 에어갭 디버깅 난이도**: Envoy gRPC ext-proc 단계에서 발생하는 PII 감지 오류나 과금 누락 발생 시, 분산 추적(Distributed Tracing) 인프라가 미비한 폐쇄망 환경에서 운영팀의 원인 규명이 극도로 어렵습니다.
3. **이종 모델 백엔드 프로토콜 정규화 한계**: vLLM, Ollama, Triton, SGLang, 사내 자체 호스팅 모델마다 제각각인 API 응답 스펙과 파라미터를 Envoy C++ L7 필터만으로 처리하는 데 한계가 존재합니다.

---

## 2. 아키텍처 결정 (Decision)

본 어플라이언스는 **Envoy L7 인그레스 역방향 프록시**와 **Python FastAPI 인텔리전트 제어 평면 게이트웨이** 간의 명확한 역할 분리 모델을 공식 채택합니다:

```
[클라이언트 앱 / 사내 시스템]
        │
        ▼ (포트 10000: TLS 종단, Rate Limit, Access Log)
┌────────────────────────────────────────────────────────┐
│  Envoy L7 Ingress Gateway (C++)                        │
│  - 표준 인그레스 엔드포인트: /v1/*, /api/*             │
│  - 고성능 커넥션 풀링, HTTP/2 종단, L4/L7 DDoS 방어  │
│  - Upstream 클러스터: backend_service (127.0.0.1:8000)  │
└────────────────────────────────────────────────────────┘
        │ (역방향 프록시 / 내부 초저지연 통신)
        ▼
┌────────────────────────────────────────────────────────┐
│  Ordinatio Core Gateway (FastAPI / Python)       │
│  1. 인지형 동적 라우팅 (Cognitive Routing & Splitter)  │
│     - 테넌트 쿼터, 가상 키(Argon2id) 인라인 인증      │
│     - 모델 가용성, 헬스 프로빙, 지연시간 기반 분할   │
│  2. 인라인 가드레일 (ext-proc 역할 통합)               │
│     - 초경량 정규식 PII 감지 및 마스킹 (<2ms)          │
│     - 동적 시스템 프롬프트(페르소나/가이드라인) 주입   │
│  3. FinOps & 감사 무결성                               │
│     - 동기식 원자적 토큰 계량 및 월간 예산 차단       │
│     - WORM SHA-256 감사 로그 불변 기록                │
│  4. 멀티 프로바이더 어댑터                             │
│     - vLLM, Ollama, Triton, SGLang, OpenAI 표준화      │
│  5. xDS 설정 생성기 (`xds_generator.py`)               │
│     - 라우팅 정책 변경 시 Envoy RDS/CDS 아티팩트 발행 │
└────────────────────────────────────────────────────────┘
        │
        ▼ (업스트림 추론 호출)
[사내 프라이빗 LLM 서빙 클러스터: vLLM / Ollama / Triton / K8s GPU Pools]
```

### 세부 역할 분담
1. **Envoy 역할 (L7 Ingress & Traffic Management)**:
   - 외부/사내 트래픽의 단일 진입점(포트 10000)으로서 TLS 종단 및 정적 라우팅 수행.
   - 대규모 동시 연결 관리, HTTP keep-alive, 기본 버퍼링 및 네트워크 레벨 보호.
   - REST RDS v3 엔드포인트(`/api/v1/xds/v3/discovery:routes`)를 통한 무중단 라우트 리비전 동기화 지원.
2. **FastAPI 게이트웨이 역할 (`gateway.py`)**:
   - 가상 API Key(`sk-ord-...`) 유효성 검증 및 테넌트 하드캡(Hard Cap) 차단.
   - 인라인 PII 검사 및 마스킹 (`pii_engine.py`).
   - 시스템 프롬프트 동적 합성 및 주입.
   - 가중치 기반 카나리 분할, 조건부 헤더 매칭, 폴백 페일오버 실행.
   - 업스트림 서빙 백엔드로의 비동기 HTTP 요청 디스패치 및 스트리밍 중계.
   - WORM 불변 감사 로그(`audit_logs`) 및 FinOps 계량 기록.

### PII 마스킹 적용 범위 (Masking Scope Invariant)

본 ADR의 역할 분리에 따라 **PII 탐지·마스킹의 유일한 집행 지점은 제어 평면 게이트웨이**입니다.

| 경로 | PII 마스킹 | 비고 |
|---|---|---|
| Envoy(:10000) → `backend_service` → `/v1/chat/completions` | **적용** | `dispatch_chat_completion` 0.6단계. 운영 추론 트래픽 전량이 이 경로를 통과 |
| `/v1/chat/completions` 직접 호출 | **적용** | 동일 함수 |
| `app/core/ext_proc_server.py` (`/api/v1/ext-proc/process`) | **미적용** | 라우팅 결정·TPM 쿼터·프롬프트 주입 전용. 업스트림 추론을 수행하지 않으므로 모델로의 PII 유출 경로가 아님 |

`deploy/envoy/envoy-ai-gateway.yaml`의 `envoy.filters.http.ext_proc` 필터는 **의도적으로 비활성(주석) 상태**이며, Envoy는 평문 `router` 필터로만 동작합니다. 이 전제가 유지되는 동안 마스킹을 우회하여 모델에 도달하는 경로는 존재하지 않습니다.

**변경 시 필수 조건**: ext_proc 필터를 활성화하여 해당 어댑터가 추론 트래픽을 직접 인터셉트·전달하도록 바꾸는 경우, 그 이전에 `ext_proc_server.py`에 `PiiEngine.mask_conversation()` 호출, BLOCK 시 `REJECT`(403) 처리, `record_pii_audit()` 기록을 구현해야 합니다. 동일 경고가 해당 소스 모듈 docstring과 Envoy 설정 파일 주석에 명시되어 있습니다.

### 마스킹 적용 대상 (Coverage)

요청 측은 **대화 전체**를 대상으로 합니다 — 마지막 user 메시지만이 아니라 이전 턴 user·assistant·system 메시지, `tool_result` 블록, 도구 호출 인자(`input`/`arguments`)의 모든 텍스트 리프를 포함합니다. 이미지 base64(`source.data`)와 프로토콜 식별자(`tool_use_id`, `id`, `name`)는 대상에서 제외하여 멀티모달 데이터 손상과 대화 프로토콜 파손을 방지합니다.

응답 측은 업스트림 completion(OpenAI `choices[].message`, Anthropic `content`, `tool_calls[].function.arguments`)을 검사하여 모델이 학습 데이터·RAG 컨텍스트에서 PII를 재출력하는 경로를 차단합니다. **시맨틱 캐시 적재 이전**에 수행하여 마스킹되지 않은 PII가 캐시에 영구 저장되지 않도록 보장합니다. 응답 측 BLOCK은 요청 측과 달리 해당 구간만 인라인 치환합니다(이미 발생한 추론 비용 보존).

마스킹은 **시스템 프롬프트 자동 주입보다 먼저** 수행됩니다. 거버넌스 가드레일 문구가 정규식에 걸려 변형되면 보안 정책 자체가 손상되기 때문입니다.

---

## 3. 결과 및 영향 (Consequences)

### 긍정적 효과 (Positive)
- **에어갭 배포 단순성**: 별도의 Go 데몬이나 ext-proc 프로세스 없이 단일 백엔드 컨테이너로 모든 인공지능 오케스트레이션 로직 완결.
- **초저지연 인라인 처리**: 네트워크 홉(Hop) 및 gRPC 마샬링 오버헤드를 제거하여 엔드-투-엔드 추론 지연시간 2ms 이내 단축.
- **완벽한 데이터 무결성**: 가상 키 인증, PII 마스킹, 토큰 과금, 감사 로그 기록이 단일 ACID DB 트랜잭션 수명주기 내에서 원자적으로 보장.

### 고려사항 및 완화 방안 (Trade-offs & Mitigations)
- **CPU 집약적 작업 부하**: PII 정규식 및 시스템 프롬프트 조작이 Python 프로세스 내에서 수행되므로, 고부하 환경에서는 Uvicorn 멀티 워커 프로세스(`--workers N`) 또는 K8s HPA를 통해 수평 스케일아웃을 지원합니다.

