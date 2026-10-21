# 사용자 인증 및 역할 기반 접근 통제(RBAC) 구현 및 검증 결과 보고서

**문서 번호**: PRE_27  
**최종 개정일**: 2026-10-21  
**상태**: APPROVED & IMPLEMENTED (통과 완료)  
**기반 사양서**: [PRE_26_user_authentication_and_rbac_specification.md](file:///Users/jason/project/오케스트레이터/architecture/PRE_26_user_authentication_and_rbac_specification.md)  
**DoD 검증 스크립트**: `aiorche/scripts/verify-auth-rbac.sh` (`make verify-auth-rbac`)

---

## 1. 개요 및 구현 배경
본 문서는 고객 자율 운영형 폐쇄망(Air-Gapped) 환경에서 운영되는 AI Orchestrator Appliance의 **사용자 인증(Authentication) 및 역할 기반 접근 제어(RBAC, Role-Based Access Control)** 기능의 최종 구현 내역 및 테스트 검증 결과를 기록합니다.

사용자의 명시적 결정에 따라 아래 5가지 원칙을 100% 충족하도록 설계 및 엔지니어링되었습니다:
1. **인증 방식 (Option A)**: 폐쇄망 로컬 PostgreSQL DB 저장소 (`User`, `UserSession`) + Argon2id 단방향 솔트 암호화 + JWT 토큰 발급.
2. **역할 세분화 모델 (Option A)**: 3-Tier 역할 모델 (`SUPER_ADMIN`, `TENANT_ADMIN`, `VIEWER`).
3. **사용자-테넌트 관계 (Option A)**: 1:1 관계 (`users.tenant_id`)를 통한 테넌트 격리.
4. **금융권 보안 제약**:
   - 30분 미활동 시 슬라이딩 자동 세션 만료 및 강제 로그아웃
   - 비밀번호 5회 연속 오류 시 15분간 계정 자동 잠금 (`locked_until`)
   - 단일 활성 세션 보장 (중복 로그인 시 이전 세션 즉시 폐기)
5. **초기 부트스트랩**: 대화형 CLI 명령어 `make init-admin` (`init_admin.py`) 지원.

---

## 2. 아키텍처 및 엔지니어링 구현 내역

### 2.1 Backend 구조 (`aiorche/backend`)
| 파일 경로 | 구현 기능 및 기술 세부사항 |
| :--- | :--- |
| `app/models/user.py` | `User`(계정, Argon2id 해시, 권한, 실패 카운트, 잠금 시각) 및 `UserSession`(단일 활성 세션, 토큰 해시, 슬라이딩 활동 시각) ORM 모델 |
| `app/schemas/user.py` | Pydantic V2 기반 요청/응답 스키마 (`UserLoginRequest`, `UserLoginResponse`, `UserResponse`, `UserCreateRequest`, `UserUpdateRequest`, `PasswordChangeRequest`) |
| `app/core/config.py` | `SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`(30), `SESSION_INACTIVITY_TIMEOUT_MINUTES`(30), `MAX_LOGIN_ATTEMPTS`(5), `LOCKOUT_DURATION_MINUTES`(15) |
| `app/core/security.py` | `hash_password`, `verify_password`, `hash_session_token`, `create_access_token`, `decode_access_token` |
| `app/api/deps.py` | `get_current_user`, `require_roles`, `get_tenant_scope` 의존성 주입 게이트웨이 |
| `app/api/v1/endpoints/auth.py` | `/login`, `/logout`, `/me`, `/password` 엔드포인트 |
| `app/api/v1/endpoints/users.py` | 사용자 CRUD, 비밀번호 초기화, 잠금 해제 관리 API (`SUPER_ADMIN` 전용) |
| `app/scripts/init_admin.py` | 대화형 마스킹 입력 및 CLI 인자 지원 최고 관리자 부트스트래퍼 |

### 2.2 Frontend 구조 (`aiorche/frontend`)
| 파일 경로 | 구현 기능 및 UI/UX 특징 |
| :--- | :--- |
| `src/context/AuthContext.jsx` | React Context 기반 인증 상태 관리, 30분 슬라이딩 타이머, 브라우저 활동 감지 리스너, 토큰 로컬스토리지 관리 |
| `src/components/LoginPage.jsx` | Glassmorphism Dark Slate 테마 로그인 화면, 금융 보안 안내 배지, 비밀번호 토글, 5회 실패 시 15분 잠금 안내 |
| `src/components/Header.jsx` | 로그인 사용자 배지, 30분 실시간 카운트다운 타이머 (`⏱ 29:45`), [연장] 클릭 기능, [로그아웃] 버튼 |
| `src/components/Sidebar.jsx` | 권한 기반 메뉴 필터링, `SUPER_ADMIN` 접속 시 '사용자 및 계정 관리' 탭 동적 활성화 |
| `src/components/UsersTab.jsx` | 사용자 통계 KPI 카드, 검색/필터, 사용자 등록 모달, 비밀번호 초기화 모달, 계정 잠금 해제 액션 |
| `src/App.jsx` | `AuthProvider` 래핑, 비인증 시 `LoginPage` 렌더링, 인증 시 대시보드 및 권한 탭 라우팅 |

---

## 3. 단위 및 통합 테스트 검증 결과

### 3.1 타깃 검증 결과 (`tests/test_auth_rbac.py`)
```bash
uv run pytest tests/test_auth_rbac.py -v
```
| 테스트 케이스 | 검증 항목 | 결과 |
| :--- | :--- | :---: |
| `test_init_admin_script` | 초기 부트스트랩 스크립트 실행 및 SUPER_ADMIN 생성 | **PASS** |
| `test_login_success_and_me` | 올바른 자격증명 로그인, JWT 토큰 발급 및 `/auth/me` 프로필 조회 | **PASS** |
| `test_login_invalid_password_and_failed_count` | 잘못된 비밀번호 시 401 오류 및 실패 횟수 1씩 증가 확인 | **PASS** |
| `test_account_lockout_after_5_failures` | 5회 연속 오류 시 403 Forbidden 및 15분간 잠금(`locked_until`) 검증 | **PASS** |
| `test_single_active_session_enforcement` | 중복 로그인 시 이전 기기 세션 즉시 무효화 (Single Active Session) | **PASS** |
| `test_inactivity_timeout_30m` | 30분 경과된 세션 호출 시 401 Unauthorized 세션 만료 검증 | **PASS** |
| `test_rbac_super_admin_vs_tenant_admin` | SUPER_ADMIN 계정 생성 및 TENANT_ADMIN의 사용자 관리 접근 403 차단 검증 | **PASS** |

### 3.2 전사 테스트 스위트 회귀 검증 (`make test`)
- **Backend Pytest**: **85 Passed / 0 Failed (100% 통과)**
  - `tests/test_agent_router.py`: 11 Passed
  - `tests/test_auth_rbac.py`: 7 Passed
  - `tests/test_compliance.py`: 8 Passed
  - `tests/test_external_api.py`: 4 Passed
  - `tests/test_finops_observability.py`: 6 Passed
  - `tests/test_gateway_security_p0.py`: 6 Passed
  - `tests/test_health.py`: 5 Passed
  - `tests/test_lifecycle.py`: 8 Passed
  - `tests/test_phase1_system_prompt_schema.py`: 4 Passed
  - `tests/test_phase3_prompt_injection.py`: 3 Passed
  - `tests/test_routing.py`: 11 Passed
  - `tests/test_system_prompts.py`: 5 Passed
  - `tests/test_virtual_keys.py`: 7 Passed
- **Frontend Build**: **Vite Production Bundle (`dist/assets/index-*.js`, 505 kB) 컴파일 100% 성공**

---

## 4. Definition of Done (DoD) 자동화 검증

`make verify-auth-rbac` 실행 결과:
```text
==========================================================
🔐 AI Orchestrator Auth & RBAC Definition of Done (DoD) Audit
  [사용자 인증, 3계층 역할 통제, 30분 세션 보안 및 관리 평면 검증]
==========================================================
==> [1/5] Verifying Core Auth & RBAC Artifacts...
  ✅ All Auth & RBAC core files verified.
==> [2/5] Testing Initial Admin CLI Bootstrapper...
  ✅ Bootstrapper CLI options and help verified.
==> [3/5] Running Backend Auth & RBAC Test Suite...
  ✅ All 7 Auth & RBAC targeted test scenarios passed.
==> [4/5] Running Full Backend Zero-Regression Test Suite...
  ✅ Full test suite (85/85 tests) passed with ZERO regressions.
==> [5/5] Validating Frontend Production Build (Vite)...
  ✅ Frontend production bundle with Auth & Users tab compiled successfully.
==========================================================
🎉 DoD PASS: 사용자 인증 및 RBAC 권한 통제 구현 및 검증 완료!
   • 인증 방식: Local DB (Argon2id + JWT)
   • 권한 모델: 3-Tier (SUPER_ADMIN, TENANT_ADMIN, VIEWER)
   • 테넌트 격리: 1:1 사용자-부서 매핑 및 교차 테넌트 차단
   • 금융 보안 제약: 30분 슬라이딩 세션, 5회 실패 시 15분 잠금, 단일 세션
   • 초기 부트스트랩: make init-admin CLI 지원
==========================================================
```

---

## 5. 결론 및 향후 로드맵
AI Orchestrator Appliance는 본 구현을 통해 외부 SaaS IdP나 클라우드 의존성 없이 고객사의 자체 PostgreSQL DB와 완벽하게 폐쇄된 환경에서 금융 보안 표준(30분 미활동 세션 만료, 5회 잠금, Argon2id 해싱, 3계층 RBAC)을 완벽하게 만족하는 엔터프라이즈 운영 기반을 확보하였습니다.
