import asyncio
import time
from datetime import datetime, timezone
from typing import List, Optional, Tuple
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.schemas.model_catalog import (
    ModelCatalogCreate,
    ModelCatalogUpdate,
    ModelCatalogResponse,
    ModelHealthCheckResult
)
from app.api.deps import require_permission
from app.core.security import encrypt_upstream_key, decrypt_upstream_key, mask_api_key, validate_upstream_endpoint_url

router = APIRouter()

def _serialize_model(m: ModelCatalog) -> ModelCatalogResponse:
    """Serialize ModelCatalog into ModelCatalogResponse with masked API key."""
    resp = ModelCatalogResponse.model_validate(m)
    resp.api_key = mask_api_key(m.api_key)
    return resp


async def probe_endpoint(
    endpoint: str,
    engine: str = "vLLM",
    api_key: Optional[str] = None,
    auth_type: Optional[str] = None,
    provider: Optional[str] = "openai",
    timeout: float = 3.0
) -> Tuple[bool, Optional[int], Optional[float], Optional[str]]:
    """
    Probe a serving model endpoint based on its provider protocol.
    Returns: (is_healthy, status_code, latency_ms, error_message)
    """
    try:
        validate_upstream_endpoint_url(endpoint)
    except ValueError as ssrf_err:
        return False, 400, 0.0, f"SSRF 보안 차단: {ssrf_err}"

    base_url = endpoint.rstrip('/')
    urls_to_try = [base_url]
    try:
        from urllib.parse import urlsplit
        parsed = urlsplit(base_url)
        root_url = f"{parsed.scheme}://{parsed.netloc}"
        if "/chat/completions" in parsed.path:
            prefix = f"{root_url}{parsed.path.split('/chat/completions')[0]}"
            if prefix and prefix not in urls_to_try:
                urls_to_try.append(prefix)
        if root_url and root_url not in urls_to_try:
            urls_to_try.append(root_url)
    except Exception:
        pass

    if "127.0.0.1" in base_url:
        urls_to_try.extend([u.replace("127.0.0.1", "host.docker.internal") for u in list(urls_to_try) if "127.0.0.1" in u])
        urls_to_try.extend([u.replace("127.0.0.1", "172.20.0.1") for u in list(urls_to_try) if "127.0.0.1" in u])
    elif "localhost" in base_url:
        urls_to_try.extend([u.replace("localhost", "host.docker.internal") for u in list(urls_to_try) if "localhost" in u])
        urls_to_try.extend([u.replace("localhost", "172.20.0.1") for u in list(urls_to_try) if "localhost" in u])

    # Provider-specific health probe paths
    prov = (provider or "openai").lower()
    if prov == "anthropic":
        probe_paths = ["", "/v1/models", "/"]
    elif prov == "gemini":
        probe_paths = ["", "/v1beta/models", "/"]
    elif prov == "cohere":
        probe_paths = ["", "/v2/models", "/v1/models", "/"]
    elif prov == "deepseek":
        probe_paths = ["", "/models", "/v1/models", "/"]
    else:  # openai / default
        probe_paths = ["", "/health", "/v1/models", "/api/tags", "/"]

    # Configure upstream auth headers
    headers = {}
    if api_key:
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {api_key}"
        elif auth_type == "apikey":
            headers["apikey"] = api_key
    if prov == "anthropic":
        headers["anthropic-version"] = "2023-06-01"
        if api_key:
            headers["x-api-key"] = api_key
    if api_key:
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {api_key}"
        elif auth_type == "apikey":
            headers["apikey"] = api_key

    last_err = None
    last_status = None
    start_time = time.perf_counter()

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        for target in urls_to_try:
            for path in probe_paths:
                full_url = f"{target}{path}"
                t0 = time.perf_counter()
                try:
                    res = await client.get(full_url, headers=headers if headers else None)
                    latency = round((time.perf_counter() - t0) * 1000, 2)
                    if res.status_code < 400:
                        return True, res.status_code, latency, None
                    last_status = res.status_code
                    last_err = f"HTTP {res.status_code}"
                except httpx.ConnectError:
                    last_err = "연결 거부 (Connection Refused)"
                except httpx.ConnectTimeout:
                    last_err = f"연결 타임아웃 ({timeout}s 초과)"
                except httpx.ReadTimeout:
                    last_err = f"응답 대기시간 초과 ({timeout}s 초과)"
                except httpx.TimeoutException:
                    last_err = f"요청 타임아웃 ({timeout}s 초과)"
                except Exception as e:
                    last_err = str(e)

    total_latency = round((time.perf_counter() - start_time) * 1000, 2)
    return False, last_status, total_latency, last_err

