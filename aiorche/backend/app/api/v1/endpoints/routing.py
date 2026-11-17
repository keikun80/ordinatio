import uuid
import time
import asyncio
from typing import List, Optional, Any, Dict
from datetime import datetime
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.config import settings
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.schemas.routing import (
    DryRunRequest,
    DryRunResponse,
    CanaryDeployRequest,
    CanaryDeployResponse,
    RoutePolicyCreate,
    RoutePolicyUpdate,
    RoutingPolicyResponse,
    RouteTestCallRequest,
    RouteTestCallResponse,
    AllModelsTestCallRequest,
    AllModelsTestCallResponse
)
from app.core.xds_generator import generate_xds_revision
from app.core.security import SYSTEM_DIAGNOSTICS_KEY, ensure_system_diagnostics_key
from app.api.deps import require_permission

router = APIRouter()

@router.get("", response_model=RoutingPolicyResponse, dependencies=[Depends(require_permission("routing:read"))])
def get_active_routing(
    route_name: Optional[str] = Query(None, description="Optional specific route name to query"),
    db: Session = Depends(get_db)
):
    """Get active dynamic routing policy (supports optional route_name query)"""
    query = db.query(RoutingPolicy)
    if route_name:
        policy = query.filter(RoutingPolicy.route_name == route_name).first()
    else:
        policy = query.order_by(RoutingPolicy.priority.asc(), RoutingPolicy.deployed_at.desc()).first()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active routing policy configured."
        )
    return policy

@router.get("/routes", response_model=List[RoutingPolicyResponse], dependencies=[Depends(require_permission("routing:read"))])
def list_all_routes(db: Session = Depends(get_db)):
    """List all configured routing profiles in order of priority"""
    return db.query(RoutingPolicy).order_by(RoutingPolicy.priority.asc(), RoutingPolicy.deployed_at.desc()).all()

@router.get("/routes/{route_name}", response_model=RoutingPolicyResponse, dependencies=[Depends(require_permission("routing:read"))])
def get_route_by_name(route_name: str, db: Session = Depends(get_db)):
    """Get specific route policy by route_name"""
    policy = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == route_name).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Route '{route_name}' not found."
        )
    return policy

@router.post("/routes", response_model=RoutingPolicyResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("routing:write"))])
def create_route(request: RoutePolicyCreate, db: Session = Depends(get_db)):
    """Create a new multi-route profile"""
    existing = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == request.route_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Route '{request.route_name}' already exists."
        )

    # Validate weights
    total_weight = sum(item.weight for item in request.traffic_weights)
    if total_weight != 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"가중치 합계는 반드시 100%여야 합니다 (현재: {total_weight}%)."
        )

    # Validate models
    for item in request.traffic_weights:
        m = db.query(ModelCatalog).filter(ModelCatalog.model_id == item.model_id).first()
        if not m:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"모델 '{item.model_id}'을(를) 찾을 수 없습니다."
            )

    new_rev = generate_xds_revision()
    policy_id = f"pol-{uuid.uuid4().hex[:8]}"
    weights_json = [item.model_dump() for item in request.traffic_weights]

    new_route = RoutingPolicy(
        policy_id=policy_id,
        route_name=request.route_name,
        traffic_weights=weights_json,
        load_balancing_strategy=request.load_balancing_strategy,
        failover_model_id=request.failover_model_id,
        failover_chain=request.failover_chain or [],
        match_conditions=request.match_conditions or {},
        priority=request.priority,
        is_active=request.is_active,
        description=request.description,
        xds_revision=new_rev,
        deployed_by=request.deployed_by
    )
    db.add(new_route)
    db.commit()
    db.refresh(new_route)
    return new_route

