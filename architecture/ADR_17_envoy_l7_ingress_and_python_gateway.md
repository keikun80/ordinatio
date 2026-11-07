# ADR-17: Envoy L7 인그레스 역방향 프록시와 Python FastAPI 인텔리전트 게이트웨이의 역할 분리

- **상태**: 승인됨 (Accepted)
- **일자**: 2026-11-07
- **결정자**: AI Orchestrator 아키텍처 팀
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
│  AI Orchestrator Core Gateway (FastAPI / Python)       │
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
   - 가상 API Key(`sk-orch-...`) 유효성 검증 및 테넌트 하드캡(Hard Cap) 차단.
   - 인라인 PII 검사 및 마스킹 (`pii_engine.py`).
   - 시스템 프롬프트 동적 합성 및 주입.
   - 가중치 기반 카나리 분할, 조건부 헤더 매칭, 폴백 페일오버 실행.
   - 업스트림 서빙 백엔드로의 비동기 HTTP 요청 디스패치 및 스트리밍 중계.
   - WORM 불변 감사 로그(`audit_logs`) 및 FinOps 계량 기록.

---

## 3. 결과 및 영향 (Consequences)

### 긍정적 효과 (Positive)
- **에어갭 배포 단순성**: 별도의 Go 데몬이나 ext-proc 프로세스 없이 단일 백엔드 컨테이너로 모든 인공지능 오케스트레이션 로직 완결.
- **초저지연 인라인 처리**: 네트워크 홉(Hop) 및 gRPC 마샬링 오버헤드를 제거하여 엔드-투-엔드 추론 지연시간 2ms 이내 단축.
- **완벽한 데이터 무결성**: 가상 키 인증, PII 마스킹, 토큰 과금, 감사 로그 기록이 단일 ACID DB 트랜잭션 수명주기 내에서 원자적으로 보장.

### 고려사항 및 완화 방안 (Trade-offs & Mitigations)
- **CPU 집약적 작업 부하**: PII 정규식 및 시스템 프롬프트 조작이 Python 프로세스 내에서 수행되므로, 고부하 환경에서는 Uvicorn 멀티 워커 프로세스(`--workers N`) 또는 K8s HPA를 통해 수평 스케일아웃을 지원합니다.

