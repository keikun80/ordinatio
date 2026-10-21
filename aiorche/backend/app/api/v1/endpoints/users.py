from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import hash_password
from app.models.user import User, UserSession
from app.models.tenant import Tenant
from app.schemas.user import (
    UserCreateRequest,
    UserUpdateRequest,
    UserResponse
)
from app.api.deps import require_roles, get_current_user

router = APIRouter(prefix="/users", tags=["User & RBAC Account Administration"])

# Enforce SUPER_ADMIN role across all user management endpoints
super_admin_guard = require_roles(["SUPER_ADMIN"])

def _to_user_response(user: User) -> UserResponse:
    now = datetime.utcnow()
    is_locked = bool(user.locked_until and user.locked_until > now)
    tenant_name = user.tenant.name if user.tenant else None
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        tenant_id=user.tenant_id,
        tenant_name=tenant_name,
        is_active=user.is_active,
        failed_login_count=user.failed_login_count,
        is_locked=is_locked,
        locked_until=user.locked_until,
        last_login_at=user.last_login_at,
        created_at=user.created_at
    )

@router.get("", response_model=List[UserResponse], dependencies=[Depends(super_admin_guard)])
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
    return [_to_user_response(u) for u in users]

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(super_admin_guard)])
def create_user(
    req: UserCreateRequest,
    db: Session = Depends(get_db)
):
    """Create a new operator/user account with role and tenant mapping."""
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

    # Validate role
    valid_roles = ["SUPER_ADMIN", "TENANT_ADMIN", "VIEWER"]
    if req.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 역할입니다. (허용 역할: {', '.join(valid_roles)})"
        )

    # Validate tenant if provided
    if req.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == req.tenant_id).first()
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"존재하지 않는 부서(테넌트) ID입니다: '{req.tenant_id}'"
            )

    new_user = User(
        username=req.username,
        full_name=req.full_name,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        tenant_id=req.tenant_id,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return _to_user_response(new_user)

@router.patch("/{user_id}", response_model=UserResponse, dependencies=[Depends(super_admin_guard)])
def update_user(
    user_id: str,
    req: UserUpdateRequest,
    db: Session = Depends(get_db)
):
    """Update user role, tenant binding, status, password, or reset lockout."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
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
        if req.role not in ["SUPER_ADMIN", "TENANT_ADMIN", "VIEWER"]:
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
    return _to_user_response(user)

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(super_admin_guard)])
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

    db.delete(user)
    db.commit()
    return None
