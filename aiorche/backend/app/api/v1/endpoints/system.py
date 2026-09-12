from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/system/info")
def get_system_info():
    """Return core orchestrator version and component status."""
    return {
        "solution": "Enterprise AI Orchestrator Appliance",
        "version": settings.VERSION,
        "datacenter_name": settings.DATACENTER_NAME,
        "cluster_region": settings.CLUSTER_REGION,
        "deploy_mode": settings.DEPLOY_MODE,
        "mode": "Air-Gapped Customer-Managed",
        "components": {
            "envoy": "v1.31.2",
            "ext_proc": "v1.2.0",
            "presidio": "v2.2.354",
            "control_plane": settings.VERSION
        }
    }

@router.get("/system/preflight")
def run_preflight_check():
    """Simulate or check real preflight health diagnostics."""
    return {
        "status": "HEALTHY",
        "checks": [
            {"component": "PostgreSQL Metastore", "status": "PASS", "latency_ms": 0.8},
            {"component": "Redis Cluster Quotas", "status": "PASS", "latency_ms": 0.3},
            {"component": "Apache Kafka Event Bus", "status": "PASS", "latency_ms": 1.2},
            {"component": "vLLM InferencePool", "status": "PASS", "latency_ms": 24.0},
            {"component": "NVIDIA DCGM Exporter", "status": "PASS", "latency_ms": 4.0}
        ]
    }
