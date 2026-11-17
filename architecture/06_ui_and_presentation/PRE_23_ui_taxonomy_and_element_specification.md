# AI 오케스트레이터 화면 요소 및 기능 식별 표준 명세서 (UI Taxonomy & Element Specification)
## Software Engineering Standard for UI Identifiers, Screen Taxonomy & E2E Test Locators

본 문서는 AI 오케스트레이터 관리 포털(Admin Dashboard) 내의 모든 **화면, 섹션, 기능, 대화형 UI 요소(버튼, 입력창, 슬라이더, 테이블, 모달 등)**를 개발자, 운영자, QA 엔지니어, 고객사 담당자가 혼선 없이 정확하게 지칭하고, E2E 자동화 테스트(Playwright/Selenium) 및 감사 추적에서 식별하기 위한 **UI 정보 아키텍처 및 식별자 표준 규격서**입니다.

---

## 1. 개요 및 수립 배경

### 1.1 해결하고자 하는 문제 (Problem Statement)
1. **지칭의 모호성**: "라우팅 화면 중간에 있는 모델 가중치 슬라이더", "가상키 팝업에서 두 번째 입력창" 등 시각적/위치적 구두 표현에 의존하여 결함 보고, 요구사항 변경, 매뉴얼 작성 시 소통 비용 증가.
2. **E2E 테스트 취약성**: DOM 내 고유 식별자(`data-testid`) 부재로 인해 CSS 클래스나 DOM 깊이에 의존하는 불안정한 셀렉터 사용 불가피.
3. **운영 감사 및 지원 추적성 부족**: 장애 발생 시 사용자가 조작한 정확한 화면 코드(`ScreenID`)와 기능 코드(`FunctionID`)를 로그/티켓에 남기기 어려움.

### 1.2 4대 표준화 원칙 (4 Standardization Pillars)
```
┌────────────────────────────────────────────────────────────────────────────────┐
│                   UI 요소 및 기능 식별 표준화 4대 축 (Taxonomy Matrix)           │
├─────────────────────┬─────────────────────┬─────────────────────┬──────────────┤
│ 1. 화면 계층 ID     │ 2. 기능 동작 ID     │ 3. DOM 테스트 ID     │ 4. 시각적 인스펙터│
│ (Screen ID)         │ (Function ID)       │ (data-testid)       │ (Dev Inspector)│
│  SCR-[TAB]-[SEC]    │  FNC-[TAB]-[ACTION] │  [tab]-[sec]-[type] │ Ctrl+Shift+D  │
│  ex) SCR-RT-02      │  ex) FNC-RT-DEPLOY  │  ex) rt-btn-deploy  │ 실시간 오버레이│
└─────────────────────┴─────────────────────┴─────────────────────┴──────────────┘
```

---

## 2. 식별자 명명 규칙 (Naming Conventions)

### 2.1 화면 코드 (Screen ID: `SCR-*`)
대시보드의 탭 및 주요 모달/하위 뷰를 고유 식별하는 계층형 코드입니다.
* **형식**: `SCR-[TAB_CODE]-[SECTION_NUMBER]`
* **탭 코드(TAB_CODE)**:
  * `COM`: 전역 공통 (Header, Sidebar, Navigation)
  * `OV`: Overview (총괄 관제 대시보드)
  * `VK`: Virtual Keys (거버넌스)
  * `RT`: Routing (동적 라우팅, 가중치 분할기, 장애 우회, xDS 배포)
  * `SP`: System Prompts (시스템 프롬프트 거버넌스 및 동적 인라인 주입)
  * `FO`: FinOps (비용 계량, 모델 단가, 하드 캡)
  * `CP`: Compliance & PII (개인정보 마스킹, WORM 감사 추적)
  * `LC`: Appliance Lifecycle (에어갭 패치, 자가진단, 서포트 번들)
  * `PS`: Prompt Studio (프롬프트 시뮬레이터 및 모델 튜닝)

