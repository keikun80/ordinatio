"""최소 기능 In-Process Redis 스텁.

테스트 환경에 Redis 가 없어(`get_redis_client() -> None`) Redis 분기가 한 번도
실행되지 않았다. 그래서 '이중 기록 불일치' 같은 결함이 테스트를 통과했다.

fakeredis 같은 PyPI 패키지를 추가하지 않는다 — 본 제품은 100% 에어갭 오프라인
번들로 배포되므로 런타임/테스트 의존성 추가는 번들 구성에 영향을 준다.
필요한 명령만 직접 구현한다.
"""
from __future__ import annotations

import fnmatch
import threading
from typing import Dict, Iterator, Optional


class FakeRedis:
    def __init__(self) -> None:
        self._store: Dict[str, str] = {}
        self._ttl: Dict[str, int] = {}
        self._lock = threading.Lock()
        self.fail_on_incrby = False

    # --- connection ---
    def ping(self) -> bool:
        return True

    # --- string / counter ---
    def get(self, key: str) -> Optional[str]:
        with self._lock:
            return self._store.get(key)

    def set(self, key: str, value) -> bool:
        with self._lock:
            self._store[key] = str(value)
        return True

    def setex(self, key: str, ttl: int, value) -> bool:
        with self._lock:
            self._store[key] = str(value)
            self._ttl[key] = int(ttl)
        return True

    def incrby(self, key: str, amount: int = 1) -> int:
        if self.fail_on_incrby:
            raise RuntimeError("simulated redis failure")
        with self._lock:
            current = int(self._store.get(key, "0"))
            current += int(amount)
            self._store[key] = str(current)
            return current

    incr = incrby

    def expire(self, key: str, ttl: int) -> bool:
        with self._lock:
            if key in self._store:
                self._ttl[key] = int(ttl)
                return True
        return False

    def delete(self, *keys: str) -> int:
        removed = 0
        with self._lock:
            for k in keys:
                if self._store.pop(k, None) is not None:
                    removed += 1
                self._ttl.pop(k, None)
        return removed

    def scan_iter(self, match: str = "*", count: int = 100) -> Iterator[str]:
        with self._lock:
            keys = list(self._store.keys())
        for k in keys:
            if fnmatch.fnmatch(k, match):
                yield k

    # --- test helpers ---
    def snapshot(self) -> Dict[str, str]:
        with self._lock:
            return dict(self._store)

    def flush(self) -> None:
        with self._lock:
            self._store.clear()
            self._ttl.clear()
