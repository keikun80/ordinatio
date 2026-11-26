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



# ---------------------------------------------------------------------------
# 시스템 프롬프트 거버넌스 주입과의 상호작용 회귀 테스트
# ---------------------------------------------------------------------------

# 전사 가드레일 수준의 긴 거버넌스 지침 (실제 시드 sp-global-guardrail 과 동일)
GUARDRAIL = (
    "[사내 보안 및 금융 컴플라이언스 기본 지침]\n"
    "1. 금융거래정보, 주민등록번호, 계좌 비밀번호 등 개인 식별 정보를 절대 외부로 유출하거나 요구하지 마십시오.\n"
    "2. 사내 규정과 금융소비자보호법을 철저히 준수하며 객관적이고 신뢰할 수 있는 정보를 제공하십시오.\n"
    "3. 불확실한 투자 조언이나 확정적 수익률 보장은 엄격히 금지됩니다."
)


def _with_guardrail(user_message: str, guardrail: str = GUARDRAIL):
    return [
        {"role": "system", "content": guardrail},
        {"role": "user", "content": user_message},
    ]


def test_injected_system_prompt_does_not_cause_cross_question_cache_hit():
    """
    긴 거버넌스 지침이 주입되어도 서로 무관한 질문이 교차 적중해서는 안 된다.

    회귀 배경: 유사도 임베딩에 주입된 시스템 프롬프트를 포함하면 수백 토큰의 지침이 벡터를
    지배해, 전혀 다른 질문끼리도 임계값(0.92)을 넘겼다.
    (실측 0.939 -> 다른 사용자의 캐시 응답이 그대로 반환됨)
    """
    cache = SemanticCache()
    cache.store("tenant-a", "model-a", _with_guardrail("Failover test prompt"), {"id": "resp-A"})

    assert cache.lookup("tenant-a", "model-a", _with_guardrail("Canary fail trigger")) is None
    assert cache.lookup("tenant-a", "model-a", _with_guardrail("분기 실적 요약해줘")) is None

    # 동일 질문은 여전히 적중해야 한다 (캐시가 무력화되지는 않았음)
    hit = cache.lookup("tenant-a", "model-a", _with_guardrail("Failover test prompt"))
    assert hit is not None
    assert hit.response == {"id": "resp-A"}


def test_cache_is_invalidated_when_governance_prompt_changes():
    """
    주입된 거버넌스 지침이 달라지면 캐시 네임스페이스가 분리되어야 한다.

    회귀 배경: 시스템 프롬프트가 캐시 키에 포함되지 않아, 관리자가 가드레일을 수정/교체한
    뒤에도 '이전 지침으로 생성된' 응답이 계속 서빙되어 거버넌스가 우회되었다.
    """
    cache = SemanticCache()
    question = "대출 상품 추천해줘"
    cache.store("tenant-a", "model-a", _with_guardrail(question), {"id": "old-guardrail-answer"})

    # 동일 지침 -> 적중
    assert cache.lookup("tenant-a", "model-a", _with_guardrail(question)) is not None

    # 지침 개정 -> 미적중 (새 지침으로 다시 추론해야 한다)
    revised = GUARDRAIL + "\n4. 금리 변동 리스크를 반드시 함께 안내하십시오."
    assert cache.lookup("tenant-a", "model-a", _with_guardrail(question, revised)) is None

    # 지침이 아예 없는 요청도 분리된다
    assert cache.lookup("tenant-a", "model-a", [{"role": "user", "content": question}]) is None


def test_developer_role_treated_as_governance_context():
    """OpenAI 추론 모델의 'developer' 롤도 거버넌스 지침으로 동일 취급되어야 한다."""
    cache = SemanticCache()
    question = "코드 리뷰해줘"
    msgs = [{"role": "developer", "content": GUARDRAIL}, {"role": "user", "content": question}]
    cache.store("tenant-a", "model-a", msgs, {"id": "dev-answer"})

    # 동일 developer 지침 -> 적중
    assert cache.lookup("tenant-a", "model-a", msgs) is not None

    # developer 지침이 다르면 분리
    other = [{"role": "developer", "content": "[다른 지침]"}, {"role": "user", "content": question}]
    assert cache.lookup("tenant-a", "model-a", other) is None

    # 지침은 동일하고 질문만 다르면 미적중
    diff_q = [{"role": "developer", "content": GUARDRAIL}, {"role": "user", "content": "배포 절차 알려줘"}]
    assert cache.lookup("tenant-a", "model-a", diff_q) is None
