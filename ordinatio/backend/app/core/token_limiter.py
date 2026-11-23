import time
import uuid
import logging
from typing import Dict, Tuple, Optional
import redis
from app.core.config import settings

logger = logging.getLogger(__name__)

class TokenRateLimiter:
    """
    Token-based Rate Limiter (TPM: Tokens Per Minute) for Envoy AI Gateway & AgentRouter.
    Tracks token consumption within a 60-second sliding window per Virtual Key / Tenant.
    Supports Redis distributed sliding window with automatic in-process memory fallback.
    """

    def __init__(self, host: Optional[str] = None, port: Optional[int] = None):
        self._history: Dict[str, list] = {}
        self._redis_host = host or settings.REDIS_HOST
        self._redis_port = port or settings.REDIS_PORT
        self._redis: Optional[redis.Redis] = None
        self._redis_unavailable = False

    def _get_redis(self) -> Optional[redis.Redis]:
        if self._redis_unavailable:
            return None
        if self._redis is None:
            try:
                client = redis.Redis(
                    host=self._redis_host,
                    port=self._redis_port,
                    decode_responses=True,
                    socket_connect_timeout=0.05,
                    socket_timeout=0.05,
                )
                client.ping()
                self._redis = client
            except Exception:
                self._redis_unavailable = True
                self._redis = None
                return None
        return self._redis

    def check_and_consume(self, key_id: str, requested_tokens: int, tpm_limit: int) -> Tuple[bool, int, int]:
        """
        Validates whether adding `requested_tokens` exceeds `tpm_limit`.
        Returns: (is_allowed, current_usage, remaining_tokens)
        """
        now = time.time()
        window_start = now - 60.0

        r_client = self._get_redis()
        if r_client:
            redis_key = f"ordinatio:tpm:{key_id}"
            try:
                # 1. Clean up entries older than 60s and fetch active window
                pipe = r_client.pipeline()
                pipe.zremrangebyscore(redis_key, "-inf", window_start)
                pipe.zrange(redis_key, 0, -1)
                _, members = pipe.execute()

                # Sum token usage from member tokens (format: f"{tokens}:{unique_id}")
                current_usage = 0
                for m in members:
                    if isinstance(m, str) and ":" in m:
                        try:
                            current_usage += int(m.split(":", 1)[0])
                        except ValueError:
                            pass

                if current_usage + requested_tokens > tpm_limit:
                    remaining = max(0, tpm_limit - current_usage)
                    return False, current_usage, remaining

                # Record token consumption with TTL
                unique_member = f"{requested_tokens}:{uuid.uuid4().hex[:8]}"
                pipe2 = r_client.pipeline()
                pipe2.zadd(redis_key, {unique_member: now})
                pipe2.expire(redis_key, 120)
                pipe2.execute()

                remaining = max(0, tpm_limit - (current_usage + requested_tokens))
                return True, current_usage + requested_tokens, remaining
            except Exception as e:
                logger.debug(f"Redis rate limiter failed, falling back to in-memory: {e}")
                self._redis_unavailable = True

        # In-memory sliding window fallback
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

        r_client = self._get_redis()
        if r_client:
            redis_key = f"ordinatio:tpm:{key_id}"
            try:
                pipe = r_client.pipeline()
                pipe.zremrangebyscore(redis_key, "-inf", window_start)
                pipe.zrange(redis_key, 0, -1)
                _, members = pipe.execute()

                current_usage = 0
                for m in members:
                    if isinstance(m, str) and ":" in m:
                        try:
                            current_usage += int(m.split(":", 1)[0])
                        except ValueError:
                            pass
                return current_usage
            except Exception:
                self._redis_unavailable = True

        if key_id not in self._history:
            return 0
        return sum(cnt for ts, cnt in self._history[key_id] if ts > window_start)

# Global singleton instance
token_rate_limiter = TokenRateLimiter()
