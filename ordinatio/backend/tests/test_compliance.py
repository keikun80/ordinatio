"""Phase 4: Compliance & PII Governance Unit/Integration Tests

Tests for:
1. PiiEngine unit tests (MASK, HASH, BLOCK, latency, hashes)
2. PII rules CRUD API (/api/v1/compliance/rules)
3. PII Simulation API (/api/v1/compliance/simulate) & WORM audit log creation
4. Audit Logs Forensics API (/api/v1/compliance/audit-logs)
5. Compliance Dashboard Stats API (/api/v1/compliance/stats)
"""
import json
import re
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.pii_engine import PiiEngine, PiiRuleConfig, PiiDetection, PiiBlockedError

client = TestClient(app)


# =====================================================================
# 1. PiiEngine Unit Tests
# =====================================================================

def test_pii_engine_mask_action():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-rrn",
            name="주민번호 테스트",
            entity_type="RRN",
            regex_pattern=r"\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[1-4]\d{6}",
            confidence_threshold=0.99,
            action="MASK"
        )
    )

    sample_text = "고객 주민번호는 900101-1234567 이며 확인 바랍니다."
    res = engine.mask(sample_text)

    assert not res.is_blocked
    assert res.original_text == sample_text
    assert "[MASKED_RRN]" in res.masked_text
    assert "900101-1234567" not in res.masked_text
    assert len(res.detections) == 1
    assert res.detections[0].entity_type == "RRN"
    assert res.detections[0].action == "MASK"
    assert res.original_hash.startswith("sha256:")
    assert res.masked_hash.startswith("sha256:")
    assert res.original_hash != res.masked_hash
    assert res.latency_ms < 50.0  # sub-millisecond or few ms


def test_pii_engine_hash_action():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-acct",
            name="계좌번호 가명화",
            entity_type="BANK_ACCOUNT",
            regex_pattern=r"\b\d{3,6}-\d{2,6}-\d{3,6}\b",
            confidence_threshold=0.90,
            action="HASH"
        )
    )

    sample_text = "환불 계좌: 110-382-999412 로 입금 요청."
    res = engine.mask(sample_text)

    assert not res.is_blocked
    assert "[HASH_BANK_ACCOUNT_" in res.masked_text
    assert "110-382-999412" not in res.masked_text
    assert len(res.detections) == 1
    assert res.detections[0].action == "HASH"


def test_pii_engine_block_action():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-emp",
            name="사번 유출 차단",
            entity_type="EMPLOYEE_ID",
            regex_pattern=r"\bEMP-[A-Z]{2}\d{5}\b",
            confidence_threshold=0.85,
            action="BLOCK"
        )
    )

    sample_text = "내부 감사 대상자 EMP-HQ12345 입니다."
    res = engine.mask(sample_text)

    assert res.is_blocked is True
    assert "[BLOCKED_BY_COMPLIANCE" in res.masked_text
    assert len(res.detections) == 1
    assert res.detections[0].action == "BLOCK"


def test_pii_engine_clean_text():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-rrn",
            name="주민번호",
            entity_type="RRN",
            regex_pattern=r"\d{6}-[1-4]\d{6}",
            confidence_threshold=0.90,
            action="MASK"
        )
    )

    clean_text = "오늘의 코스피 지수는 2,650 포인트로 마감했습니다."
    res = engine.mask(clean_text)

    assert not res.is_blocked
    assert res.masked_text == clean_text
    assert len(res.detections) == 0
    assert res.original_hash == res.masked_hash


# =====================================================================
# 1.1 룰 겹침 해소 (Overlap Resolution) — 마스킹 손상 및 원문 잔존 방지
#
# 서로 겹치는 정규식 매칭을 모두 치환하면 토큰이 서로를 잘라
# 마스킹 결과가 손상되고 원문 일부가 업스트림으로 유출된다.
# =====================================================================

# init_db가 시딩하는 운영 기본 룰셋과 동일한 정의
SEEDED_RULES = {
    "rrn": PiiRuleConfig("pii-rrn", "주민등록번호 마스킹", "RRN",
                         r"\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[1-4]\d{6}", 0.99, "MASK"),
    "account": PiiRuleConfig("pii-account", "계좌번호 가명화(해싱)", "BANK_ACCOUNT",
                             r"\d{3,6}-\d{2,6}-\d{3,6}", 0.90, "HASH"),
    "card": PiiRuleConfig("pii-card", "신용카드 번호 마스킹", "CREDIT_CARD",
                          r"\b\d{4}-\d{4}-\d{4}-\d{4}\b", 0.95, "MASK"),
    "employee": PiiRuleConfig("pii-employee", "사내 행번/사번 차단", "EMPLOYEE_ID",
                              r"\bEMP-[A-Z]{2}\d{5}\b", 0.85, "BLOCK"),
    "passport": PiiRuleConfig("pii-passport", "여권번호 마스킹", "PASSPORT",
                              r"\b[A-Z]\d{8}\b", 0.95, "MASK"),
    "phone": PiiRuleConfig("pii-phone", "휴대전화번호 마스킹", "PHONE",
                           r"\b01[016789]-\d{3,4}-\d{4}\b", 0.95, "MASK"),
}

