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
DEFAULT_FAST_MODEL = "meta-llama/Llama-3-8B-Instruct"
DEFAULT_REASONING_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Qwen-70B"
DEFAULT_FALLBACK_MODEL = "qwen/Qwen-2.5-7B-Instruct"

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
        explicit_model_request: Optional[str] = None
    ) -> RoutingDecision:
        active_policy = policy or self.default_policy
        reasons = list(classification.reasons)

        # If client explicitly asked for a concrete known model other than 'auto' or 'agent-auto', respect it
        if explicit_model_request and explicit_model_request not in ["auto", "agent-auto", "default", None]:
            is_heavy = any(k in explicit_model_request.lower() for k in ["70b", "72b", "r1", "reason", "large"])
            cluster = DEFAULT_CLUSTERS["reasoning_72b"] if is_heavy else DEFAULT_CLUSTERS["fast_8b"]
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
                fallback_cluster=DEFAULT_CLUSTERS["fallback"]
            )

        # 1. LeastCost Policy (Budget-Aware)
        if active_policy == RoutingPolicyType.LEAST_COST:
            # If tenant budget spent ratio >= 80%, force downgrade to fast/economic model
            if tenant_budget_spent_ratio >= 0.8:
                reasons.append(f"Budget alert active ({tenant_budget_spent_ratio*100:.1f}% spent): forcing Fast 8B Tier to minimize compute TCO")
                return RoutingDecision(
                    selected_model=self.fast_model,
                    target_cluster=DEFAULT_CLUSTERS["fast_8b"],
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="fast_8b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fallback_model,
                    fallback_cluster=DEFAULT_CLUSTERS["fallback"]
                )
            
            # Normal budget: light/medium goes to 8B, reasoning goes to 72B
            if classification.complexity in [ComplexityLevel.REASONING_HEAVY, ComplexityLevel.AGENT_WORKFLOW]:
                return RoutingDecision(
                    selected_model=self.reasoning_model,
                    target_cluster=DEFAULT_CLUSTERS["reasoning_72b"],
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="reasoning_72b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fast_model,
                    fallback_cluster=DEFAULT_CLUSTERS["fast_8b"]
                )
            else:
                return RoutingDecision(
                    selected_model=self.fast_model,
                    target_cluster=DEFAULT_CLUSTERS["fast_8b"],
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="fast_8b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fallback_model,
                    fallback_cluster=DEFAULT_CLUSTERS["fallback"]
                )

        # 2. LatencyOptimized Policy
        if active_policy == RoutingPolicyType.LATENCY_OPTIMIZED:
            # Prioritize low-latency 8B model unless prompt strictly demands heavy reasoning
            if classification.complexity == ComplexityLevel.REASONING_HEAVY:
                reasons.append("LatencyOptimized: complex deductive reasoning required, routing to Reasoning 72B")
                return RoutingDecision(
                    selected_model=self.reasoning_model,
                    target_cluster=DEFAULT_CLUSTERS["reasoning_72b"],
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="reasoning_72b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fast_model,
                    fallback_cluster=DEFAULT_CLUSTERS["fast_8b"]
                )
            else:
                reasons.append("LatencyOptimized: prioritizing ultra-fast TTFT on Fast 8B Tier")
                return RoutingDecision(
                    selected_model=self.fast_model,
                    target_cluster=DEFAULT_CLUSTERS["fast_8b"],
                    complexity=classification.complexity,
                    policy_applied=active_policy,
                    tier="fast_8b",
                    estimated_tokens=classification.estimated_tokens,
                    reasons=reasons,
                    fallback_model=self.fallback_model,
                    fallback_cluster=DEFAULT_CLUSTERS["fallback"]
                )

        # 3. QualityFirst Policy (Default)
        if classification.complexity in [ComplexityLevel.REASONING_HEAVY, ComplexityLevel.AGENT_WORKFLOW]:
            reasons.append("QualityFirst: detected heavy reasoning/tool calling, routing to 72B Tier")
            return RoutingDecision(
                selected_model=self.reasoning_model,
                target_cluster=DEFAULT_CLUSTERS["reasoning_72b"],
                complexity=classification.complexity,
                policy_applied=active_policy,
                tier="reasoning_72b",
                estimated_tokens=classification.estimated_tokens,
                reasons=reasons,
                fallback_model=self.fast_model,
                fallback_cluster=DEFAULT_CLUSTERS["fast_8b"]
            )
        else:
            reasons.append("QualityFirst: standard conversational query, routing to Fast 8B Tier")
            return RoutingDecision(
                selected_model=self.fast_model,
                target_cluster=DEFAULT_CLUSTERS["fast_8b"],
                complexity=classification.complexity,
                policy_applied=active_policy,
                tier="fast_8b",
                estimated_tokens=classification.estimated_tokens,
                reasons=reasons,
                fallback_model=self.fallback_model,
                fallback_cluster=DEFAULT_CLUSTERS["fallback"]
            )
