# PRE_38: 사용자 역할(Role) 추가·수정·삭제 동적 RBAC 관리 엔진 및 에디터 구현 계획서 및 결과 보고서

**문서 번호**: ORDINATIO-ENG-PLAN-20261106-ROLE-MGR  
**대상 시스템**: Ordinatio Appliance (`ordinatio/`)  
**작성 일자**: 2026-11-06  
**관련 모듈**: RBAC 인가 엔진, 역할(Role) CRUD API, 사용자 관리 포털 (`UsersTab.jsx` / `RoleManager`)  
**검증 상태**: 계획 수립 및 구현 진행  

---

## 1. 개요 및 목적 (Executive Summary)

현재 Ordinatio는 3대 고정 시스템 역할(`SUPER_ADMIN`, `TENANT_ADMIN`, `VIEWER`) 체계로 구성되어 있어, 고객사 및 운영팀에서 사내 조직 특성에 맞는 커스텀 역할(예: `SECURITY_AUDITOR` 보안 감사관, `FINOPS_MANAGER` 재무 관리자, `OPERATOR` 모델 운영자 등)을 신규 정의하거나 불필요한 역할을 삭제할 수 없는 한계가 존재합니다.

본 엔지니어링 프로젝트는 **고객사 운영팀이 웹 관리 콘솔에서 직접 역할을 동적으로 추가(Add), 편집(Edit), 삭제(Delete)하고, 각 역할별 8대 제어 평면 권한(Permissions)을 세밀하게 제어할 수 있는 동적 RBAC Role 관리 엔진(Role Manager)을 구축**하는 것을 목적으로 합니다.

---

## 2. 핵심 아키텍처 및 불변 원칙 (Core Architectural Invariants)

1. **100% 에어갭 / 오프라인 자립성**:
   - 외부 IAM(Keycloak, Okta 등) 없이 로컬 PostgreSQL 및 자체 RBAC 엔진만으로 100% 자립 운영.
2. **시스템 기본 역할(System Roles) 불변 보호 (System Role Immunity)**:
   - 시스템 기본 3대 역할(`SUPER_ADMIN`, `TENANT_ADMIN`, `VIEWER`)은 `is_system=True` 플래그로 보호되며, 삭제나 코드명 변경이 원천 차단됩니다.
3. **참조 무결성 및 사용자 안전 가드 (Cascade Safety)**:
   - 현재 활성 사용자에게 부여되어 사용 중인 역할은 삭제할 수 없으며(HTTP 400 차단), 사용자의 역할을 먼저 재배치해야 삭제할 수 있도록 방어합니다.
4. **동적 사용자 폼 연동**:
   - 사용자 등록 및 수정 모달의 Role 선택 드롭다운은 DB에 등록된 활성 Role 목록과 실시간으로 연동됩니다.
5. **UI 텍스트 단일 진실 공급원 준수**:
   - 신규 추가되는 모든 UI 텍스트는 `constants/strings.js`의 `strings.roles` 네임스페이스를 통해 바인딩(하드코딩 한글 0건 유지).

---

## 3. 데이터베이스 모델 및 DDL 설계

### 3.1 `roles` 테이블 스키마 (`app/models/role.py`)

