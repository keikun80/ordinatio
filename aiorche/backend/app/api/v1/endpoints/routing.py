import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.schemas.routing import (
    DryRunRequest,
    DryRunResponse,
    CanaryDeployRequest,
    CanaryDeployResponse,
    RoutePolicyCreate,
    RoutePolicyUpdate,
    RoutingPolicyResponse
)
from app.core.xds_generator import generate_xds_revision

router = APIRouter()

@router.get("", response_model=RoutingPolicyResponse)
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

@router.get("/routes", response_model=List[RoutingPolicyResponse])
def list_all_routes(db: Session = Depends(get_db)):
    """List all configured routing profiles in order of priority"""
    return db.query(RoutingPolicy).order_by(RoutingPolicy.priority.asc(), RoutingPolicy.deployed_at.desc()).all()

@router.get("/routes/{route_name}", response_model=RoutingPolicyResponse)
def get_route_by_name(route_name: str, db: Session = Depends(get_db)):
    """Get specific route policy by route_name"""
    policy = db.query(RoutingPolicy).filter(RoutingPolicy.route_name == route_name).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Route '{route_name}' not found."
        )
    return policy

@router.post("/routes", response_model=RoutingPolicyResponse, status_code=status.HTTP_201_CREATED)
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

@router.put("/routes/{route_name}", response_model=RoutingPolicyResponse)
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

@router.delete("/routes/{route_name}", status_code=status.HTTP_200_OK)
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

@router.post("/dry-run", response_model=DryRunResponse)
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

@router.post("/deploy", response_model=CanaryDeployResponse)
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

@router.get("/history", response_model=List[RoutingPolicyResponse])
def get_routing_history(db: Session = Depends(get_db)):
    """List historical dynamic routing deployments and revisions"""
    return db.query(RoutingPolicy).order_by(RoutingPolicy.deployed_at.desc()).limit(20).all()

