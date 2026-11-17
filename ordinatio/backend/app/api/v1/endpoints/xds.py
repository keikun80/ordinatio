from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.core.xds_generator import generate_envoy_multi_route_configuration

router = APIRouter()

@router.get("/v3/discovery:routes")
@router.post("/v3/discovery:routes")
def xds_discovery_routes(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Envoy v3 REST Route Discovery Service (RDS) endpoint.
    Envoy queries this endpoint to dynamically update its route configuration without downtime.
    """
    policies = db.query(RoutingPolicy).filter(RoutingPolicy.is_active == True).order_by(RoutingPolicy.priority.asc(), RoutingPolicy.deployed_at.desc()).all()
    if not policies:
        policies = db.query(RoutingPolicy).order_by(RoutingPolicy.deployed_at.desc()).limit(1).all()

    if not policies:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active routing policy found in xDS metastore."
        )

    latest_rev = max((p.xds_revision for p in policies), default=policies[0].xds_revision)

    models = db.query(ModelCatalog).all()
    models_map = {m.model_id: m for m in models}

    route_config = generate_envoy_multi_route_configuration(
        policies=policies,
        models_map=models_map,
        revision=latest_rev
    )

    return {
        "version_info": latest_rev,
        "resources": [route_config["route_config"]]
    }

