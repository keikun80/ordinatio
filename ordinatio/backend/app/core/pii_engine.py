"""PII Masking Engine — Phase 4: Compliance & Privacy Governance

자체 정규식 기반 PII 탐지·마스킹 엔진.
DB pii_rules 테이블에 저장된 룰셋을 로드하여 실시간 마스킹 수행.

지원 액션:
  - MASK: 정규식 매칭 부분을 [MASKED_{TYPE}] 형태로 치환
  - HASH: SHA-256 가명화 해시로 치환 [HASH_{TYPE}_{hash6}]
  - BLOCK: 요청 즉시 차단 (해당 PII 포함 시 HTTP 400 반환)

에어갭 제약 사항:
  - Presidio spaCy NER 모델(~500MB) 없이 경량 정규식 엔진으로 동작
  - PresidioAdapter 인터페이스를 통해 향후 Presidio 연동 가능
"""
import hashlib
import re
import time
import uuid
import json
import logging
from dataclasses import dataclass, field, asdict
from typing import List, Optional

logger = logging.getLogger(__name__)


class PiiEngineError(Exception):
    """PII 엔진 일반 오류"""
    pass


class PiiBlockedError(PiiEngineError):
    """BLOCK 액션에 의한 요청 차단 예외"""
    def __init__(self, message: str, detections: List["PiiDetection"]):
        super().__init__(message)
        self.detections = detections


@dataclass
class PiiDetection:
    """단일 PII 탐지 결과"""
    entity_type: str
    rule_id: str
    rule_name: str
    matched_text: str       # 원본 매칭 텍스트 (감사 로그용)
    start: int
    end: int
    confidence: float
    action: str             # MASK, HASH, BLOCK
    replacement: str = ""   # 치환 결과


@dataclass
class MaskedResult:
    """PII 마스킹 처리 전체 결과"""
    original_text: str
    masked_text: str
    detections: List[PiiDetection] = field(default_factory=list)
    is_blocked: bool = False
    latency_ms: float = 0.0
    original_hash: str = ""
    masked_hash: str = ""

    @property
    def pii_count(self) -> int:
        return len(self.detections)

    def to_dict(self):
        return {
            "original_text": self.original_text,
            "masked_text": self.masked_text,
            "detections": [asdict(d) for d in self.detections],
            "is_blocked": self.is_blocked,
            "latency_ms": round(self.latency_ms, 3),
            "original_hash": self.original_hash,
            "masked_hash": self.masked_hash,
            "pii_count": len(self.detections),
        }


@dataclass
class MaskedConversation:
    """대화 전체(모든 메시지 · 모든 텍스트 블록) 마스킹 결과"""
    messages: List[dict] = field(default_factory=list)
    detections: List[PiiDetection] = field(default_factory=list)
    is_blocked: bool = False
    blocked_entities: List[str] = field(default_factory=list)
    masked_message_count: int = 0
    latency_ms: float = 0.0
    original_hash: str = ""
    masked_hash: str = ""

    @property
    def pii_count(self) -> int:
        return len(self.detections)


@dataclass
class MaskedCompletion:
    """업스트림 LLM 응답(completion) 마스킹 결과"""
    payload: dict = field(default_factory=dict)
    detections: List[PiiDetection] = field(default_factory=list)
    latency_ms: float = 0.0

    @property
    def pii_count(self) -> int:
        return len(self.detections)


@dataclass
class PiiRuleConfig:
    """PII 룰 설정 (DB 또는 인메모리)"""
    rule_id: str
    name: str
    entity_type: str
    regex_pattern: str
    confidence_threshold: float
    action: str  # MASK, HASH, BLOCK
    is_active: bool = True


