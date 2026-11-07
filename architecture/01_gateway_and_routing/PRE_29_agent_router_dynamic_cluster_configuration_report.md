# PRE-29: AgentRouter 동적 Envoy 업스트림 클러스터 사용자 구성 및 시스템 하드코딩 제거 구현 보고서

## 1. 개요 및 배경 (Context & Problem Statement)

### 1.1 배경 및 문제점
기존 AgentRouter 및 2-Tier L7 AI Gateway 분기 시스템에서는 Envoy 업스트림 클러스터 식별자로 `cluster_vllm_fast_8b`, `cluster_vllm_reasoning_72b`, `cluster_vllm_inference_pool` 등의 고정된 문자열이 백엔드 상태 API 응답 및 프론트엔드 UI 라벨에 하드코딩되어 있었습니다.

이로 인해 다음과 같은 치명적인 한계가 존재했습니다:
1. **폐쇄망 온프레미스 인프라 비호환**: 고객사 환경마다 Envoy xDS 클러스터 명명 규칙(예: `cluster_ollama_internal`, `cluster_tgi_heavy`, `cluster_vllm_gpu_pool_a`)이 상이함에도 이를 사용자가 자유롭게 입력하거나 변경할 수 없었습니다.
2. **시스템 불변값 강제**: 프론트엔드 모달에서 고정 텍스트 `<span style={{ ... }}>클러스터: cluster_vllm_reasoning_72b</span>`로만 표시되어 사용자의 제어 권한이 차단되었습니다.

### 1.2 사용자 요구사항
> "클러스터: cluster_vllm_reasoning_72b , 클러스터: cluster_vllm_fast_8b와 같이 동적으로 변경이 안되거나 사용자가 입력할 수 없는 시스템 값은 없어야해"

---

## 2. 핵심 변경 내용 및 아키텍처 구현 (Engineering Implementation)

### 2.1 백엔드 동적 클러스터 유도 및 정책 엔진 개선 (`policy_engine.py`)
- **`derive_cluster_name(model_name, default_fallback)` 헬퍼 구현**:
  - 모델 이름으로부터 Envoy 클러스터 식별자를 동적으로 자동 유도 (`cluster_{sanitized_model_name}`).
  - 사용자가 명시적으로 클러스터명을 지정하지 않은 경우에도 하드코딩된 상수 대신 선택한 모델에 맞춘 클러스터 식별자를 생성.
- **`evaluate_route()` 다형성 확장**:
  - `policy_config: Optional[Dict[str, Any]] = None` 매개변수를 추가하여 DB/캐시에 저장된 사용자의 실시간 클러스터 및 모델 설정을 우선 반영.
  - `QualityFirst`: `cfg.get("reasoning_cluster")`, `cfg.get("fast_cluster")` 동적 적용.
  - `LeastCost`: `cfg.get("economic_cluster")`, `cfg.get("standard_cluster")` 동적 적용.
  - `LatencyOptimized`: `cfg.get("fast_cluster")`, `cfg.get("reasoning_cluster")` 동적 적용.
  - `SelfHealingFallback`: `cfg.get("fallback_cluster")`, `cfg.get("secondary_fallback_cluster")` 동적 적용.
  - 클라이언트의 명시적 모델 요청(Explicit Override) 시에도 사용자 정책에 등록된 클러스터 또는 동적 파생 클러스터를 자동 타깃팅.

### 2.2 라우팅 API 엔드포인트 현행화 (`routing.py`)
- **`GET /api/v1/routing/agent-router/status`**:
  - `agent_router_policies` 테이블에서 활성화된 정책 설정을 실시간 조회하여 `default_tiers` 딕셔너리의 `cluster` 값을 반환하도록 수정.
- **`POST /api/v1/routing/agent-router/simulate`**:
  - DB 세션을 주입받아 사용자가 수정한 활성 정책 설정을 실시간으로 로드하여 경로 결정을 시뮬레이션하도록 구현.

### 2.3 프론트엔드 UI 모달 및 실시간 관제 현행화 (`RoutingTab.jsx`)
- **하드코딩된 정적 라벨 전면 제거 및 편집용 `<input type="text">` 도입**:
  - **QualityFirst 탭**:
    - `심층 추론·코딩 전용 고성능 모델` 선택 박스 + `Envoy 업스트림 클러스터 식별자` 입력 필드 (`reasoning_cluster`)
    - `일반 대화 및 단순 질의 모델` 선택 박스 + `Envoy 업스트림 클러스터 식별자` 입력 필드 (`fast_cluster`)
  - **LeastCost 탭**:
    - `다운티어링할 경제형 모델` + `경제형 업스트림 클러스터` 입력 필드 (`economic_cluster`)
    - `표준 고성능 모델` + `표준형 업스트림 클러스터` 입력 필드 (`standard_cluster`)
  - **LatencyOptimized 탭**:
    - `초저지연 최우선 처리 모델` + `초저지연 업스트림 클러스터` 입력 필드 (`fast_cluster`)
    - `심층 추론 허용 시 모델` + `심층 추론 업스트림 클러스터` 입력 필드 (`reasoning_cluster`)
  - **SelfHealingFallback 탭**:
    - `1차 장애 시 자동 절체 모델` + `1차 폴백 업스트림 클러스터` 입력 필드 (`fallback_cluster`)
    - `2차 예비 모델` + `2차 폴백 업스트림 클러스터` 입력 필드 (`secondary_fallback_cluster`)
