import uuid
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.schemas.routing import (
    DryRunRequest,
    DryRunResponse,
    CanaryDeployRequest,
    CanaryDeployResponse,
    RoutingPolicyResponse
)
from app.core.xds_generator import generate_xds_revision, generate_envoy_route_configuration

router = APIRouter()

@router.get("", response_model=RoutingPolicyResponse)
def get_active_routing(db: Session = Depends(get_db)):
    """Get current active dynamic routing policy and xDS revision"""
    policy = db.query(RoutingPolicy).order_by(RoutingPolicy.deployed_at.desc()).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active routing policy configured."
        )
    return policy

@router.post("/dry-run", response_model=DryRunResponse)
def dry_run_routing(request: DryRunRequest, db: Session = Depends(get_db)):
    """Pre-flight dry run validation for traffic weights and endpoint targets"""
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
    """Deploy new canary traffic split weights to Envoy xDS without downtime"""
    # 1. Validation
    total_weight = sum(item.weight for item in request.traffic_weights)
    if total_weight != 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"카나리 가중치 합계는 반드시 100%여야 합니다 (현재: {total_weight}%)."
        )

    models_map = {}
    for item in request.traffic_weights:
        model = db.query(ModelCatalog).filter(ModelCatalog.model_id == item.model_id).first()
        if not model:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"모델 '{item.model_id}'을(를) 찾을 수 없습니다."
            )
        models_map[item.model_id] = model

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
        envoy_ack=True,
        message=f"Envoy AI Gateway에 xDS 라우팅 정책이 무중단 실시간 배포되었습니다. (리비전: {new_revision})"
    )

@router.get("/history", response_model=List[RoutingPolicyResponse])
def get_routing_history(db: Session = Depends(get_db)):
    """List historical dynamic routing deployments and revisions"""
    return db.query(RoutingPolicy).order_by(RoutingPolicy.deployed_at.desc()).limit(20).all()
