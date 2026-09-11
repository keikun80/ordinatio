from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class ModelCatalogBase(BaseModel):
    model_id: str = Field(..., json_schema_extra={"example": "meta-llama/Llama-3.1-8B-Instruct"})
    alias: str = Field(..., json_schema_extra={"example": "financial-advisor-v1"})
    backend_infra: str = Field(..., json_schema_extra={"example": "EKS"})  # EKS, ECS, EC2
    target_endpoint: str = Field(..., json_schema_extra={"example": "http://vllm-llama8b.ai-serving:8000"})
    input_price_per_1k: float = Field(default=0.8, ge=0.0)
    output_price_per_1k: float = Field(default=2.4, ge=0.0)
    cache_discount_ratio: float = Field(default=0.25, ge=0.0, le=1.0)
    is_active: bool = True

class ModelCatalogCreate(ModelCatalogBase):
    pass

class ModelCatalogUpdate(BaseModel):
    alias: Optional[str] = None
    target_endpoint: Optional[str] = None
    input_price_per_1k: Optional[float] = None
    output_price_per_1k: Optional[float] = None
    cache_discount_ratio: Optional[float] = None
    is_active: Optional[bool] = None

class ModelCatalogResponse(ModelCatalogBase):
    model_config = ConfigDict(from_attributes=True)
    updated_at: Optional[datetime] = None
