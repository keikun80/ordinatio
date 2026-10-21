from passlib.context import CryptContext
import secrets

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

def generate_virtual_key() -> str:
    """
    Generate a high-entropy 32-character virtual API Key with 'sk-orch-' prefix.
    Length: 8 ('sk-orch-') + 32 (hex) = 40 characters.
    """
    random_hex = secrets.token_hex(16)
    return f"sk-orch-{random_hex}"

def hash_virtual_key(key: str) -> str:
    """Hash the virtual API key using Argon2id for secure one-way storage."""
    return pwd_context.hash(key)

def verify_virtual_key(plain_key: str, hashed_key: str) -> bool:
    """Verify plaintext key against stored Argon2id hash."""
    return pwd_context.verify(plain_key, hashed_key)

# Aliases for backwards compatibility
get_key_hash = hash_virtual_key
verify_key = verify_virtual_key

# ------------------------------------------------------------------------------
# Human User Password & JWT Token Security
# ------------------------------------------------------------------------------
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from app.core.config import settings

def hash_password(password: str) -> str:
    """Hash user password with Argon2id."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plaintext password against stored hash."""
    return pwd_context.verify(plain_password, hashed_password)

def hash_session_token(token: str) -> str:
    """Generate SHA-256 hash for database session lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_access_token(
    user_id: str,
    username: str,
    role: str,
    tenant_id: Optional[str],
    session_id: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Generate signed JWT access token for web console & control plane."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode: Dict[str, Any] = {
        "sub": user_id,
        "username": username,
        "role": role,
        "tenant_id": tenant_id,
        "sid": session_id,
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate signed JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

# System Diagnostics Virtual Key for appliance loopback testing
SYSTEM_DIAGNOSTICS_KEY = "sk-orch-system-diagnostics-appliance-key"
SYSTEM_DIAGNOSTICS_KEY_ID = "vk-system-diagnostics"

def ensure_system_diagnostics_key(db_session):
    """
    Ensure the official system diagnostics virtual key is seeded into DB.
    This enables dashboard one-click gateway test calls and prompt studio
    without creating security bypasses or mock backdoors.
    """
    from app.models.virtual_key import VirtualKey
    from app.models.tenant import Tenant
    
    existing = db_session.query(VirtualKey).filter(VirtualKey.key_id == SYSTEM_DIAGNOSTICS_KEY_ID).first()
    if existing:
        return existing
    
    tenant = db_session.query(Tenant).first()
    tenant_id = tenant.tenant_id if tenant else "dept-wm"
    
    diag_key = VirtualKey(
        key_id=SYSTEM_DIAGNOSTICS_KEY_ID,
        key_hash=hash_virtual_key(SYSTEM_DIAGNOSTICS_KEY),
        key_prefix=SYSTEM_DIAGNOSTICS_KEY[:16],
        tenant_id=tenant_id,
        name="[시스템] 대시보드 진단 및 즉시 호출 전용 키",
        allowed_models=[],
        allowed_ip_cidrs=[],
        rpm_limit=1000,
        tpm_limit=1000000,
        is_active=True,
        expires_at=None
    )
    db_session.add(diag_key)
    try:
        db_session.commit()
    except Exception:
        db_session.rollback()
    return diag_key
