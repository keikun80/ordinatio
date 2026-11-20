from typing import List, Optional
from datetime import datetime, timezone

def _to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import hash_password
from app.models.user import User, UserSession
from app.models.tenant import Tenant
from app.models.role import Role
from app.core.permissions import ALL_PERMISSION_CODES
from app.schemas.user import (
    UserCreateRequest,
    UserUpdateRequest,
    UserResponse
)
from app.api.deps import require_roles, require_permission, get_current_user

router = APIRouter(prefix="/users", tags=["User & RBAC Account Administration"])

users_read_guard = require_permission("users:read")
users_write_guard = require_permission("users:write")

def _to_user_response(user: User, db: Optional[Session] = None) -> UserResponse:
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

@router.get("", response_model=List[UserResponse], dependencies=[Depends(users_read_guard)])
def list_users(
    tenant_id: Optional[str] = Query(None, description="부서별 필터링"),
    role: Optional[str] = Query(None, description="역할 필터링"),
    db: Session = Depends(get_db)
):
    """List all user accounts in the enterprise appliance (Super Admin Only)."""
    query = db.query(User)
    if tenant_id:
        query = query.filter(User.tenant_id == tenant_id)
    if role:
        query = query.filter(User.role == role)
    users = query.order_by(User.created_at.desc()).all()
    return [_to_user_response(u, db) for u in users]

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(users_write_guard)])
def create_user(
    req: UserCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new operator/user account with role and tenant mapping."""
    # Privilege Escalation Guard: Only SUPER_ADMIN can assign SUPER_ADMIN role
    if req.role == "SUPER_ADMIN" and current_user.role != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="전사 최고 관리자(SUPER_ADMIN) 역할은 최고 관리자만 생성하거나 부여할 수 있습니다."
        )

    # Check duplicate username
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"이미 사용 중인 사용자 아이디입니다: '{req.username}'"
        )

    # Check duplicate email
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"이미 등록된 이메일 주소입니다: '{req.email}'"
        )

    # Validate role dynamically against roles table or fallback
    role_obj = db.query(Role).filter(Role.name == req.role).first()
    if not role_obj and req.role not in ["SUPER_ADMIN", "TENANT_ADMIN", "VIEWER"]:
        valid_roles = [r.name for r in db.query(Role.name).all()] or ["SUPER_ADMIN", "TENANT_ADMIN", "VIEWER"]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 역할입니다. (허용 역할: {', '.join(valid_roles)})"
        )

    # Validate tenant if provided
    tenant_id = req.tenant_id.strip() if (req.tenant_id and req.tenant_id.strip()) else None
    if tenant_id:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"존재하지 않는 부서(테넌트) ID입니다: '{tenant_id}'"
            )

    new_user = User(
        username=req.username,
        full_name=req.full_name,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        tenant_id=tenant_id,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return _to_user_response(new_user, db)

@router.patch("/{user_id}", response_model=UserResponse, dependencies=[Depends(users_write_guard)])
def update_user(
    user_id: str,
    req: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user role, tenant binding, status, password, or reset lockout."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    # Privilege Escalation Guard: Non-SUPER_ADMIN cannot promote anyone to SUPER_ADMIN
    if req.role == "SUPER_ADMIN" and current_user.role != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="전사 최고 관리자(SUPER_ADMIN) 역할은 최고 관리자만 부여할 수 있습니다."
        )

    # Protection Guard: Non-SUPER_ADMIN cannot modify SUPER_ADMIN accounts
    if user.role == "SUPER_ADMIN" and current_user.role != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="전사 최고 관리자 계정은 다른 최고 관리자만 수정할 수 있습니다."
        )

    # Anti-Orphaned Lockout Guard: Cannot deactivate self if SUPER_ADMIN, and last active SUPER_ADMIN cannot be deactivated
    if req.is_active is False and user.role == "SUPER_ADMIN":
        if current_user.id == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="현재 로그인 중인 본인 전사 최고 관리자(SUPER_ADMIN) 계정은 비활성화할 수 없습니다."
            )
        active_sa_count = db.query(User).filter(User.role == "SUPER_ADMIN", User.is_active == True).count()
        if active_sa_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="시스템 내 유일한 활성 전사 최고 관리자(SUPER_ADMIN) 계정은 비활성화할 수 없습니다."
            )

    if req.full_name is not None:
        user.full_name = req.full_name
    if req.email is not None:
        # Check duplicate email
        existing = db.query(User).filter(User.email == req.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="이미 다른 사용자가 사용 중인 이메일입니다.")
        user.email = req.email
    if req.role is not None:
        role_obj = db.query(Role).filter(Role.name == req.role).first()
        if not role_obj and req.role not in ["SUPER_ADMIN", "TENANT_ADMIN", "VIEWER"]:
            raise HTTPException(status_code=400, detail="유효하지 않은 역할입니다.")
        user.role = req.role
    if req.tenant_id is not None:
        if req.tenant_id != "":
            tenant = db.query(Tenant).filter(Tenant.tenant_id == req.tenant_id).first()
            if not tenant:
                raise HTTPException(status_code=400, detail="존재하지 않는 부서 ID입니다.")
            user.tenant_id = req.tenant_id
        else:
            user.tenant_id = None
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.password:
        user.password_hash = hash_password(req.password)
    if req.unlock:
        user.failed_login_count = 0
        user.locked_until = None

    db.commit()
    db.refresh(user)
    return _to_user_response(user, db)

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(users_write_guard)])
def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user account (Cannot delete self)."""
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="현재 로그인 중인 본인 계정은 삭제할 수 없습니다."
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    # Protection Guard: Non-SUPER_ADMIN cannot delete a SUPER_ADMIN
    if user.role == "SUPER_ADMIN" and current_user.role != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="전사 최고 관리자 계정은 다른 최고 관리자만 삭제할 수 있습니다."
        )

    # Anti-Orphaned Lockout Guard: The last active SUPER_ADMIN cannot be deleted
    if user.role == "SUPER_ADMIN":
        active_sa_count = db.query(User).filter(User.role == "SUPER_ADMIN", User.is_active == True).count()
        if active_sa_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="시스템 내 유일한 전사 최고 관리자(SUPER_ADMIN) 계정은 삭제할 수 없습니다."
            )

    db.delete(user)
    db.commit()
    return None