# 시딩 룰셋 전체에 걸쳐 PII가 잔존하면 안 되는 원문 토큰
PII_LITERALS = [
    "880520-1098765", "9410-1234-5678-9012", "123-456-789012",
    "010-1234-5678", "M12345678", "EMP-HQ12345",
]


def _assert_no_raw_pii(masked_text: str, *literals: str):
    for lit in literals:
        assert lit not in masked_text, f"원문 PII가 마스킹 결과에 잔존: {lit!r} in {masked_text!r}"
        # 토큰이 서로를 잘라 발생하는 부분 잔존(예: '-9012')까지 검출한다
        for frag in lit.split("-"):
            if len(frag) >= 4:
                assert frag not in masked_text, \
                    f"원문 PII 조각이 잔존: {frag!r} in {masked_text!r}"


def _assert_tokens_well_formed(masked_text: str):
    """치환 토큰이 서로 잘려 깨진 형태로 남지 않았는지 검증한다."""
    for token in re.findall(r"\[(?:MASKED|HASH|BLOCKED)_[^\]]*\]?", masked_text):
        assert re.fullmatch(r"\[MASKED_[A-Z_]+\]|\[HASH_[A-Z_]+_[0-9a-f]{6}\]", token), \
            f"손상된 마스킹 토큰 발견: {token!r} in {masked_text!r}"


def _assert_detected_pii_is_replaced(result):
    """탐지된 모든 PII는 원문·조각 모두 결과에 남지 않아야 한다."""
    _assert_tokens_well_formed(result.masked_text)
    for d in result.detections:
        _assert_no_raw_pii(result.masked_text, d.matched_text)


@pytest.mark.parametrize("order", [
    ("card", "account"),
    ("account", "card"),
    ("phone", "account"),
    ("account", "phone"),
    ("rrn", "account"),
    ("account", "rrn"),
])
def test_pii_overlap_resolution_is_order_independent(order):
    """겹치는 룰의 평가 순서가 바뀌어도 동일한 마스킹 결과를 보장해야 한다."""
    samples = [
        "기업카드 9410-1234-5678-9012 로 결제 진행",
        "국민은행 123-456-789012 계좌로 이체",
        "연락처는 010-1234-5678 입니다",
        "주민번호 880520-1098765 확인 요청",
    ]
    forward = PiiEngine([SEEDED_RULES[k] for k in order])
    reverse = PiiEngine([SEEDED_RULES[k] for k in reversed(order)])

    for text in samples:
        r_fwd = forward.mask(text)
        r_rev = reverse.mask(text)
        assert r_fwd.masked_text == r_rev.masked_text, (
            f"룰 순서에 따라 마스킹 결과가 달라짐: {order} -> {r_fwd.masked_text!r} "
            f"vs {tuple(reversed(order))} -> {r_rev.masked_text!r}"
        )
        # 해당 룰 조합이 탐지한 PII에 한해 완전 치환을 검증한다
        # (조합에 포함되지 않은 룰의 PII는 애초에 탐지 대상이 아니다)
        _assert_detected_pii_is_replaced(r_fwd)
        _assert_detected_pii_is_replaced(r_rev)


def test_pii_full_seeded_ruleset_leaves_no_raw_pii():
    """시딩 기본 룰셋 전체를 적용했을 때 어떤 원문 PII도 잔존하지 않아야 한다."""
    engine = PiiEngine(list(SEEDED_RULES.values()))
    text = (
        "고객 홍길동(주민번호 880520-1098765)의 기업카드 9410-1234-5678-9012 와 "
        "국민은행 123-456-789012 계좌, 연락처 010-1234-5678, 여권 M12345678 확인 요청"
    )
    res = engine.mask(text)

    assert not res.is_blocked
    # 시딩 룰셋은 아래 PII 전체를 커버하므로 어떤 원문도 잔존해서는 안 된다
    _assert_no_raw_pii(res.masked_text, *[l for l in PII_LITERALS if l != "EMP-HQ12345"])
    _assert_tokens_well_formed(res.masked_text)


def test_pii_overlap_prefers_block_action():
    """겹침 시 BLOCK 규칙이 MASK/HASH보다 항상 우선해야 한다 (fail-safe)."""
    # 계좌 패턴과 겹치도록 구성된 사번 차단 케이스
    block_rule = PiiRuleConfig("pii-emp-wide", "사번 차단", "EMPLOYEE_ID",
                               r"\d{3,6}-\d{2,6}-\d{3,6}", 0.50, "BLOCK")
    mask_rule = PiiRuleConfig("pii-acct-narrow", "계좌 마스킹", "BANK_ACCOUNT",
                              r"\d{3,6}-\d{2,6}-\d{3,6}", 0.99, "MASK")

    for rules in ([block_rule, mask_rule], [mask_rule, block_rule]):
        res = PiiEngine(rules).mask("계좌 123-456-789012 확인")
        assert res.is_blocked is True, "BLOCK 규칙이 MASK 규칙에 밀려 차단되지 않음"
        assert res.pii_count == 1


def test_pii_overlap_counts_each_entity_once():
    """겹친 매칭은 중복 집계되지 않아야 한다 (감사 통계 정확성)."""
    engine = PiiEngine([SEEDED_RULES["card"], SEEDED_RULES["account"]])
    res = engine.mask("기업카드 9410-1234-5678-9012 로 결제")

    assert res.pii_count == 1
    assert res.detections[0].entity_type == "CREDIT_CARD"  # 최장 매칭 채택


