from typing import List, Any
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="allow")

    PROJECT_NAME: str = "Ordinatio Control Plane"
    VERSION: str = "1.0.2"
    API_V1_STR: str = "/api/v1"
    
    ENV: str = "development"
    DEBUG: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, v: Any) -> Any:
        if isinstance(v, str):
            if v.lower() in ("release", "prod", "production", "false", "0", "no", "off"):
                return False
            if v.lower() in ("debug", "dev", "development", "true", "1", "yes", "on"):
                return True
        return v
    DATACENTER_NAME: str = "온프레미스 주전산센터"
    CLUSTER_REGION: str = "DC-1 서울"
    DEPLOY_MODE: str = "air-gap"
    ALLOW_DEV_MOCK_KEYS: bool = False
    SEED_DEMO_DATA: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Security & User Authentication (RBAC)
    SECRET_KEY: str = "orchestrator-in-airgap-rsa4096-secret-change-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    SESSION_INACTIVITY_TIMEOUT_MINUTES: int = 30
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15
    INITIAL_ADMIN_USERNAME: str = "admin"
    INITIAL_ADMIN_EMAIL: str = "admin@ordinatio.local"
    INITIAL_ADMIN_PASSWORD: str = "admin1234!"

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/ordinatio_db"
    
    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # Envoy
    ENVOY_INGRESS_URL: str = "http://127.0.0.1:8080"
    ENVOY_ADMIN_URL: str = "http://localhost:9901"
    ENVOY_XDS_PORT: int = 18000
    DOCKER_BRIDGE_GATEWAY_IP: str = "172.20.0.1"

    # Gateway Timeouts (Configurable via .env or install.conf)
    GATEWAY_READ_TIMEOUT: float = 120.0
    GATEWAY_CONNECT_TIMEOUT: float = 10.0
    MODEL_HEALTH_CHECK_DEFAULT_TIMEOUT: float = 3.0

    # Air-gapped local semantic cache (no external embedding service)
    SEMANTIC_CACHE_ENABLED: bool = True
    SEMANTIC_CACHE_SIMILARITY_THRESHOLD: float = 0.92
    SEMANTIC_CACHE_TTL_SECONDS: int = 3600
    SEMANTIC_CACHE_MAX_CANDIDATES: int = 200

    # Reverse Proxy & AWS ELB Configuration
    BEHIND_PROXY: bool = True
    TRUSTED_PROXIES: str = "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,testclient"
    ENVOY_XFF_NUM_TRUSTED_HOPS: int = 1
    ENFORCE_SSL_REDIRECT: bool = False

    # Keycloak
    KEYCLOAK_SERVER_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "ordinatio"

settings = Settings()