### 2.2 기능 코드 (Function ID: `FNC-*`)
사용자 인터랙션에 의해 백엔드 API 호출, 상태 변환, 배포 트리거를 발생시키는 비즈니스 액션 코드입니다.
* **형식**: `FNC-[TAB_CODE]-[ACTION_NAME]`
* **예시**:
  * `FNC-VK-ISSUE`: 신규 가상키 발급
  * `FNC-VK-REVOKE`: 가상키 즉시 파기
  * `FNC-VK-CREATE-TENANT`: 신규 부서(테넌트) 등록
  * `FNC-RT-DEPLOY`: Envoy xDS 동적 라우팅 정책 배포
  * `FNC-RT-AUTOBALANCE`: 모델 가중치 균등 분할
  * `FNC-SP-CREATE`: 시스템 프롬프트 카탈로그 신규 등록
  * `FNC-SP-BIND`: 시스템 프롬프트 타겟(ROUTE/KEY/TENANT) 바인딩
  * `FNC-LC-HOTFIX`: 오프라인 패치 번들 서명 검증 및 롤링 핫픽스 실행

### 2.3 DOM 테스트 식별자 (`data-testid`)
Playwright, Cypress 등 E2E 테스트 도구 및 DOM 질의에서 사용하는 고유 속성입니다.
* **형식**: `[tab]-[section]-[element_type]-[semantic_name]`
* **엘리먼트 타입(element_type) 약어 표준**:
  * `btn`: 버튼 (`<button>`)
  * `input`: 입력 필드 (`<input type="text|number|password">`)
  * `textarea`: 다중 행 입력 (`<textarea>`)
  * `select`: 드롭다운 선택상자 (`<select>`)
  * `slider`: 범위 슬라이더 (`<input type="range">`)
  * `toggle`: 토글 스위치 / 체크박스 (`<input type="checkbox">`)
  * `table`: 데이터 테이블 (`<table>`)
  * `row`: 테이블 행 (`<tr>`)
  * `card`: 요약 카드 / 통계 패널 (`<div>`)
  * `modal`: 팝업 대화상자 (`<div>`)
  * `badge`: 상태 뱃지 (`<span>`)
  * `tab`: 탭 전환 네비게이션 버튼 (`<button>`)

---

## 3. 화면별 전수 UI 인벤토리 (Complete UI Inventory)

### 3.1 [COM] 공통 내비게이션 및 헤더 (`SCR-COM-*`)
| Screen ID | Element/Test ID (`data-testid`) | 요소 형태 | 공식 명칭 (UI Label) | 동작 및 설명 (Action / Role) |
| :--- | :--- | :---: | :--- | :--- |
| `SCR-COM-01` | `com-sidebar-nav` | `nav` | 사이드바 내비게이션 바 | 전체 탭 이동 컨테이너 |
| `SCR-COM-01` | `com-tab-overview` | `tab` | 관제 홈 (Overview) | Overview 탭 활성화 |
| `SCR-COM-01` | `com-tab-virtualkeys` | `tab` | 거버넌스 (Governance) | Governance 탭 활성화 |
| `SCR-COM-01` | `com-tab-routing` | `tab` | 동적 라우팅 (Routing) | Dynamic Routing 탭 활성화 |
| `SCR-COM-01` | `com-tab-systemprompts` | `tab` | 시스템 프롬프트 (System Prompts) | System Prompts 탭 활성화 |
| `SCR-COM-01` | `com-tab-finops` | `tab` | 비용 관제 (FinOps) | FinOps 탭 활성화 |
| `SCR-COM-01` | `com-tab-compliance` | `tab` | 보안 & 감사 (Compliance) | Compliance & Audit 탭 활성화 |
| `SCR-COM-01` | `com-tab-lifecycle` | `tab` | 패치 & 수명주기 (Lifecycle) | Lifecycle 탭 활성화 |
| `SCR-COM-01` | `com-tab-promptstudio` | `tab` | 프롬프트 스튜디오 (Prompt Studio) | Prompt Studio 탭 활성화 |
| `SCR-COM-02` | `com-header-bar` | `header` | 상단 전역 헤더 | 시스템 상태, 테넌트 선택, 인스펙터 토글 |
| `SCR-COM-02` | `com-header-select-tenant` | `select` | 작업 테넌트 선택기 | 전역 필터링 테넌트 변경 |
| `SCR-COM-02` | `com-header-badge-status` | `badge` | 게이트웨이 상태 표시 | Envoy L7 Gateway 상태 (HEALTHY/DEGRADED) |
| `SCR-COM-02` | `com-header-btn-inspector` | `btn` | UI 인스펙터 토글 | 화면 식별자 오버레이 표시 on/off (`Ctrl+Shift+D`) |