def test_pii_non_overlapping_detections_all_applied():
    """겹치지 않는 PII는 모두 개별 탐지·치환되어야 한다 (겹침 해소의 과잉 억제 방지)."""
    engine = PiiEngine([SEEDED_RULES["rrn"], SEEDED_RULES["card"], SEEDED_RULES["phone"]])
    res = engine.mask("주민번호 880520-1098765, 카드 9410-1234-5678-9012, 연락처 010-1234-5678")

    assert res.pii_count == 3
    assert {d.entity_type for d in res.detections} == {"RRN", "CREDIT_CARD", "PHONE"}
    assert res.masked_text.count("[MASKED_") == 3


def test_pii_rules_loaded_from_db_are_deterministically_ordered():
    """DB 룰 로딩은 rule_id 오름차순으로 고정되어야 한다 (환경별 결과 분기 방지)."""
    from app.core.pii_engine import load_rules_from_db
    from tests.conftest import TestSessionLocal

    db = TestSessionLocal()
    try:
        rule_ids = [r.rule_id for r in load_rules_from_db(db)]
    finally:
        db.close()

    assert rule_ids == sorted(rule_ids), f"룰 순서가 비결정적입니다: {rule_ids}"


# =====================================================================
# 1.2 대화 전수 마스킹 (요청 측) — 멀티턴 · 도구 호출 · 멀티모달
#
# 마지막 user 메시지만 마스킹하면 멀티턴 2번째 턴부터 PII가 원문 전달된다.
# =====================================================================

def _conversation_engine():
    return PiiEngine([SEEDED_RULES[k] for k in ("rrn", "card", "phone", "employee")])


def test_mask_conversation_masks_earlier_turns():
    """이전 턴 user 메시지의 PII도 마스킹되어야 한다 (핵심 회귀 방어)."""
    engine = _conversation_engine()
    messages = [
        {"role": "user", "content": "제 주민번호는 880520-1098765 입니다"},   # 이전 턴
        {"role": "assistant", "content": "확인했습니다"},
        {"role": "user", "content": "이제 조회해주세요"},                      # 마지막 턴 (PII 없음)
    ]
    res = engine.mask_conversation(messages)

    assert res.pii_count == 1
    assert "880520-1098765" not in json.dumps(res.messages, ensure_ascii=False)
    assert res.messages[0]["content"] == "제 주민번호는 [MASKED_RRN] 입니다"
    assert res.messages[2]["content"] == "이제 조회해주세요"
    assert res.original_hash != res.masked_hash


def test_mask_conversation_masks_assistant_and_system_roles():
    """assistant·system 메시지의 PII도 마스킹 대상이어야 한다."""
    engine = _conversation_engine()
    messages = [
        {"role": "system", "content": "고객 연락처 010-1234-5678 를 참고하라"},
        {"role": "assistant", "content": [{"type": "text", "text": "카드 9410-1234-5678-9012 조회"}]},
    ]
    res = engine.mask_conversation(messages)

    serialized = json.dumps(res.messages, ensure_ascii=False)
    assert "010-1234-5678" not in serialized
    assert "9410-1234-5678-9012" not in serialized
    assert res.masked_message_count == 2


def test_mask_conversation_masks_tool_arguments_and_results():
    """도구 호출 인자와 tool_result 내용의 PII도 마스킹되어야 한다."""
    engine = _conversation_engine()
    messages = [
        {"role": "assistant", "content": [
            {"type": "tool_use", "id": "toolu_019ABC", "name": "lookup",
             "input": {"phone": "010-1234-5678", "note": "고객 요청"}},
        ]},
        {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "toolu_019ABC",
             "content": [{"type": "text", "text": "결과: 주민번호 880520-1098765"}]},
        ]},
    ]
    res = engine.mask_conversation(messages)

    serialized = json.dumps(res.messages, ensure_ascii=False)
    assert "010-1234-5678" not in serialized
    assert "880520-1098765" not in serialized
    assert res.pii_count == 2
    # 프로토콜 식별자는 보존되어야 한다 — 마스킹되면 업스트림 대화가 깨진다
    assert res.messages[0]["content"][0]["id"] == "toolu_019ABC"
    assert res.messages[0]["content"][0]["name"] == "lookup"
    assert res.messages[1]["content"][0]["tool_use_id"] == "toolu_019ABC"


def test_mask_conversation_preserves_image_blocks():
    """이미지 base64 데이터는 마스킹 대상이 아니어야 한다 (손상 방지)."""
    engine = _conversation_engine()
    b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAAMBAQBh6FG1AAAAAElFTkSuQmCC"
    messages = [{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
        {"type": "text", "text": "주민번호 880520-1098765 확인"},
    ]}]
    res = engine.mask_conversation(messages)

    assert res.messages[0]["content"][0]["source"]["data"] == b64
    assert "880520-1098765" not in res.messages[0]["content"][1]["text"]


def test_mask_conversation_detects_block_in_earlier_turn():
    """이전 턴에 숨은 BLOCK 대상 PII도 차단 판정되어야 한다."""
    engine = _conversation_engine()
    messages = [
        {"role": "user", "content": "담당자 EMP-HQ12345 입니다"},
        {"role": "assistant", "content": "확인했습니다"},
        {"role": "user", "content": "조회해주세요"},
    ]
    res = engine.mask_conversation(messages)

    assert res.is_blocked is True
    assert res.blocked_entities == ["EMPLOYEE_ID"]


