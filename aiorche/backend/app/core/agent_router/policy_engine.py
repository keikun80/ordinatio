from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import logging

from app.core.agent_router.classifier import ComplexityLevel, ClassificationResult

logger = logging.getLogger(__name__)

class RoutingPolicyType(str, Enum):
    QUALITY_FIRST = "QualityFirst"
    LEAST_COST = "LeastCost"
    LATENCY_OPTIMIZED = "LatencyOptimized"
    SELF_HEALING_FALLBACK = "SelfHealingFallback"

class RoutingDecision(BaseModel):
    selected_model: str
    target_cluster: str
    complexity: ComplexityLevel
    policy_applied: RoutingPolicyType
    tier: str                           # "fast_8b", "reasoning_72b", "agent_worker"
    estimated_tokens: int
    reasons: List[str] = Field(default_factory=list)
    fallback_model: Optional[str] = None
    fallback_cluster: Optional[str] = None

# Default standard model mappings for air-gapped deployments
DEFAULT_FAST_MODEL = "meta-llama/Llama-3.1-8B-Instruct"
DEFAULT_REASONING_MODEL = "meta-llama/Llama-3.1-70B-Instruct"
DEFAULT_FALLBACK_MODEL = "qwen2.5:14b"

def derive_cluster_name(model_name: Optional[str], default_fallback: str = "cluster_default") -> str:
    """Dynamically derives an Envoy cluster name from model name when not explicitly configured."""
    if not model_name:
        return default_fallback
    clean = model_name.replace("/", "_").replace(":", "_").replace(".", "_").replace("-", "_").lower()
    return f"cluster_{clean}"

DEFAULT_CLUSTERS = {
    "fast_8b": "cluster_vllm_fast_8b",
    "reasoning_72b": "cluster_vllm_reasoning_72b",
    "fallback": "cluster_vllm_inference_pool"
}