class PiiEngine:
    """자체 정규식 기반 PII 탐지·마스킹 엔진

    DB pii_rules 테이블에서 룰셋을 로드하거나,
    인메모리 룰 목록으로 초기화 가능.
    """

    def __init__(self, rules: Optional[List[PiiRuleConfig]] = None):
        self._rules: List[PiiRuleConfig] = rules or []
        self._compiled: dict = {}
        self._compile_rules()

    def _compile_rules(self):
        """정규식 사전 컴파일"""
        self._compiled = {}
        for rule in self._rules:
            if rule.is_active:
                try:
                    self._compiled[rule.rule_id] = re.compile(rule.regex_pattern)
                except re.error as e:
                    logger.warning(f"Invalid regex for rule {rule.rule_id}: {e}")

    def load_rules(self, rules: List[PiiRuleConfig]):
        """룰셋 동적 리로드"""
        self._rules = rules
        self._compile_rules()

    def load_rules_from_db(self, db_session):
        """DB 세션으로부터 활성 룰셋을 쿼리하여 컴파일"""
        self._rules = load_rules_from_db(db_session)
        self._compile_rules()

    def register_rule(self, rule: PiiRuleConfig):
        """단일 룰 추가 또는 갱신"""
        self._rules = [r for r in self._rules if r.rule_id != rule.rule_id]
        self._rules.append(rule)
        self._compile_rules()

    @staticmethod
    def _sha256_short(text: str, length: int = 6) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]

    @staticmethod
    def _sha256_full(text: str) -> str:
        return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"

    def scan(self, text: str) -> List[PiiDetection]:
        """텍스트에서 PII 탐지 (마스킹 없이 탐지만)

        서로 겹치는 매칭은 fail-safe 우선순위로 단일 탐지만 채택한다. 겹침을 허용하면
        치환 시 토큰이 서로를 잘라 마스킹 결과가 손상되고 원문 일부가 잔존할 수 있다.
        """
        candidates = []
        for rule in self._rules:
            if not rule.is_active or rule.rule_id not in self._compiled:
                continue
            pattern = self._compiled[rule.rule_id]
            for match in pattern.finditer(text):
                # 신뢰도는 정규식 기반이므로 임계값 고정 사용
                confidence = float(rule.confidence_threshold)
                replacement = self._make_replacement(
                    rule.action, rule.entity_type, match.group()
                )
                candidates.append(PiiDetection(
                    entity_type=rule.entity_type,
                    rule_id=rule.rule_id,
                    rule_name=rule.name,
                    matched_text=match.group(),
                    start=match.start(),
                    end=match.end(),
                    confidence=confidence,
                    action=rule.action,
                    replacement=replacement,
                ))

        detections = self._resolve_overlaps(candidates)
        # 역순 정렬 (뒤에서부터 치환해야 인덱스 안 깨짐)
        detections.sort(key=lambda d: d.start, reverse=True)
        return detections

    @staticmethod
    def _resolve_overlaps(candidates: List[PiiDetection]) -> List[PiiDetection]:
        """겹치는 탐지 후보 중 하나만 채택한다.

        우선순위 (fail-safe):
          1. BLOCK 액션 — 차단 규칙은 마스킹/가명화보다 항상 우선한다
          2. 최장 매칭 — 더 넓은 범위를 덮는 규칙이 PII 전체를 포함할 가능성이 높다
          3. 높은 신뢰도
          4. rule_id 사전순 — 동률일 때 결정적 결과를 보장한다
        """
        ordered = sorted(
            candidates,
            key=lambda d: (
                d.action != "BLOCK",
                -(d.end - d.start),
                -d.confidence,
                d.rule_id,
                d.start,
            ),
        )

        accepted: List[PiiDetection] = []
        for cand in ordered:
            if any(cand.start < acc.end and acc.start < cand.end for acc in accepted):
                continue
            accepted.append(cand)
        return accepted

    def _make_replacement(self, action: str, entity_type: str, original: str) -> str:
        if action == "MASK":
            return f"[MASKED_{entity_type}]"
        elif action == "HASH":
            short_hash = self._sha256_short(original)
            return f"[HASH_{entity_type}_{short_hash}]"
        elif action == "BLOCK":
            return f"[BLOCKED_{entity_type}]"
        return original

    def mask(self, text: str, requester_id: str = "system", inline_block: bool = False) -> MaskedResult:
        """텍스트에서 PII 탐지 및 마스킹 수행

        Args:
            text: 마스킹 대상 텍스트
            requester_id: 요청자 식별 ID (감사 로그용)
            inline_block: BLOCK 액션 처리 방식.
                False(기본, 요청 측): 전문을 차단 안내 문구로 치환한다. 요청은
                    어차피 HTTP 403으로 거부되므로 페이로드를 보존할 이유가 없다.
                True(응답 측): 매칭 구간만 ``[BLOCKED_{TYPE}]``으로 인라인 치환하고
                    나머지 응답 본문은 보존한다. 이미 추론 비용이 발생한 응답을
                    통째로 버리지 않기 위함이며, ``is_blocked``는 그대로 보고된다.

        Returns:
            MaskedResult: 마스킹 결과 (원문 해시, 마스킹 텍스트, 탐지 목록 등)
        """
        start_time = time.perf_counter()

        original_hash = self._sha256_full(text)
        detections = self.scan(text)

        is_blocked = any(d.action == "BLOCK" for d in detections)
        masked_text = text

        if is_blocked and not inline_block:
            block_entities = [d.entity_type for d in detections if d.action == "BLOCK"]
            masked_text = (
                f"[BLOCKED_BY_COMPLIANCE: "
                f"{', '.join(block_entities)} 포함으로 요청이 차단되었습니다]"
            )
        else:
            # 원문 인덱스 기준 단일 패스 재조립.
            # 겹침이 제거된 상태이므로 모든 구간이 원문 좌표로 안전하게 해석된다.
            parts = []
            cursor = 0
            for detection in sorted(detections, key=lambda d: d.start):
                parts.append(text[cursor:detection.start])
                parts.append(detection.replacement)
                cursor = detection.end
            parts.append(text[cursor:])
            masked_text = "".join(parts)

        masked_hash = self._sha256_full(masked_text)
        elapsed_ms = (time.perf_counter() - start_time) * 1000

        return MaskedResult(
            original_text=text,
            masked_text=masked_text,
            detections=detections,
            is_blocked=is_blocked,
            latency_ms=elapsed_ms,
            original_hash=original_hash,
            masked_hash=masked_hash,
        )


    # ------------------------------------------------------------------
    # 대화 전체 마스킹 (멀티턴 · 멀티모달 · 도구 호출 포함)
    # ------------------------------------------------------------------

    # 프로토콜 식별자가 아니라 실제 사용자/모델 콘텐츠를 담는 키만 순회한다.
    # 화이트리스트 방식이어야 tool_use_id·image source 등 구조적 값이 마스킹되어
    # 업스트림 대화 프로토콜이 깨지는 것을 막을 수 있다.
    CONTENT_KEYS = ("text", "content", "thinking")
    # 인자 서브트리는 키 이름이 임의이므로 모든 문자열 리프를 마스킹한다.
    ARGUMENT_KEYS = ("input", "arguments")

    def _mask_content(self, value, detections: List[PiiDetection], inline_block: bool = False):
        """콘텐츠 키를 따라 재귀 순회하며 텍스트 리프만 마스킹한다."""
        if isinstance(value, str):
            return self._mask_text_leaf(value, detections, inline_block)
        if isinstance(value, list):
            return [self._mask_content(item, detections, inline_block) for item in value]
        if isinstance(value, dict):
            masked = dict(value)
            for key, sub in value.items():
                if key in self.CONTENT_KEYS:
                    masked[key] = self._mask_content(sub, detections, inline_block)
                elif key in self.ARGUMENT_KEYS:
                    masked[key] = self._mask_all_strings(sub, detections, inline_block)
            return masked
        return value

    def _mask_all_strings(self, value, detections: List[PiiDetection], inline_block: bool = False):
        """임의 구조의 모든 문자열 리프를 마스킹한다 (도구 호출 인자용)."""
        if isinstance(value, str):
            return self._mask_text_leaf(value, detections, inline_block)
        if isinstance(value, list):
            return [self._mask_all_strings(item, detections, inline_block) for item in value]
        if isinstance(value, dict):
            return {k: self._mask_all_strings(v, detections, inline_block) for k, v in value.items()}
        return value

    def mask_conversation(self, messages: List[dict]) -> MaskedConversation:
        """대화 메시지 목록 전체에 대해 PII 탐지·마스킹을 수행한다.

        마지막 user 메시지만 처리하면 멀티턴 2번째 턴부터, 그리고 assistant·
        tool_result·도구 인자에 포함된 PII가 업스트림으로 원문 전달된다.
        이 메서드는 모든 메시지의 모든 텍스트 리프를 대상으로 한다.

        Note:
            거버넌스 자동 주입 시스템 프롬프트는 **주입 전에** 호출하여 대상에서
            제외해야 한다. 가드레일 문구가 마스킹되어 변형되는 것을 막기 위함이다.
        """
        start_time = time.perf_counter()

        original_canonical = json.dumps(messages, sort_keys=True, ensure_ascii=False, default=str)
        detections: List[PiiDetection] = []
        masked_messages: List[dict] = []
        masked_message_count = 0

        for message in messages:
            if not isinstance(message, dict):
                masked_messages.append(message)
                continue
            before = len(detections)
            masked = dict(message)
            for key, sub in message.items():
                if key in self.CONTENT_KEYS:
                    masked[key] = self._mask_content(sub, detections)
                elif key in self.ARGUMENT_KEYS:
                    masked[key] = self._mask_all_strings(sub, detections)
            masked_messages.append(masked)
            if len(detections) > before:
                masked_message_count += 1

        blocked_entities = sorted({d.entity_type for d in detections if d.action == "BLOCK"})
        masked_canonical = json.dumps(masked_messages, sort_keys=True, ensure_ascii=False, default=str)

        return MaskedConversation(
            messages=masked_messages,
            detections=detections,
            is_blocked=bool(blocked_entities),
            blocked_entities=blocked_entities,
            masked_message_count=masked_message_count,
            latency_ms=(time.perf_counter() - start_time) * 1000,
            original_hash=self._sha256_full(original_canonical),
            masked_hash=self._sha256_full(masked_canonical),
        )


    def mask_completion(self, payload: dict) -> MaskedCompletion:
        """업스트림 LLM 응답에 포함된 PII를 탐지·마스킹한다.

        모델이 학습 데이터나 RAG 컨텍스트에서 가져온 PII를 재출력하면 요청 측
        마스킹만으로는 막을 수 없다. OpenAI(``choices[].message``)와
        Anthropic(``content``) 양쪽 응답 규격을 모두 처리한다.

        BLOCK 액션은 응답 측에서는 차단이 아니라 치환으로 처리한다 — 이미 추론
        비용이 발생했고, 응답을 통째로 버리는 것보다 마스킹 후 전달하는 편이
        가용성 측면에서 안전하다. 탐지 사실은 감사 로그로 남는다.
        """
        start_time = time.perf_counter()
        detections: List[PiiDetection] = []

        if not isinstance(payload, dict):
            return MaskedCompletion(payload=payload, detections=[], latency_ms=0.0)

        masked = dict(payload)

        # OpenAI 규격: choices[].message.{content,reasoning,reasoning_content,tool_calls}
        choices = masked.get("choices")
        if isinstance(choices, list):
            new_choices = []
            for choice in choices:
                if not isinstance(choice, dict):
                    new_choices.append(choice)
                    continue
                new_choice = dict(choice)
                message = choice.get("message")
                if isinstance(message, dict):
                    new_message = dict(message)
                    for key in ("content", "reasoning", "reasoning_content"):
                        if isinstance(message.get(key), (str, list, dict)):
                            new_message[key] = self._mask_content(message[key], detections, inline_block=True)
                    tool_calls = message.get("tool_calls")
                    if isinstance(tool_calls, list):
                        new_message["tool_calls"] = self._mask_tool_calls(tool_calls, detections)
                    new_choice["message"] = new_message
                new_choices.append(new_choice)
            masked["choices"] = new_choices

        # Anthropic 규격: 최상위 content (문자열 또는 블록 배열)
        if isinstance(masked.get("content"), str):
            masked["content"] = self._mask_text_leaf(masked["content"], detections, inline_block=True)
        elif isinstance(masked.get("content"), list):
            masked["content"] = self._mask_content(masked["content"], detections, inline_block=True)

        return MaskedCompletion(
            payload=masked,
            detections=detections,
            latency_ms=(time.perf_counter() - start_time) * 1000,
        )

    def _mask_text_leaf(self, text: str, detections: List[PiiDetection], inline_block: bool = False) -> str:
        result = self.mask(text, inline_block=inline_block)
        detections.extend(result.detections)
        return result.masked_text

    def _mask_tool_calls(self, tool_calls: list, detections: List[PiiDetection]) -> list:
        """OpenAI tool_calls의 function.arguments(JSON 문자열) 내부를 마스킹한다.

        치환 토큰에는 따옴표/백슬래시가 없으므로 JSON 문자열 유효성이 유지된다.
        """
        masked_calls = []
        for call in tool_calls:
            if not isinstance(call, dict):
                masked_calls.append(call)
                continue
            new_call = dict(call)
            fn = call.get("function")
            if isinstance(fn, dict) and isinstance(fn.get("arguments"), str):
                new_fn = dict(fn)
                new_fn["arguments"] = self._mask_text_leaf(fn["arguments"], detections, inline_block=True)
                new_call["function"] = new_fn
            masked_calls.append(new_call)
        return masked_calls


