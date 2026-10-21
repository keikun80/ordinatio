# PRE-26: 사용자 인증 및 역할 기반 권한 관리(RBAC) 아키텍처 및 구현 사양서
(User Authentication & Role-Based Access Control Architecture Specification)

> **문서 상태**: 설계 확정 및 구현 준비 (Approved & Ready for Implementation)  
> **최초 작성일**: 2026-10-21  
> **대상 시스템**: AI Orchestrator Control Plane (FastAPI) & Admin Console (React 18 + Vite)  
> **아키텍처 표준**: 폐쇄망(Air-Gapped) 자립형, 금융권 전자금융감독규정 및 정보보호 표준 준수  

---

## 1. 개요 및 배경 (Executive Summary)

현재 AI Orchestrator는 L7 AI Gateway로 인입되는 LLM API 요청에 대해 테넌트별 가상 API Key(`sk-orch-...`, Argon2id 단방향 솔트 해싱) 기반의 M2M(Machine-to-Machine) 인증을 완벽하게 지원하고 있습니다.

그러나 웹 브라우저를 통해 접속하는 **어드민 포털(Admin Console)과 제어 평면 REST API**는 현재 익명 접근이 허용되어 있어, 고객사 엔터프라이즈 및 금융권 컴플라이언스(전자금융감독규정 제13조 등)를 충족하기 위해서는 **운영자 및 사용자(Human Users)에 대한 엄격한 식별/인증(Authentication), 역할 기반 권한 제어(RBAC), 세션 보안 통제**가 필수적입니다.

본 문서는 사용자의 확정된 의사결정 사항을 바탕으로, 외부 인터넷이나 클라우드 SaaS IdP(Auth0 등) 없이 **100% 폐쇄망 로컬 환경에서 자립적으로 동작하는 사용자 인증 및 RBAC 시스템의 소프트웨어 공학적 설계 사양**을 정의합니다.

---

## 2. 확정된 아키텍처 결정 사항 (ADR - Architectural Decision Records)

| 번호 | 결정 항목 | 채택 방안 | 결정 사유 및 기대 효과 |
| :---: | :--- | :--- | :--- |
| **ADR-1** | **인증 방식 (IdP)** | **옵션 A: 자체 로컬 DB 계정 관리** | 외부 Keycloak/LDAP 등 추가 인프라 구축 부담 없이, PostgreSQL 내장 테이블과 Argon2id 해싱으로 100% 오프라인 자립 기동 |
| **ADR-2** | **역할 체계 (Roles)** | **옵션 A: 3단계 역할 모델** | `SUPER_ADMIN`(전사 총괄), `TENANT_ADMIN`(부서 관리), `VIEWER`(조회 전용)의 직관적이고 군더더기 없는 권한 통제 |
| **ADR-3** | **사용자-부서 관계** | **옵션 A: 1:1 매핑** | 한 사용자는 반드시 하나의 부서(테넌트)에만 명확히 소속되어 데이터 범위(Scope) 침범 및 권한 충돌 원천 차단 |
| **ADR-4** | **세션 및 보안 제약** | **금융 보안 표준 3대 제약 적용** | ① 30분 미활동 시 자동 로그아웃 (Inactivity Timeout)<br>② 5회 비밀번호 오류 시 15분간 계정 잠금<br>③ 신규 로그인 시 기존 세션 무효화 (중복 로그인 방지) |
| **ADR-5** | **초기 계정 부트스트랩** | **방법 2: `make init-admin` CLI** | 평문 비밀번호의 소스코드/환경변수 노출을 방지하고, 서버 기동 후 안전한 대화형(터미널 마스킹)으로 최초 슈퍼관리자 생성 |

---

## 3. 3단계 역할(Role) 체계 및 8대 메뉴 인가(Authorization) 매트릭스