@router.put("/routes/{route_name}", response_model=RoutingPolicyResponse, dependencies=[Depends(require_permission("routing:write"))])
def update_route(route_name: str, request: RoutePolicyUpdate, db: Session = Depends(get_db)):
    """Update an existing multi-route profile"""
    route = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == route_name).first()
    if not route:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Route '{route_name}' not found."
        )

    if request.traffic_weights is not None:
        total_weight = sum(item.weight for item in request.traffic_weights)
        if total_weight != 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"가중치 합계는 반드시 100%여야 합니다 (현재: {total_weight}%)."
            )
        route.traffic_weights = [item.model_dump() for item in request.traffic_weights]

    if request.load_balancing_strategy is not None:
        route.load_balancing_strategy = request.load_balancing_strategy
    if request.failover_model_id is not None:
        route.failover_model_id = request.failover_model_id
    if request.failover_chain is not None:
        route.failover_chain = request.failover_chain
    if request.match_conditions is not None:
        route.match_conditions = request.match_conditions
    if request.priority is not None:
        route.priority = request.priority
    if request.is_active is not None:
        route.is_active = request.is_active
    if request.description is not None:
        route.description = request.description

    route.xds_revision = generate_xds_revision()
    route.deployed_by = request.deployed_by or "admin"
    db.commit()
    db.refresh(route)
    return route

@router.delete("/routes/{route_name}", status_code=status.HTTP_200_OK, dependencies=[Depends(require_permission("routing:write"))])
def delete_route(route_name: str, db: Session = Depends(get_db)):
    """Delete a route profile (at least one route must remain)"""
    total_routes = db.query(RoutingPolicy).count()
    if total_routes <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="최소 1개 이상의 기본 라우팅 정책이 유지되어야 하므로 삭제할 수 없습니다."
        )

    route = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == route_name).first()
    if not route:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Route '{route_name}' not found."
        )

    db.delete(route)
    db.commit()
    return {"status": "success", "message": f"Route '{route_name}' deleted successfully."}

@router.post("/dry-run", response_model=DryRunResponse, dependencies=[Depends(require_permission("routing:write"))])
def dry_run_routing(request: DryRunRequest, db: Session = Depends(get_db)):
    """Pre-flight dry run validation for traffic weights, models, and match rules"""
    errors = []
    total_weight = sum(item.weight for item in request.traffic_weights)

    if total_weight != 100:
        errors.append(f"가중치 총합이 100%가 아닙니다 (현재 합계: {total_weight}%).")

    active_count = 0
    for item in request.traffic_weights:
        model = db.query(ModelCatalog).filter(ModelCatalog.model_id == item.model_id).first()
        if not model:
            errors.append(f"지정된 모델 '{item.model_id}'이(가) 모델 카탈로그에 존재하지 않습니다.")
        elif not model.is_active:
            errors.append(f"지정된 모델 '{item.model_id}'이(가) 비활성화 상태입니다.")
        else:
            active_count += 1

    if request.failover_model_id:
        failover = db.query(ModelCatalog).filter(ModelCatalog.model_id == request.failover_model_id).first()
        if not failover:
            errors.append(f"장애 우회(Failover) 대상 모델 '{request.failover_model_id}'이(가) 존재하지 않습니다.")

    if request.failover_chain:
        for f_model in request.failover_chain:
            f_cat = db.query(ModelCatalog).filter(ModelCatalog.model_id == f_model).first()
            if not f_cat:
                errors.append(f"다단계 장애 우회 체인 모델 '{f_model}'이(가) 존재하지 않습니다.")

    is_valid = len(errors) == 0
    return DryRunResponse(
        is_valid=is_valid,
        total_weight=total_weight,
        validation_errors=errors,
        estimated_latency_ms=1.18 if is_valid else 0.0,
        active_endpoints_count=active_count
    )

