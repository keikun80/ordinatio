import time
from datetime import datetime
from typing import List, Dict, Any, Optional

def generate_xds_revision() -> str:
    """Generate unique xDS revision tag: e.g. xds-rev-20260911-150530"""
    now = datetime.now()
    return f"xds-rev-{now.strftime('%Y%m%d-%H%M%S')}"

def build_envoy_weighted_clusters(traffic_weights: List[Dict[str, Any]], models_map: Dict[str, Any]) -> Dict[str, Any]:
    """Convert model traffic weights into Envoy weighted_clusters structure"""
    clusters = []
    total_weight = 0
    for tw in traffic_weights:
        model_id = tw["model_id"]
        weight = int(tw["weight"])
        total_weight += weight
        
        # Resolve model alias if known, else sanitize model_id
        model_info = models_map.get(model_id)
        cluster_name = f"cluster_{model_info.alias}" if model_info else f"cluster_{model_id.replace('/', '_').replace('-', '_')}"
        
        clusters.append({
            "name": cluster_name,
            "weight": weight
        })

    return {
        "clusters": clusters,
        "total_weight": total_weight or 100
    }

def generate_envoy_route_configuration(
    route_name: str,
    traffic_weights: List[Dict[str, Any]],
    models_map: Dict[str, Any],
    revision: str,
    strategy: str = "LeastQueueDepth"
) -> Dict[str, Any]:
    """Build Envoy v3 RouteConfiguration data structure matching xDS standards"""
    weighted_clusters = build_envoy_weighted_clusters(traffic_weights, models_map)

    route_entry = {
        "match": {
            "prefix": "/v1/chat/completions"
        },
        "route": {
            "weighted_clusters": weighted_clusters,
            "timeout": "60s",
            "retry_policy": {
                "retry_on": "5xx,connect-failure,reset",
                "num_retries": 2
            }
        }
    }

    # If load balancing strategy requires session or affinity metadata
    if strategy == "PrefixCacheAffinity":
        route_entry["route"]["hash_policy"] = [
            {"header": {"header_name": "x-prompt-hash"}}
        ]

    return {
        "version_info": revision,
        "route_config": {
            "@type": "type.googleapis.com/envoy.config.route.v3.RouteConfiguration",
            "name": "local_ai_route",
            "virtual_hosts": [
                {
                    "name": "ai_service",
                    "domains": ["*"],
                    "routes": [
                        {
                            "match": {"prefix": "/health"},
                            "route": {"cluster": "backend_service"}
                        },
                        {
                            "match": {"prefix": "/api"},
                            "route": {"cluster": "backend_service"}
                        },
                        route_entry
                    ]
                }
            ]
        }
    }
