import time
from typing import Dict, Tuple

class TokenRateLimiter:
    """
    Token-based Rate Limiter (TPM: Tokens Per Minute) for Envoy AI Gateway & AgentRouter.
    Tracks token consumption within a 60-second sliding window per Virtual Key / Tenant.
    """

    def __init__(self):
        # key -> list of (timestamp, token_count)
        self._history: Dict[str, list] = {}

    def check_and_consume(self, key_id: str, requested_tokens: int, tpm_limit: int) -> Tuple[bool, int, int]:
        """
        Validates whether adding `requested_tokens` exceeds `tpm_limit`.
        Returns: (is_allowed, current_usage, remaining_tokens)
        """
        now = time.time()
        window_start = now - 60.0

        if key_id not in self._history:
            self._history[key_id] = []

        # Purge entries older than 60s
        self._history[key_id] = [
            (ts, cnt) for ts, cnt in self._history[key_id] if ts > window_start
        ]

        current_usage = sum(cnt for _, cnt in self._history[key_id])

        if current_usage + requested_tokens > tpm_limit:
            remaining = max(0, tpm_limit - current_usage)
            return False, current_usage, remaining

        # Consume tokens
        self._history[key_id].append((now, requested_tokens))
        remaining = max(0, tpm_limit - (current_usage + requested_tokens))
        return True, current_usage + requested_tokens, remaining

    def get_current_tpm(self, key_id: str) -> int:
        now = time.time()
        window_start = now - 60.0
        if key_id not in self._history:
            return 0
        return sum(cnt for ts, cnt in self._history[key_id] if ts > window_start)

# Global singleton instance
token_rate_limiter = TokenRateLimiter()
