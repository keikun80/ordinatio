from sqlalchemy import Column, String, Boolean, Numeric, DateTime, func
from app.db.base import Base

class ModelCatalog(Base):
    __tablename__ = "model_catalogs"

    model_id = Column(String(128), primary_key=True, index=True)
    alias = Column(String(64), unique=True, nullable=False)
    backend_infra = Column(String(32), nullable=False)  # Legacy/Composite (e.g. 'On-Prem K8s')
    serving_engine = Column(String(32), nullable=False, default="vLLM")  # 'vLLM', 'Ollama', 'SGLang', 'Triton'
    execution_method = Column(String(32), nullable=False, default="k8s")  # 'k8s', 'docker-compose', 'direct'
    target_endpoint = Column(String(255), nullable=False)
    input_price_per_1k = Column(Numeric(10, 4), default=0.8, nullable=False)
    output_price_per_1k = Column(Numeric(10, 4), default=2.4, nullable=False)
    cache_discount_ratio = Column(Numeric(5, 4), default=0.25, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    api_key = Column(String(255), nullable=True)  # Upstream endpoint API Key
    auth_type = Column(String(32), nullable=True, default="none")  # 'none', 'apikey', 'bearer'
    provider = Column(String(32), nullable=True, default="openai")  # 'openai', 'deepseek', 'anthropic', 'gemini', 'cohere', 'custom'
    health_check_timeout = Column(Numeric(5, 2), default=3.0, nullable=True)  # Health check timeout in seconds
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