### 3.1 역할별 정의 및 권한 범위

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AI Orchestrator Role Hierarchy                       │
├────────────────────────────────────────────────────────────────────────┤
│  [1] SUPER_ADMIN (슈퍼 관리자)                                         │
│      - 전사 플랫폼 총괄 운영자                                         │
│      - 모든 부서(테넌트) 데이터 열람/수정, 사용자 계정 생성/역할 부여    │
│      - 전사 모델 풀/라우팅, 긴급 보안 패치 적용, 시스템 자가진단 수행   │
├────────────────────────────────────────────────────────────────────────┤
│  [2] TENANT_ADMIN (부서 관리자)                                        │
│      - 소속 부서(테넌트 1:1) 한정 제어 권한                            │
│      - 소속 부서의 가상 API Key 발급/폐기, 부서 시스템 프롬프트 등록     │
│      - 소속 부서의 FinOps 예산/토큰 계량 및 인보이스 열람               │
├────────────────────────────────────────────────────────────────────────┤
│  [3] VIEWER (일반 조회자)                                              │
│      - 전사 또는 소속 부서 지표 열람 전용 (Read-Only)                  │
│      - 가상키 발급, 라우팅 수정, 프롬프트 변경, 패치 적용 일체 불가     │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 8대 메뉴별 CRUD 권한 매트릭스

| 메뉴 번호 및 명칭 | SUPER_ADMIN | TENANT_ADMIN | VIEWER | 비고 |
| :--- | :---: | :---: | :---: | :--- |
| **M1. 글로벌 관제 홈** | 전사 지표 조회 | 소속 부서 지표 조회 | 전체/부서 지표 조회 (R) | 테넌트 필터링 적용 |
| **M2. 모델 & 라우팅** | 전체 CRUD | 조회 전용 (R) | 조회 전용 (R) | 부서 관리자는 모델/라우팅 수정 불가 |
| **M3. 거버넌스 (테넌트/키)** | 전체 테넌트/키 CRUD | **소속 부서 키 발급/폐기** | 소속 부서 키 목록 조회 (R) | 타 부서 키 수정/조회 불가 |
| **M4. 시스템 프롬프트** | 전사 프롬프트 CRUD | **부서 프롬프트 CRUD** | 프롬프트 목록 조회 (R) | 우선순위 계층 유지 |
| **M5. FinOps 비용 & 예산** | 전사 예산 설정 & 정산 | **소속 부서 쿼터/인보이스** | 소속 부서 사용량 조회 (R) | 타 부서 재무데이터 차단 |
| **M6. PII 보안 & 감사** | PII 규칙 관리 & WORM 열람 | **차단 (Access Denied)** | 조회 전용 (R, 마스킹) | 금융 보안 분리 원칙 |
| **M7. 긴급 패치 & 자가진단** | 패치 적용 & 진단 전체 | **차단 (Access Denied)** | 시스템 진단 헬스 조회만 | 패치 적용은 슈퍼관리자 전용 |
| **M8. 프롬프트 스튜디오** | 전체 모델 추론 | 소속 부서 키로 추론 | **차단 (Access Denied)** | 토큰 비용 발생 메뉴 제한 |
| **[신규] 사용자 관리 (Users)** | 사용자 계정 전체 CRUD | **차단 (Access Denied)** | 본인 프로필 조회/PW변경 | 슈퍼관리자만 사용자 추가/잠금해제 |

---

## 4. 데이터베이스 엔티티 설계 (PostgreSQL)

### 4.1 `users` 테이블 (사용자 계정 및 보안 상태)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,               -- 로그인 ID (영문, 숫자)
    full_name VARCHAR(128) NOT NULL,                    -- 성명
    email VARCHAR(255) UNIQUE NOT NULL,                 -- 사내 이메일
    password_hash VARCHAR(255) NOT NULL,                -- Argon2id 단방향 솔트 해시
    role VARCHAR(32) NOT NULL DEFAULT 'VIEWER',         -- 'SUPER_ADMIN', 'TENANT_ADMIN', 'VIEWER'
    tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE SET NULL, -- 소속 부서 (1:1 매핑)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- 활성 상태
    failed_login_count INT NOT NULL DEFAULT 0,          -- 연속 로그인 실패 횟수 (최대 5회)
    locked_until TIMESTAMP WITH TIME ZONE NULL,         -- 계정 잠금 만료 일시 (5회 실패 시 +15분)
    last_login_at TIMESTAMP WITH TIME ZONE NULL,        -- 최종 로그인 일시
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
```

### 4.2 `user_sessions` 테이블 (단일 활성 세션 & 중복 로그인 제어)

```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) NOT NULL,            -- SHA-256(세션 식별자)
    ip_address VARCHAR(64) NOT NULL,                    -- 접속 IP
    user_agent VARCHAR(512) NULL,                       -- 브라우저 정보
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL, -- 최종 활동 시간 (30분 슬라이딩)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,       -- 세션 절대 만료 일시
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,          -- 강제 만료 여부 (중복 로그인 시 TRUE)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_active ON user_sessions(user_id, is_revoked);
```

---

## 5. 보안 제약 및 세션 라이프사이클 엔진 상세

```
[클라이언트 로그인 요청]
       │
       ▼
