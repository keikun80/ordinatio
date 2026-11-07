import re
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.role import Role
from app.models.user import User
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse, PermissionInfo
from app.api.deps import require_roles, require_permission, get_current_user
from app.core.permissions import AVAILABLE_PERMISSIONS, ALL_PERMISSION_CODES

router = APIRouter()
super_admin_guard = require_permission("roles:manage")

def _to_role_response(role: Role, db: Session) -> RoleResponse:
    user_cnt = db.query(func.count(User.id)).filter(User.role == role.name).scalar() or 0
    return RoleResponse(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        permissions=role.permissions or [],
        user_count=user_cnt,
        created_at=role.created_at,
        updated_at=role.updated_at
    )

@router.get("", response_model=List[RoleResponse])
def list_roles(
    current_user: User = Depends(require_permission("users:read")),
    db: Session = Depends(get_db)
):
    """List all registered roles and their assigned user counts."""
    roles = db.query(Role).order_by(Role.is_system.desc(), Role.created_at.asc()).all()
    return [_to_role_response(r, db) for r in roles]

@router.get("/permissions", response_model=List[PermissionInfo])
def list_available_permissions(
    current_user: User = Depends(require_permission("users:read"))
):
    """List all available platform granular permissions."""
    return [PermissionInfo(**p) for p in AVAILABLE_PERMISSIONS]

@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(super_admin_guard)])
def create_role(
    req: RoleCreate,
    db: Session = Depends(get_db)
):
    """Create a new custom role (SUPER_ADMIN only)."""
    # Normalize role name
    role_name = req.name.strip().upper()
    if not re.match(r"^[A-Z0-9_]{2,64}$", role_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="역할 식별 코드는 2~64자의 영문 대문자, 숫자, 언더스코어(_)만 사용할 수 있습니다."
        )

    # Check duplicate
    if db.query(Role).filter(Role.name == role_name).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"이미 등록된 역할 식별 코드입니다: '{role_name}'"
        )

    # Validate permissions
    invalid_perms = [p for p in req.permissions if p not in ALL_PERMISSION_CODES and p != "*"]
    if invalid_perms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 권한 코드가 포함되어 있습니다: {', '.join(invalid_perms)}"
        )

    new_role = Role(
        name=role_name,
        display_name=req.display_name.strip(),
        description=req.description.strip() if req.description else None,
        is_system=False,
        permissions=req.permissions
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return _to_role_response(new_role, db)

@router.patch("/{role_id}", response_model=RoleResponse, dependencies=[Depends(super_admin_guard)])
def update_role(
    role_id: str,
    req: RoleUpdate,
    db: Session = Depends(get_db)
):
    """Update role display name, description, or permissions (SUPER_ADMIN only)."""
    role = db.query(Role).filter((Role.id == role_id) | (Role.name == role_id)).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 역할을 찾을 수 없습니다."
        )

    if req.display_name is not None:
        role.display_name = req.display_name.strip()
    if req.description is not None:
        role.description = req.description.strip() if req.description else None
    if req.permissions is not None:
        invalid_perms = [p for p in req.permissions if p not in ALL_PERMISSION_CODES and p != "*"]
        if invalid_perms:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"유효하지 않은 권한 코드가 포함되어 있습니다: {', '.join(invalid_perms)}"
            )
        role.permissions = req.permissions

    db.commit()
    db.refresh(role)
    return _to_role_response(role, db)

@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(super_admin_guard)])
def delete_role(
    role_id: str,
    db: Session = Depends(get_db)
):
    """Delete a custom role (Cannot delete system roles or roles currently in use)."""
    role = db.query(Role).filter((Role.id == role_id) | (Role.name == role_id)).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 역할을 찾을 수 없습니다."
        )

    if role.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"시스템 기본 역할('{role.name}')은 시스템 보호를 위해 삭제할 수 없습니다."
        )

    # Check if in use
    in_use_count = db.query(func.count(User.id)).filter(User.role == role.name).scalar() or 0
    if in_use_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"현재 {in_use_count}명의 사용자가 '{role.name}' 역할을 사용 중이므로 삭제할 수 없습니다. 먼저 사용자의 역할을 변경해 주십시오."
        )

    db.delete(role)
    db.commit()
    return None