@router.get("/health-check", response_model=List[ModelHealthCheckResult], dependencies=[Depends(require_permission("routing:read"))])
async def check_all_models_health(
    timeout: Optional[float] = Query(default=None, ge=0.5, le=60.0, description="수동 지정 헬스체크 타임아웃 (초)"),
    db: Session = Depends(get_db)
):
    """Check live health status of all registered serving models concurrently"""
    models = db.query(ModelCatalog).all()
    if not models:
        return []

    async def _check(m: ModelCatalog) -> ModelHealthCheckResult:
        eff_timeout = timeout if timeout is not None else float(getattr(m, "health_check_timeout", None) or 3.0)
        is_healthy, status_code, latency_ms, error_msg = await probe_endpoint(
            m.target_endpoint,
            m.serving_engine or "vLLM",
            api_key=decrypt_upstream_key(m.api_key),
            auth_type=m.auth_type,
            provider=getattr(m, "provider", "openai"),
            timeout=eff_timeout
        )
        return ModelHealthCheckResult(
            model_id=m.model_id,
            name=m.name or m.model_id,
            alias=m.alias or m.model_id,
            serving_engine=m.serving_engine or "vLLM",
            execution_method=m.execution_method or "k8s",
            target_endpoint=m.target_endpoint,
            provider=getattr(m, "provider", "openai"),
            health_check_timeout=eff_timeout,
            is_healthy=is_healthy,
            status_code=status_code,
            latency_ms=latency_ms,
            error_message=error_msg,
            checked_at=datetime.now(timezone.utc)
        )

    results = await asyncio.gather(*[_check(m) for m in models])
    return results

@router.post("/{model_id:path}/health", response_model=ModelHealthCheckResult, dependencies=[Depends(require_permission("routing:read"))])
async def check_single_model_health(
    model_id: str,
    timeout: Optional[float] = Query(default=None, ge=0.5, le=60.0, description="수동 지정 헬스체크 타임아웃 (초)"),
    db: Session = Depends(get_db)
):
    """Check live health status of a specific serving model"""
    model = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found."
        )

    eff_timeout = timeout if timeout is not None else float(getattr(model, "health_check_timeout", None) or 3.0)
    is_healthy, status_code, latency_ms, error_msg = await probe_endpoint(
        model.target_endpoint,
        model.serving_engine or "vLLM",
        api_key=decrypt_upstream_key(model.api_key),
        auth_type=model.auth_type,
        provider=getattr(model, "provider", "openai"),
        timeout=eff_timeout
    )
    return ModelHealthCheckResult(
        model_id=model.model_id,
        name=model.name or model.model_id,
        alias=model.alias or model.model_id,
        serving_engine=model.serving_engine or "vLLM",
        execution_method=model.execution_method or "k8s",
        target_endpoint=model.target_endpoint,
        provider=getattr(model, "provider", "openai"),
        health_check_timeout=eff_timeout,
        is_healthy=is_healthy,
        status_code=status_code,
        latency_ms=latency_ms,
        error_message=error_msg,
        checked_at=datetime.now(timezone.utc)
    )

@router.get("", response_model=List[ModelCatalogResponse], dependencies=[Depends(require_permission("routing:read"))])
def list_models(db: Session = Depends(get_db)):
    """List all serving models in catalog with masked API keys"""
    models = db.query(ModelCatalog).all()
    return [_serialize_model(m) for m in models]

@router.post("", response_model=ModelCatalogResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("routing:write"))])
def create_model(model_in: ModelCatalogCreate, db: Session = Depends(get_db)):
    """Register a new LLM serving model to catalog with Fernet encrypted API key"""
    try:
        validate_upstream_endpoint_url(model_in.target_endpoint)
    except ValueError as ssrf_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"비인가 업스트림 엔드포인트 차단 (SSRF 보호): {ssrf_err}"
        )

    existing = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_in.model_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Model '{model_in.model_id}' already exists in catalog."
        )
    
    alias_val = model_in.alias.strip() if model_in.alias else model_in.model_id.strip()
    alias_exist = db.query(ModelCatalog).filter(
        ModelCatalog.alias == alias_val,
        ModelCatalog.model_id != model_in.model_id
    ).first()
    if alias_exist:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Alias '{alias_val}' already used by another model."
        )

    model_dict = model_in.model_dump()
    model_dict["alias"] = alias_val
    if not model_dict.get("name"):
        model_dict["name"] = model_in.model_id
    if model_dict.get("api_key"):
        model_dict["api_key"] = encrypt_upstream_key(model_dict["api_key"])

    model = ModelCatalog(**model_dict)
    db.add(model)
    db.commit()
    db.refresh(model)
    return _serialize_model(model)

