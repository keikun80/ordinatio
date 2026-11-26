# Ordinatio: 시스템 프롬프트 거버넌스 및 동적 인라인 주입 구현 및 검증 결과서 (PRE-20)

> **문서 상태**: 최종 완료 (Final / DoD Passed)  
> **최초 작성일**: 2026-09-25  
> **관련 설계서**: [`PRE_19_system_prompt_governance_and_dynamic_injection_plan.md`](file:///Users/jason/project/오케스트레이터/architecture/PRE_19_system_prompt_governance_and_dynamic_injection_plan.md)  
> **아키텍처 불변성**: 100% 에어갭 자립성 준수, L7 Envoy ext_proc 스트림 변조, Argon2id 가상키 / 라우팅 정책 / 테넌트 1:1 바인딩 지원

---

## 1. 개요 및 목적
본 결과서는 LLM 호출 시 기업 표준 가드레일, 페르소나 및 보안 지침을 클라이언트 코드 수정 없이 게이트웨이 레벨에서 자동 합성하는 **"시스템 프롬프트 거버넌스 및 동적 인라인 주입(Dynamic System Prompt Injection) 시스템"**의 5단계 엔지니어링 구현 및 검증 결과를 요약합니다.

사용자 정의 요구사항에 따라 등록된 시스템 프롬프트는 **[라우팅 정책 (ROUTE) / 가상 API Key (VIRTUAL_KEY) / 테넌트 (TENANT) / 전사 공통 (GLOBAL)]** 중 하나에 1:1로 유연하게 바인딩되며, 위계적 우선순위에 따라 게이트웨이 및 API 테스트벤치에서 무중단 자동 합성됩니다.

---

## 2. 5단계 구현 상세 내역

### Phase 1: DB 스키마 및 영속 계층 구현 (완료)
- **SQLAlchemy ORM 모델 (`app/models/system_prompt.py`)**:
  - `prompt_id` (PK, String(64)), `name`, `description`, `content` (Text), `target_type` (ROUTE, VIRTUAL_KEY, TENANT, GLOBAL), `target_id`, `target_name`, `injection_mode` (PREPEND, OVERRIDE, FALLBACK_ONLY), `estimated_tokens`, `is_active`, `created_at`, `updated_at`.
- **Pydantic V2 스키마 (`app/schemas/system_prompt.py`)**:
  - `SystemPromptCreate`, `SystemPromptUpdate`, `SystemPromptResponse`, `SystemPromptResolveRequest`, `SystemPromptResolveResponse`.
- **초기 시드 템플릿 자동화 (`app/db/init_db.py`, `tests/conftest.py`)**:
  - `sp-global-guardrail` (전사 공통 보안 가드레일, GLOBAL)
  - `sp-wm-advisor` (PB 자산관리 어드바이저, ROUTE: `financial-advisor-v1`)
  - `sp-route-code` (시니어 파이썬 엔지니어 지침, ROUTE: `code-assistant-v1`)
- **단위 테스트 통과**: `tests/test_phase1_system_prompt_schema.py` (4/4 통과).

### Phase 2: RESTful 거버넌스 API 및 우선순위 시뮬레이터 (완료)
- **API 엔드포인트 (`app/api/v1/endpoints/system_prompts.py`)**:
  - `GET /api/v1/system-prompts`: 프롬프트 목록 조회 (target_type 필터링 지원).
  - `POST /api/v1/system-prompts`: 신규 프롬프트 등록 및 한국어/영어 가중 토큰 자동 산출.
  - `GET /api/v1/system-prompts/{prompt_id}`: 단일 프롬프트 상세 조회.
  - `PUT /api/v1/system-prompts/{prompt_id}`: 프롬프트 정보, 타겟 바인딩 및 주입 모드 수정.
  - `DELETE /api/v1/system-prompts/{prompt_id}`: 프롬프트 영구 삭제.
  - `POST /api/v1/system-prompts/resolve`: 런타임 우선순위 시뮬레이션 엔드포인트.
- **라우터 등록**: `app/api/v1/api.py` 내 `system_prompts` 라우터 통합.
- **단위 테스트 통과**: `tests/test_system_prompts.py` (5/5 통과).

### Phase 3: L7 AI Gateway ext_proc & 테스트벤치 연동 (완료)
- **코어 주입 엔진 (`app/core/prompt_injector.py`)**:
  - **위계적 우선순위 규칙**: `VIRTUAL_KEY` (1순위) > `ROUTE` (2순위) > `TENANT` (3순위) > `GLOBAL` (4순위).
  - **주입 전략 지원**:
    - `PREPEND`: 기존 클라이언트 system 프롬프트 앞에 사내 규정 선두 결합 (권장).
    - `OVERRIDE`: 클라이언트의 프롬프트 무시하고 사내 표준 프롬프트로 강제 대체.
    - `FALLBACK_ONLY`: 클라이언트 요청에 system 메시지가 없을 경우에만 사내 기본 지침 보충.
- **L7 ext_proc Body Mutation (`app/core/ext_proc_server.py`)**:
  - Envoy를 통과하는 OpenAI 호환 스트림 페이로드를 가로채 `messages` 배열을 동적으로 변조하고, 게이트웨이 응답 헤더(`x-orche-prompt-injected`, `x-orche-prompt-target`) 부착.
- **라우팅 테스트벤치 실시간 연동 (`app/api/v1/endpoints/routing.py`)**:
  - 대화형 테스트 발송 시 가상키/라우트 기반 프롬프트가 주입되어 LLM(`qwen2.5:0.5b`)에 전달되고, 응답 메타데이터에 주입 정보 포함.
- **통합 테스트 통과**: `tests/test_phase3_prompt_injection.py` (3/3 통과).

### Phase 4: 프론트엔드 UI 거버넌스 포털 및 바인딩 마법사 (완료)
- **API 클라이언트 확장 (`src/api/client.js`)**:
  - 시스템 프롬프트 CRUD 및 `/resolve` 시뮬레이터 함수 구현.
- **네비게이션 연동 (`src/components/Sidebar.jsx`, `src/App.jsx`)**:
  - 사이드바 내 **"시스템 프롬프트 거버넌스"** (`ScrollText` 아이콘, `L7 주입` 뱃지) 메뉴 추가 및 탭 라우팅 연동.
- **거버넌스 포털 UI 컴포넌트 (`src/components/SystemPromptsTab.jsx`)**:
  - **4대 KPI 카드**: 총 등록 프롬프트, 활성 상태, 라우팅 바인딩, 키/테넌트 바인딩 실시간 집계.
  - **타겟 필터 탭**: 전체, 라우팅 정책, 가상 API Key, 테넌트, 전사 공통 필터링.
  - **1:1 바인딩 마법사 모달**:
    - 바인딩 분류(ROUTE, VIRTUAL_KEY, TENANT, GLOBAL) 선택 시 해당 엔티티 목록(라우팅 정책 목록, 발급된 가상키 목록) 동적 로드.
    - 주입 전략(`PREPEND`, `OVERRIDE`, `FALLBACK_ONLY`) 및 실시간 글자수/토큰 카운터 지원.
- **브라우저 E2E 실증 검증 완료**: 등록 모달 오픈, 타겟 선택에 따른 드롭다운 동적 전환 정상 확인.

### Phase 5: DoD 자동화 검증 스크립트 및 통합 리그레션 (완료)
- **자동화 검증 스크립트 작성 (`scripts/verify-phase-system-prompt.sh`)**:
  - [1/4] 필수 스키마, 모델, 주입 엔진, UI 컴포넌트 파일 존재 검증.
  - [2/4] 시스템 프롬프트 타깃 테스트 12종 및 전체 테스트 78종 일괄 통과 검증.
  - [3/4] 프론트엔드 Vite 프로덕션 빌드 무결성 검증.
  - [4/4] 우선순위 및 주입 모드(`PREPEND`, `OVERRIDE`, `FALLBACK_ONLY`) 불변성 검증.
- **결과**: `DoD PASSED (100%)`.

---

## 3. 종합 테스트 결과 매트릭스

| 테스트 분류 | 대상 모듈 | 테스트 케이스 수 | 결과 | 비고 |
| :--- | :--- | :---: | :---: | :--- |
| **Phase 1 단위** | `test_phase1_system_prompt_schema.py` | 4건 | **PASS (100%)** | Pydantic V2 검증, DB CRUD, 시드 데이터 검증 |
| **Phase 2 통합** | `test_system_prompts.py` | 5건 | **PASS (100%)** | REST CRUD API, 토큰 계산, /resolve 시뮬레이터 |
| **Phase 3 L7 게이트웨이** | `test_phase3_prompt_injection.py` | 3건 | **PASS (100%)** | 우선순위 계층, ext_proc 주입, 테스트벤치 연동 |
| **전체 백엔드 회귀** | `backend/tests/` (전체) | 78건 | **PASS (100%)** | FinOps, PII, WORM, xDS, Hotfix 전체 무회귀 검증 |
| **프론트엔드 빌드** | `frontend/` (Vite) | 1,887 모듈 | **SUCCESS** | 프로덕션 번들(444KB js, 21KB css) 빌드 성공 |
| **DoD 스크립트** | `verify-phase-system-prompt.sh` | 4개 단계 | **PASS (4/4)** | 100% 자동화 통과 |

---

## 4. 아키텍처 불변성 준수 체크리스트

- [x] **100% 에어갭/오프라인 자립성**: 외부 인터넷 호출 없이 로컬 DB 및 Envoy L7 내부 필터로 동작.
- [x] **1:1 유연한 타겟 바인딩**: 라우팅 정책(ROUTE), 가상 API Key(VIRTUAL_KEY), 테넌트(TENANT), 전사(GLOBAL) 1:1 연결 지원.
- [x] **명확한 우선순위 체계**: `VIRTUAL_KEY` > `ROUTE` > `TENANT` > `GLOBAL` 체계로 충돌 방지.
- [x] **무중단 주입 전략**: `PREPEND`, `OVERRIDE`, `FALLBACK_ONLY` 3종 모드를 통한 기업 표준 준수 보장.
- [x] **모노레포 표준 준수**: `backend/` (`uv`), `frontend/` (React+Vite Vanilla CSS), `deploy/` 정합성 유지.

---

## 5. 결론 및 향후 과제
본 구현을 통해 고객사 엔터프라이즈 운영팀은 개발팀의 개별 프롬프트 하드코딩이나 변경 없이도, 오케스트레이터 관리 화면에서 시스템 프롬프트를 등록하고 라우팅 정책이나 특정 부서의 가상키에 즉각 바인딩하여 전사 AI 거버넌스를 완벽히 통제할 수 있게 되었습니다.

---

## 6. 후속 보정 (Addendum, 2026-11-26)

본문 §2~§3 은 최초 구현 시점(2026-09-25)의 기록이며, 이후 소스 코드 전수 조사에서 발견된
결함 보정 및 기능 보완이 반영되었습니다. 아래 내용이 현재의 사실입니다.

### 6.1 본문 기재 내용 정정
- **시드 바인딩 정정**: §2 Phase 1 의 "`sp-wm-advisor` (ROUTE: `financial-advisor-v1`)",
  "`sp-route-code` (ROUTE: `code-assistant-v1`)" 는 사실과 다릅니다. 실제 시드
  (`app/db/init_db.py`, `tests/conftest.py`)는 다음과 같습니다.
  - `sp-global-guardrail` → `GLOBAL`
  - `sp-wm-advisor` → `TENANT` / `dept-wm`
  - `sp-route-code` → `ROUTE` / `code-copilot-v2`
- **테스트 건수 정정**: §3 의 "78건" 은 당시 수치이며 현재 전체 백엔드 스위트는 약 150건입니다.
  DoD 스크립트는 더 이상 고정 건수를 단정하지 않고 pytest 종료코드에 위임합니다.
- **`SCR-SP-M02` 정정**: §2 Phase 4 의 "1:1 바인딩 마법사 모달" 은 `SCR-SP-M01`(등록/수정 모달)에
  해당합니다. `SCR-SP-M02` 는 주입 시뮬레이터입니다. 별도의 바인딩 마법사 화면과 `/bindings` API 는
  존재하지 않으며(바인딩은 프롬프트 레코드에 인라인된 1:1 모델), 이 사실은 `PRE_23` §3.4 에 명시되었습니다.

### 6.2 결함 보정 내역
| 구분 | 내용 |
| :--- | :--- |
| 검증 게이트 | `verify-phase-system-prompt.sh` 가 `FAILED` 플래그를 평가하지 않아 테스트/빌드 실패 시에도 `DoD PASSED` + exit 0 을 반환했던 문제 수정 (거짓 통과) |
| 바인딩 검증 우회 | `target_name` 입력으로 타겟 존재 검증을 건너뛸 수 있던 구멍 차단. 이제 `_validate_and_enrich_target()` 이 항상 수행되고 `target_name` 입력값은 무시됨 |
| 중복 활성 검증 | 정규화된 `target_id`(ROUTE 는 route_name) 기준으로 검사하도록 순서 변경. `policy_id` 로 전달된 경우에도 중복이 탐지됨 |
| 타겟명 캐시 | 목록 조회 시 동기화한 `target_name` 을 영속화. 미영속 시 서버사이드 `search` 가 낡은 컬럼을 조회해 이름 변경된 타겟이 검색에서 누락되던 불일치 해소 |
| 감사 기록 무음 | `except: pass` 제거 → ERROR 로깅 + `x-orche-audit-degraded: true` 응답 헤더로 노출 |
| 참조 정합성 | 라우트/가상키/테넌트 삭제 시 바인딩된 프롬프트가 있으면 400 차단, `force=true` 시 비활성화 후 `PROMPT_ORPHANED` 감사 기록 (`app/core/prompt_bindings.py`) |
| 토큰 추정 parity | FE/BE 구현 불일치(`'abc한글def'` → BE 4 / FE 5) 해소. FE 로직을 `frontend/src/utils/tokenEstimate.js` 로 추출하고 공용 벡터(`backend/tests/fixtures/token_vectors.json`)로 DoD 스크립트 [5/5] 단계에서 양측을 비교 |

### 6.3 기능 보완 내역
| 기능 | 내용 |
| :--- | :--- |
| 서버사이드 페이지네이션 | 프론트가 `offset`/`limit`/`target_type`/`search` 를 서버로 전달. 이전에는 클라이언트 필터링이어서 프롬프트 100건 초과 시 목록·KPI·검색이 조용히 잘렸음 |
| KPI 집계 분리 | `GET /api/v1/system-prompts/stats` 신규. 페이지 응답만으로 전사 집계를 계산하던 왜곡 제거 |
| 버전 이력 및 복원 | `system_prompt_versions` 테이블 + `GET /{id}/versions`, `POST /{id}/versions/{snapshotId}/restore` 신규. 복원은 비파괴(append-only) 방식으로 새 버전을 생성. UI 는 `SCR-SP-M04` 이력 모달 |
| 버전 증가 규칙 | 활성 토글만으로는 `version` 을 증가시키지 않고 `change_kind=ACTIVATE/DEACTIVATE` 이력만 기록 |
| 동적 변수 UX | `SUPPORTED_PROMPT_VARIABLES` 단일 진실 공급원 + `GET /api/v1/system-prompts/variables` + 에디터 변수 칩 삽입 및 미지원 변수 경고 |
| 분류 / 식별 코드 | `category`(SECURITY/COMPLIANCE/PERSONA) 컬럼 및 등록 시 `prompt_id` 직접 지정 UI 추가 (`PRE_23` 명세 항목 구현) |
| 명세 드리프트 차단 | `scripts/verify-ui-taxonomy.sh` 신규 (`make verify-ui-taxonomy`). `PRE_23` §3.4 의 testid·엔드포인트와 구현을 기계적으로 대조 |