def load_rules_from_db(db_session) -> List[PiiRuleConfig]:
    """DB pii_rules 테이블에서 활성 룰셋 로드

    ``rule_id`` 오름차순을 명시한다. 정렬이 없으면 DB 실행 계획에 따라 룰 평가 순서가
    달라져 동일 입력의 마스킹 결과가 환경별로 갈리고 감사 증적이 재현 불가능해진다.
    """
    from app.models.pii_rule import PiiRule
    rows = (
        db_session.query(PiiRule)
        .filter(PiiRule.is_active.is_(True))
        .order_by(PiiRule.rule_id.asc())
        .all()
    )
    return [
        PiiRuleConfig(
            rule_id=r.rule_id,
            name=r.name,
            entity_type=r.entity_type,
            regex_pattern=r.regex_pattern,
            confidence_threshold=float(r.confidence_threshold),
            action=r.action,
            is_active=r.is_active,
        )
        for r in rows
    ]


def get_engine_with_db_rules(db_session) -> PiiEngine:
    """DB 기반 PII 엔진 인스턴스 생성"""
    rules = load_rules_from_db(db_session)
    return PiiEngine(rules=rules)


def get_default_engine(db_session=None) -> PiiEngine:
    """PostgreSQL DB 기반 PII 엔진 반환 (DB 세션 전달 권장, 미전달 시 임시 세션 사용)"""
    if db_session is not None:
        return get_engine_with_db_rules(db_session)
    from app.db.session import SessionLocal
    with SessionLocal() as db:
        return get_engine_with_db_rules(db)
