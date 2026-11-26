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

# 거버넌스 지침 역할. app.core.prompt_injector.SYS_ROLES 와 동일한 집합이지만,
# 본 모듈은 ORM/DB 계층에 의존하지 않아야 하므로 로컬에 정의한다.
_GOVERNANCE_ROLES = {"system", "developer"}


def _canonical_messages(messages: Iterable[Dict[str, Any]]) -> str:
    """Preserve the full conversation context; never cache on only the last question."""
    return "\n".join(
        f"{message.get('role', 'user')}:{json.dumps(message.get('content', ''), ensure_ascii=False, sort_keys=True)}"
        for message in messages
    )


def _split_governance(messages: Iterable[Dict[str, Any]]) -> tuple[list, list]:
    """
    메시지를 (거버넌스 지침, 실제 대화 턴)으로 분리한다.

    시스템 프롬프트 거버넌스가 주입하는 지침은 길이가 길고(사내 가드레일 수백 토큰)
    동일 라우트의 모든 요청에 똑같이 들어가므로, 유사도 임베딩에 포함하면 지침이
    벡터를 지배해 서로 무관한 질문끼리도 임계값을 넘어버린다.
    (실측: 전사 가드레일 주입 시 'Failover test prompt' vs 'Canary fail trigger' 유사도 0.939 > 임계값 0.92
     → 전혀 다른 질문에 남의 캐시 응답이 반환됨)

    따라서 지침은 '네임스페이스'로만 쓰고(= 지침이 바뀌면 캐시가 분리되고),
    유사도 판정은 실제 대화 턴만으로 수행한다.
    """
    governance = []
    conversation = []
    for m in messages or []:
        if m.get("role") in _GOVERNANCE_ROLES:
            governance.append(m)
        else:
            conversation.append(m)
    return governance, conversation


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
    def _prefix(scope: Optional[str], model_id: Optional[str], governance: Optional[list] = None) -> str:
        s_val = str(scope or "global")
        m_val = str(model_id or "default")
        scope_hash = hashlib.sha256(s_val.encode("utf-8")).hexdigest()[:24]
        model_hash = hashlib.sha256(m_val.encode("utf-8")).hexdigest()[:24]
        # 주입된 거버넌스 지침을 네임스페이스에 포함한다.
        # 포함하지 않으면 관리자가 가드레일을 수정/교체한 뒤에도 '이전 지침으로 생성된' 응답이
        # 계속 캐시에서 서빙되어 거버넌스가 우회된다.
        gov_val = _canonical_messages(governance or [])
        gov_hash = hashlib.sha256(gov_val.encode("utf-8")).hexdigest()[:24]
        return f"ordinatio:semantic-cache:{scope_hash}:{model_hash}:{gov_hash}"

    def lookup(self, scope: Optional[str], model_id: Optional[str], messages: Iterable[Dict[str, Any]]) -> Optional[CacheHit]:
        if not settings.SEMANTIC_CACHE_ENABLED:
            return None
        governance, conversation = _split_governance(messages)
        vector = _embedding(_canonical_messages(conversation))
        prefix = self._prefix(scope, model_id, governance)
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
        governance, conversation = _split_governance(messages)
        prefix = self._prefix(scope, model_id, governance)
        canonical_conversation = _canonical_messages(conversation)
        fingerprint = hashlib.sha256(canonical_conversation.encode("utf-8")).hexdigest()
        key = f"{prefix}:{fingerprint}"
        entry = {"embedding": _embedding(canonical_conversation), "response": copy.deepcopy(response)}
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