@router.post("/deploy", response_model=CanaryDeployResponse, dependencies=[Depends(require_permission("routing:write"))])
def deploy_canary_routing(request: CanaryDeployRequest, db: Session = Depends(get_db)):
    """Deploy new routing policy or canary weights to Envoy xDS without downtime"""
    # 1. Validation
    total_weight = sum(item.weight for item in request.traffic_weights)
    if total_weight != 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"카나리 가중치 합계는 반드시 100%여야 합니다 (현재: {total_weight}%)."
        )

    for item in request.traffic_weights:
        model = db.query(ModelCatalog).filter(ModelCatalog.model_id == item.model_id).first()
        if not model:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"모델 '{item.model_id}'을(를) 찾을 수 없습니다."
            )

    if request.failover_model_id:
        failover = db.query(ModelCatalog).filter(ModelCatalog.model_id == request.failover_model_id).first()
        if not failover:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"장애 우회 모델 '{request.failover_model_id}'을(를) 찾을 수 없습니다."
            )

    # 2. Generate new xDS Revision tag
    new_revision = generate_xds_revision()
    weights_json = [item.model_dump() for item in request.traffic_weights]

    # 3. Persist routing policy (Update existing or Insert new)
    existing_policy = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == request.route_name).first()
    if existing_policy:
        existing_policy.traffic_weights = weights_json
        existing_policy.load_balancing_strategy = request.load_balancing_strategy
        existing_policy.failover_model_id = request.failover_model_id
        if request.failover_chain is not None:
            existing_policy.failover_chain = request.failover_chain
        if request.match_conditions is not None:
            existing_policy.match_conditions = request.match_conditions
        if request.priority is not None:
            existing_policy.priority = request.priority
        if request.is_active is not None:
            existing_policy.is_active = request.is_active
        if request.description is not None:
            existing_policy.description = request.description
        existing_policy.xds_revision = new_revision
        existing_policy.deployed_by = request.deployed_by
        policy_id = existing_policy.policy_id
    else:
        policy_id = f"pol-{uuid.uuid4().hex[:8]}"
        new_policy = RoutingPolicy(
            policy_id=policy_id,
            route_name=request.route_name,
            traffic_weights=weights_json,
            load_balancing_strategy=request.load_balancing_strategy,
            failover_model_id=request.failover_model_id,
            failover_chain=request.failover_chain or [],
            match_conditions=request.match_conditions or {},
            priority=request.priority or 10,
            is_active=request.is_active if request.is_active is not None else True,
            description=request.description,
            xds_revision=new_revision,
            deployed_by=request.deployed_by
        )
        db.add(new_policy)

    db.commit()

    return CanaryDeployResponse(
        status="success",
        policy_id=policy_id,
        route_name=request.route_name,
        xds_revision=new_revision,
        deployed_at=datetime.now(),
        applied_weights=request.traffic_weights,
        load_balancing_strategy=request.load_balancing_strategy,
        failover_model_id=request.failover_model_id,
        failover_chain=request.failover_chain,
        match_conditions=request.match_conditions,
        envoy_ack=True,
        message=f"Envoy AI Gateway에 xDS 라우팅 정책이 무중단 실시간 배포되었습니다. (리비전: {new_revision})"
    )

@router.get("/history", response_model=List[RoutingPolicyResponse], dependencies=[Depends(require_permission("routing:read"))])
def get_routing_history(db: Session = Depends(get_db)):
    """List historical dynamic routing deployments and revisions"""
    return db.query(RoutingPolicy).order_by(RoutingPolicy.deployed_at.desc()).limit(20).all()

