from typing import Dict, Any, List, Optional
import copy
from sqlalchemy.orm import Session
from app.models.agent_router_policy import AgentRouterPolicyModel

DEFAULT_POLICIES_CONFIG: List[Dict[str, Any]] = [
    {
        "policy_id": "QualityFirst",
        "name": "QualityFirst (품질 우선)",
        "description": "복잡한 알고리즘, 코딩 및 심층 추론 질문 시 최고 성능 70B 모델로 우선 분기하고 단순 질의는 8B로 처리합니다.",
        "is_active": True,
        "config": {
            "reasoning_model": "meta-llama/Llama-3.1-70B-Instruct",
            "fast_model": "meta-llama/Llama-3.1-8B-Instruct",
            "enforce_reasoning_for_tools": True,
            "reasoning_cluster": "cluster_vllm_reasoning_72b",
            "fast_cluster": "cluster_vllm_fast_8b"
        }
    },
    {
        "policy_id": "LeastCost",
        "name": "LeastCost (비용 최적화)",
        "description": "테넌트의 월간 예산 소진율이 임계치를 초과하면 강제로 경제형 8B 모델로 다운티어링하여 클라우드/인프라 TCO를 방어합니다.",
        "is_active": True,
        "config": {
            "budget_threshold_pct": 80.0,
            "economic_model": "meta-llama/Llama-3.1-8B-Instruct",
            "standard_model": "meta-llama/Llama-3.1-70B-Instruct",
            "economic_cluster": "cluster_vllm_fast_8b",
            "standard_cluster": "cluster_vllm_reasoning_72b"
        }
    },
    {
        "policy_id": "LatencyOptimized",
        "name": "LatencyOptimized (지연시간 최적화)",
        "description": "초저지연(TTFT) 보장을 위해 경량 8B 모델을 최우선 분기하며, 명시적 심층 추론 요청 시에만 선택적 예외를 허용합니다.",
        "is_active": True,
        "config": {
            "target_latency_ms": 200,
            "primary_fast_model": "meta-llama/Llama-3.1-8B-Instruct",
            "allow_reasoning_override": True,
            "reasoning_model": "meta-llama/Llama-3.1-70B-Instruct",
            "fast_cluster": "cluster_vllm_fast_8b",
            "reasoning_cluster": "cluster_vllm_reasoning_72b"
        }
    },
    {
        "policy_id": "SelfHealingFallback",
        "name": "SelfHealingFallback (자가 치유 폴백)",
        "description": "업스트림 GPU 서빙 노드의 5xx 오류 또는 헬스체크 타임아웃 발생 시 무중단으로 지정된 예비 모델로 자동 절체합니다.",
        "is_active": True,
        "config": {
            "primary_fallback_model": "qwen2.5:14b",
            "secondary_fallback_model": "Solar-10.7B-Financial",
            "max_retries": 2,
            "timeout_seconds": 5,
            "fallback_cluster": "cluster_vllm_inference_pool"
        }
    }
]