1. 사용자 존재 및 is_active 확인
       ├─ 사용자 없음 or 비활성 ──► 401 Unauthorized (동일한 오류 메시지로 사용자 유추 방지)
       ▼
2. 계정 잠금(locked_until) 검사
       ├─ locked_until > NOW() ──► 403 Forbidden ("비밀번호 5회 오류로 15분간 잠김")
       ▼
3. Argon2id 비밀번호 검증
       ├─ 불일치 ──► failed_login_count += 1
       │             ├─ count >= 5 ──► locked_until = NOW() + 15분, 감사로그 기록
       │             └─ count < 5  ──► 401 Unauthorized ("아이디 또는 비밀번호 오류")
       ▼
4. 인증 성공
       ├─ failed_login_count = 0, locked_until = NULL, last_login_at = NOW()
       ├─ [중복 로그인 제어] 기존 동일 사용자의 활성 세션(is_revoked=FALSE) 일괄 REVOKE
       ├─ 신규 세션 발급:
       │    - Session ID (UUIDv4) 생성 및 DB/Redis 등록
       │    - JWT Access Token (유효기간 30분, payload: sub=user_id, role, tenant_id, sid)
       └─ 감사로그(WORM) 'AUTH_LOGIN_SUCCESS' 기록
```

### 5.1 30분 미활동 자동 로그아웃 메커니즘
1. **백엔드 검증**:
   - 모든 인가 필요 요청 인입 시 FastAPI Middleware에서 `user_sessions.last_activity_at`을 검사.
   - `현재 시간 - last_activity_at > 30분`이면 세션을 즉시 만료(`is_revoked=TRUE`)하고 `401 Session Expired` 반환.
   - 유효한 요청일 경우 `last_activity_at`을 현재 시각으로 갱신(Sliding Window).
2. **프론트엔드 UI 타이머 통제**:
   - React `AuthContext`에서 마우스 이동, 키보드 입력 등 사용자 인터랙션을 감지하는 유휴 타이머(Inactivity Timer) 구동.
   - 28분 경과 시: "2분 후 세션이 만료됩니다. 세션을 연장하시겠습니까?" 모달 팝업 표시.
   - 30분 도달 시: 클라이언트 토큰 삭제 및 즉시 로그인 화면으로 리다이렉트.

### 5.2 중복 로그인 방지 (Single Active Session)
- 한 사용자가 PC-A에서 로그인한 상태에서 PC-B에서 동일 계정으로 로그인하면:
  - PC-B 로그인 성공 즉시 PC-A의 세션을 `is_revoked = TRUE`로 마킹.
  - PC-A의 다음 API 요청 시 즉시 `401 Unauthorized: 다른 브라우저에서 로그인되어 세션이 종료되었습니다`를 수신하고 로그아웃 처리.

---

## 6. 초기 관리자 계정 부트스트랩 CLI (`make init-admin`)

서버 초기 구동 후 소스코드나 파일에 평문 비밀번호를 기록하지 않고, 안전하게 대화형 터미널 인터페이스를 통해 최초 슈퍼 관리자를 생성합니다:

```bash
# 실행 명령 (Makefile 타깃)
make init-admin
```

### 실행 흐름:
```text
============================================================
🔐 AI Orchestrator Initial Super Admin Bootstrap
============================================================
기존 등록된 슈퍼 관리자 존재 여부 점검 중...
-> 등록된 슈퍼 관리자가 없습니다. 최초 관리자 계정을 설정합니다.

Username [admin]: admin
Full Name: 시스템 최고관리자
Email: secops-admin@enterprise.internal
Enter Password (typing hidden): ********
Confirm Password (typing hidden): ********