---

### 3.2 [VK] 거버넌스 (`SCR-VK-*`)
| Screen ID | Element/Test ID (`data-testid`) | 요소 형태 | 공식 명칭 (UI Label) | Function ID | 백엔드 API 연동 |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `SCR-VK-01` | `vk-card-total` | `card` | 전체 발급 키 수 | - | `GET /api/v1/virtual-keys` |
| `SCR-VK-01` | `vk-card-active` | `card` | 정상 활성 키 수 | - | `GET /api/v1/virtual-keys` |
| `SCR-VK-01` | `vk-card-revoked` | `card` | 파기 완료 키 수 | - | `GET /api/v1/virtual-keys` |
| `SCR-VK-01` | `vk-btn-open-create-tenant` | `btn` | 신규 부서 등록 | - | 모달(`SCR-VK-M05`) 오픈 |
| `SCR-VK-01` | `vk-btn-open-create` | `btn` | 신규 가상키 발급 | - | 모달(`SCR-VK-M01`) 오픈 |
| `SCR-VK-01` | `vk-input-search` | `input` | 키 이름 / ID 검색 | - | 프론트엔드 목록 필터 |
| `SCR-VK-01` | `vk-select-tenant-filter`| `select` | 부서(테넌트) 필터 | - | 목록 테넌트 필터링 |
| `SCR-VK-01` | `vk-table-keys` | `table` | 가상키 목록 테이블 | - | 가상키 목록 렌더링 |
| `SCR-VK-01` | `vk-row-${keyId}` | `row` | 개별 가상키 행 | - | 키 메타데이터 표기 |
| `SCR-VK-01` | `vk-btn-revoke-${keyId}` | `btn` | 즉시 파기 (Revoke) | `FNC-VK-REVOKE` | `PUT /api/v1/virtual-keys/{id}/revoke` |
| `SCR-VK-01` | `vk-btn-delete-${keyId}` | `btn` | 키 영구 삭제 | `FNC-VK-DELETE` | `DELETE /api/v1/virtual-keys/{id}` |
| `SCR-VK-01` | `vk-btn-copy-${keyId}` | `btn` | 마스킹 키 복사 | - | 클립보드 복사 |
| `SCR-VK-M01`| `vk-modal-create` | `modal` | 가상키 신규 발급 팝업 | - | 발급 대화상자 |
| `SCR-VK-M01`| `vk-modal-input-name` | `input` | 가상키 식별 명칭 | - | 폼 필드 (Key Name) |
| `SCR-VK-M01`| `vk-modal-select-tenant`| `select` | 소속 테넌트 선택 | - | 폼 필드 (Tenant ID) |
| `SCR-VK-M01`| `vk-modal-input-rpm` | `input` | 분당 요청 한도(RPM) | - | 폼 필드 (Rate Limit RPM) |
| `SCR-VK-M01`| `vk-modal-input-tpm` | `input` | 분당 토큰 한도(TPM) | - | 폼 필드 (Rate Limit TPM) |
| `SCR-VK-M01`| `vk-modal-input-cidr` | `input` | 허용 IP CIDR 대역 | - | 폼 필드 (IP Whitelist) |
| `SCR-VK-M01`| `vk-modal-btn-submit` | `btn` | 발급 완료 및 비밀키 생성 | `FNC-VK-ISSUE` | `POST /api/v1/virtual-keys` |
| `SCR-VK-M01`| `vk-modal-btn-cancel` | `btn` | 취소 | - | 모달 닫기 |
| `SCR-VK-M02`| `vk-modal-secret` | `modal` | 1회성 비밀키 노출 팝업 | - | `sk-ord-...` 평문 1회 표출 |
| `SCR-VK-M02`| `vk-modal-secret-value`| `input` | 생성된 API Key | - | 읽기 전용 비밀키 값 |
| `SCR-VK-M02`| `vk-modal-btn-copy-secret`| `btn` | 비밀키 전체 복사 | - | 클립보드 복사 |
| `SCR-VK-M02`| `vk-modal-btn-close-secret`| `btn` | 복사 완료 및 닫기 | - | 모달 닫기 (영구 마스킹) |
| `SCR-VK-M05`| `vk-modal-create-tenant` | `modal` | 신규 부서(테넌트) 등록 팝업 | - | 부서 등록 대화상자 |
| `SCR-VK-M05`| `vk-modal-tenant-input-name` | `input` | 부서 명칭 | - | 폼 필드 (Department Name) |
| `SCR-VK-M05`| `vk-modal-tenant-input-code` | `input` | 고유 부서 코드 | - | 폼 필드 (Department Code) |
| `SCR-VK-M05`| `vk-modal-tenant-input-budget` | `input` | 월간 예산 한도(KRW) | - | 폼 필드 (Monthly Budget) |
| `SCR-VK-M05`| `vk-modal-tenant-toggle-hardcap`| `toggle` | Hard Cap 자동 차단 여부 | - | 폼 필드 (Hard Cap Toggle) |
| `SCR-VK-M05`| `vk-modal-tenant-btn-submit` | `btn` | 부서 등록 완료 | `FNC-VK-CREATE-TENANT` | `POST /api/v1/tenants` |
| `SCR-VK-M05`| `vk-modal-tenant-btn-cancel` | `btn` | 취소 | - | 모달 닫기 |

