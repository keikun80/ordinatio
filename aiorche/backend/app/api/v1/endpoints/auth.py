import uuid
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

def _to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    hash_session_token
)
from app.models.user import User, UserSession
from app.models.role import Role
from app.core.permissions import ALL_PERMISSION_CODES
from app.schemas.user import (
    UserLoginRequest,
    UserLoginResponse,
    UserResponse,
    PasswordChangeRequest
)
from app.api.deps import get_current_user, extract_token_from_request

router = APIRouter(prefix="/auth", tags=["User Authentication & Session Management"])

def _build_user_response(user: User, db: Optional[Session] = None) -> UserResponse:
    now = datetime.now(timezone.utc)
    locked_until = _to_utc(user.locked_until)
    is_locked = bool(locked_until and locked_until > now)
    tenant_name = user.tenant.name if user.tenant else None

    permissions = []
    if user.role == "SUPER_ADMIN":
        permissions = ["*"] + ALL_PERMISSION_CODES
    elif db:
        role_obj = db.query(Role).filter(Role.name == user.role).first()
        if role_obj and role_obj.permissions:
            permissions = role_obj.permissions

    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        permissions=permissions,
        tenant_id=user.tenant_id,
        tenant_name=tenant_name,
        is_active=user.is_active,
        failed_login_count=user.failed_login_count,
        is_locked=is_locked,
        locked_until=user.locked_until,
        last_login_at=user.last_login_at,
        created_at=user.created_at
    )

@router.post("/login", response_model=UserLoginResponse)
def login(
    req: UserLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """Authenticate user with Argon2id, enforce lockout on 5 failures, and revoke duplicate sessions."""
    now = datetime.now(timezone.utc)

    user = db.query(User).filter(
        or_(User.username == req.username, User.email == req.username)
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 올바르지 않습니다."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다. 시스템 관리자에게 문의하십시오."
        )

    # 1. Check account lockout
    locked_until = _to_utc(user.locked_until)
    if locked_until and locked_until > now:
        remaining_seconds = int((locked_until - now).total_seconds())
        remaining_minutes = max(1, (remaining_seconds + 59) // 60)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"비밀번호 {settings.MAX_LOGIN_ATTEMPTS}회 연속 오류로 계정이 잠겨 있습니다. ({remaining_minutes}분 후 자동 해제됩니다)"
        )

    # 2. Verify password with Argon2id
    if not verify_password(req.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.MAX_LOGIN_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"비밀번호 {settings.MAX_LOGIN_ATTEMPTS}회 연속 오류로 계정이 {settings.LOCKOUT_DURATION_MINUTES}분간 잠겼습니다."
            )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"아이디 또는 비밀번호가 올바르지 않습니다. (연속 실패 {user.failed_login_count}/{settings.MAX_LOGIN_ATTEMPTS}회)"
        )

    # 3. Successful login - Reset failure counters
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now

    # 4. Enforce Single Active Session (중복 로그인 제어)
    # Revoke any existing active sessions for this user
    existing_active_sessions = db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.is_revoked == False
    ).all()
    for s in existing_active_sessions:
        s.is_revoked = True

    # 5. Issue new session & JWT access token
    session_id = str(uuid.uuid4())
    session_token = secrets.token_urlsafe(32)
    session_token_hash = hash_session_token(session_token)

    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "")[:500]

    new_session = UserSession(
        id=session_id,
        user_id=user.id,
        session_token_hash=session_token_hash,
        ip_address=client_ip,
        user_agent=user_agent,
        last_activity_at=now,
        expires_at=now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        is_revoked=False
    )
    db.add(new_session)
    db.commit()

    access_token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
        tenant_id=user.tenant_id,
        session_id=session_id
    )

    # Set secure HttpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=False  # Allow http in air-gap local network
    )

    return UserLoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_build_user_response(user, db)
    )

@router.post("/logout")
def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke all active sessions for current user and clear cookie."""
    active_sessions = db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.is_revoked == False
    ).all()
    for s in active_sessions:
        s.is_revoked = True
    db.commit()

    response.delete_cookie(key="access_token")
    return {"message": "성공적으로 로그아웃되었습니다."}

@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve currently authenticated user profile and permissions."""
    return _build_user_response(current_user, db)

@router.post("/password")
def change_password(
    req: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change current user password."""
    if not verify_password(req.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기존 비밀번호가 일치하지 않습니다."
        )

    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "비밀번호가 성공적으로 변경되었습니다."}
