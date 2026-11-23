from app.core.semantic_cache import SemanticCache


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


def test_semantic_cache_tracks_finops_savings():
    cache = SemanticCache()
    cache.record_savings(tokens=150, cost_krw=2.75)
    stats = cache.stats()

    assert stats["saved_tokens"] == 150
    assert stats["saved_cost_krw"] == 2.75