```python
class Role(Base):
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(64), unique=True, nullable=False, index=True) # 역할 코드 (예: SUPER_ADMIN, AUDITOR)
    display_name = Column(String(128), nullable=False) # 표시 명칭 (예: 보안 감사관)
    description = Column(String(512), nullable=True) # 역할 설명
    is_system = Column(Boolean, nullable=False, default=False) # 시스템 기본 역할 보호 플래그
    permissions = Column(JSON, nullable=False, default=list) # 세부 권한 코드 목록
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

### 3.2 8대 도메인 표준 권한 코드 인벤토리

| 권한 코드 (Code) | 권한 명칭 | 대상 도메인 및 제어 범위 |
| :--- | :--- | :--- |
| `overview:read` | 글로벌 관제 홈 조회 | 1초 WebSocket 실시간 관제 및 지표 요약 조회 |
| `routing:read` | 모델 & 라우팅 조회 | 서빙 모델 목록 및 라우팅 정책 열람 |
| `routing:write` | 모델 & 라우팅 관리 | 모델 카탈로그 CRUD, 카나리 가중치 배포, 라우트 디스패치 |
| `governance:read` | 테넌트/가상키 조회 | 부서(테넌트) 및 가상 API Key 목록 열람 |
| `governance:write` | 테넌트/가상키 관리 | 부서 생성/수정, 가상키 발급/수정/파기 수명주기 제어 |
| `prompts:read` | 시스템 프롬프트 조회 | 시스템 프롬프트 카탈로그 및 바인딩 열람 |
| `prompts:write` | 시스템 프롬프트 관리 | 시스템 프롬프트 등록/수정/삭제 및 1:1 타깃 바인딩 |
| `finops:read` | FinOps 비용 조회 | 부서별 예산 소진율, 표준 단가표, 청구서 열람 |
| `finops:write` | FinOps 예산/정산 관리 | 테넌트 월 예산 한도(Hard Cap) 설정 및 인보이스 CSV 내보내기 |
| `compliance:read` | PII/감사로그 조회 | PII 탐지 규칙 목록 및 WORM 불변 감사 로그 열람 |
| `compliance:write` | PII 규칙 관리 | PII 마스킹 규칙 등록/수정/삭제 및 포렌식 JSON 내보내기 |
| `lifecycle:read` | 수명주기/진단 조회 | 컴포넌트 버전, 패치 권고, 시스템 진단 헬스 조회 |
| `lifecycle:write` | 긴급 패치/운영 관리 | RSA-4096 서명 패치 적용, 롤백, 서포트 번들 생성 |
| `prompt_studio:execute` | 프롬프트 추론 실행 | 프롬프트 스튜디오 실시간 모델 추론 테스트 |
| `users:read` | 사용자 목록 조회 | 사용자 계정 목록 및 접속 세션 상태 열람 |
| `users:write` | 사용자 계정 관리 | 신규 사용자 등록, 인적사항/역할 변경, 계정 잠금 해제, 삭제 |
| `roles:manage` | 역할 및 권한 관리 | 커스텀 역할 추가/수정/삭제 및 세부 권한 매트릭스 편집 |

---

## 4. 백엔드 API 명세 (`app/api/v1/endpoints/roles.py`)

1. **`GET /api/v1/roles`**:
   - 등록된 전체 역할 목록 반환 (각 역할별 할당된 사용자 수 `user_count` 포함).
2. **`POST /api/v1/roles`**:
   - 신규 커스텀 역할 생성 (영문 대문자 코드 검증, 중복 방지, `is_system=False` 고정).
3. **`PATCH /api/v1/roles/{role_id}`**:
   - 역할 표시명, 설명, 권한 목록 수정 (시스템 기본 역할의 경우 코드명 변경 불가, 설명 및 권한 수정 가능).
4. **`DELETE /api/v1/roles/{role_id}`**:
   - 역할 삭제 (`is_system=True` 시 400 에러, 해당 역할을 사용 중인 사용자가 존재할 시 400 에러 차단).

---

## 5. 프론트엔드 UI 설계 (`UsersTab.jsx`)

1. **서브 탭 네비게이션**:
   - **[사용자 목록]** (`subTab === 'users'`)
   - **[역할 및 권한 관리]** (`subTab === 'roles'`)
2. **역할 관리 패널 요약 지표**:
   - 총 역할 수, 시스템 기본 역할 수, 커스텀 정의 역할 수 카드 표시.
3. **역할 목록 테이블**:
   - 역할 코드, 표시 명칭, 설명, 시스템 역할 여부(배지), 부여된 권한 수, 소속 사용자 수, 생성일시, 작업(수정 / 삭제).
4. **신규 역할 등록 및 수정 팝업 모달**:
   - 역할 코드 (`name`): 신규 등록 시 영문 대문자/언더스코어 입력, 수정 시 읽기 전용.
   - 역할 표시명 (`display_name`)
   - 역할 설명 (`description`)
   - 권한 선택 매트릭스: 8대 도메인별 체크박스 카드 + [전체 선택] / [전체 해제] 토글.
5. **동적 역할 드롭다운 바인딩**:
   - 사용자 등록/수정 모달의 역할 선택 드롭다운이 `roles` API 데이터를 실시간 바인딩하여 커스텀 역할 즉시 부여 가능.

---

## 6. 구현 및 자동화 검증 증적 (Implementation & Verification Evidence)

### 6.1. 구현된 컴포넌트 및 소스 파일
1. **데이터베이스 모델 및 스키마**:
   - [`ordinatio/backend/app/models/role.py`](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/models/role.py): `Role` ORM 모델 정의 (`id`, `name`, `display_name`, `description`, `is_system`, `permissions`, `created_at`, `updated_at`).
   - [`ordinatio/backend/app/schemas/role.py`](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/schemas/role.py): Pydantic V2 표준 `RoleCreate`, `RoleUpdate`, `RoleResponse`, `PermissionInfo` 스키마.
   - [`ordinatio/backend/app/core/permissions.py`](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/core/permissions.py): 8대 제어 평면 17개 표준 세부 권한 코드 및 카테고리 정의.
2. **시드 및 초기화**:
   - [`ordinatio/backend/app/db/init_db.py`](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/db/init_db.py): 기동 시 3대 시스템 기본 역할(`SUPER_ADMIN`, `TENANT_ADMIN`, `VIEWER`) 자동 시딩.
3. **백엔드 REST API**:
   - [`ordinatio/backend/app/api/v1/endpoints/roles.py`](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/api/v1/endpoints/roles.py): Role CRUD 및 권한 인벤토리 API 엔드포인트.
   - [`ordinatio/backend/app/api/v1/endpoints/users.py`](file:///Users/jason/project/오케스트레이터/ordinatio/backend/app/api/v1/endpoints/users.py): 사용자 생성/수정 시 동적 Role 유효성 검증 연동.
4. **프론트엔드 API 클라이언트 및 다국어**:
   - [`ordinatio/frontend/src/api/client.js`](file:///Users/jason/project/오케스트레이터/ordinatio/frontend/src/api/client.js): `getRoles()`, `getRolePermissions()`, `createRole()`, `updateRole()`, `deleteRole()` API 연동.
   - [`ordinatio/frontend/src/constants/strings.js`](file:///Users/jason/project/오케스트레이터/ordinatio/frontend/src/constants/strings.js): `strings.roles` 네임스페이스 신설 (하드코딩 0건).
5. **프론트엔드 포털 UI**:
   - [`ordinatio/frontend/src/components/UsersTab.jsx`](file:///Users/jason/project/오케스트레이터/ordinatio/frontend/src/components/UsersTab.jsx):
     - 사용자 목록(`users`)과 역할 관리(`roles`) 서브 탭 네비게이션.
     - 4종 Role KPI 요약 지표 카드.
     - Role 테이블 (`data-testid="roles-table"`), 시스템 기본 보호 배지, 사용자 카운트, 작업 버튼.
     - 신규 역할 등록 및 세부 권한 매트릭스 모달 (`isCreateRoleModalOpen`).
     - 역할 정보 및 권한 수정 모달 (`isEditRoleModalOpen`).
     - 사용자 등록/수정 모달에 동적 Role 드롭다운 바인딩.

### 6.2. 품질 검증 결과 (100% PASS)

| 검증 항목 | 검증 명령 | 수행 결과 | 판정 |
| :--- | :--- | :--- | :---: |
| **정적 분석 (한글 검사)** | Python 정규식 스캔 | JSX/코드 내 하드코딩된 한글 **0건 (EXACTLY ZERO)** | **PASS** |
| **프론트엔드 빌드** | `npm --prefix ordinatio/frontend run build` | `✓ 1892 modules transformed (built in 4.53s)` | **PASS** |
| **역할 단위/통합 테스트** | `cd ordinatio/backend && uv run pytest tests/test_roles.py -v` | **6 passed in 1.27s** | **PASS** |
| **RBAC 통합 테스트** | `cd ordinatio/backend && uv run pytest tests/test_auth_rbac.py -v` | **7 passed in 3.11s** | **PASS** |
| **백엔드 전체 회귀 테스트** | `cd ordinatio/backend && uv run pytest -q` | **92 passed in 62.31s (100% PASS)** | **PASS** |

### 6.3. 보안 안전성 검증
1. **시스템 기본 역할 삭제 시도 시 차단**: `DELETE /api/v1/roles/SUPER_ADMIN` 호출 시 `400 Bad Request` ("시스템 기본 역할은 보호되어 삭제 불가") 확인 완료.
2. **사용 중인 역할 삭제 시도 시 차단**: `OPERATOR` 역할을 부여받은 활성 사용자가 존재하는 상태에서 삭제 호출 시 `400 Bad Request` ("현재 1명의 사용자가 사용 중이므로 삭제 불가") 확인 완료.
3. **일반 조회자(VIEWER) 수정/생성 차단**: `POST /api/v1/roles` 호출 시 `403 Forbidden` 인가 차단 확인 완료.

---

## 7. 가상 API Key 거버넌스 PBAC 연동 및 SEC_AUDITOR 권한 격리 (Defect Resolution)

### 7.1. 결함 보고 내용 및 근본 원인 분석
- **현상**: `SEC_AUDITOR` 역할을 신규 생성하고 조회 권한(`governance:read`, `compliance:read`)만 설정하였음에도, 해당 사용자가 가상 API Key를 생성할 수 있었던 버그.
- **근본 원인**:
  1. **백엔드 엔드포인트 무방비**: `ordinatio/backend/app/api/v1/endpoints/virtual_keys.py`의 `create_virtual_key`, `revoke_virtual_key`, `update_virtual_key`, `delete_virtual_key` 엔드포인트에 세부 권한 의존성(`require_permission("governance:write")`)이 누락되어 인증 여부와 무관하게 호출 가능했음.
  2. **프론트엔드 버튼 노출**: `VirtualKeysTab.jsx`가 사용자의 세부 권한(`governance:write`)을 판별하지 않고 `[+ 신규 API Key 발급]`, `[+ 신규 부서 등록]` 버튼을 상시 활성화하고 있었음.
  3. **사용자 응답 내 권한 정보 부재**: `/api/v1/auth/me` 및 `/api/v1/auth/login` 응답에 사용자가 보유한 역할의 세부 권한 코드 목록(`permissions: [...]`)이 포함되지 않았음.

### 7.2. 개선 조치 및 구현 세부사항
1. **PBAC 인가 의존성 신설 (`deps.py`)**:
   - `require_permission(permission_code: str)` 의존성 구현.
   - `SUPER_ADMIN`은 모든 권한에 무제한 접근 허용(`*`).
   - 커스텀 역할(`SEC_AUDITOR` 등)은 DB의 `roles` 테이블에서 `permissions` 배열을 조회하여 `permission_code` 보유 여부 검증. 미보유 시 `403 Forbidden` (`detail="접근 권한이 없습니다. (필요 권한: 'governance:write', 현재 역할: 'SEC_AUDITOR')"`) 즉시 반환.
2. **엔드포인트 인가 잠금 (`virtual_keys.py`, `tenants.py`)**:
   - `GET /virtual-keys`, `GET /tenants`: `governance:read` 요구.
   - `POST /virtual-keys`, `PATCH /virtual-keys/{id}`, `DELETE /virtual-keys/{id}`, `PATCH /virtual-keys/{id}/revoke`: `governance:write` 요구.
   - `POST /tenants`, `PATCH /tenants/{id}`: `governance:write` 요구.
3. **프론트엔드 UI 가드 및 다국어 준수 (`VirtualKeysTab.jsx`, `strings.js`)**:
   - `useAuth()`에서 `hasPermission('governance:write')` 조회.
   - 권한 미보유 시 상단에 `[🔒 조회 전용 권한]` 배지(`data-testid="vk-badge-readonly"`) 표시.
   - `[+ 신규 API Key 발급]`, `[+ 신규 부서 등록]` 버튼 및 테이블 내 수정, 파기, 삭제 버튼을 `disabled` 처리하고 툴팁 바인딩.
   - 임의 모달 호출 차단 가드 적용.
4. **자동화 검증 증적**:
   - `tests/test_roles.py::test_sec_auditor_read_only_cannot_create_virtual_key` 추가 (100% 통과).
   - 실제 구동 중인 백엔드 컨테이너 실시간 검증 완료: `POST /virtual-keys` 호출 시 403 Forbidden 반환 확인.

---

## 8. 전 도메인(10대 도메인 · 17종 권한 코드) RBAC/PBAC 전수 점검 및 완전 강화 (PRE_38.2)

### 8.1. 전수 감사(Audit) 결과
프로젝트 전체 14개 백엔드 엔드포인트 모듈(`ordinatio/backend/app/api/v1/endpoints/`)과 프론트엔드 전체 탭 컴포넌트를 대상으로 `app/core/permissions.py`에 정의된 **10대 도메인 · 17종 세부 권한 코드(PBAC)** 적용 실태를 전수 검사하여 아래 구간의 누락을 식별 및 즉시 보완함:

| 도메인 | 세부 권한 코드 | 백엔드 엔드포인트 모듈 | 조치 전 상태 | 조치 후 상태 (PBAC 완전 적용) |
| :--- | :--- | :--- | :--- | :--- |
| **1. 통합 관제** | `overview:read` | `observability.py` | 미적용 | `GET /metrics/summary`, `POST /promql`에 `require_permission("overview:read")` 적용 |
| **2. 모델 및 라우팅** | `routing:read`, `routing:write` | `models.py`, `routing.py` | 미적용 | 조회/시뮬레이션/헬스체크(`routing:read`), 모델/라우트 등록·수정·삭제·카나리 배포·AgentRouter 정책 수정(`routing:write`) 및 `RoutingTab.jsx` UI 가드 적용 |
| **3. 테넌트 & 가상키** | `governance:read`, `governance:write` | `tenants.py`, `virtual_keys.py` | `DELETE /tenants/{id}` 누락 | 전 엔드포인트(`GET`, `POST`, `PATCH`, `DELETE`, `revoke`) PBAC 적용 및 `VirtualKeysTab.jsx` UI 가드 적용 완료 |
| **4. 시스템 프롬프트** | `prompts:read`, `prompts:write` | `system_prompts.py` | 미적용 | 목록/단건/시뮬레이션(`prompts:read`), 생성/수정/삭제(`prompts:write`) 및 `SystemPromptsTab.jsx` UI 가드 적용 |
| **5. FinOps 과금/예산** | `finops:read`, `finops:write` | `finops.py`, `external.py` | 미적용 | 대시보드/요약(`finops:read`), 정산서 CSV 추출 및 부서 예산 증액(`finops:write`) 및 `FinOpsTab.jsx` UI 가드 적용 |
| **6. 컴플라이언스/감사** | `compliance:read`, `compliance:write` | `compliance.py` | 미적용 | PII 룰/WORM 감사로그/통계/시뮬레이션(`compliance:read`), PII 룰 생성/수정/삭제(`compliance:write`) 및 `ComplianceTab.jsx` UI 가드 적용 |
| **7. 라이프사이클/패치** | `lifecycle:read`, `lifecycle:write` | `lifecycle.py` | 미적용 | 컴포넌트/패치이력/사전진단(`lifecycle:read`), 서명검증/Dry-run/적용/롤백/서포트번들(`lifecycle:write`) 및 `LifecycleTab.jsx` UI 가드 적용 |
| **8. 프롬프트 스튜디오** | `prompt_studio:execute` | `PromptStudioTab.jsx` | 미적용 | `hasPermission('prompt_studio:execute')` 기반 샌드박스 추론 실행 가드 및 조회 전용 배지 표시 |
| **9. 사용자 관리** | `users:read`, `users:write` | `users.py`, `UsersTab.jsx`, `Sidebar.jsx` | `SUPER_ADMIN` 하드코딩 | `GET /users`(`users:read`), `POST/PATCH/DELETE /users`(`users:write`) PBAC 전환 및 사이드바/탭 동적 접근 허용 |
| **10. 역할(Role) 관리** | `roles:manage` | `roles.py`, `UsersTab.jsx`, `Sidebar.jsx` | `SUPER_ADMIN` 하드코딩 | `POST/PATCH/DELETE /roles`(`roles:manage`) PBAC 전환 및 사이드바/탭 동적 접근 허용 |

### 8.2. Implied Read 권한 설계 및 API Client 인증 헤더 일원화
- **상위 쓰기 권한의 읽기 권한 자동 내포 (`deps.py`)**: 특정 도메인에 대해 `<domain>:write` 권한을 부여받은 역할은 별도로 `<domain>:read`를 체크하지 않았더라도 해당 도메인의 읽기 API(`GET`)를 호출할 수 있도록 `require_permission`을 고도화함 (역방향인 `:read` -> `:write`는 엄격 차단).
- **프론트엔드 API Client JWT 헤더 전수 부착 (`client.js`)**: 제어 평면(Control Plane)의 모든 API 호출(`models`, `routing`, `tenants`, `virtual-keys`, `system-prompts`, `finops`, `observability`, `compliance`, `lifecycle`, `users`, `roles`)에 `getAuthHeaders()`가 100% 포함되도록 통일.
- **자동화 통합 검증 (`tests/test_roles.py::test_all_domains_pbac_enforcement`)**: 전 도메인 조회 전용 역할(`GLOBAL_READER`)을 생성하여 10대 도메인의 모든 `:read` 엔드포인트(`200 OK`) 및 `:write`/`:manage` 엔드포인트(`403 Forbidden`)를 자동 검증하여 **전체 93개 테스트 100% PASS** 달성.

