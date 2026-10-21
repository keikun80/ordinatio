from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="allow")

    PROJECT_NAME: str = "AI Orchestrator Control Plane"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    ENV: str = "development"
    DEBUG: bool = True
    DATACENTER_NAME: str = "온프레미스 주전산센터"
    CLUSTER_REGION: str = "DC-1 서울"
    DEPLOY_MODE: str = "air-gap"
    ALLOW_DEV_MOCK_KEYS: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Security & User Authentication (RBAC)
    SECRET_KEY: str = "orchestrator-in-airgap-rsa4096-secret-change-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    SESSION_INACTIVITY_TIMEOUT_MINUTES: int = 30
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/aiorche_db"
    
    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # Envoy
    ENVOY_INGRESS_URL: str = "http://localhost:8080"
    ENVOY_ADMIN_URL: str = "http://localhost:9901"
    ENVOY_XDS_PORT: int = 18000

    # Keycloak
    KEYCLOAK_SERVER_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "aiorche"

settings = Settings()