class AgentRouter:
    """
    Intelligent Cognitive Dispatcher for Multi-Agent & LLM Workflows.
    Decides the optimal model and Envoy cluster based on prompt classification,
    budget consumption, and routing policies.
    """

    def __init__(
        self,
        default_policy: RoutingPolicyType = RoutingPolicyType.QUALITY_FIRST,
        fast_model: str = DEFAULT_FAST_MODEL,
        reasoning_model: str = DEFAULT_REASONING_MODEL,
        fallback_model: str = DEFAULT_FALLBACK_MODEL
    ):
        self.default_policy = default_policy
        self.fast_model = fast_model
        self.reasoning_model = reasoning_model
        self.fallback_model = fallback_model

    def evaluate_route(
        self,
        classification: ClassificationResult,
        policy: Optional[RoutingPolicyType] = None,
        tenant_budget_spent_ratio: float = 0.0,
        explicit_model_request: Optional[str] = None,
        policy_config: Optional[Dict[str, Any]] = None
    ) -> RoutingDecision:
        from app.core.agent_router.policy_manager import AgentRouterPolicyManager

        active_policy = policy or self.default_policy
        reasons = list(classification.reasons)
        if policy_config is not None:
            cfg = policy_config
        else:
            policy_item = AgentRouterPolicyManager.get_policy(active_policy.value)
            cfg = policy_item.get("config", {})

        # If client explicitly asked for a concrete known model other than 'auto' or 'agent-auto', respect it
        if explicit_model_request and explicit_model_request not in ["auto", "agent-auto", "default", None]:
            is_heavy = any(k in explicit_model_request.lower() for k in ["70b", "72b", "r1", "reason", "large"])
            # Use user-configured cluster if available, or dynamically derive from model name
            default_cluster = cfg.get("reasoning_cluster" if is_heavy else "fast_cluster")
            cluster = default_cluster or derive_cluster_name(explicit_model_request)
            tier = "reasoning_72b" if is_heavy else "fast_8b"
            reasons.append(f"Client requested explicit model override: {explicit_model_request}")
            return RoutingDecision(
                selected_model=explicit_model_request,
                target_cluster=cluster,
                complexity=classification.complexity,
                policy_applied=active_policy,
                tier=tier,
                estimated_tokens=classification.estimated_tokens,
                reasons=reasons,
                fallback_model=self.fallback_model,
                fallback_cluster=cfg.get("fallback_cluster") or derive_cluster_name(self.fallback_model)
            )

        # 1. LeastCost Policy (Budget-Aware)
        if active_policy == RoutingPolicyType.LEAST_COST:
            threshold_ratio = float(cfg.get("budget_threshold_pct", 80.0)) / 100.0
            economic_model = cfg.get("economic_model", self.fast_model)
            standard_model = cfg.get("standard_model", self.reasoning_model)
            economic_cluster = cfg.get("economic_cluster") or cfg.get("fast_cluster") or derive_cluster_name(economic_model)
            standard_cluster = cfg.get("standard_cluster") or cfg.get("reasoning_cluster") or derive_cluster_name(standard_model)
            fallback_cluster = cfg.get("fallback_cluster") or derive_cluster_name(self.fallback_model)

            # If tenant budget spent ratio >= threshold, force downgrade to economic model
            if tenant_budget_spent_ratio >= threshold_ratio:
                reasons.append(f"Budget alert active ({tenant_budget_spent_ratio*100:.1f}% spent >= {threshold_ratio*100:.0f}% threshold): forcing Economic Model ({economic_model}) to minimize compute TCO")
                return RoutingDecision(
                    selected_model=economic_model,
                    target_cluster=economic_cluster,
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="fast_8b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fallback_model,
                    fallback_cluster=fallback_cluster
                )
            
            # Normal budget: light/medium goes to economic/fast, reasoning goes to standard/72B
            if classification.complexity in [ComplexityLevel.REASONING_HEAVY, ComplexityLevel.AGENT_WORKFLOW]:
                return RoutingDecision(
                    selected_model=standard_model,
                    target_cluster=standard_cluster,
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="reasoning_72b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=economic_model,
                    fallback_cluster=economic_cluster
                )
            else:
                return RoutingDecision(
                    selected_model=economic_model,
                    target_cluster=economic_cluster,
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="fast_8b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fallback_model,
                    fallback_cluster=fallback_cluster
                )

        # 2. LatencyOptimized Policy
        if active_policy == RoutingPolicyType.LATENCY_OPTIMIZED:
            primary_fast_model = cfg.get("primary_fast_model", self.fast_model)
            allow_reasoning = cfg.get("allow_reasoning_override", True)
            reasoning_model = cfg.get("reasoning_model", self.reasoning_model)
            fast_cluster = cfg.get("fast_cluster") or derive_cluster_name(primary_fast_model)
            reasoning_cluster = cfg.get("reasoning_cluster") or derive_cluster_name(reasoning_model)
            fallback_cluster = cfg.get("fallback_cluster") or derive_cluster_name(self.fallback_model)
            target_latency = cfg.get("target_latency_ms", 200)

            # Prioritize low-latency fast model unless prompt strictly demands heavy reasoning AND override allowed
            if classification.complexity == ComplexityLevel.REASONING_HEAVY and allow_reasoning:
                reasons.append(f"LatencyOptimized (Target {target_latency}ms): complex deductive reasoning required, override to Reasoning Model ({reasoning_model})")
                return RoutingDecision(
                    selected_model=reasoning_model,
                    target_cluster=reasoning_cluster,
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="reasoning_72b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=primary_fast_model,
                    fallback_cluster=fast_cluster
                )
            else:
                reasons.append(f"LatencyOptimized: prioritizing ultra-fast TTFT on Fast Tier ({primary_fast_model}, Target {target_latency}ms)")
                return RoutingDecision(
                    selected_model=primary_fast_model,
                    target_cluster=fast_cluster,
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="fast_8b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fallback_model,
                    fallback_cluster=fallback_cluster
                )

        # 3. SelfHealingFallback Policy
        if active_policy == RoutingPolicyType.SELF_HEALING_FALLBACK:
            primary_fallback = cfg.get("primary_fallback_model", self.fallback_model)
            secondary_fallback = cfg.get("secondary_fallback_model", "Solar-10.7B-Financial")
            fallback_cluster = cfg.get("fallback_cluster") or derive_cluster_name(primary_fallback)
            secondary_cluster = cfg.get("secondary_fallback_cluster") or derive_cluster_name(secondary_fallback)

            reasons.append(f"SelfHealingFallback: routing to resilient fallback model ({primary_fallback}) on cluster {fallback_cluster}")
            return RoutingDecision(
                selected_model=primary_fallback,
                target_cluster=fallback_cluster,
                complexity=classification.complexity,
                policy_applied=active_policy,
                tier="fallback",
                estimated_tokens=classification.estimated_tokens,
                reasons=reasons,
                fallback_model=secondary_fallback,
                fallback_cluster=secondary_cluster
            )

        # 4. QualityFirst Policy (Default)
        q_reasoning_model = cfg.get("reasoning_model", self.reasoning_model)
        q_fast_model = cfg.get("fast_model", self.fast_model)
        q_reasoning_cluster = cfg.get("reasoning_cluster") or derive_cluster_name(q_reasoning_model)
        q_fast_cluster = cfg.get("fast_cluster") or derive_cluster_name(q_fast_model)
        fallback_cluster = cfg.get("fallback_cluster") or derive_cluster_name(self.fallback_model)

        if classification.complexity in [ComplexityLevel.REASONING_HEAVY, ComplexityLevel.AGENT_WORKFLOW]:
            reasons.append(f"QualityFirst: detected heavy reasoning/tool calling, routing to Reasoning Tier ({q_reasoning_model})")
            return RoutingDecision(
                selected_model=q_reasoning_model,
                target_cluster=q_reasoning_cluster,
                complexity=classification.complexity,
                policy_applied=active_policy,
                tier="reasoning_72b",
                estimated_tokens=classification.estimated_tokens,
                reasons=reasons,
                fallback_model=q_fast_model,
                fallback_cluster=q_fast_cluster
            )
        else:
            reasons.append(f"QualityFirst: standard conversational query, routing to Fast Tier ({q_fast_model})")
            return RoutingDecision(
                selected_model=q_fast_model,
                target_cluster=q_fast_cluster,
                complexity=classification.complexity,
                policy_applied=active_policy,
                tier="fast_8b",
                estimated_tokens=classification.estimated_tokens,
                reasons=reasons,
                fallback_model=self.fallback_model,
                fallback_cluster=fallback_cluster
            )

