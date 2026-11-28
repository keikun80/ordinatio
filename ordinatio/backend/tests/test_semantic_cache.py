from app.core.semantic_cache import SemanticCache
from app.core.telemetry_hub import _get_cache_hit_rate


def test_semantic_cache_hits_for_equivalent_conversation_within_scope():
    cache = SemanticCache()
    messages = [{"role": "system", "content": "Answer concisely."}, {"role": "user", "content": "서울 날씨를 알려줘"}]
    response = {"id": "chatcmpl-1", "usage": {"prompt_tokens": 12, "completion_tokens": 8}}

    cache.store("tenant-a", "model-a", messages, response)
    hit = cache.lookup("tenant-a", "model-a", messages)

    assert hit is not None
    assert hit.similarity == 1.0
    assert hit.response == response


def test_semantic_cache_isolated_by_tenant_scope_and_model():
    cache = SemanticCache()
    messages = [{"role": "user", "content": "분기 실적 요약해줘"}]
    cache.store("tenant-a", "model-a", messages, {"answer": "A"})

    assert cache.lookup("tenant-b", "model-a", messages) is None
    assert cache.lookup("tenant-a", "model-b", messages) is None


def test_semantic_cache_shared_long_system_prompt_does_not_cross_hit_unrelated_questions():
    """Regression: a long shared (injected) system prompt must not make unrelated questions collide."""
    cache = SemanticCache()
    system = {
        "role": "system",
        "content": "[사내 보안 및 금융 컴플라이언스 기본 지침]\n1. 금융거래정보, 주민등록번호, 계좌 비밀번호 등 개인 식별 정보를 절대 외부로 유출하거나 요구하지 마십시오.\n"
                   "2. 사내 규정과 금융소비자보호법을 철저히 준수하며 객관적이고 신뢰할 수 있는 정보를 제공하십시오.\n"
                   "3. 불확실한 투자 조언이나 확정적 수익률 보장은 엄격히 금지됩니다.",
    }
    cache.store("tenant-a", "model-a", [system, {"role": "user", "content": "Failover test prompt"}], {"answer": "A"})

    assert cache.lookup("tenant-a", "model-a", [system, {"role": "user", "content": "Canary fail trigger"}]) is None
    hit = cache.lookup("tenant-a", "model-a", [system, {"role": "user", "content": "Failover test prompt"}])
    assert hit is not None and hit.response == {"answer": "A"}


def test_semantic_cache_requires_exact_context_match():
    """Same final question under a different system prompt or prior turns must miss."""
    cache = SemanticCache()
    question = {"role": "user", "content": "분기 실적 요약해줘"}
    cache.store("tenant-a", "model-a", [{"role": "system", "content": "Answer in English."}, question], {"answer": "EN"})

    assert cache.lookup("tenant-a", "model-a", [{"role": "system", "content": "한국어로 답하세요."}, question]) is None
    assert cache.lookup("tenant-a", "model-a", [question]) is None
    assert cache.lookup("tenant-a", "model-a", [
        {"role": "system", "content": "Answer in English."},
        {"role": "user", "content": "이전 질문"},
        {"role": "assistant", "content": "이전 답변"},
        question,
    ]) is None


def test_semantic_cache_tracks_finops_savings():
    cache = SemanticCache()
    cache.record_savings(tokens=150, cost_krw=2.75)
    stats = cache.stats()

    assert stats["saved_tokens"] == 150
    assert stats["saved_cost_krw"] == 2.75


def test_semantic_cache_hit_rate_computation_and_telemetry_integration(monkeypatch):
    """Test real-time calculation of hit_rate_pct = (hits / total_lookups) * 100 and integration with telemetry hub."""
    test_cache = SemanticCache()
    messages = [{"role": "user", "content": "실시간 캐시 히트율 테스트"}]
    response = {"id": "chatcmpl-cache-test", "choices": [{"message": {"content": "성공"}}]}

    # Initial state: 0 lookups -> 0.0%
    assert test_cache.stats()["hit_rate_pct"] == 0.0
    assert test_cache.stats()["hits"] == 0
    assert test_cache.stats()["misses"] == 0

    # 1 Miss
    test_cache.lookup("tenant-hit", "model-hit", messages)
    assert test_cache.stats()["misses"] == 1
    assert test_cache.stats()["hits"] == 0
    assert test_cache.stats()["hit_rate_pct"] == 0.0

    # Store and 1 Hit -> 1 Hit, 1 Miss -> hit_rate_pct == 50.0%
    test_cache.store("tenant-hit", "model-hit", messages, response)
    hit = test_cache.lookup("tenant-hit", "model-hit", messages)
    assert hit is not None

    stats = test_cache.stats()
    assert stats["hits"] == 1
    assert stats["misses"] == 1
    assert stats["hit_rate_pct"] == 50.0

    # Test telemetry hub helper integration
    import app.core.semantic_cache as sc_mod
    monkeypatch.setattr(sc_mod, "semantic_cache", test_cache)
    live_hit_rate = _get_cache_hit_rate()
    assert live_hit_rate == 50.0

