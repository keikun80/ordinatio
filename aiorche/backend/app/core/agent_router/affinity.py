import hashlib
from typing import Optional, Dict

class SessionAffinityManager:
    """
    Manages KV-Cache & Conversation Session Affinity for Agentic Multi-Turn Dialogues.
    In vLLM with Prefix Caching, routing requests with matching prefix hashes to the
    same inference worker drastically improves TTFT and reduces redundant GPU compute.
    """

    def __init__(self, worker_slots: int = 4):
        self.worker_slots = worker_slots

    def compute_session_worker_id(self, session_id: Optional[str], prompt_prefix: Optional[str] = None) -> str:
        """Determines consistent worker index (worker-0 to worker-N) based on session_id or prompt hash"""
        key = session_id or prompt_prefix or "default-anonymous-session"
        hash_val = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16)
        worker_idx = hash_val % self.worker_slots
        return f"worker-{worker_idx}"

    def get_affinity_headers(self, session_id: Optional[str], prompt_prefix: Optional[str] = None) -> Dict[str, str]:
        """Returns HTTP headers for Envoy hash_policy routing"""
        worker_id = self.compute_session_worker_id(session_id, prompt_prefix)
        headers = {
            "x-agent-worker-affinity": worker_id
        }
        if session_id:
            headers["x-session-id"] = session_id
        if prompt_prefix:
            prefix_hash = hashlib.md5(prompt_prefix.encode("utf-8")).hexdigest()[:12]
            headers["x-prompt-hash"] = prefix_hash
        return headers