[검증 중...]
 ✔ 비밀번호 복잡도 통과 (영문, 숫자, 특수문자 포함 8자 이상)
 ✔ Argon2id 솔트 단방향 해싱 생성 완료
 ✔ PostgreSQL DB 사용자 레코드 영구 저장 완료

🎉 SUCCESS: 슈퍼 관리자 'admin' 계정이 안전하게 생성되었습니다.
웹 콘솔(http://localhost:5173)에서 로그인해 주십시오.
============================================================
```

---

## 7. 프론트엔드(UI) 변경 사양

1. **로그인 화면 (`LoginPage.jsx` / `LoginModal.jsx`)**:
   - 에어갭 전용 Vanilla CSS Glassmorphism & Dark Slate 테마 유지.
   - 아이디, 비밀번호 입력, 캡스락 감지, 연속 실패 시 잠금 남은 시간(분:초) 카운트다운 표시.
2. **상단 헤더 (`Header.jsx`)**:
   - 우측 상단에 현재 로그인된 사용자 정보 배지 추가:
     - 예: `[홍길동 | 자산관리팀 | TENANT_ADMIN]`
   - 자동 로그아웃 남은 시간 표시 (`⏱ 29:45`) 및 [세션 연장] 버튼.
   - [로그아웃] 버튼.
3. **사이드바 메뉴 인가 필터링 (`Sidebar.jsx`)**:
   - 사용자의 `role`에 따라 권한이 없는 메뉴는 아예 표시하지 않거나 자물쇠 아이콘으로 비활성화.
   - 예: `TENANT_ADMIN`에게는 `PII 보안 & 감사`, `긴급 패치` 메뉴가 숨김 처리됨.
4. **신규 탭: 사용자 계정 관리 (`UsersTab.jsx`)**:
   - `SUPER_ADMIN`에게만 노출되는 사용자 관리 탭.
   - 사용자 목록 조회, 신규 계정 발급, 부서 배정, 잠금 해제(Reset Lock), 비밀번호 초기화 기능.

---

## 8. 단계별 구현 및 검증 계획 (Implementation & Verification DoD)

| 단계 | 작업 내용 | 검증 기준 (Definition of Done) |
| :---: | :--- | :--- |
| **Phase 1** | **Backend Core & DB**<br>- `models/user.py`, `models/session.py`<br>- Argon2id 해싱, JWT 토큰 유틸리티<br>- `make init-admin` CLI 스크립트 작성 | - `make init-admin` 정상 실행 및 DB 적재<br>- 비밀번호 5회 틀릴 시 15분 잠금 단위 테스트 통과 |
| **Phase 2** | **Backend Auth API & Guards**<br>- `/api/v1/auth/login`, `/logout`, `/me`<br>- FastAPI Dependency (`get_current_active_user`, `require_role`)<br>- 테넌트별 데이터 격리(Scope Guard) | - `pytest tests/test_auth_rbac.py` 100% 통과<br>- 타 부서 키 수정 시도 시 403 Forbidden 검증 |
| **Phase 3** | **Frontend UI & State**<br>- `AuthContext.jsx` (로그인 세션 유지)<br>- `LoginPage.jsx` (로그인 폼)<br>- `Header.jsx` 사용자 배지 & 타이머<br>- `Sidebar.jsx` 권한별 메뉴 필터링 | - 브라우저 E2E 로그인 / 로그아웃 흐름 통과<br>- 권한 없는 메뉴 접근 차단 UI 검증 |
| **Phase 4** | **DoD 통합 자동화 검증**<br>- `scripts/verify-auth-rbac.sh`<br>- `make verify-auth` 타깃 등록 | - CLI 스크립트 1회 실행으로 모든 권한 시나리오 자동 검증 통과 |

---

## 9. 결론 및 다음 단계

사용자께서 결정해 주신 5가지 핵심 항목(로컬 DB, 3단계 역할, 1:1 테넌트 매핑, 금융 3대 보안 제약, `make init-admin` 부트스트랩)을 반영하여 완전한 소프트웨어 공학적 사양서 작성을 마쳤습니다.

사용자의 지시("코딩은 하지 말고 계획만 해")에 따라 실제 소스코드 변경은 전혀 진행하지 않았으며, 향후 사용자의 구현 승인 시 본 계획서에 정의된 Phase 1부터 순차적으로 구현을 진행하게 됩니다.