async def _execute_single_test_call(
    route_name: str,
    method: str,
    message: str,
    target_model_id: Optional[str],
    policy: RoutingPolicy,
    traffic_weights: Optional[List[Any]],
    db: Session
) -> RouteTestCallResponse:
    envoy_ingress = settings.ENVOY_INGRESS_URL.rstrip('/')
    candidate_hosts = list(dict.fromkeys([
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        envoy_ingress,
        "http://envoy:8080"
    ]))

    path_prefix = ""
    if policy.match_conditions and policy.match_conditions.get("path_prefix"):
        path_prefix = policy.match_conditions.get("path_prefix")
    else:
        path_prefix = f"/v1/routes/{route_name}"

    ensure_system_diagnostics_key(db)
    auth_header_val = f"Bearer {SYSTEM_DIAGNOSTICS_KEY}"

    primary_tenant_code = None
    if policy.match_conditions and policy.match_conditions.get("tenant_codes"):
        primary_tenant_code = policy.match_conditions["tenant_codes"][0]

    if method == "path":
        target_path = path_prefix
        request_headers = {
            "Content-Type": "application/json",
            "Authorization": auth_header_val,
            "x-strict-upstream": "true"
        }
        if primary_tenant_code:
            request_headers["x-orche-tenant"] = primary_tenant_code
    else:
        target_path = "/v1/chat/completions"
        request_headers = {
            "Content-Type": "application/json",
            "Authorization": auth_header_val,
            "x-orche-route": route_name,
            "x-strict-upstream": "true"
        }
        if primary_tenant_code:
            request_headers["x-orche-tenant"] = primary_tenant_code

    weights = traffic_weights if (traffic_weights is not None and len(traffic_weights) > 0) else (policy.traffic_weights or [])
    
    # Target model selection: explicit target_model_id takes priority
    target_model_name = target_model_id
    if not target_model_name and weights:
        first_w = weights[0]
        if isinstance(first_w, dict):
            target_model_name = first_w.get("model_id")
        elif hasattr(first_w, "model_id"):
            target_model_name = first_w.model_id

    # If no target model found and no weights
    if not target_model_name and not weights:
        chosen_url = f"{envoy_ingress}{path_prefix if method == 'path' else '/v1/chat/completions'}"
        return RouteTestCallResponse(
            is_success=False,
            status_code=502,
            latency_ms=0.5,
            target_url=chosen_url,
            request_headers=request_headers,
            response_body={
                "error": "No Upstream Models Configured (HTTP 502 Bad Gateway)",
                "message": f"라우트 '{route_name}'에 연결된 서빙 모델이 없습니다."
            },
            error_message="라우트에 연결된 모델이 없습니다. (HTTP 502 Bad Gateway)",
            dispatched_route=route_name,
            model_id=target_model_id
        )

    # 4. System Prompt Auto-Injection (Phase 3)
    tenant_code = None
    if policy.match_conditions and policy.match_conditions.get("tenant_codes"):
        tenant_code = policy.match_conditions["tenant_codes"][0]

    raw_messages = [{"role": "user", "content": message}]
    from app.core.prompt_injector import resolve_and_inject_system_prompt
    injected_messages, applied_prompt, resolved_by = resolve_and_inject_system_prompt(
        db=db,
        messages=raw_messages,
        key_id=SYSTEM_DIAGNOSTICS_KEY[:16],
        route_name=route_name,
        tenant_id=tenant_code
    )

    applied_prompt_name = applied_prompt.name if applied_prompt else None
    if applied_prompt:
        request_headers["x-orche-prompt-injected"] = applied_prompt.prompt_id
        request_headers["x-orche-prompt-target"] = resolved_by or "NONE"

    payload = {
        "model": target_model_name or route_name,
        "messages": injected_messages,
        "temperature": 0.7,
        "max_tokens": 128
    }

    t0 = time.perf_counter()
    status_code = None
    resp_body = None
    err_msg = None
    is_success = False
    chosen_url = f"{envoy_ingress}{target_path}"

    client_timeout = httpx.Timeout(120.0, connect=10.0, read=120.0)
    async with httpx.AsyncClient(timeout=client_timeout) as client:
        for host in candidate_hosts:
            test_url = f"{host}{target_path}"
            try:
                res = await client.post(test_url, json=payload, headers=request_headers)
                latency = round((time.perf_counter() - t0) * 1000, 2)
                status_code = res.status_code
                try:
                    resp_body = res.json()
                except Exception:
                    resp_body = res.text[:200]

                is_success = (res.status_code < 500)
                error_msg = None
                if not is_success:
                    if status_code == 502:
                        error_msg = "업스트림 모델 서버 오프라인 (HTTP 502 Bad Gateway)"
                    else:
                        error_msg = f"Envoy Gateway HTTP {status_code}"

                return RouteTestCallResponse(
                    is_success=is_success,
                    status_code=status_code,
                    latency_ms=latency,
                    target_url=chosen_url,
                    request_headers=request_headers,
                    response_body=resp_body,
                    error_message=error_msg,
                    dispatched_route=route_name,
                    model_id=target_model_name,
                    applied_system_prompt=applied_prompt_name,
                    prompt_resolved_by=resolved_by
                )
            except (httpx.ConnectTimeout, httpx.ConnectError) as exc:
                err_msg = f"게이트웨이 연결 실패 ({test_url}): {exc}"
                continue
            except httpx.ReadTimeout:
                err_msg = "게이트웨이 LLM 모델 추론 타임아웃 (120초 초과 - vLLM 처리 지연)"
                break
            except httpx.TimeoutException as exc:
                err_msg = f"요청 타임아웃: {exc}"
                continue
            except Exception as e:
                err_msg = str(e)
                break

    total_latency = round((time.perf_counter() - t0) * 1000, 2)
    return RouteTestCallResponse(
        is_success=False,
        status_code=status_code,
        latency_ms=total_latency,
        target_url=chosen_url,
        request_headers=request_headers,
        response_body=None,
        error_message=err_msg or "연결 실패",
        dispatched_route=route_name,
        model_id=target_model_name
    )

