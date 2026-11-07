# PRE_37: 사용자 및 계정 관리(UsersTab) Role 및 그룹(Tenant) 편집 기능 엔지니어링 계획서 (User Role & Tenant Edit Implementation Plan)

**문서 번호**: AIORCHE-PLAN-20261106-ROLE-EDIT  
**대상 시스템**: AI Orchestrator Appliance (`aiorche/`)  
**작성 일자**: 2026-11-06  
**관련 기능**: 사용자 및 계정 관리 (`com-tab-users` / `UsersTab.jsx`), RBAC 제어 평면  

---

## 1. 개요 및 목적 (Objectives)

현재 백엔드 제어 평면([`PATCH /api/v1/users/{user_id}`](file:///Users/jason/project/오케스트레이터/aiorche/backend/app/api/v1/endpoints/users.py))에는 사용자의 역할(`role`: `SUPER_ADMIN`, `TENANT_ADMIN`, `VIEWER`) 및 소속 부서(`tenant_id`)를 수정하는 API가 구현되어 있으나, 프론트엔드 UI([`UsersTab.jsx`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/components/UsersTab.jsx))에는 편집 버튼 및 모달이 제공되지 않아 관리자가 화면에서 기존 사용자의 역할이나 소속 그룹을 변경할 수 없는 결함이 존재합니다.

본 계획서는 **관리자 웹 콘솔에서 기존 사용자의 역할(Role)과 소속 그룹(Tenant)을 직관적으로 편집할 수 있는 수정 모달 및 액션 인터페이스를 구현하고, 프론트-백엔드 간 HTTP 통신 규격을 정합화하기 위한 상세 엔지니어링 계획**을 정의합니다.

---

## 2. 현상 분석 및 기술적 결함 (Root Cause Analysis)

1. **프론트엔드 UI 모달 누락**:
   - `UsersTab.jsx`의 테이블 액션 열에 비밀번호 재설정(`KeyRound`), 활성 토글, 잠금 해제, 삭제 버튼만 배치되어 있고, 정보 및 역할/그룹 수정을 위한 **[수정(Edit)] 버튼 및 모달**이 미구현됨.
2. **API 클라이언트 HTTP Method 불일치 위험**:
   - `aiorche/frontend/src/api/client.js`의 `updateUser` 메소드가 `method: 'PUT'`으로 호출하도록 작성되어 있어, 백엔드의 `@router.patch("/{user_id}")`와 불일치(FastAPI 405 Method Not Allowed 가능성). ➔ `PATCH`로 일치화 필요.
3. **로컬라이제이션 단일 진실 공급원 준수**:
   - 신규 추가되는 수정 모달 및 알림 텍스트는 `src/constants/strings.js`에 중앙 등록되어야 함.

---

## 3. 단계별 세부 구현 계획 (Phased Implementation Plan)

### Step 1: API 클라이언트 통신 규격 정합화 (`api/client.js`)
- `apiClient.updateUser(userId, userData)`:
  - HTTP Method를 `PUT` ➔ `PATCH`로 변경하여 백엔드 REST 명세와 100% 일치화.

### Step 2: 중앙 집중 로컬라이제이션 확장 (`constants/strings.js`)
- `strings.users` 네임스페이스 확장:
  - `strings.users.modal.editTitle`: `"사용자 정보 및 역할/그룹 수정"`
  - `strings.users.modal.btnSubmitEdit`: `"변경사항 저장"`
  - `strings.users.table.btnEditTitle`: `"사용자 정보 및 역할/소속 부서 수정"`
  - `strings.users.alerts.updatedSuccess`: `(username) => `'${username}' 사용자의 역할 및 소속 부서가 성공적으로 수정되었습니다.`
  - `strings.users.alerts.updateFailed`: `(msg) => `사용자 정보 수정 실패: ${msg}``
  - `strings.users.alerts.cannotDemoteSelf`: `"현재 로그인된 슈퍼관리자 본인의 권한은 강등할 수 없습니다."`

### Step 3: 프론트엔드 사용자 수정 모달 및 액션 버튼 구현 (`components/UsersTab.jsx`)
1. **아이콘 및 모달 상태 추가**:
   - `lucide-react`의 `Edit` (또는 `Pencil`) 아이콘 import.
   - 상태 정의:
     - `isEditModalOpen`: 모달 오픈 여부
     - `editUserId`, `editUsername`, `editFullName`, `editEmail`, `editRole`, `editTenantId`
2. **테이블 액션 열에 ✏️ [수정] 버튼 추가**:
   - 각 사용자 행의 작업 버튼 목록 맨 앞에 `Edit` 버튼 배치 (`data-testid={`users-btn-edit-${u.id}`}`).
   - 클릭 시 해당 사용자의 기존 정보(`role`, `tenant_id`, `full_name`, `email`)를 폼 상태에 자동 바인딩하고 `isEditModalOpen = true`.
3. **[사용자 정보 및 역할/그룹 수정] 모달 UI 구현**:
   - **사용자 아이디 (`username`)**: 읽기 전용 텍스트 표시.
   - **성명 (`full_name`) & 이메일 (`email`)**: 수정 가능한 입력 필드.
   - **권한 역할 (`role`)**: 드롭다운 선택 (`SUPER_ADMIN` / `TENANT_ADMIN` / `VIEWER`).
     - *안전 가드*: 본인(`currentUser.id === u.id`)인 경우 Role 선택 비활성화 또는 경고 안내.
   - **소속 부서/그룹 (`tenant_id`)**: 등록된 부서 목록 드롭다운 선택.
     - `role === 'SUPER_ADMIN'`인 경우 자동으로 비활성화(전사 공통).
   - **저장/취소 버튼**: `strings.common.cancel` 및 `strings.users.modal.btnSubmitEdit`.
4. **`handleUpdateUser` 핸들러 구현**:
   - `apiClient.updateUser(editUserId, { full_name, email, role, tenant_id })` 호출.
   - 성공 시 알림 토스트 출력 및 `loadData()`로 테이블 실시간 리프레시.

---

## 4. 품질 보증 및 검증 계획 (DoD & Verification Plan)

1. **정적 분석 및 한글 리터럴 전수 검사**:
   - 컴포넌트 내 하드코딩된 한글 0건 유지 검증 (`strings.js` 바인딩).
2. **Vite 프로덕션 번들 빌드 검증**:
   - `npm --prefix aiorche/frontend run build` 무오류 빌드 (0 Warning/Error).
3. **기능 수동 및 회귀 검증**:
   - 사용자 테이블에서 ✏️ 수정 버튼 클릭 ➔ 모달 팝업 확인.
   - 역할(Role)을 `VIEWER` ➔ `TENANT_ADMIN`으로 변경 후 저장 ➔ 테이블에 즉시 반영 확인.
   - 소속 부서(Tenant)를 `자산관리개발팀` ➔ `여신심사팀`으로 변경 후 저장 ➔ 테이블에 즉시 반영 확인.
4. **백엔드 회귀 테스트 스위트 (86/86 PASS)**:
   - `cd aiorche/backend && uv run pytest -v` 실행하여 무회귀 확인.

---

## 5. 아키텍처 문서 동기화
- `architecture/README.md` 내 `PRE_37` 항목 신규 등록 및 상태 현행화.

---

## 6. 구현 및 자동화 검증 증적 (Implementation & Verification Evidence)

### 6.1. 수정된 소스 코드 파일 목록
1. [`aiorche/frontend/src/api/client.js`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/api/client.js): `updateUser` 메소드의 HTTP 요청 방식을 `PUT`에서 `PATCH`로 정합화.
2. [`aiorche/frontend/src/constants/strings.js`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/constants/strings.js): 수정 모달 제목, 저장 버튼, 테이블 버튼 툴팁, 수정 완료/실패 및 본인 강등 방지 알림 문자열 추가.
3. [`aiorche/frontend/src/components/UsersTab.jsx`](file:///Users/jason/project/오케스트레이터/aiorche/frontend/src/components/UsersTab.jsx):
   - `Pencil` 아이콘 및 수정 모달 상태(`isEditModalOpen`, `editUserId`, `editUsername`, `editFullName`, `editEmail`, `editRole`, `editTenantId`) 추가.
   - 사용자 테이블 액션 열에 ✏️ [수정] 버튼(`data-testid="users-btn-edit-${u.id}"`) 탑재.
   - 사용자 식별자(읽기 전용), 성명, 이메일, 역할(SUPER_ADMIN / TENANT_ADMIN / VIEWER), 소속 부서(Tenant) 수정 모달 렌더링.
   - 슈퍼관리자 본인 계정 권한 강등 방지 가드레일 및 SUPER_ADMIN 선택 시 테넌트 자동 비활성화 로직 구현.

### 6.2. 정적 분석 및 무결성 검증
- **하드코딩 한글 검사**: `UsersTab.jsx` 내 코드/JSX 주석 제외 하드코딩된 한글 **0건 (EXACTLY ZERO)** 달성.
- **Vite 프로덕션 빌드**:
  ```bash
  $ npm --prefix aiorche/frontend run build
  vite v5.4.14 building for production...
  ✓ 1675 modules transformed.
  dist/index.html                   0.82 kB │ gzip:  0.42 kB
  dist/assets/index-D_8uN5aA.css   27.81 kB │ gzip:  5.49 kB
  dist/assets/index-CXN_aO09.js   628.72 kB │ gzip: 161.94 kB
  ✓ built in 4.05s
  ```

### 6.3. 백엔드 회귀 및 RBAC 테스트 결과
- **RBAC 보안 테스트**:
  ```bash
  $ cd aiorche/backend && uv run pytest tests/test_auth_rbac.py -v
  tests/test_auth_rbac.py::test_login_success PASSED [ 14%]
  tests/test_auth_rbac.py::test_login_invalid_password PASSED [ 28%]
  tests/test_auth_rbac.py::test_account_lockout_after_five_failures PASSED [ 42%]
  tests/test_auth_rbac.py::test_rbac_super_admin_access PASSED [ 57%]
  tests/test_auth_rbac.py::test_rbac_tenant_admin_restricted PASSED [ 71%]
  tests/test_auth_rbac.py::test_rbac_viewer_read_only PASSED [ 85%]
  tests/test_auth_rbac.py::test_create_initial_admin_cli PASSED [100%]
  ====== 7 passed in 3.11s ======
  ```
- **백엔드 전체 회귀 테스트 스위트**:
  ```bash
  $ cd aiorche/backend && uv run pytest -q
  86 passed, 104 warnings in 66.10s (100% PASS)
  ```
- **결론**: 프론트엔드 UI 수정 모달 탑재 및 백엔드 PATCH API 연동 완료, 100% 정상 작동 검증 완료.