@router.get("/{model_id:path}", response_model=ModelCatalogResponse, dependencies=[Depends(require_permission("routing:read"))])
def get_model(model_id: str, db: Session = Depends(get_db)):
    """Get serving model details by model_id with masked API key"""
    model = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found."
        )
    return _serialize_model(model)

@router.patch("/{model_id:path}", response_model=ModelCatalogResponse, dependencies=[Depends(require_permission("routing:write"))])
def update_model(model_id: str, model_in: ModelCatalogUpdate, db: Session = Depends(get_db)):
    """Update serving model attributes (status, pricing, endpoint, encrypted API key)"""
    model = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found."
        )

    update_data = model_in.model_dump(exclude_unset=True)
    if "target_endpoint" in update_data and update_data["target_endpoint"] is not None:
        try:
            validate_upstream_endpoint_url(update_data["target_endpoint"])
        except ValueError as ssrf_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"비인가 업스트림 엔드포인트 차단 (SSRF 보호): {ssrf_err}"
            )
    if "api_key" in update_data:
        val = update_data["api_key"]
        if val and not ("..." in val or val == "sk-***"):
            update_data["api_key"] = encrypt_upstream_key(val)
        elif val and ("..." in val or val == "sk-***"):
            # Masked placeholder sent back from client; do not overwrite existing DB key
            del update_data["api_key"]
        else:
            update_data["api_key"] = None

    for field, value in update_data.items():
        setattr(model, field, value)

    db.commit()
    db.refresh(model)
    return _serialize_model(model)

@router.delete("/{model_id:path}", status_code=status.HTTP_200_OK, dependencies=[Depends(require_permission("routing:write"))])
def delete_model(model_id: str, force: bool = False, db: Session = Depends(get_db)):
    """Delete a serving model from the catalog (with routing dependency safety check)"""
    model = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found."
        )

    # Check if model is currently referenced in any active routing policies
    policies = db.query(RoutingPolicy).all()
    referencing_routes = []
    for pol in policies:
        # Check traffic_weights
        weights = pol.traffic_weights or []
        for item in weights:
            if isinstance(item, dict) and item.get("model_id") == model_id:
                referencing_routes.append(pol.route_name)
                break
        # Check failover_model_id
        if pol.failover_model_id == model_id and pol.route_name not in referencing_routes:
            referencing_routes.append(pol.route_name)

    if referencing_routes and not force:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"해당 모델은 활성 라우트 정책({', '.join(referencing_routes)})에서 가중치 또는 페일오버 타깃으로 사용 중이므로 삭제할 수 없습니다. 먼저 라우트 설정을 변경해 주세요."
        )

    # If force=True, cascade remove model from any referencing routes
    if force and referencing_routes:
        for pol in policies:
            changed = False
            if pol.traffic_weights:
                new_weights = [w for w in pol.traffic_weights if isinstance(w, dict) and w.get("model_id") != model_id]
                if len(new_weights) != len(pol.traffic_weights):
                    if new_weights:
                        total = sum(w.get("weight", 0) for w in new_weights)
                        if total > 0:
                            for w in new_weights:
                                w["weight"] = round((w.get("weight", 0) / total) * 100)
                            diff = 100 - sum(w.get("weight", 0) for w in new_weights)
                            if diff != 0:
                                new_weights[0]["weight"] += diff
                    pol.traffic_weights = new_weights
                    changed = True
            if pol.failover_model_id == model_id:
                pol.failover_model_id = None
                changed = True
            if pol.failover_chain and model_id in pol.failover_chain:
                pol.failover_chain = [m for m in pol.failover_chain if m != model_id]
                changed = True
            if changed:
                db.add(pol)

    db.delete(model)
    db.commit()
    return {"status": "success", "message": f"모델 '{model_id}'이(가) 카탈로그에서 성공적으로 삭제되었습니다."}