def test_mask_conversation_clean_payload_is_unchanged():
    """PII가 없으면 메시지가 변형되지 않아야 한다."""
    engine = _conversation_engine()
    messages = [{"role": "user", "content": "오늘 코스피 지수를 알려줘"}]
    res = engine.mask_conversation(messages)

    assert res.pii_count == 0
    assert res.messages == messages
    assert res.original_hash == res.masked_hash


# ---------------------------------------------------------------------
# 1.2.1 게이트웨이 실 인입 경로 통합 검증
# ---------------------------------------------------------------------

def _latest_audit_log(action_taken=None):
    from app.models.audit_log import AuditLog
    from tests.conftest import TestSessionLocal
    from sqlalchemy import desc
    db = TestSessionLocal()
    try:
        q = db.query(AuditLog)
        if action_taken:
            q = q.filter(AuditLog.action_taken == action_taken)
        row = q.order_by(desc(AuditLog.timestamp), desc(AuditLog.log_id)).first()
        if not row:
            return None
        return {
            "log_id": row.log_id,
            "action_taken": row.action_taken,
            "pii_count": row.pii_count,
            "is_blocked": row.is_blocked,
            "detections": json.loads(row.detections_json or "[]"),
        }
    finally:
        db.close()


def test_gateway_blocks_pii_hidden_in_earlier_turn():
    """게이트웨이는 이전 턴에 숨은 BLOCK 대상 PII도 403으로 차단해야 한다.

    기존 구현은 마지막 user 메시지만 검사했으므로 이 요청이 그대로 통과했다.
    """
    res = client.post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer sk-ord-test-key-developer"},
        json={
            "model": "meta-llama/Llama-3.1-8B-Instruct",
            "messages": [
                {"role": "user", "content": "담당자는 EMP-HQ12345 입니다"},
                {"role": "assistant", "content": "확인했습니다."},
                {"role": "user", "content": "그럼 조회를 진행해주세요"},
            ],
        },
    )

    assert res.status_code == 403
    assert "EMPLOYEE_ID" in res.json()["detail"]

    log = _latest_audit_log(action_taken="BLOCK")
    assert log is not None
    assert log["is_blocked"] is True
    assert log["detections"][0]["direction"] == "REQUEST"


def test_gateway_audits_pii_in_earlier_turn():
    """이전 턴 user 메시지의 마스킹 대상 PII도 감사 로그에 기록되어야 한다."""
    res = client.post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer sk-ord-test-key-developer"},
        json={
            "model": "meta-llama/Llama-3.1-8B-Instruct",
            "messages": [
                {"role": "user", "content": "제 주민번호는 880520-1098765 입니다"},
                {"role": "assistant", "content": "확인했습니다."},
                {"role": "user", "content": "대출 한도를 알려주세요"},
            ],
        },
    )

    # 업스트림 미가동 환경에서는 개발자 시뮬레이션 응답 또는 502가 반환된다.
    # 어느 쪽이든 PII 감사 기록은 반드시 남아야 한다.
    assert res.status_code in (200, 502)

    log = _latest_audit_log(action_taken="MASK")
    assert log is not None
    assert log["pii_count"] >= 1
    assert any(d["entity_type"] == "RRN" for d in log["detections"])
    assert all(d["direction"] == "REQUEST" for d in log["detections"])

    if res.status_code == 200:
        # 마스킹된 페이로드가 응답 메타데이터에 반영되어야 한다
        meta = res.json().get("orche_metadata", {})
        assert meta.get("pii_filtered") is True
        # 원문 PII가 응답 어디에도 남아 있어서는 안 된다
        assert "880520-1098765" not in json.dumps(res.json(), ensure_ascii=False)


# ---------------------------------------------------------------------
# 1.2.2 ext_proc 적용 범위 고정 (ADR-17 Masking Scope Invariant)
#
# ext_proc는 라우팅·쿼터·프롬프트 주입 전용이며 PII 마스킹을 수행하지 않는다.
# 이 전제는 Envoy ext_proc 필터가 비활성이라는 배포 구성에 의존하므로,
# 구성이 바뀌어 마스킹 우회 경로가 생기면 테스트가 실패해야 한다.
# ---------------------------------------------------------------------