@router.post("/test-call", response_model=RouteTestCallResponse, dependencies=[Depends(require_permission("routing:read"))])
async def test_route_call(req: RouteTestCallRequest, db: Session = Depends(get_db)):
    """Test calling a specific route (or specific model) through Envoy Gateway"""
    policy = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == req.route_name).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Route '{req.route_name}' not found."
        )

    return await _execute_single_test_call(
        route_name=req.route_name,
        method=req.method,
        message=req.message,
        target_model_id=req.target_model_id,
        policy=policy,
        traffic_weights=req.traffic_weights,
        db=db
    )

@router.post("/test-call-all", response_model=AllModelsTestCallResponse, dependencies=[Depends(require_permission("routing:read"))])
async def test_all_models_call(req: AllModelsTestCallRequest, db: Session = Depends(get_db)):
    """Test calling all linked LLM models through Envoy Gateway concurrently"""
    policy = None
    if req.route_name:
        policy = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == req.route_name).first()
    if not policy:
        policy = db.query(RoutingPolicy).order_by(RoutingPolicy.priority.asc()).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active routing policy configured."
        )

    # Determine models to test
    models_to_test = []
    if req.scope == "route" and policy.traffic_weights:
        for w in policy.traffic_weights:
            mid = w.get("model_id") if isinstance(w, dict) else getattr(w, "model_id", None)
            if mid and mid not in models_to_test:
                models_to_test.append(mid)

    # If scope == "all" or route had no models, query all registered active models
    if req.scope == "all" or not models_to_test:
        all_models = db.query(ModelCatalog).all()
        models_to_test = [m.model_id for m in all_models]

    if not models_to_test:
        return AllModelsTestCallResponse(
            is_success=False,
            total_count=0,
            success_count=0,
            failed_count=0,
            results=[]
        )

    tasks = [
        _execute_single_test_call(
            route_name=policy.route_name,
            method=req.method or "header",
            message=req.message or "안녕하세요. Envoy 게이트웨이 라우팅 테스트 요청입니다.",
            target_model_id=mid,
            policy=policy,
            traffic_weights=policy.traffic_weights,
            db=db
        )
        for mid in models_to_test
    ]

    results = await asyncio.gather(*tasks)
    success_count = sum(1 for r in results if r.is_success)
    failed_count = len(results) - success_count

    return AllModelsTestCallResponse(
        is_success=(failed_count == 0),
        total_count=len(results),
        success_count=success_count,
        failed_count=failed_count,
        results=list(results)
    )

# -----------------------------------------------------------------------------
# Phase 0.1: AgentRouter Status & Interactive Intent Simulation & Policy Configs
# -----------------------------------------------------------------------------
from pydantic import BaseModel, Field
from typing import Any, Dict
from app.core.agent_router import (
    AgentRouter,
    classify_prompt,
    RoutingPolicyType,
    DEFAULT_FAST_MODEL,
    DEFAULT_REASONING_MODEL,
    DEFAULT_FALLBACK_MODEL,
    derive_cluster_name
)
from app.core.agent_router.policy_manager import AgentRouterPolicyManager
from app.schemas.routing import (
    AgentRouterPolicyItem,
    AgentRouterPoliciesResponse,
    AgentRouterPoliciesUpdate
)

class AgentRouterSimulateRequest(BaseModel):
    prompt: str = Field(..., description="테스트할 사용자 프롬프트 텍스트")
    policy: Optional[str] = Field(default="QualityFirst", description="QualityFirst, LeastCost, LatencyOptimized, SelfHealingFallback")
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, description="도구/함수 호출 스키마")
    budget_spent_ratio: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)