- **헤더 배지 동적화**:
  - 기존 정적 텍스트 `"Fast 8B Tier"`, `"Reasoning 72B Tier"` 대신 서버에서 응답받은 실제 동적 클러스터명(`agentRouterStatus.default_tiers.*.cluster`)을 툴팁 및 배지 레이블로 실시간 렌더링.

### 2.4 인텐트 분석 결과 카드 메뉴의 대화형 수동 에디트(Manual Override) 구현
- **판정된 복잡도 (Complexity)**: 정적 텍스트를 대화형 드롭다운으로 교체하여 `LIGHT`, `STANDARD`, `REASONING_HEAVY` 간 즉시 수동 재분류 가능.
- **디스패치 모델 티어**: `fast_8b`, `reasoning_72b`, `fallback`, `agent_worker` 간 실시간 재할당 드롭다운 구현.
- **선택된 타깃 모델**: 서빙 모델 풀에 등록된 모델 전체 목록 드롭다운 연동 및 선택 시 클러스터 식별자 자동 동기화.
- **Envoy 업스트림 클러스터**: 자유로운 텍스트 입력 지원으로 임의의 xDS 클러스터 지정 가능.
- **수동 에디트 모드 활성 뱃지 및 액션 컨트롤**:
  - 사용자 값 수정 감지 시 `✏️ 수동 에디트 모드 활성 (Manual Override)` 경보 뱃지 노출.
  - `🔄 초기 분석값 복원`: AI 초기 자동 분류 상태로 즉시 롤백 기능.
  - `🚀 테스트벤치에 적용`: 선택한 타깃 모델 및 프롬프트를 하단 L7 Envoy 실시간 테스트벤치로 원클릭 자동 주입 및 테스트 연계.

### 2.5 meta-llama 하드코딩 제거 및 모델 카탈로그(ModelCatalog) 동적 바인딩
- **문제점**: 초기 시드 데이터(`init.sql`) 및 기본 상수(`DEFAULT_POLICIES_CONFIG`)에 `meta-llama/Llama-3.1-70B-Instruct`, `meta-llama/Llama-3.1-8B-Instruct`가 고정 지정되어 있어, 고객사가 등록한 실제 모델(`deepseek-ai/deepseek-v4.1-flash`, `gemma2:2b`) 대신 시뮬레이터 결과에 미등록 모델이 노출되는 결함 식별.
- **조치 사항**:
  1. `agent_router_policies` DB 테이블의 4개 정책 설정을 고객사 활성 모델(`deepseek-ai/deepseek-v4.1-flash`, `gemma2:2b`)로 정규화.
  2. `policy_manager.py`의 `get_all_policies`에서 `ModelCatalog`를 실시간 조회하여 레거시 `meta-llama` 잔재 발견 시 활성 모델 카탈로그의 대표 모델로 자동 마이그레이션 및 커밋하도록 자동 정제 로직 구축.
  3. `RoutingTab.jsx`의 정책 모달 내 모든 드롭다운에 미등록 모델 감지 시 `⚠️ 미등록 모델` 경고 옵션 렌더링 및 사용자가 직접 등록 모델 중 선택하도록 보완.

---

## 3. 검증 결과 (Verification & Test Results)

### 3.1 백엔드 전체 회귀 테스트 통과
- **테스트 명령**: `uv run pytest`
- **결과**: **85/85 ALL PASS (100% 무결성 통과)**
  - `tests/test_agent_router.py`: 11개 전 단위 테스트 통과 (시뮬레이터, 상태 API, CRUD, L7 헤더 주입, 세션 어피니티).
  - RBAC, 가상 키 관리, PII 거버넌스, 라이프사이클 전 테스트 무결성 통과.

### 3.2 프론트엔드 빌드 검증
- **빌드 명령**: `npm run build`
- **결과**: **0 Error, Vite 프로덕션 빌드 성공 및 Docker 컨테이너 무중단 재배포 완료**

---

## 4. 결론
시스템 내에 사용자가 변경할 수 없던 고정 클러스터 식별자와 하드코딩된 `meta-llama` 모델이 완전히 제거되었으며, 고객사 관리자는 온프레미스 인프라 환경의 실제 서빙 모델 풀 및 Envoy 업스트림 클러스터명에 맞추어 100% 자율적으로 구성·운영할 수 있게 되었습니다.