---

### 3.3 [RT] 동적 라우팅 및 Envoy xDS (`SCR-RT-*`)
| Screen ID | Element/Test ID (`data-testid`) | 요소 형태 | 공식 명칭 (UI Label) | Function ID | 백엔드 API 연동 |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `SCR-RT-01` | `rt-select-profile` | `select` | 활성 라우팅 프로필 선택 | - | `GET /api/v1/routes/profiles` |
| `SCR-RT-01` | `rt-btn-new-profile` | `btn` | 신규 라우팅 정책 추가 | `FNC-RT-CREATE-PROFILE` | `POST /api/v1/routes/profiles` |
| `SCR-RT-01` | `rt-btn-deploy-xds` | `btn` | Envoy xDS 무중단 즉시 배포 | `FNC-RT-DEPLOY` | `POST /api/v1/routes/deploy-xds` |
| `SCR-RT-01` | `rt-select-health-timeout`| `select` | 헬스체크 타임아웃 조절 | - | localStorage & API 쿼리 파라미터 |
| `SCR-RT-02` | `rt-splitter-card` | `card` | 트래픽 분할기 패널 | - | N-Target 가중치 분할 영역 |
| `SCR-RT-02` | `rt-btn-auto-balance` | `btn` | 가중치 자동 균등 분할 | `FNC-RT-AUTOBALANCE`| 100% 합산 1/N 자동 계산 |
| `SCR-RT-02` | `rt-splitter-slider-${id}`| `slider` | 개별 모델 가중치 슬라이더 | - | 0~100% 동적 슬라이더 |
| `SCR-RT-02` | `rt-splitter-input-${id}` | `input` | 개별 모델 가중치 숫자 입력 | - | 0~100 정수 입력 필드 |
| `SCR-RT-02` | `rt-select-add-model` | `select` | 분할기에 추가할 서빙 모델 | - | 카탈로그 등록 모델 선택 |
| `SCR-RT-02` | `rt-btn-add-model` | `btn` | 분할 대상 모델 추가 | - | 분할기 리스트에 모델 추가 |
| `SCR-RT-02` | `rt-btn-remove-model-${id}`| `btn`| 분할 대상 모델 제거 | - | 분할기 리스트에서 모델 삭제 |
| `SCR-RT-03` | `rt-failover-card` | `card` | 다단계 장애 우회 체인 | - | 1차/2차/3차 폴백 목록 |
| `SCR-RT-03` | `rt-failover-select-${idx}`| `select`| N차 폴백 타겟 모델 선택 | - | 장애 대체 모델 지정 |
| `SCR-RT-03` | `rt-failover-btn-add` | `btn` | 폴백 단계 추가 | - | 장애 우회 순위 추가 |
| `SCR-RT-04` | `rt-testbench-card` | `card` | 라우팅 테스트벤치 | - | 라우팅 즉시 시뮬레이션 콘솔 |
| `SCR-RT-04` | `rt-testbench-select-key` | `select` | 테스트용 API Key | - | Authorization 헤더 주입 |
| `SCR-RT-04` | `rt-testbench-input-prompt`| `textarea` | 테스트 프롬프트 메시지 | - | 테스트 페이로드 |
| `SCR-RT-04` | `rt-testbench-btn-send` | `btn` | 라우팅 테스트 요청 전송 | `FNC-RT-TEST` | `POST /api/v1/routes/test` (45s 타임아웃) |
| `SCR-RT-04` | `rt-testbench-output` | `pre` | 게이트웨이 응답 및 라우팅 결과 | - | 실제 응답 모델 및 응답 시간 표출 |