def test_envoy_ext_proc_filter_remains_disabled():
    """Envoy ext_proc 필터가 비활성 상태여야 한다.

    활성화되면 추론 트래픽이 제어 평면 가드레일(PII 마스킹)을 우회할 수 있다.
    활성화가 의도된 변경이라면 ext_proc_server.py에 마스킹을 먼저 구현하고
    이 테스트를 갱신해야 한다. (ADR-17)
    """
    from pathlib import Path

    config_path = Path(__file__).resolve().parents[2] / "deploy" / "envoy" / "envoy-ai-gateway.yaml"
    if not config_path.exists():
        pytest.skip(f"Envoy 설정 파일을 찾을 수 없습니다: {config_path}")

    active_lines = [
        line for line in config_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    active_config = "\n".join(active_lines)

    assert "envoy.filters.http.ext_proc" not in active_config, (
        "Envoy ext_proc 필터가 활성화되었습니다. ADR-17에 따라 PII 마스킹은 제어 평면 "
        "게이트웨이에만 구현되어 있으므로, 이 필터를 켜면 마스킹 우회 경로가 생깁니다. "
        "ext_proc_server.py에 mask_conversation() + BLOCK REJECT + 감사 기록을 먼저 구현하십시오."
    )
    assert "envoy.filters.http.router" in active_config, "Envoy router 필터가 비활성 상태입니다."


def test_ext_proc_adapter_does_not_claim_masking():
    """ext_proc 어댑터는 PII 마스킹을 수행하지 않음이 문서화되어 있어야 한다."""
    from app.core import ext_proc_server

    doc = ext_proc_server.__doc__ or ""
    assert "PII 탐지·마스킹을 수행하지 않는다" in doc, (
        "ext_proc_server 모듈 docstring의 적용 범위 선언이 사라졌습니다. "
        "마스킹 미적용 전제는 명시적으로 유지되어야 합니다."
    )


# =====================================================================
# 1.3 응답 측 마스킹 (Completion) — 모델이 PII를 재출력하는 경로
# =====================================================================

def test_mask_completion_openai_shape():
    """OpenAI 규격 응답의 content·reasoning·tool_calls가 마스킹되어야 한다."""
    engine = _conversation_engine()
    payload = {
        "choices": [{"message": {
            "role": "assistant",
            "content": "고객 주민번호는 880520-1098765 입니다",
            "reasoning": "연락처 010-1234-5678 조회",
            "tool_calls": [{"id": "call_1", "type": "function", "function": {
                "name": "notify",
                "arguments": json.dumps({"phone": "010-9876-5432"}, ensure_ascii=False),
            }}],
        }}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 20},
    }
    res = engine.mask_completion(payload)
    message = res.payload["choices"][0]["message"]

    assert "880520-1098765" not in message["content"]
    assert "010-1234-5678" not in message["reasoning"]
    assert res.pii_count == 3
    # usage 등 비콘텐츠 필드는 보존되어야 한다
    assert res.payload["usage"] == {"prompt_tokens": 10, "completion_tokens": 20}
    # tool_calls arguments는 마스킹 후에도 유효한 JSON이어야 한다
    args = json.loads(message["tool_calls"][0]["function"]["arguments"])
    assert args["phone"] == "[MASKED_PHONE]"
    assert message["tool_calls"][0]["id"] == "call_1"


def test_mask_completion_anthropic_shape():
    """Anthropic 규격 응답의 최상위 content 블록이 마스킹되어야 한다."""
    engine = _conversation_engine()
    payload = {"type": "message", "content": [{"type": "text", "text": "연락처 010-9876-5432 확인"}]}
    res = engine.mask_completion(payload)

    assert res.payload["content"][0]["text"] == "연락처 [MASKED_PHONE] 확인"
    assert res.pii_count == 1


def test_mask_completion_block_is_inline_not_whole_text():
    """응답 측 BLOCK은 응답 본문을 통째로 버리지 않고 해당 구간만 치환해야 한다."""
    engine = _conversation_engine()
    payload = {"choices": [{"message": {
        "content": "담당자 EMP-HQ12345 이며 접수번호는 2024-A-114 입니다",
    }}]}
    res = engine.mask_completion(payload)
    content = res.payload["choices"][0]["message"]["content"]

    assert "EMP-HQ12345" not in content
    assert "[BLOCKED_EMPLOYEE_ID]" in content
    # 나머지 본문은 보존되어야 한다
    assert "접수번호는 2024-A-114 입니다" in content
    assert "BLOCKED_BY_COMPLIANCE" not in content


def test_request_side_block_still_replaces_whole_text():
    """요청 측 BLOCK은 기존대로 전문을 차단 문구로 치환해야 한다 (회귀 방어)."""
    engine = _conversation_engine()
    res = engine.mask("담당자 EMP-HQ12345 확인")

    assert res.is_blocked is True
    assert res.masked_text.startswith("[BLOCKED_BY_COMPLIANCE")
    assert "EMP-HQ12345" not in res.masked_text


def test_mask_completion_ignores_non_dict_payload():
    """비정형 응답에도 안전해야 한다."""
    engine = _conversation_engine()
    for payload in ("문자열 응답", None, [1, 2, 3]):
        res = engine.mask_completion(payload)
        assert res.payload == payload
        assert res.pii_count == 0


# =====================================================================
# 2. Compliance Rules API Integration Tests
# =====================================================================

def test_compliance_rules_crud():
    # 1. List existing rules (seeded in init_db)
    res = client.get("/api/v1/compliance/rules")
    assert res.status_code == 200
    rules = res.json()
    assert len(rules) >= 4

    # 2. Create new custom rule
    new_rule = {
        "rule_id": "pii-passport-test",
        "name": "여권번호 마스킹",
        "entity_type": "PASSPORT",
        "regex_pattern": r"[A-Z]{1}\d{8}",
        "confidence_threshold": 0.95,
        "action": "MASK",
        "is_active": True
    }
    create_res = client.post("/api/v1/compliance/rules", json=new_rule)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["rule_id"] == "pii-passport-test"
    assert created["entity_type"] == "PASSPORT"

    # 3. Duplicate ID conflict check
    dup_res = client.post("/api/v1/compliance/rules", json=new_rule)
    assert dup_res.status_code == 409

    # 4. Invalid Regex syntax check
    bad_rule = {
        "rule_id": "pii-invalid-regex",
        "name": "잘못된 정규식",
        "entity_type": "CUSTOM",
        "regex_pattern": "[A-Z++(",  # Unclosed parenthesis
        "confidence_threshold": 0.8,
        "action": "MASK"
    }
    bad_res = client.post("/api/v1/compliance/rules", json=bad_rule)
    assert bad_res.status_code == 400

    # 5. Update rule
    update_res = client.put("/api/v1/compliance/rules/pii-passport-test", json={
        "name": "여권번호 마스킹 (개정)",
        "confidence_threshold": 0.98,
        "action": "HASH"
    })
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["name"] == "여권번호 마스킹 (개정)"
    assert updated["action"] == "HASH"

    # 6. Delete rule
    del_res = client.delete("/api/v1/compliance/rules/pii-passport-test")
    assert del_res.status_code == 200

    # 7. Verify deletion
    verify_res = client.delete("/api/v1/compliance/rules/pii-passport-test")
    assert verify_res.status_code == 404


# =====================================================================
# 3. PII Simulation & WORM Audit Log Generation Tests
# =====================================================================

def test_compliance_simulate_and_audit_log():
    sim_payload = {
        "text": "고객 홍길동님의 주민번호는 880520-1098765 이며 카드번호 1234-5678-9012-3456 로 결제 요청합니다.",
        "requester_id": "WM-9901",
        "key_id": "sk-ord-wm-prod-01",
        "model_id": "meta-llama/Llama-3.1-8B-Instruct"
    }

    res = client.post("/api/v1/compliance/simulate", json=sim_payload)
    assert res.status_code == 200
    data = res.json()

    # Verify masking
    assert not data["is_blocked"]
    assert "[MASKED_RRN]" in data["masked_text"]
    assert "[MASKED_CREDIT_CARD]" in data["masked_text"]
    assert "880520-1098765" not in data["masked_text"]
    assert "1234-5678-9012-3456" not in data["masked_text"]
    assert data["pii_count"] >= 2
    assert data["audit_log_id"] is not None

    # Verify WORM audit log was created in DB
    audit_res = client.get("/api/v1/compliance/audit-logs?requester_id=WM-9901")
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) >= 1
    target_log = next(log for log in logs if log["log_id"] == data["audit_log_id"])
    assert target_log["requester_id"] == "WM-9901"
    assert target_log["action_taken"] == "MASK"
    assert target_log["is_blocked"] is False
    assert target_log["worm_reference_id"].startswith("worm-s3-vault://")
    assert target_log["original_prompt_hash"] == data["original_hash"]
    assert target_log["masked_payload_hash"] == data["masked_hash"]


