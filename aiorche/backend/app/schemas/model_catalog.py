from typing import Optional
from datetime import datetime, timezone
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict

class ServingEngineEnum(str, Enum):
    VLLM = "vLLM"
    OLLAMA = "Ollama"
    SGLANG = "SGLang"
    TRITON = "Triton"

class ExecutionMethodEnum(str, Enum):
    K8S = "k8s"
    DOCKER_COMPOSE = "docker-compose"
    DIRECT = "direct"

class ModelCatalogBase(BaseModel):
    model_id: str = Field(..., json_schema_extra={"example": "meta-llama/Llama-3.1-8B-Instruct"})
    alias: str = Field(..., json_schema_extra={"example": "financial-advisor-v1"})
    serving_engine: str = Field(default="vLLM", json_schema_extra={"example": "vLLM"})
    execution_method: str = Field(default="k8s", json_schema_extra={"example": "k8s"})
    backend_infra: str = Field(default="On-Prem K8s", json_schema_extra={"example": "On-Prem K8s"})
    target_endpoint: str = Field(..., json_schema_extra={"example": "http://vllm-llama8b.ai-serving:8000"})
    input_price_per_1k: float = Field(default=0.8, ge=0.0)
    output_price_per_1k: float = Field(default=2.4, ge=0.0)
    cache_discount_ratio: float = Field(default=0.25, ge=0.0, le=1.0)
    is_active: bool = True
    api_key: Optional[str] = Field(default=None, description="Upstream LLM API Key (optional)")
    auth_type: Optional[str] = Field(default="none", description="Upstream authentication header option: 'none', 'apikey' (apikey: {key}), or 'bearer' (Authorization: Bearer {key})")
    provider: Optional[str] = Field(default="openai", description="LLM protocol/provider: 'openai', 'deepseek', 'anthropic', 'gemini', 'cohere', 'custom'")

class ModelCatalogCreate(ModelCatalogBase):
    pass

class ModelCatalogUpdate(BaseModel):
    alias: Optional[str] = None
    serving_engine: Optional[str] = None
    execution_method: Optional[str] = None
    backend_infra: Optional[str] = None
    target_endpoint: Optional[str] = None
    input_price_per_1k: Optional[float] = None
    output_price_per_1k: Optional[float] = None
    cache_discount_ratio: Optional[float] = None
    is_active: Optional[bool] = None
    api_key: Optional[str] = None
    auth_type: Optional[str] = None
    provider: Optional[str] = None

class ModelCatalogResponse(ModelCatalogBase):
    model_config = ConfigDict(from_attributes=True)
    updated_at: Optional[datetime] = None

class ModelHealthCheckResult(BaseModel):
    model_id: str
    alias: str
    serving_engine: str
    execution_method: str
    target_endpoint: str
    provider: Optional[str] = "openai"
    is_healthy: bool
    status_code: Optional[int] = None
    latency_ms: Optional[float] = None
    error_message: Optional[str] = None
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
