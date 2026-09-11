from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.core.xds_generator import generate_envoy_route_configuration

router = APIRouter()

@router.get("/v3/discovery:routes")
@router.post("/v3/discovery:routes")
def xds_discovery_routes(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Envoy v3 REST Route Discovery Service (RDS) endpoint.
    Envoy queries this endpoint to dynamically update its route configuration without downtime.
    """
    policy = db.query(RoutingPolicy).order_by(RoutingPolicy.deployed_at.desc()).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active routing policy found in xDS metastore."
        )

    models = db.query(ModelCatalog).all()
    models_map = {m.model_id: m for m in models}

    route_config = generate_envoy_route_configuration(
        route_name=policy.route_name,
        traffic_weights=policy.traffic_weights,
        models_map=models_map,
        revision=policy.xds_revision,
        strategy=policy.load_balancing_strategy
    )

    return {
        "version_info": policy.xds_revision,
        "resources": [route_config["route_config"]]
    }