---

### 3.4 [SP] 시스템 프롬프트 거버넌스 (`SCR-SP-*`)
| Screen ID | Element/Test ID (`data-testid`) | 요소 형태 | 공식 명칭 (UI Label) | Function ID | 백엔드 API 연동 |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `SCR-SP-01` | `sp-card-total` | `card` | 등록된 프롬프트 수 | - | `GET /api/v1/system-prompts` |
| `SCR-SP-01` | `sp-card-active` | `card` | 활성 가드레일 수 | - | `GET /api/v1/system-prompts` |
| `SCR-SP-01` | `sp-card-bindings` | `card` | 연결된 바인딩 규칙 수 | - | `GET /api/v1/system-prompts/bindings` |
| `SCR-SP-01` | `sp-btn-open-create` | `btn` | 새 시스템 프롬프트 등록 | - | 모달(`SCR-SP-M01`) 오픈 |
| `SCR-SP-01` | `sp-btn-open-bind` | `btn` | 바인딩 규칙 신규 설정 | - | 모달(`SCR-SP-M02`) 오픈 |
| `SCR-SP-01` | `sp-table-catalog` | `table` | 프롬프트 카탈로그 테이블 | - | 프롬프트 메타데이터 목록 |
| `SCR-SP-01` | `sp-row-${id}` | `row` | 개별 프롬프트 행 | - | 프롬프트 정보 표시 |
| `SCR-SP-01` | `sp-btn-edit-${id}` | `btn` | 프롬프트 지침 수정 | - | 수정 모달 오픈 |
| `SCR-SP-01` | `sp-btn-delete-${id}` | `btn` | 프롬프트 삭제 | `FNC-SP-DELETE` | `DELETE /api/v1/system-prompts/{id}` |
| `SCR-SP-M01`| `sp-modal-form` | `modal` | 프롬프트 작성/수정 팝업 | - | 등록/수정 모달 컨테이너 |
| `SCR-SP-M01`| `sp-input-title` | `input` | 프롬프트 제목 (식별명) | - | 폼 필드 (Title) |
| `SCR-SP-M01`| `sp-input-code` | `input` | 고유 식별 코드 | - | 폼 필드 (Unique Code) |
| `SCR-SP-M01`| `sp-select-category` | `select` | 프롬프트 카테고리 | - | SECURITY / COMPLIANCE / PERSONA |
| `SCR-SP-M01`| `sp-textarea-content`| `textarea` | 시스템 프롬프트 본문 내용 | - | L7 인라인 주입 텍스트 |
| `SCR-SP-M01`| `sp-badge-token-count`| `badge` | 실시간 토큰 & 글자수 계량기 | - | 문자수 / 추정 토큰수 표출 |
| `SCR-SP-M01`| `sp-btn-submit` | `btn` | 저장 및 카탈로그 반영 | `FNC-SP-CREATE` | `POST /api/v1/system-prompts` |
| `SCR-SP-M02`| `sp-modal-binding` | `modal` | 주입 바인딩 마법사 팝업 | - | 1:1 타겟 바인딩 대화상자 |
| `SCR-SP-M02`| `sp-select-bind-prompt`| `select` | 주입할 시스템 프롬프트 | - | 바인딩 대상 프롬프트 선택 |
| `SCR-SP-M02`| `sp-select-target-type`| `select` | 바인딩 타겟 유형 | - | ROUTE / VIRTUAL_KEY / TENANT / GLOBAL |
| `SCR-SP-M02`| `sp-select-target-id` | `select` | 바인딩 대상 식별자 | - | 선택된 타입의 엔티티 목록 |
| `SCR-SP-M02`| `sp-select-inject-mode`| `select` | 주입 모드 | - | PREPEND / OVERRIDE / FALLBACK_ONLY |
| `SCR-SP-M02`| `sp-input-priority` | `input` | 우선순위 가중치 (1~100) | - | 위계 우선순위 충돌 해소용 |
| `SCR-SP-M02`| `sp-btn-submit-binding`| `btn` | 바인딩 규칙 저장 | `FNC-SP-BIND` | `POST /api/v1/system-prompts/bindings` |