class AgentRouterPolicyManager:
    """Manages CRUD for AgentRouter policies with PostgreSQL as the Single Source of Truth."""

    @classmethod
    def get_all_policies(cls, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """Fetch all policies directly from DB (or using a scoped session if db is None)."""
        if db is not None:
            return cls._fetch_from_db(db)

        from app.db.session import SessionLocal
        with SessionLocal() as session:
            return cls._fetch_from_db(session)

    @classmethod
    def _fetch_from_db(cls, db: Session) -> List[Dict[str, Any]]:
        try:
            from app.models.model_catalog import ModelCatalog
            catalog_models = db.query(ModelCatalog).filter(ModelCatalog.is_active == True).all()
            active_catalog_ids = [m.model_id for m in catalog_models]

            db_rows = db.query(AgentRouterPolicyModel).all()
            if db_rows:
                result = []
                is_dirty = False
                for row in db_rows:
                    cfg = dict(row.config or {})
                    def is_stale_or_empty(val: Optional[str]) -> bool:
                        return not val or "meta-llama" in str(val)

                    if active_catalog_ids:
                        default_reasoning = active_catalog_ids[0]
                        default_fast = active_catalog_ids[-1]

                        if row.policy_id == "QualityFirst":
                            if is_stale_or_empty(cfg.get("reasoning_model")):
                                cfg["reasoning_model"] = default_reasoning
                                is_dirty = True
                            if is_stale_or_empty(cfg.get("fast_model")):
                                cfg["fast_model"] = default_fast
                                is_dirty = True
                        elif row.policy_id == "LeastCost":
                            if is_stale_or_empty(cfg.get("standard_model")):
                                cfg["standard_model"] = default_reasoning
                                is_dirty = True
                            if is_stale_or_empty(cfg.get("economic_model")):
                                cfg["economic_model"] = default_fast
                                is_dirty = True
                        elif row.policy_id == "LatencyOptimized":
                            if is_stale_or_empty(cfg.get("reasoning_model")):
                                cfg["reasoning_model"] = default_reasoning
                                is_dirty = True
                            if is_stale_or_empty(cfg.get("primary_fast_model")):
                                cfg["primary_fast_model"] = default_fast
                                is_dirty = True
                        elif row.policy_id == "SelfHealingFallback":
                            if is_stale_or_empty(cfg.get("primary_fallback_model")):
                                cfg["primary_fallback_model"] = default_fast
                                is_dirty = True
                            if is_stale_or_empty(cfg.get("secondary_fallback_model")):
                                cfg["secondary_fallback_model"] = default_reasoning
                                is_dirty = True

                        if is_dirty:
                            row.config = cfg

                    item = {
                        "policy_id": row.policy_id,
                        "name": row.name,
                        "description": row.description,
                        "is_active": row.is_active,
                        "config": cfg,
                        "updated_at": row.updated_at
                    }
                    result.append(item)

                if is_dirty:
                    try:
                        db.commit()
                    except Exception:
                        db.rollback()

                return result
        except Exception:
            pass

        return copy.deepcopy(DEFAULT_POLICIES_CONFIG)

    @classmethod
    def get_policy(cls, policy_id: str, db: Optional[Session] = None) -> Dict[str, Any]:
        """Fetch a specific policy by policy_id directly from DB."""
        policies = cls.get_all_policies(db)
        for p in policies:
            if p["policy_id"].lower() == policy_id.lower():
                return p
        for p in DEFAULT_POLICIES_CONFIG:
            if p["policy_id"].lower() == policy_id.lower():
                return copy.deepcopy(p)
        return copy.deepcopy(DEFAULT_POLICIES_CONFIG[0])

    @classmethod
    def update_policies(cls, updated_list: List[Dict[str, Any]], db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """Update policy configurations directly in PostgreSQL."""
        if db is not None:
            return cls._update_in_db(updated_list, db)

        from app.db.session import SessionLocal
        with SessionLocal() as session:
            return cls._update_in_db(updated_list, session)

    @classmethod
    def _update_in_db(cls, updated_list: List[Dict[str, Any]], db: Session) -> List[Dict[str, Any]]:
        for item in updated_list:
            pid = item.get("policy_id")
            if not pid:
                continue

            try:
                db_row = db.query(AgentRouterPolicyModel).filter(AgentRouterPolicyModel.policy_id == pid).first()
                if db_row:
                    if "name" in item:
                        db_row.name = item["name"]
                    if "description" in item:
                        db_row.description = item["description"]
                    if "is_active" in item:
                        db_row.is_active = item["is_active"]
                    if "config" in item:
                        db_row.config = item["config"]
                else:
                    new_row = AgentRouterPolicyModel(
                        policy_id=pid,
                        name=item.get("name", pid),
                        description=item.get("description", ""),
                        is_active=item.get("is_active", True),
                        config=item.get("config", {})
                    )
                    db.add(new_row)
                db.commit()
            except Exception:
                db.rollback()

        return cls.get_all_policies(db)
