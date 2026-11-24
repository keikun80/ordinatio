from datetime import datetime, timedelta, timezone
from typing import Optional, List, Callable

def _to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
from fastapi import Depends, HTTPException, status, Header, Cookie, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
from app.core.security import decode_access_token
from app.models.user import User, UserSession
from app.models.role import Role

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False
)

def extract_token_from_request(
    auth_header: Optional[str] = Header(None, alias="Authorization"),
    cookie_token: Optional[str] = Cookie(None, alias="access_token"),
    oauth_token: Optional[str] = Depends(oauth2_scheme)
) -> Optional[str]:
    """Extract Bearer token from Header, OAuth2 scheme, or Cookie."""
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    if oauth_token:
        return oauth_token
    if cookie_token:
        return cookie_token
    return None

def get_current_user(
    token: Optional[str] = Depends(extract_token_from_request),
    db: Session = Depends(get_db)
) -> User:
    """Validate JWT access token and single active session state with 30m sliding timeout."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증되지 않은 요청입니다. 로그인이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 인증 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰 페이로드 규격이 올바르지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. User existence & active check
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="존재하지 않는 사용자 계정입니다."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다. 관리자에게 문의하십시오."
        )

    # 2. Account lockout check
    now = datetime.now(timezone.utc)
    locked_until = _to_utc(user.locked_until)
    if locked_until and locked_until > now:
        remaining_seconds = int((locked_until - now).total_seconds())
        remaining_minutes = max(1, (remaining_seconds + 59) // 60)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"비밀번호 5회 연속 오류로 계정이 잠겨 있습니다. ({remaining_minutes}분 후 자동 해제)"
        )

    # 3. Session validation (Single Active Session & Inactivity Timeout)
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == user.id
    ).first()

    if not session or session.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="세션이 만료되었거나 다른 기기에서 로그인되어 종료되었습니다."
        )

    # 4. 30-minute inactivity check (sliding window)
    inactivity_limit = timedelta(minutes=settings.SESSION_INACTIVITY_TIMEOUT_MINUTES)
    last_act = _to_utc(session.last_activity_at)
    if last_act and (now - last_act > inactivity_limit):
        session.is_revoked = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"{settings.SESSION_INACTIVITY_TIMEOUT_MINUTES}분 동안 활동이 없어 세션이 만료되었습니다. 다시 로그인해 주십시오."
        )

    # Update last activity timestamp
    session.last_activity_at = now
    db.commit()

    return user

def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user

def require_roles(allowed_roles: List[str]) -> Callable[[User], User]:
    """Enforce role-based access control (RBAC)."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"접근 권한이 없습니다. (필요 권한: {', '.join(allowed_roles)}, 보유 권한: {current_user.role})"
            )
        return current_user
    return role_checker

def require_permission(permission_code: str) -> Callable:
    """
    Enforce fine-grained PBAC based on dynamic Role permissions in DB.
    - SUPER_ADMIN: unrestricted access to all permissions.
    - Custom / standard roles: check if '*' or permission_code exists in role.permissions.
    - Unauthenticated requests strictly return 401 Unauthorized across all environments.
    """
    def permission_checker(
        token: Optional[str] = Depends(extract_token_from_request),
        db: Session = Depends(get_db)
    ) -> User:
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="인증되지 않은 요청입니다. 로그인이 필요합니다.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        current_user = get_current_user(token=token, db=db)
        role = db.query(Role).filter(Role.name == current_user.role).first()
        perms = role.permissions if role and role.permissions else []

        if "*" in perms or permission_code in perms:
            return current_user

        if permission_code.endswith(":read"):
            write_equiv = permission_code.replace(":read", ":write")
            if write_equiv in perms:
                return current_user
            if permission_code == "users:read" and "roles:manage" in perms:
                return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"접근 권한이 없습니다. (필요 권한: '{permission_code}', 현재 역할: '{current_user.role}')"
        )

    return permission_checker

def require_any_permission(*permission_codes: str) -> Callable:
    """
    Enforce fine-grained PBAC allowing access if the user possesses ANY of the given permission codes.
    - SUPER_ADMIN: unrestricted access to all permissions.
    - Custom / standard roles: check if '*' or any requested permission_code matches role.permissions.
    - Supports automatic :write equivalence for :read permissions.
    """
    def permission_checker(
        token: Optional[str] = Depends(extract_token_from_request),
        db: Session = Depends(get_db)
    ) -> User:
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="인증되지 않은 요청입니다. 로그인이 필요합니다.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        current_user = get_current_user(token=token, db=db)
        role = db.query(Role).filter(Role.name == current_user.role).first()
        perms = role.permissions if role and role.permissions else []

        if "*" in perms:
            return current_user

        for permission_code in permission_codes:
            if permission_code in perms:
                return current_user
            if permission_code.endswith(":read"):
                write_equiv = permission_code.replace(":read", ":write")
                if write_equiv in perms:
                    return current_user
                if permission_code == "users:read" and "roles:manage" in perms:
                    return current_user

        codes_str = ", ".join(f"'{c}'" for c in permission_codes)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"접근 권한이 없습니다. (필요 권한 중 하나: [{codes_str}], 현재 역할: '{current_user.role}')"
        )

    return permission_checker

def get_tenant_scope(current_user: User = Depends(get_current_user)) -> Optional[str]:
    """
    Returns tenant_id for scoped data access.
    - SUPER_ADMIN: None (unrestricted, cross-tenant access)
    - TENANT_ADMIN / VIEWER: bound to current_user.tenant_id
    """
    if current_user.role == "SUPER_ADMIN":
        return None
    return current_user.tenant_id
