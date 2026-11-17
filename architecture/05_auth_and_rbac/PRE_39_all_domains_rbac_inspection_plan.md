# Ordinatio 전 도메인(10대 도메인 · 17종 권한) RBAC/PBAC 적용 현황 정밀 검사 계획서 (PRE_39)

**문서 번호**: ORDINATIO-ARCH-PRE39-20261106  
**작성 일자**: 2026-11-06  
**대상 범위**: `ordinatio/backend` (14개 라우터 · 50+ 엔드포인트) 및 `ordinatio/frontend` (사이드바/헤더/10대 도메인 전체 탭 및 인라인 컨트롤)  
**목적**: 프로젝트에 존재하는 모든 기능에 대해 역할 기반(RBAC) 및 세부 권한 기반(PBAC) 접근 통제가 백엔드 API, 테넌트 수평 격리(Tenant Scoping), 프론트엔드 메뉴 노출, 그리고 화면 내 세부 조작 버튼까지 빈틈없이 적용되어 있는지 정밀 검사하기 위한 엔지니어링 감사 계획 수립.

---

## 1. 검사 개요 및 4대 핵심 검사 축 (Inspection Axes)

단순히 API 엔드포인트의 HTTP 상태 코드만 확인하는 것을 넘어, 실제 운영 환경에서 권한 우회(Privilege Escalation)나 UI 노출 불일치가 발생하지 않도록 **4대 계층(4-Layer Defense-in-Depth)**을 전수 검사합니다.

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                    Ordinatio 전 도메인 RBAC / PBAC 4계층 정밀 검사 체계               │
├──────────────────┬──────────────────┬────────────────────────┬─────────────────────────────┤
│  Axis 1: 수직 인가 │  Axis 2: 수평 격리 │  Axis 3: 메뉴/화면 접근  │  Axis 4: 인라인 조작 제어    │
│ (Backend PBAC)   │ (Tenant Scoping) │ (Navigation Visibility)│ (Inline Row/Control Guard)  │
├──────────────────┼──────────────────┼────────────────────────┼─────────────────────────────┤
│ • 10대 도메인 전체 │ • TENANT_ADMIN 등 │ • 보유 권한(:read/:write│ • 테이블 행(Row) 단위 수정/  │
│   REST API에     │   부서 귀속 계정이 │   /:execute)에 따른    │   삭제/토글/슬라이더 조작    │
│   require_perm() │   타 부서(Tenant) │   Sidebar 메뉴 및      │   버튼의 disabled 처리 여부 │
│   누락 여부 전수  │   가상키·프롬프트· │   Header 패치 아이콘    │ • 모달 강제 오픈 및 콘솔     │
│   코드 정적 검사  │   예산 접근 차단   │   렌더링 가드 검사      │   우회 호출 시 이중 차단     │
└──────────────────┴──────────────────┴────────────────────────┴─────────────────────────────┘
```

---

## 2. 10대 도메인 × 17종 권한 코드 전수 검사 매트릭스

[`app/core/permissions.py`](../ordinatio/backend/app/core/permissions.py)에 정의된 17개 권한 코드별 백엔드 엔드포인트 및 프론트엔드 UI 검사 대상 목록입니다.

| # | 도메인명 | 권한 코드 | 백엔드 검사 대상 엔드포인트 | 프론트엔드 검사 대상 컴포넌트 및 세부 컨트롤 |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **통합 관제 홈** | `overview:read` | • `GET /api/v1/observability/metrics/summary`<br>• `POST /api/v1/observability/promql`<br>• `WS /api/v1/observability/ws` | • `Sidebar.jsx`: `overview` 탭 노출 조건<br>• `OverviewTab.jsx`: KPI 카드, 라우팅/FinOps 바로가기 버튼 권한 연동 |
| **2** | **모델 및 라우팅** | `routing:read`<br>`routing:write` | • `GET /api/v1/models`, `GET /models/{id}`, `GET /models/health-check`, `POST /models/{id}/health` (`:read`)<br>• `POST /models`, `PATCH /models/{id}`, `DELETE /models/{id}` (`:write`)<br>• `GET /api/v1/routing`, `GET /routes`, `GET /history`, `POST /test-call`, `GET /agent-router/*`, `POST /agent-router/simulate` (`:read`)<br>• `POST /routes`, `PUT /routes/{name}`, `DELETE /routes/{name}`, `POST /dry-run`, `POST /deploy`, `PUT /agent-router/policies` (`:write`) | • `Sidebar.jsx`: `routing` 아코디언 메뉴 노출 조건<br>• `RoutingTab.jsx`:<br>  - 상단 `[+ 신규 라우트]`, `[+ 신규 모델 등록]`, `[4대 정책 기준 편집]` 버튼<br>  - **세부 인라인**: 가중치 슬라이더 조작, `[균등 분할]`, 모델 추가/제거 버튼, Failover 모델 선택 드롭다운, `[Dry-run 검증]`, `[무중단 배포 (xDS Push)]`<br>  - **서빙 모델 풀**: 모델 카드 내 `[수정(✏️)]`, `[삭제(🗑️)]` 버튼<br>  - **AgentRouter**: 인텐트 카드 수동 오버라이드(Manual Override) 저장 |
| **3** | **테넌트 & 가상키** | `governance:read`<br>`governance:write` | • `GET /api/v1/tenants`, `GET /tenants/{id}` (`:read`)<br>• `POST /tenants`, `PATCH /tenants/{id}`, `DELETE /tenants/{id}` (`:write`)<br>• `GET /api/v1/virtual-keys`, `GET /virtual-keys/Prometheus` (`:read`)<br>• `POST /virtual-keys`, `PATCH /virtual-keys/{id}`, `PATCH /virtual-keys/{id}/revoke`, `DELETE /virtual-keys/{id}` (`:write`) | • `Sidebar.jsx`: `virtual-keys` 탭 노출 조건<br>• `VirtualKeysTab.jsx`:<br>  - 상단 `[+ 신규 부서 등록]`, `[+ 신규 API Key 발급]` 버튼<br>  - 부서(Tenant) 목록 내 `[삭제]` 버튼<br>  - 가상키 테이블 행 내 `[수정]`, `[즉시 파기(Revoke)]`, `[영구 삭제]` 버튼 |
| **4** | **시스템 프롬프트** | `prompts:read`<br>`prompts:write` | • `GET /api/v1/system-prompts`, `GET /system-prompts/{id}`, `POST /system-prompts/resolve` (`:read`)<br>• `POST /system-prompts`, `PUT /system-prompts/{id}`, `DELETE /system-prompts/{id}` (`:write`) | • `Sidebar.jsx`: `system-prompts` 탭 노출 조건<br>• `SystemPromptsTab.jsx`:<br>  - 상단 `[+ 프롬프트 등록]` 버튼<br>  - **세부 인라인**: 각 프롬프트 카드 우측 상단 `[운용중/비활성]` 토글 스위치 버튼 (`sp-btn-toggle-*`)<br>  - 카드 하단 `[수정]`, `[삭제]` 버튼 |
| **5** | **FinOps 과금/예산** | `finops:read`<br>`finops:write` | • `GET /api/v1/finops/overview` (`:read`)<br>• `GET /api/v1/external/tenants/{id}/summary` (`:read`)<br>• `GET /api/v1/finops/invoices/export` (`:write`)<br>• `PATCH /api/v1/external/tenants/{id}/budget` (`:write`) | • `Sidebar.jsx`: `finops` 탭 노출 조건<br>• `FinOpsTab.jsx`:<br>  - 상단 `[부서별 정산서 CSV 추출]` 버튼<br>  - **세부 인라인**: 예산 초과(Blocked) 부서 카드 내 `[긴급 한도 증액 및 차단 해제]` 버튼 |
| **6** | **컴플라이언스/감사** | `compliance:read`<br>`compliance:write` | • `GET /api/v1/compliance/rules`, `POST /compliance/simulate`, `GET /compliance/audit-logs`, `GET /compliance/stats` (`:read`)<br>• `POST /compliance/rules`, `PUT /compliance/rules/{id}`, `DELETE /compliance/rules/{id}` (`:write`) | • `Sidebar.jsx`: `compliance` 탭 노출 조건<br>• `ComplianceTab.jsx`:<br>  - 상단 `[+ 커스텀 정규식 룰 추가]` 버튼<br>  - **세부 인라인**: PII 탐지 룰 테이블 내 `룰 명칭 <input>`, `정규식 <input>`, `임계치 <input type="range">`, `조치 <select>`, `운용중/비활성 배지 클릭 토글`, 행별 `[저장]`, `[삭제(🗑️)]` 버튼 |
| **7** | **라이프사이클/패치** | `lifecycle:read`<br>`lifecycle:write` | • `GET /api/v1/lifecycle/components`, `GET /lifecycle/patches/history`, `GET /lifecycle/preflight` (`:read`)<br>• `POST /lifecycle/patches/verify`, `POST /lifecycle/patches/dry-run`, `POST /lifecycle/patches/apply`, `POST /lifecycle/patches/rollback`, `POST /lifecycle/support-bundle`, `GET /lifecycle/support-bundle/download/{id}` (`:write`) | • `Header.jsx`: 상단 `[긴급 보안 패치]` 버튼 노출/접근 조건<br>• `LifecycleTab.jsx`:<br>  - 상단 `[Zero-PII 서포트 번들 추출]` 버튼<br>  - **세부 인라인**: `[샘플 벤더 패치 번들 로드]` 버튼, 파일 업로드 드롭존(`fileInputRef`), 패치 로드 후 `[Dry-run 호환성 검증]`, `[무중단 롤링 배포]`, `[긴급 롤백]` 버튼 |
| **8** | **프롬프트 스튜디오** | `prompt_studio:execute` | • `POST /api/v1/compliance/simulate`<br>• `POST /v1/chat/completions` (내부 진단 키 호출) | • `Sidebar.jsx`: `prompt-studio` 탭 노출 조건<br>• `PromptStudioTab.jsx`: `[추론 실행]` 버튼 및 파라미터 컨트롤 비활성화 |
| **9** | **사용자 관리** | `users:read`<br>`users:write` | • `GET /api/v1/users` (`:read`)<br>• `POST /api/v1/users`, `PATCH /api/v1/users/{id}`, `DELETE /api/v1/users/{id}` (`:write`) | • `Sidebar.jsx` & `App.jsx`: `users` 메뉴 접근 가드<br>• `UsersTab.jsx`:<br>  - 상단 `[+ 신규 사용자 등록]` 버튼<br>  - **세부 인라인**: 사용자 테이블 행 내 `[잠금 해제]`, `[수정(✏️)]`, `[비밀번호 초기화(🔑)]`, `[활성/비활성 토글]`, `[계정 삭제(🗑️)]` 버튼 (`!canWriteUsers` 시 비활성화 여부) |
| **10** | **역할(Role) 관리** | `roles:manage` | • `GET /api/v1/roles`, `GET /api/v1/roles/permissions` (`users:read` 또는 `roles:manage`)<br>• `POST /api/v1/roles`, `PATCH /api/v1/roles/{id}`, `DELETE /api/v1/roles/{id}` (`roles:manage`) | • `Sidebar.jsx` & `App.jsx`: `roles` 메뉴 접근 가드<br>• `UsersTab.jsx` (역할 서브탭):<br>  - `users:read`만 있고 `roles:manage`가 없는 사용자가 `UsersTab` 진입 시, 역할 서브탭의 `[+ 새 역할 추가]`, 행별 `[수정(✏️)]`, `[삭제(🗑️)]` 버튼 비활성화 여부 |

---

## 3. 단계별 상세 검사 계획 (5-Phase Audit & Verification Plan)

### Phase 1: 백엔드 API 수직 인가(Vertical PBAC) 전수 정적/동적 검사
1. **라우터 데코레이터 전수 스캔**:
   - `ordinatio/backend/app/api/v1/endpoints/` 내 14개 파일의 모든 `@router.(get|post|put|patch|delete)` 엔드포인트 시그니처를 추출하여 `Depends(require_permission(...))` 또는 `Depends(get_current_user)` 누락 여부를 100% 대조합니다.
2. **예외(Data-Plane / Public) 엔드포인트 적정성 검증**:
   - `POST /api/v1/auth/login` (로그인 엔드포인트)
   - `POST /api/v1/virtual-keys/validate`, `GET /api/v1/external/me`, `GET /api/v1/external/models`, `POST /api/v1/external/usage/report` (`sk-ord-*` 가상 API Key 기반 데이터 평면 연동)
   - `GET /api/v1/xds/v3/discovery:routes` (Envoy 내부 컨테이너 간 xDS 폴링)
   - 위 데이터 평면/내부 엔드포인트를 제외한 **모든 제어 평면(Control Plane) API가 100% JWT + PBAC로 보호**되는지 확인합니다.
3. **Roles 조회 API 권한 점검**:
   - 현재 `GET /api/v1/roles` 및 `GET /api/v1/roles/permissions`에 인증/권한 의존성이 누락되어 있는지 확인하고, `users:read` 또는 `roles:manage`(로그인 사용자) 권한 가드를 적용합니다.

### Phase 2: 테넌트 수평 격리(Horizontal RBAC / Tenant Scoping) 검사
1. **소속 부서(`tenant_id`) 기반 데이터 격리 점검**:
   - `TENANT_ADMIN` 또는 특정 부서(`tenant_id = "dept-wm"`)에 배정된 커스텀 역할 사용자가 API 호출 시:
     - `virtual_keys.py`: 타 부서(`dept-ai-lab`)의 가상키를 조회·수정·파기·삭제할 수 없는지 검사.
     - `tenants.py`: 타 부서의 테넌트 정보를 수정·삭제할 수 없는지 검사.
     - `system_prompts.py`: 타 부서 전용(`TENANT` 타깃) 시스템 프롬프트를 임의 수정·삭제할 수 없는지 검사.
     - `finops.py` / `external.py`: 타 부서 예산을 임의 증액할 수 없는지 검사.

### Phase 3: 프론트엔드 네비게이션(Sidebar / Header / App) 접근 제어 검사
1. **사이드바 메뉴 동적 필터링 점검 (`Sidebar.jsx`, `App.jsx`)**:
   - 예: `SEC_AUDITOR` 역할에 `governance:read`, `compliance:read`만 부여한 경우, 권한이 전혀 없는 다른 메뉴(모델 라우팅, 시스템 프롬프트, FinOps, 프롬프트 스튜디오 등) 클릭 시 빈 화면이나 에러가 뜨지 않도록:
     - 방안 A: 보유한 권한 도메인 메뉴만 사이드바에 노출 (권장: 최소 권한 원칙에 따른 메뉴 가시성 제어)
     - 방안 B: 메뉴 진입 시 권한 없음 안내 배너 또는 조회 전용 모드 명확화
2. **상단 헤더 긴급 패치 버튼 점검 (`Header.jsx`)**:
   - `lifecycle:read` 또는 `lifecycle:write` 권한이 없는 사용자에게 헤더의 `[긴급 보안 패치]` 알림 버튼 노출/클릭 제어 여부 검사.

### Phase 4: 프론트엔드 각 탭 내부 인라인 조작 컨트롤(Inline Action Guards) 정밀 검사
상단 헤더 버튼뿐만 아니라 **테이블 행(Row), 카드 내부 토글, 슬라이더, 긴급 해제 버튼** 등 화면 내 모든 변경(Mutation) UI 요소에 `!canWrite` 비활성화(`disabled`)가 누락된 곳을 전수 색출합니다.

1. **`RoutingTab.jsx`**:
   - 모델 카탈로그 테이블/카드의 개별 모델 `[수정(✏️)]`, `[삭제(🗑️)]` 버튼 (`!canWriteRouting` 가드 여부)
   - 라우팅 스튜디오 내 가중치 슬라이더(`<input type="range">`), `[균등 분할]`, `[+ 모델 추가]`, 모델 제거(`[X]`), Failover 드롭다운 조작 가드 여부
   - AgentRouter 인텐트 분석 결과 카드의 수동 오버라이드(Manual Override) 드롭다운 조작 가드 여부
2. **`SystemPromptsTab.jsx`**:
   - 프롬프트 카드 우측 상단의 `[운용중 / 비활성]` 상태 토글 버튼 (`handleToggleActive`)에 `!canWritePrompts` 가드 적용 여부
3. **`FinOpsTab.jsx`**:
   - 예산 100% 소진(Blocked) 부서 카드 하단의 `[긴급 한도 증액 및 차단 해제]` 버튼 (`handleEmergencyIncrease`)에 `!canWriteFinops` 가드 및 오프라인 로컬 상태 변조(Fallback) 차단 여부
4. **`ComplianceTab.jsx`**:
   - PII 규칙 테이블 각 행(Row)의 `룰 이름 입력창`, `정규식 입력창`, `신뢰도 슬라이더`, `조치 방식 드롭다운`, `운용중 배지 토글`, `[저장]` 버튼, `[삭제(🗑️)]` 버튼에 `!canWriteCompliance` 가드 적용 여부
5. **`LifecycleTab.jsx`**:
   - `[샘플 벤더 패치 번들 로드]` 버튼, 파일 업로드 드롭존(`fileInputRef.current.click()`), `[Dry-run 호환성 검증]`, `[무중단 롤링 배포]`, `[긴급 롤백]` 버튼에 `!canWriteLifecycle` 가드 적용 여부
6. **`UsersTab.jsx`**:
   - `users:read`만 보유하고 `users:write`가 없는 계정이 접속했을 때, 각 사용자 행(Row)의 `[잠금 해제]`, `[수정(✏️)]`, `[비밀번호 초기화(🔑)]`, `[활성/비활성 토글]`, `[삭제(🗑️)]` 버튼이 비활성화되는지 검사
   - `roles:manage`가 없는 계정이 역할 서브탭 조회 시, 각 역할 행(Row)의 `[수정(✏️)]`, `[삭제(🗑️)]` 버튼이 비활성화되는지 검사

### Phase 5: E2E 자동화 테스트 매트릭스 검증 (`tests/test_roles.py`)
1. **역할별 시나리오 매트릭스 자동 검증**:
   - `SUPER_ADMIN`: 10대 도메인 전 기능 Read/Write 100% 허용 (`200/201`)
   - `SEC_AUDITOR` (`governance:read`, `compliance:read`):
     - 허용 도메인 조회(`GET /virtual-keys`, `GET /compliance/rules`, `GET /compliance/audit-logs`) -> `200 OK`
     - 허용 도메인 변경(`POST /virtual-keys`, `POST /compliance/rules`) -> `403 Forbidden`
     - 미허용 도메인 조회(`GET /models`, `GET /system-prompts`, `GET /finops/overview`, `GET /users`) -> `403 Forbidden`
   - `GLOBAL_READER` (전 도메인 `:read` 전용):
     - 10대 도메인 모든 `:read` API -> `200 OK`
     - 10대 도메인 모든 `:write` / `:manage` API -> `403 Forbidden`
   - `CUSTOM_PROMPT_OPS` (`prompts:write` 단독 부여):
     - Implied Read 작동 검증: `prompts:read` 없이 `prompts:write`만 부여해도 `GET /system-prompts` (`200 OK`) 및 `POST /system-prompts` (`201 Created`) 모두 성공하고, 타 도메인(`POST /virtual-keys`)은 `403 Forbidden` 차단됨을 검증.

---

## 4. 식별된 보완 대상 조치 및 재검사 결과 (100% 조치 완료 · PASS)

본 계획 수립 과정에서 식별된 8대 세부 보완 대상(백엔드 API, 네비게이션 메뉴 가시성, 7개 탭 내부 인라인 조작 컨트롤)을 전수 보완하고 재검사한 결과입니다:

| 구분 | 파일명 | 발견된 세부 미비점 | 조치 및 재검사 결과 | 상태 |
| :---: | :--- | :--- | :--- | :---: |
| **Backend** | [`roles.py`](../ordinatio/backend/app/api/v1/endpoints/roles.py)<br>[`deps.py`](../ordinatio/backend/app/api/deps.py) | `GET /api/v1/roles`, `GET /api/v1/roles/permissions`에 인증 가드 미부착 | `Depends(require_permission("users:read"))` 적용 완료 (`deps.py`에 `roles:manage -> users:read` 및 `<domain>:write -> <domain>:read` Implied Read 반영) | ✅ **PASS** |
| **Frontend** | [`Sidebar.jsx`](../ordinatio/frontend/src/components/Sidebar.jsx)<br>[`App.jsx`](../ordinatio/frontend/src/App.jsx)<br>[`Header.jsx`](../ordinatio/frontend/src/components/Header.jsx)<br>[`OverviewTab.jsx`](../ordinatio/frontend/src/components/OverviewTab.jsx)<br>[`AuthContext.jsx`](../ordinatio/frontend/src/context/AuthContext.jsx) | `users`, `roles` 외 일반 탭들은 해당 도메인 `:read` 권한이 없어도 사이드바에 노출됨 | • `Sidebar.jsx`: 9개 메뉴 전체에 도메인별 최소 권한(`overview:read`, `routing:read`, `governance:read`, `prompts:read`, `finops:read`, `compliance:read`, `prompt_studio:execute`, `users:read`, `roles:manage`) 필터링 적용<br>• `Header.jsx`: `[긴급 보안 패치]` 버튼을 `canAccessLifecycle` 보유 시에만 노출<br>• `App.jsx`: 기본 탭(`overview`) 권한이 없는 역할(`SEC_AUDITOR` 등) 로그인 시 보유한 첫 번째 허용 탭(`virtual-keys` 등)으로 자동 전환(`useEffect`) | ✅ **PASS** |
| **Frontend** | [`ComplianceTab.jsx`](../ordinatio/frontend/src/components/ComplianceTab.jsx) | 테이블 각 행(Row)의 `[저장]`, `[삭제]`, `[운용중 토글]`, `정규식 입력창`, `임계치 슬라이더`, `조치 드롭다운`이 `!canWriteCompliance` 상태에서 활성 상태임 | 행 내부 모든 입력폼(`<input>`, `<select>`, `<input type="range">`), 상태 배지 토글, `[저장]`, `[삭제]` 버튼에 `disabled={!canWriteCompliance}` 완벽 적용 | ✅ **PASS** |
| **Frontend** | [`SystemPromptsTab.jsx`](../ordinatio/frontend/src/components/SystemPromptsTab.jsx) | 카드 우측 상단 `[운용중/비활성]` 토글 버튼(`handleToggleActive`)이 활성 상태임 | 카드 상단 토글 버튼(`sp-btn-toggle-*`) 및 하단 `[수정]`, `[삭제]` 버튼 전체에 `disabled={!canWritePrompts}` 적용 | ✅ **PASS** |
| **Frontend** | [`FinOpsTab.jsx`](../ordinatio/frontend/src/components/FinOpsTab.jsx) | 부서 카드 내 `[긴급 한도 증액 및 차단 해제]` 버튼이 활성 상태이며, 403 에러 시 로컬 state를 강제 증액하는 Fallback이 존재함 | 버튼에 `disabled={!canWriteFinops}` 적용 및 `handleEmergencyIncrease` 내 오프라인 로컬 상태 변조 Fallback 완전 제거 | ✅ **PASS** |
| **Frontend** | [`LifecycleTab.jsx`](../ordinatio/frontend/src/components/LifecycleTab.jsx) | `[샘플 벤더 패치 번들 로드]`, 드롭존 파일 업로드, `[Dry-run]`, `[무중단 롤링 배포]`, `[긴급 롤백]` 버튼에 `!canWriteLifecycle` 가드 미적용 | 패치 로드·검증·배포·롤백 관련 모든 인라인 버튼 및 파일 드롭존에 `disabled={!canWriteLifecycle}` 적용 | ✅ **PASS** |
| **Frontend** | [`RoutingTab.jsx`](../ordinatio/frontend/src/components/RoutingTab.jsx)<br>[`PromptStudioTab.jsx`](../ordinatio/frontend/src/components/PromptStudioTab.jsx) | 서빙 모델 풀(Catalog) 내 개별 모델 `[+ 추가]`, `[수정]`, `[삭제]` 버튼 및 라우팅 가중치 슬라이더/숫자 입력/균등분할/제거 버튼에 가드 미적용 | • `RoutingTab.jsx`: 모델 등록/추가/수정/삭제 버튼, 가중치 슬라이더/숫자 입력, 균등분할, 모델 제거 버튼 전체에 `disabled={!canWriteRouting}` 적용<br>• `PromptStudioTab.jsx`: 프롬프트 입력창 및 `[추론 실행]` 버튼에 `disabled={!canExecuteStudio}` 적용 | ✅ **PASS** |
| **Frontend** | [`UsersTab.jsx`](../ordinatio/frontend/src/components/UsersTab.jsx) | 사용자 행(Row) 액션 버튼 및 역할 행(Row) 액션 버튼에 개별 권한 가드 미적용 | 사용자 행(`[잠금 해제]`, `[수정]`, `[비밀번호 초기화]`, `[활성/비활성]`, `[삭제]`)에 `disabled={!canWriteUsers}`, 역할 행(`[수정]`, `[삭제]`)에 `disabled={!canManageRoles}` 적용 | ✅ **PASS** |

---

## 5. 자동화 검증 및 빌드 재검사 증적 (Verification Evidence)

1. **백엔드 RBAC/PBAC 전 도메인 매트릭스 및 전체 테스트 스위트 통과**:
   - `tests/test_roles.py` (7/7 PASS):
     - `SEC_AUDITOR` (`["governance:read", "compliance:read"]`): 허용 도메인 조회 `200 OK`, 쓰기(`POST /api/v1/virtual-keys`, `POST /api/v1/compliance/rules`) `403 Forbidden`, 미허용 도메인 조회(`GET /api/v1/models`, `GET /api/v1/system-prompts`, `GET /api/v1/finops/overview`, `GET /api/v1/users`, `GET /api/v1/roles`) `403 Forbidden` 완벽 차단 검증.
     - `GLOBAL_READER` (전 도메인 `:read`): 전 도메인 조회 `200 OK`, 전 도메인 변경(`POST /models`, `POST /virtual-keys`, `POST /system-prompts`, `POST /compliance/rules`, `PATCH /external/tenants/{id}/budget`) `403 Forbidden` 완벽 차단 검증.
   - 전체 백엔드 테스트 스위트: **93 passed in pytest (100% PASS)**.
2. **프론트엔드 프로덕션 빌드 및 컨테이너 동기화 검증**:
   - `npm --prefix ordinatio/frontend run build`: 문법/번들링 오류 0건 (`dist/` 빌드 성공).
   - `ordinatio-backend` 및 `ordinatio-frontend` 컨테이너에 최신 코드 반영 및 재기동 완료.