def test_compliance_simulate_block():
    sim_payload = {
        "text": "비상 연락망: 담당 행번 EMP-AB12345 에게 문의 요망",
        "requester_id": "RISK-001",
        "key_id": "sk-ord-risk-dev-02"
    }

    res = client.post("/api/v1/compliance/simulate", json=sim_payload)
    assert res.status_code == 200
    data = res.json()

    assert data["is_blocked"] is True
    assert "[BLOCKED_BY_COMPLIANCE" in data["masked_text"]
    assert data["pii_count"] >= 1

    # Verify audit log recorded action_taken as BLOCK
    audit_res = client.get("/api/v1/compliance/audit-logs?action_taken=BLOCK")
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert any(l["log_id"] == data["audit_log_id"] for l in logs)


# =====================================================================
# 4. Compliance Stats API Tests
# =====================================================================

def test_compliance_stats():
    res = client.get("/api/v1/compliance/stats")
    assert res.status_code == 200
    stats = res.json()

    assert stats["total_rules"] >= 4
    assert stats["active_rules"] >= 4
    assert stats["total_audit_logs"] >= 2
    assert "RRN" in stats["detections_by_type"]
    assert "CREDIT_CARD" in stats["detections_by_type"]


# =====================================================================
# 5. WORM Storage Integrity Verification Tests
# =====================================================================

def test_compliance_worm_integrity_verification():
    """WORM 불변 파일 스토리지 및 SHA-256 해시 체인 무결성 검증 테스트"""
    res = client.get("/api/v1/compliance/worm/verify")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "VERIFIED"
    assert data["total_records"] >= 1
    assert data["tampered_records"] == 0
    assert data["hash_chain_valid"] is True
    assert "latest_hash" in data


# ---------------------------------------------------------------------
# 5.1 WORM 무결성 음성 검증 (Negative / Tamper-Detection Tests)
#
# 해피 패스만 검증하면 "검증 로직이 아무것도 보지 않는" 상태도 통과한다.
# 아래 테스트는 실제 공격 시나리오를 재현하여 탐지 여부를 확인한다.
# ---------------------------------------------------------------------

