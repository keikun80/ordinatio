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

def build_single_route_entry(
    route_name: str,
    traffic_weights: List[Dict[str, Any]],
    models_map: Dict[str, Any],
    strategy: str = "LeastQueueDepth",
    match_conditions: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Build Envoy route entry (or entries) for a specific routing policy"""
    weighted_clusters = build_envoy_weighted_clusters(traffic_weights, models_map)

    route_payload = {
        "weighted_clusters": weighted_clusters,
        "timeout": "60s",
        "retry_policy": {
            "retry_on": "5xx,connect-failure,reset",
            "num_retries": 2
        }
    }

    if strategy == "PrefixCacheAffinity":
        route_payload["hash_policy"] = [
            {"header": {"header_name": "x-prompt-hash"}}
        ]

    entries = []
    conditions = match_conditions or {}

    # 1. Dedicated Path Prefix (e.g. /v1/routes/financial-advisor) with rewrite to upstream /v1/chat/completions
    path_prefix = conditions.get("path_prefix") or f"/v1/routes/{route_name}"
    path_route_payload = {
        **route_payload,
        "prefix_rewrite": "/v1/chat/completions"
    }
    entries.append({
        "match": {"prefix": path_prefix},
        "route": path_route_payload
    })

    # 2. Route Name Header Matcher (e.g. x-orche-route: financial-advisor-v1)
    entries.append({
        "match": {
            "prefix": "/v1/chat/completions",
            "headers": [
                {
                    "name": "x-orche-route",
                    "string_match": {"exact": route_name}
                }
            ]
        },
        "route": route_payload
    })

    # 3. Tenant code matching headers (e.g. x-orche-tenant: WM-01)
    tenant_codes = conditions.get("tenant_codes", [])
    if tenant_codes:
        for tcode in tenant_codes:
            entries.append({
                "match": {
                    "prefix": "/v1/chat/completions",
                    "headers": [
                        {
                            "name": "x-orche-tenant",
                            "string_match": {"exact": tcode}
                        }
                    ]
                },
                "route": route_payload
            })

    # 4. Custom Header Matchers
    custom_headers = conditions.get("headers", {})
    if custom_headers:
        header_matchers = [
            {"name": k, "string_match": {"exact": str(v)}}
            for k, v in custom_headers.items()
        ]
        entries.append({
            "match": {
                "prefix": "/v1/chat/completions",
                "headers": header_matchers
            },
            "route": route_payload
        })

    # 5. Standard /v1/chat/completions fallback entry
    entries.append({
        "match": {
            "prefix": "/v1/chat/completions"
        },
        "route": route_payload
    })

    return entries

def generate_envoy_multi_route_configuration(
    policies: List[Any],
    models_map: Dict[str, Any],
    revision: str
) -> Dict[str, Any]:
    """Compile multiple routing policies into a unified Envoy v3 RouteConfiguration"""
    base_routes = [
        {"match": {"prefix": "/health"}, "route": {"cluster": "backend_service"}},
        {"match": {"prefix": "/api"}, "route": {"cluster": "backend_service"}}
    ]

    # Sort policies by priority (ascending: priority 1 comes before 10)
    sorted_policies = sorted(policies, key=lambda p: getattr(p, 'priority', 10))

    ai_routes = []
    default_route_entry = None

    for p in sorted_policies:
        if hasattr(p, 'is_active') and not p.is_active:
            continue

        route_entries = build_single_route_entry(
            route_name=p.route_name,
            traffic_weights=p.traffic_weights,
            models_map=models_map,
            strategy=p.load_balancing_strategy,
            match_conditions=getattr(p, 'match_conditions', None)
        )

        # Separate specific matching entries from the generic fallback
        for entry in route_entries:
            # If entry has headers or a specific path prefix, prioritize it
            if "headers" in entry.get("match", {}) or entry.get("match", {}).get("prefix") != "/v1/chat/completions":
                ai_routes.append(entry)
            else:
                if default_route_entry is None:
                    default_route_entry = entry

    if default_route_entry:
        ai_routes.append(default_route_entry)
    elif sorted_policies:
        # Fallback to the first policy's default completions route
        first_p = sorted_policies[0]
        ai_routes.append({
            "match": {"prefix": "/v1/chat/completions"},
            "route": {
                "weighted_clusters": build_envoy_weighted_clusters(first_p.traffic_weights, models_map),
                "timeout": "60s"
            }
        })

    return {
        "version_info": revision,
        "route_config": {
            "@type": "type.googleapis.com/envoy.config.route.v3.RouteConfiguration",
            "name": "local_ai_route",
            "virtual_hosts": [
                {
                    "name": "ai_service",
                    "domains": ["*"],
                    "routes": base_routes + ai_routes
                }
            ]
        }
    }

def generate_envoy_route_configuration(
    route_name: str,
    traffic_weights: List[Dict[str, Any]],
    models_map: Dict[str, Any],
    revision: str,
    strategy: str = "LeastQueueDepth"
) -> Dict[str, Any]:
    """Build Envoy v3 RouteConfiguration matching xDS standards (Backward Compatible)"""
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