---

### 3.5 [FO/CP/LC/PS/OV] 기타 핵심 탭
| Screen ID | Element/Test ID (`data-testid`) | 요소 형태 | 공식 명칭 (UI Label) | Function ID | 백엔드 API 연동 |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `SCR-OV-01` | `ov-card-rps` | `card` | 초당 요청 수 (RPS) | - | WebSocket 1s 스트리밍 |
| `SCR-OV-01` | `ov-card-latency` | `card` | 평균 지연 시간 (Latency) | - | WebSocket 1s 스트리밍 |
| `SCR-OV-01` | `ov-card-tokens` | `card` | 총 토큰 처리량 (Tokens) | - | WebSocket 1s 스트리밍 |
| `SCR-FO-01` | `fo-card-budget-usage` | `card` | 월간 누적 비용 및 예산 소진율 | - | `GET /api/v1/finops/summary` |
| `SCR-FO-01` | `fo-btn-export-csv` | `btn` | 결산용 CSV 청구서 내보내기 | `FNC-FO-EXPORT` | `GET /api/v1/finops/export-csv` |
| `SCR-CP-01` | `cp-input-simulator` | `textarea` | PII 마스킹 실시간 시뮬레이터 | - | 실시간 프롬프트 입력창 |
| `SCR-CP-01` | `cp-btn-test-mask` | `btn` | 개인정보 마스킹 검증 실행 | `FNC-CP-SIMULATE` | `POST /api/v1/compliance/simulate` |
| `SCR-CP-01` | `cp-output-masked` | `pre` | 마스킹 후 정제 페이로드 | - | 마스킹/해싱/차단 결과 뷰어 |
| `SCR-CP-02` | `cp-table-audit-log` | `table` | WORM 불변 감사 로그 테이블 | - | SHA-256 체이닝 감사 증적 목록 |
| `SCR-LC-01` | `lc-btn-upload-patch` | `btn` | 오프라인 핫픽스 번들 업로드 | `FNC-LC-PATCH` | `POST /api/v1/lifecycle/patch` (RSA-4096) |
| `SCR-LC-01` | `lc-btn-preflight-check`| `btn` | 시스템 의존성 사전점검 | `FNC-LC-PREFLIGHT`| `POST /api/v1/lifecycle/preflight` |
| `SCR-LC-01` | `lc-btn-support-bundle` | `btn` | Zero-PII 기술지원 번들 생성 | `FNC-LC-BUNDLE` | `POST /api/v1/lifecycle/support-bundle` |

---

## 4. UI 개발자 인스펙터 (Dev UI Inspector) 사양

### 4.1 동작 메커니즘
* **단축키**: `Ctrl + Shift + D` (Mac: `Cmd + Shift + D`) 또는 전역 헤더의 🔍 인스펙터 버튼 클릭.
* **기능**:
  1. 활성화 시 모든 `[data-testid]` 또는 `[data-screen-id]` 속성을 보유한 DOM 요소에 시각적 하이라이트(보라색/청록색 점선 테두리) 부여.
  2. 마우스 호버(Hover) 시 상단 플로팅 툴팁으로 **`Screen ID`**, **`data-testid`**, **`Function ID`**, **`연결 컴포넌트`**를 실시간 노출.
  3. 클릭 시 해당 `data-testid` 문자열을 클립보드에 원클릭 자동 복사하여 버그 티켓 작성 및 E2E 테스트 코드 작성 지원.
* **오프라인/에어갭 안전성**:
  - 외부 라이브러리 없이 100% React 순수 상태 및 Vanilla CSS로만 작동. 프로덕션 빌드 시에도 안전하게 포함되거나 관리자 권한에서만 켤 수 있도록 설계.

---

## 5. 결론 및 향후 활용 계획
1. **커뮤니케이션 비용 제로화**: 운영팀과 엔지니어링팀 간 "SCR-RT-02의 rt-btn-auto-balance 버튼 이상 동작"과 같이 100% 무결한 티켓팅 실현.
2. **E2E 테스트 자동화 완성**: 본 문서의 `data-testid` 인벤토리를 타겟으로 삼아 Playwright 테스트 스위트를 안정적으로 유지보수 가능.