@pytest.fixture
def worm_vault(tmp_path, monkeypatch):
    """테스트별로 격리된 WORM 저장소와 레코드 기록 헬퍼를 제공한다."""
    from app.core.config import settings as app_settings
    from app.core.worm_storage import WormStorage

    monkeypatch.setattr(app_settings, "WORM_STORAGE_PATH", str(tmp_path))

    def write(log_id: str) -> str:
        ref = WormStorage.record_audit_log(
            log_id=log_id,
            requester_id="WM-TEST",
            key_id="sk-ord-test",
            model_id="test-model",
            original_prompt_hash="sha256:" + "a" * 64,
            masked_payload_hash="sha256:" + "b" * 64,
            detections=[],
            pii_count=0,
            action_taken="PASS",
            latency_ms=0.5,
            is_blocked=False,
        )
        # 기록 실패 시 None을 반환하므로 참조가 실재하는지 확인한다
        assert ref is not None
        assert (tmp_path / f"{log_id}.json").exists()
        return ref

    return tmp_path, write, WormStorage


def _unlock(path):
    """WORM 읽기 전용(0o444/0o400) 보호를 해제한다 (공격자 권한 상승 시뮬레이션)."""
    import os
    os.chmod(path, 0o644)


def test_worm_baseline_chain_is_verified(worm_vault):
    """정상 적재된 체인은 VERIFIED이며 seq/앵커가 일치해야 한다."""
    vault, write, WormStorage = worm_vault
    for i in range(1, 4):
        write(f"aud-chain-{i}")

    result = WormStorage.verify_integrity()
    assert result["status"] == "VERIFIED"
    assert result["hash_chain_valid"] is True
    assert result["chained_records"] == 3
    assert result["latest_seq"] == 3
    assert result["violation_count"] == 0
    # 체인 앵커는 읽기 전용(0o400)으로 봉인되어야 한다
    import os
    import stat as stat_mod
    head_mode = stat_mod.S_IMODE(os.stat(vault / ".chain_head").st_mode)
    assert head_mode & (stat_mod.S_IWUSR | stat_mod.S_IWGRP | stat_mod.S_IWOTH) == 0


def test_worm_detects_deleted_record(worm_vault):
    """감사 레코드 삭제는 seq 단절로 탐지되어야 한다. (삭제 후에도 VERIFIED가 나오면 안 된다)"""
    vault, write, WormStorage = worm_vault
    for i in range(1, 4):
        write(f"aud-del-{i}")
    assert WormStorage.verify_integrity()["status"] == "VERIFIED"

    target = vault / "aud-del-2.json"
    _unlock(target)
    target.unlink()

    result = WormStorage.verify_integrity()
    assert result["status"] == "MISSING_RECORD"
    assert result["hash_chain_valid"] is False
    statuses = [d["status"] for d in result["details"]]
    assert "MISSING_RECORD" in statuses
    # 삭제로 끊긴 prev_hash 연결도 함께 보고되어야 한다
    assert "CHAIN_BROKEN" in statuses


def test_worm_detects_tampered_record_body(worm_vault):
    """레코드 본문 변조는 재계산 해시 불일치로 탐지되어야 한다."""
    vault, write, WormStorage = worm_vault
    write("aud-tamper-1")
    write("aud-tamper-2")

    target = vault / "aud-tamper-2.json"
    _unlock(target)
    payload = json.loads(target.read_text(encoding="utf-8"))
    payload["requester_id"] = "ATTACKER"
    target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    result = WormStorage.verify_integrity()
    assert result["status"] == "TAMPERED"
    assert result["hash_chain_valid"] is False
    assert result["tampered_records"] == 1


