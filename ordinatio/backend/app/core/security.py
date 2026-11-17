from passlib.context import CryptContext
import secrets
import base64
from typing import Optional, Dict, Any
from cryptography.fernet import Fernet, InvalidToken

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

def generate_virtual_key() -> str:
    """
    Generate a high-entropy 32-character virtual API Key with 'sk-ord-' prefix.
    Length: 7 ('sk-ord-') + 32 (hex) = 39 characters.
    """
    random_hex = secrets.token_hex(16)
    return f"sk-ord-{random_hex}"

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
from datetime import datetime, timedelta, timezone
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
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode: Dict[str, Any] = {
        "sub": user_id,
        "username": username,
        "role": role,
        "tenant_id": tenant_id,
        "sid": session_id,
        "exp": expire,
        "iat": now
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate signed JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

# System Diagnostics Virtual Key for appliance loopback testing (HMAC-derived per SECRET_KEY, never static plaintext)
import hmac
import ipaddress
from urllib.parse import urlsplit

SYSTEM_DIAGNOSTICS_KEY = (
    f"sk-ord-diag-{hmac.new(settings.SECRET_KEY.encode('utf-8'), b'ordinatio-system-diagnostics', hashlib.sha256).hexdigest()[:27]}"
)
SYSTEM_DIAGNOSTICS_KEY_ID = "vk-system-diagnostics"
INTERNAL_DIAGNOSTICS_CIDRS = [
    "127.0.0.0/8",
    "::1/128",
    "172.16.0.0/12",
    "192.168.65.0/24",
    "10.0.0.0/8",
]

def ensure_system_diagnostics_key(db_session):
    """
    Ensure the official system diagnostics virtual key is seeded into DB.
    Restricted to internal loopback/container CIDRs and derived from SECRET_KEY.
    """
    from app.models.virtual_key import VirtualKey
    from app.models.tenant import Tenant
    
    expected_prefix = SYSTEM_DIAGNOSTICS_KEY[:16]
    existing = db_session.query(VirtualKey).filter(VirtualKey.key_id == SYSTEM_DIAGNOSTICS_KEY_ID).first()
    if existing:
        needs_update = False
        if existing.key_prefix != expected_prefix:
            existing.key_prefix = expected_prefix
            existing.key_hash = hash_virtual_key(SYSTEM_DIAGNOSTICS_KEY)
            needs_update = True
        if existing.allowed_ip_cidrs != INTERNAL_DIAGNOSTICS_CIDRS:
            existing.allowed_ip_cidrs = list(INTERNAL_DIAGNOSTICS_CIDRS)
            needs_update = True
        if needs_update:
            try:
                db_session.commit()
            except Exception:
                db_session.rollback()
        return existing
    
    tenant = db_session.query(Tenant).first()
    tenant_id = tenant.tenant_id if tenant else None
    
    diag_key = VirtualKey(
        key_id=SYSTEM_DIAGNOSTICS_KEY_ID,
        key_hash=hash_virtual_key(SYSTEM_DIAGNOSTICS_KEY),
        key_prefix=expected_prefix,
        tenant_id=tenant_id,
        name="[시스템] 대시보드 진단 및 즉시 호출 전용 키 (내부 루프백 전용)",
        allowed_models=[],
        allowed_ip_cidrs=list(INTERNAL_DIAGNOSTICS_CIDRS),
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


# ------------------------------------------------------------------------------
# SSRF Validation for Upstream Model Endpoints (C-2)
# ------------------------------------------------------------------------------
_FORBIDDEN_UPSTREAM_HOSTS = {
    "metadata.google.internal",
    "metadata",
    "169.254.169.254",
    "postgres",
    "ordinatio-postgres",
    "redis",
    "ordinatio-redis",
    "envoy",
    "ordinatio-envoy",
}
_FORBIDDEN_UPSTREAM_PORTS = {5432, 6379, 9901, 18000}

def validate_upstream_endpoint_url(url: str) -> str:
    """
    Validate upstream LLM target_endpoint URL to prevent SSRF attacks against
    cloud metadata endpoints (169.254.169.254), non-HTTP schemes, or internal
    control-plane services (PostgreSQL 5432, Redis 6379, Envoy Admin 9901, xDS 18000).
    Raises ValueError if the URL is unsafe.
    """
    if not url or not isinstance(url, str):
        raise ValueError("유효하지 않은 엔드포인트 URL입니다.")
    cleaned = url.strip()
    parsed = urlsplit(cleaned)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise ValueError(f"허용되지 않는 URL 프로토콜 스킴입니다 ({scheme or '없음'}). http:// 또는 https://만 허용됩니다.")

    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        raise ValueError("엔드포인트 URL에 유효한 호스트명이 없습니다.")

    if hostname in _FORBIDDEN_UPSTREAM_HOSTS:
        raise ValueError(f"보안 정책상 내부 인프라 또는 메타데이터 호스트({hostname})로의 접근은 차단됩니다.")

    try:
        ip_obj = ipaddress.ip_address(hostname)
        if ip_obj.is_link_local or ip_obj in ipaddress.ip_network("169.254.0.0/16"):
            raise ValueError(f"보안 정책상 링크-로컬/클라우드 메타데이터 IP 대역({hostname})은 차단됩니다.")
    except ValueError as e:
        if "보안 정책상" in str(e):
            raise

    try:
        port = parsed.port
    except ValueError:
        raise ValueError("엔드포인트 URL의 포트 번호가 유효하지 않습니다.")

    if port in _FORBIDDEN_UPSTREAM_PORTS:
        raise ValueError(f"보안 정책상 내부 제어 평면 포트({port})로의 업스트림 연결은 차단됩니다.")

    return cleaned


# ------------------------------------------------------------------------------
# Upstream Model Provider API Key Fernet Encryption & Masking (A-2)
# ------------------------------------------------------------------------------
def _get_fernet_key() -> bytes:
    """Derive deterministic 32-byte URL-safe base64 key from appliance SECRET_KEY."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)

def encrypt_upstream_key(key: Optional[str]) -> Optional[str]:
    """
    Encrypt upstream provider API key (e.g. OpenAI, Anthropic, vLLM)
    using Fernet symmetric encryption derived from appliance SECRET_KEY.
    Returns ciphertext prefixed with 'enc:'.
    """
    if not key or not key.strip():
        return None
    if key.startswith("enc:"):
        return key
    if "..." in key or key == "sk-***":
        return None  # Masked placeholder passed back; should not overwrite
    f = Fernet(_get_fernet_key())
    ciphertext = f.encrypt(key.encode("utf-8")).decode("utf-8")
    return f"enc:{ciphertext}"

def decrypt_upstream_key(cipher_text: Optional[str]) -> Optional[str]:
    """
    Decrypt upstream provider API key.
    If the key does not start with 'enc:', returns plain key for backward compatibility.
    """
    if not cipher_text:
        return None
    if not cipher_text.startswith("enc:"):
        return cipher_text
    raw_cipher = cipher_text[4:]
    f = Fernet(_get_fernet_key())
    try:
        return f.decrypt(raw_cipher.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        return cipher_text

def mask_api_key(key: Optional[str]) -> Optional[str]:
    """
    Mask an API key for safe display in UI/API responses (never exposes plaintext).
    e.g. 'sk-ant-api03-123456789' -> 'sk-...6789'
    """
    if not key:
        return None
    decrypted = decrypt_upstream_key(key) if key.startswith("enc:") else key
    if not decrypted:
        return None
    if len(decrypted) <= 8:
        return "sk-***"
    prefix = decrypted[:4] if decrypted.startswith("sk-") else decrypted[:3]
    suffix = decrypted[-4:]
    return f"{prefix}...{suffix}"


# -----------------------------------------------------------------------------
# Reverse Proxy & AWS ELB Real Client IP Extraction
# -----------------------------------------------------------------------------
def is_ip_match(ip_str: str, cidr_or_ip: str) -> bool:
    """Check if an IP matches a single IP or CIDR network string."""
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        if "/" in cidr_or_ip:
            net = ipaddress.ip_network(cidr_or_ip, strict=False)
            return ip_obj in net
        else:
            return ip_obj == ipaddress.ip_address(cidr_or_ip)
    except ValueError:
        return False

def is_trusted_proxy_ip(peer_ip: str) -> bool:
    """Check if the direct peer is a trusted reverse proxy (e.g. AWS ALB, local Nginx, or container)."""
    if peer_ip in ("testclient", "localhost", "127.0.0.1", "::1"):
        return True
    trusted_list = [p.strip() for p in settings.TRUSTED_PROXIES.split(",") if p.strip()]
    if "*" in trusted_list:
        return True
    for item in trusted_list:
        if is_ip_match(peer_ip, item):
            return True
    return False

def get_client_real_ip(request: Any) -> str:
    """
    Extract the real client IP address behind reverse proxies / AWS ALB.
    Validates that the immediate peer is trusted before honoring X-Forwarded-For.
    """
    if not request:
        return "127.0.0.1"
    
    peer_host = request.client.host if (request.client and request.client.host) else "127.0.0.1"
    
    if settings.BEHIND_PROXY and is_trusted_proxy_ip(peer_host):
        # 1. Check X-Forwarded-For header (leftmost IP is the originating client)
        xff = request.headers.get("x-forwarded-for")
        if xff:
            hops = [h.strip() for h in xff.split(",") if h.strip()]
            if hops:
                return hops[0]
        
        # 2. Check X-Real-IP header as fallback
        x_real_ip = request.headers.get("x-real-ip")
        if x_real_ip and x_real_ip.strip():
            return x_real_ip.strip()
            
    return "127.0.0.1" if peer_host == "testclient" else peer_host