@router.get("/agent-router/status", dependencies=[Depends(require_permission("routing:read"))])
def get_agent_router_status(db: Session = Depends(get_db)):
    """AgentRouter 현재 활성 정책 및 모델 풀 상태 조회 (동적 클러스터/모델 매핑)"""
    policies = AgentRouterPolicyManager.get_all_policies(db=db)
    policy_dict = {p.get("policy_id"): p.get("config", {}) for p in policies}
    qf_cfg = policy_dict.get("QualityFirst", {})
    sh_cfg = policy_dict.get("SelfHealingFallback", {})

    fast_model = qf_cfg.get("fast_model") or DEFAULT_FAST_MODEL
    fast_cluster = qf_cfg.get("fast_cluster") or derive_cluster_name(fast_model, "cluster_vllm_fast_8b")

    reasoning_model = qf_cfg.get("reasoning_model") or DEFAULT_REASONING_MODEL
    reasoning_cluster = qf_cfg.get("reasoning_cluster") or derive_cluster_name(reasoning_model, "cluster_vllm_reasoning_72b")

    fallback_model = sh_cfg.get("primary_fallback_model") or DEFAULT_FALLBACK_MODEL
    fallback_cluster = sh_cfg.get("fallback_cluster") or derive_cluster_name(fallback_model, "cluster_vllm_inference_pool")

    return {
        "status": "ACTIVE",
        "engine": "AgentRouter Cognitive Dispatcher v0.1",
        "supported_policies": [p.value for p in RoutingPolicyType],
        "policies": policies,
        "default_tiers": {
            "fast_8b": {
                "model": fast_model,
                "cluster": fast_cluster,
                "description": "단순 질의 및 대화형 Q&A를 위한 초저지연 경량 모델"
            },
            "reasoning_72b": {
                "model": reasoning_model,
                "cluster": reasoning_cluster,
                "description": "코딩, 수학, 알고리즘 및 심층 추론 전용 대형 모델"
            },
            "fallback": {
                "model": fallback_model,
                "cluster": fallback_cluster,
                "description": "장애 발생 시 자가 치유(Self-healing) 페일오버 모델"
            }
        }
    }

@router.get("/agent-router/policies", response_model=AgentRouterPoliciesResponse, dependencies=[Depends(require_permission("routing:read"))])
def get_agent_router_policies(db: Session = Depends(get_db)):
    """AgentRouter 4대 라우팅 정책(QualityFirst, LeastCost, LatencyOptimized, SelfHealingFallback) 상세 설정 조회"""
    policies = AgentRouterPolicyManager.get_all_policies(db=db)
    return AgentRouterPoliciesResponse(
        policies=[AgentRouterPolicyItem(**p) for p in policies],
        active_policy="QualityFirst"
    )

@router.put("/agent-router/policies", response_model=AgentRouterPoliciesResponse, dependencies=[Depends(require_permission("routing:write"))])
def update_agent_router_policies(payload: AgentRouterPoliciesUpdate, db: Session = Depends(get_db)):
    """AgentRouter 4대 라우팅 정책 파라미터 및 모델 매핑 업데이트"""
    raw_list = [p.model_dump() for p in payload.policies]
    updated = AgentRouterPolicyManager.update_policies(raw_list, db=db)
    return AgentRouterPoliciesResponse(
        policies=[AgentRouterPolicyItem(**p) for p in updated],
        active_policy="QualityFirst"
    )

@router.post("/agent-router/simulate", dependencies=[Depends(require_permission("routing:read"))])
def simulate_agent_router_dispatch(req: AgentRouterSimulateRequest, db: Session = Depends(get_db)):
    """프롬프트 인텐트 및 복잡도 분석 실시간 시뮬레이션"""
    messages = [{"role": "user", "content": req.prompt}]
    classification = classify_prompt(messages=messages, tools=req.tools)

    policy_enum = RoutingPolicyType.QUALITY_FIRST
    for p in RoutingPolicyType:
        if p.value.lower() == (req.policy or "").lower():
            policy_enum = p
            break

    # Fetch active policy configuration dynamically from DB/cache
    policy_data = AgentRouterPolicyManager.get_policy(policy_enum.value, db=db)
    policy_config = policy_data.get("config", {}) if policy_data else {}

    router_inst = AgentRouter(default_policy=policy_enum)
    decision = router_inst.evaluate_route(
        classification=classification,
        policy=policy_enum,
        policy_config=policy_config,
        tenant_budget_spent_ratio=req.budget_spent_ratio or 0.0
    )

    return {
        "prompt_analyzed": req.prompt[:100] + ("..." if len(req.prompt) > 100 else ""),
        "complexity": decision.complexity.value,
        "suggested_tier": decision.tier,
        "policy_applied": decision.policy_applied.value,
        "selected_model": decision.selected_model,
        "target_cluster": decision.target_cluster,
        "estimated_tokens": decision.estimated_tokens,
        "reasons": decision.reasons,
        "has_tool_calling": classification.has_tool_calling,
        "primary_intent": classification.primary_intent
    }