def test_worm_detects_reordered_chain(worm_vault):
    """prev_hash 연결을 끊는 치환(재배열)은 CHAIN_BROKEN으로 탐지되어야 한다."""
    vault, write, WormStorage = worm_vault
    for i in range(1, 4):
        write(f"aud-reorder-{i}")

    # seq 3 레코드의 prev_hash를 seq 1의 해시로 바꿔치기하고 record_hash를 재서명한다.
    # (공격자가 해시 재계산까지 수행해 자기 해시 검증만으로는 탐지되지 않는 경우)
    import hashlib
    first = json.loads((vault / "aud-reorder-1.json").read_text(encoding="utf-8"))
    target = vault / "aud-reorder-3.json"
    _unlock(target)
    payload = json.loads(target.read_text(encoding="utf-8"))
    payload["prev_hash"] = first["record_hash"]
    body = {k: v for k, v in payload.items() if k != "record_hash"}
    payload["record_hash"] = "sha256:" + hashlib.sha256(
        json.dumps(body, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    result = WormStorage.verify_integrity()
    assert result["hash_chain_valid"] is False
    statuses = [d["status"] for d in result["details"]]
    assert "CHAIN_BROKEN" in statuses
    # 자기 해시는 유효하게 재서명되었으므로 변조 카운트로는 잡히지 않는다
    assert result["tampered_records"] == 0


def test_worm_detects_tampered_chain_anchor(worm_vault):
    """체인 앵커(.chain_head) 변조는 HEAD_MISMATCH 및 권한 위반으로 탐지되어야 한다."""
    vault, write, WormStorage = worm_vault
    write("aud-anchor-1")

    head = vault / ".chain_head"
    _unlock(head)
    head.write_text(json.dumps({"hash": "sha256:" + "0" * 64, "seq": 99}), encoding="utf-8")

    result = WormStorage.verify_integrity()
    assert result["hash_chain_valid"] is False
    statuses = [d["status"] for d in result["details"]]
    assert "HEAD_MISMATCH" in statuses
    assert "PERMISSION_VIOLATION" in statuses


def test_worm_detects_readonly_permission_drift(worm_vault):
    """읽기 전용 권한 이탈은 조용히 복구되지 않고 위반으로 보고되어야 한다."""
    vault, write, WormStorage = worm_vault
    write("aud-perm-1")

    target = vault / "aud-perm-1.json"
    _unlock(target)

    result = WormStorage.verify_integrity()
    assert result["status"] == "PERMISSION_VIOLATION"
    assert result["hash_chain_valid"] is False
    assert result["details"][0]["status"] == "PERMISSION_VIOLATION"
    # 보고 후 권한을 조용히 되돌려 증적을 지우지 않아야 한다
    import os
    import stat as stat_mod
    assert stat_mod.S_IMODE(os.stat(target).st_mode) & stat_mod.S_IWUSR


def test_worm_record_includes_sequence_and_chain_link(worm_vault):
    """각 레코드는 seq와 직전 레코드 해시를 보관해야 한다."""
    vault, write, WormStorage = worm_vault
    write("aud-link-1")
    write("aud-link-2")

    r1 = json.loads((vault / "aud-link-1.json").read_text(encoding="utf-8"))
    r2 = json.loads((vault / "aud-link-2.json").read_text(encoding="utf-8"))

    assert r1["seq"] == 1
    assert r2["seq"] == 2
    assert r2["prev_hash"] == r1["record_hash"]
    assert r1["prev_hash"].startswith("GENESIS_BLOCK_")


def test_worm_concurrent_writes_allocate_unique_sequences(worm_vault):
    """동시 기록 시에도 seq가 중복되거나 체인이 깨지지 않아야 한다."""
    import concurrent.futures

    vault, _, WormStorage = worm_vault

    def write(i):
        return WormStorage.record_audit_log(
            log_id=f"aud-conc-{i:03d}",
            requester_id="WM-TEST",
            key_id="sk-ord-test",
            model_id="test-model",
            original_prompt_hash="sha256:" + "a" * 64,
            masked_payload_hash="sha256:" + "b" * 64,
            detections=[],
            pii_count=0,
            action_taken="PASS",
            latency_ms=0.1,
            is_blocked=False,
        )

    total = 24
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        refs = list(pool.map(write, range(total)))

    assert all(r is not None for r in refs), "동시 기록 중 일부가 실패했습니다"

    seqs = sorted(
        json.loads(p.read_text(encoding="utf-8"))["seq"]
        for p in vault.glob("aud-conc-*.json")
    )
    assert seqs == list(range(1, total + 1)), f"seq 중복 또는 누락 발생: {seqs}"

    result = WormStorage.verify_integrity()
    assert result["status"] == "VERIFIED"
    assert result["chained_records"] == total


def test_worm_verify_reports_db_divergence():
    """DB AuditLog 건수와 WORM 파일 건수의 괴리를 참고 지표로 노출해야 한다."""
    res = client.get("/api/v1/compliance/worm/verify")
    assert res.status_code == 200
    data = res.json()
    assert "db_record_count" in data
    assert "db_worm_divergence" in data
    assert data["db_worm_divergence"] == data["db_record_count"] - data["total_records"]


# =====================================================================
# 6. WORM Audit Logs Export & PII Presets Tests
# =====================================================================

def test_audit_logs_export_json():
    """Verify that WORM audit logs can be streamed and exported as forensic JSON."""
    res = client.get("/api/v1/compliance/audit-logs/export")
    assert res.status_code == 200
    assert "attachment; filename=" in res.headers.get("content-disposition", "")
    data = res.json()
    assert isinstance(data, list)
    if len(data) > 0:
        first = data[0]
        assert "log_id" in first
        assert "original_prompt_hash" in first
        assert "masked_payload_hash" in first
        assert "action_taken" in first


def test_pii_presets_crud():
    """Verify database-backed PII simulation presets listing, creation, and deletion."""
    # 1. List default presets (seeded if empty)
    list_res = client.get("/api/v1/compliance/presets")
    assert list_res.status_code == 200
    presets = list_res.json()
    assert len(presets) >= 4
    preset_labels = [p["label"] for p in presets]
    assert any("주민등록번호" in lbl for lbl in preset_labels)

    # 2. Create custom preset
    new_preset_payload = {
        "label": "테스트 커스텀 사번 프리셋",
        "text": "사번 EMP-9999 직원의 보안 감사 질의입니다.",
        "created_by": "tester"
    }
    create_res = client.post("/api/v1/compliance/presets", json=new_preset_payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["label"] == new_preset_payload["label"]
    assert created_data["text"] == new_preset_payload["text"]
    preset_id = created_data["preset_id"]

    # 3. Verify it appears in list
    verify_list = client.get("/api/v1/compliance/presets")
    assert any(p["preset_id"] == preset_id for p in verify_list.json())

    # 4. Delete custom preset
    del_res = client.delete(f"/api/v1/compliance/presets/{preset_id}")
    assert del_res.status_code == 200

    # 5. Verify deletion
    after_list = client.get("/api/v1/compliance/presets")
    assert not any(p["preset_id"] == preset_id for p in after_list.json())


