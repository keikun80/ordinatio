from fastapi import APIRouter
from app.api.v1.endpoints import health, system, tenants, virtual_keys, external, metrics, models, routing, xds

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health & Probes"])
api_router.include_router(system.router, tags=["System & Diagnostics"])
api_router.include_router(tenants.router, tags=["Multi-Tenant Governance"])
api_router.include_router(virtual_keys.router, tags=["Virtual Key Lifecycle"])
api_router.include_router(external.router, tags=["External Application Integration"])
api_router.include_router(metrics.router, tags=["Prometheus Metrics Exposition"])
api_router.include_router(models.router, prefix="/models", tags=["Model Catalog"])
api_router.include_router(routing.router, prefix="/routing", tags=["Dynamic Routing & Canary"])
api_router.include_router(xds.router, prefix="/xds", tags=["Envoy xDS Discovery Service"])
