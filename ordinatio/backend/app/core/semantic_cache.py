"""Air-gapped semantic response cache with Redis persistence and in-process fallback."""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import time
from collections import Counter, OrderedDict
from dataclasses import dataclass
from threading import Lock
from typing import Any, Dict, Iterable, Optional

import redis

from app.core.config import settings


_TOKEN_RE = re.compile(r"[\w가-힣]{2,}", re.UNICODE)
_DIMENSIONS = 256


def _canonical_messages(messages: Iterable[Dict[str, Any]]) -> str:
    """Preserve the full conversation context; never cache on only the last question."""
    return "\n".join(
        f"{message.get('role', 'user')}:{json.dumps(message.get('content', ''), ensure_ascii=False, sort_keys=True)}"
        for message in messages
    )


def _split_context(messages: Iterable[Dict[str, Any]]) -> tuple[str, str]:
    """Split a conversation into (exact context, final query).

    The context (system prompts + all prior turns) must match exactly, while semantic
    similarity is computed only on the final message. Embedding the whole conversation lets
    a long shared system prompt (e.g. an injected GLOBAL compliance prompt) dominate the
    vector, so unrelated questions would be served each other's cached answers.
    """
    items = list(messages)
    if not items:
        return "", ""
    return _canonical_messages(items[:-1]), _canonical_messages(items[-1:])


def _context_hash(context: str) -> str:
    return hashlib.sha256(context.encode("utf-8")).hexdigest()[:24]


def _embedding(text: str) -> list[float]:
    """Deterministic feature-hash embedding requiring no downloadable model or network."""
    counts: Counter[int] = Counter()
    tokens = _TOKEN_RE.findall(text.lower())
    for token in tokens:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        counts[int.from_bytes(digest, "big") % _DIMENSIONS] += 1
    vector = [float(counts.get(index, 0)) for index in range(_DIMENSIONS)]
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        return 0.0
    return sum(a * b for a, b in zip(left, right))


@dataclass(frozen=True)
class CacheHit:
    response: Dict[str, Any]
    similarity: float


class SemanticCache:
    """Caches only already-sanitized model responses within one tenant/key scope."""

    def __init__(self) -> None:
        self._memory: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._lock = Lock()
        self._redis: Optional[redis.Redis] = None
        self._redis_unavailable = False
        self._stats = {"hits": 0, "misses": 0, "writes": 0, "saved_tokens": 0, "saved_cost_krw": 0.0}

    def _redis_client(self) -> Optional[redis.Redis]:
        if self._redis_unavailable:
            return None
        if self._redis is None:
            try:
                self._redis = redis.Redis(
                    host=settings.REDIS_HOST,
                    port=settings.REDIS_PORT,
                    decode_responses=True,
                    socket_connect_timeout=0.05,
                    socket_timeout=0.05,
                )
                self._redis.ping()
            except Exception:
                self._redis_unavailable = True
                self._redis = None
        return self._redis

    @staticmethod
    def _prefix(scope: Optional[str], model_id: Optional[str], context: str) -> str:
        s_val = str(scope or "global")
        m_val = str(model_id or "default")
        scope_hash = hashlib.sha256(s_val.encode("utf-8")).hexdigest()[:24]
        model_hash = hashlib.sha256(m_val.encode("utf-8")).hexdigest()[:24]
        return f"ordinatio:semantic-cache:{scope_hash}:{model_hash}:{_context_hash(context)}"

    def lookup(self, scope: Optional[str], model_id: Optional[str], messages: Iterable[Dict[str, Any]]) -> Optional[CacheHit]:
        if not settings.SEMANTIC_CACHE_ENABLED:
            return None
        context, query = _split_context(messages)
        vector = _embedding(query)
        prefix = self._prefix(scope, model_id, context)
        candidates: list[Dict[str, Any]] = []
        client = self._redis_client()
        if client:
            try:
                for key in client.scan_iter(match=f"{prefix}:*", count=settings.SEMANTIC_CACHE_MAX_CANDIDATES):
                    raw = client.get(key)
                    if raw:
                        candidates.append(json.loads(raw))
                    if len(candidates) >= settings.SEMANTIC_CACHE_MAX_CANDIDATES:
                        break
            except Exception:
                self._redis_unavailable = True
        with self._lock:
            candidates.extend(entry for key, entry in self._memory.items() if key.startswith(prefix + ":"))

        best: Optional[Dict[str, Any]] = None
        best_score = 0.0
        for entry in candidates:
            score = _cosine(vector, entry.get("embedding", []))
            if score > best_score:
                best, best_score = entry, score
        with self._lock:
            if best and best_score >= settings.SEMANTIC_CACHE_SIMILARITY_THRESHOLD:
                self._stats["hits"] += 1
                return CacheHit(response=copy.deepcopy(best["response"]), similarity=round(best_score, 4))
            self._stats["misses"] += 1
        return None

    def store(self, scope: Optional[str], model_id: Optional[str], messages: Iterable[Dict[str, Any]], response: Dict[str, Any]) -> None:
        if not settings.SEMANTIC_CACHE_ENABLED:
            return
        context, query = _split_context(messages)
        prefix = self._prefix(scope, model_id, context)
        fingerprint = hashlib.sha256(query.encode("utf-8")).hexdigest()
        key = f"{prefix}:{fingerprint}"
        entry = {"embedding": _embedding(query), "response": copy.deepcopy(response)}
        with self._lock:
            self._memory[key] = entry
            self._memory.move_to_end(key)
            while len(self._memory) > settings.SEMANTIC_CACHE_MAX_CANDIDATES:
                self._memory.popitem(last=False)
            self._stats["writes"] += 1
        client = self._redis_client()
        if client:
            try:
                client.setex(key, settings.SEMANTIC_CACHE_TTL_SECONDS, json.dumps(entry, ensure_ascii=False))
            except Exception:
                self._redis_unavailable = True

    def record_savings(self, tokens: int, cost_krw: float) -> None:
        with self._lock:
            self._stats["saved_tokens"] += max(0, tokens)
            self._stats["saved_cost_krw"] = round(self._stats["saved_cost_krw"] + max(0.0, cost_krw), 2)

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            hits, misses = self._stats["hits"], self._stats["misses"]
            return {
                **self._stats,
                "hit_rate_pct": round((hits / (hits + misses)) * 100, 2) if hits + misses else 0.0,
                "backend": "redis" if self._redis_client() else "in-memory-fallback",
                "similarity_threshold": settings.SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
                "ttl_seconds": settings.SEMANTIC_CACHE_TTL_SECONDS,
            }


semantic_cache = SemanticCache()
