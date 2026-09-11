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
