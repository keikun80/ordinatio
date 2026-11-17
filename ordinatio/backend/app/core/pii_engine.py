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
        """텍스트에서 PII 탐지 (마스킹 없이 탐지만)"""
        detections = []
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
                detections.append(PiiDetection(
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
        # 역순 정렬 (뒤에서부터 치환해야 인덱스 안 깨짐)
        detections.sort(key=lambda d: d.start, reverse=True)
        return detections

    def _make_replacement(self, action: str, entity_type: str, original: str) -> str:
        if action == "MASK":
            return f"[MASKED_{entity_type}]"
        elif action == "HASH":
            short_hash = self._sha256_short(original)
            return f"[HASH_{entity_type}_{short_hash}]"
        elif action == "BLOCK":
            return f"[BLOCKED_{entity_type}]"
        return original

    def mask(self, text: str, requester_id: str = "system") -> MaskedResult:
        """텍스트에서 PII 탐지 및 마스킹 수행

        Args:
            text: 마스킹 대상 텍스트
            requester_id: 요청자 식별 ID (감사 로그용)

        Returns:
            MaskedResult: 마스킹 결과 (원문 해시, 마스킹 텍스트, 탐지 목록 등)
        """
        start_time = time.perf_counter()

        original_hash = self._sha256_full(text)
        detections = self.scan(text)

        is_blocked = any(d.action == "BLOCK" for d in detections)
        masked_text = text

        if is_blocked:
            block_entities = [d.entity_type for d in detections if d.action == "BLOCK"]
            masked_text = (
                f"[BLOCKED_BY_COMPLIANCE: "
                f"{', '.join(block_entities)} 포함으로 요청이 차단되었습니다]"
            )
        else:
            # 뒤에서부터 치환 (인덱스 안정성)
            for detection in detections:
                masked_text = (
                    masked_text[:detection.start]
                    + detection.replacement
                    + masked_text[detection.end:]
                )

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


def load_rules_from_db(db_session) -> List[PiiRuleConfig]:
    """DB pii_rules 테이블에서 활성 룰셋 로드"""
    from app.models.pii_rule import PiiRule
    rows = db_session.query(PiiRule).filter(PiiRule.is_active.is_(True)).all()
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


# --- Default rules (에어갭 폴백 / 테스트용) ---
DEFAULT_RULES = [
    PiiRuleConfig(
        rule_id="pii-rrn",
        name="주민등록번호",
        entity_type="RRN",
        regex_pattern=r"\d{2}([0]\d|[1][0-2])\d{2}-[1-4]\d{6}",
        confidence_threshold=0.95,
        action="MASK",
    ),
    PiiRuleConfig(
        rule_id="pii-account",
        name="은행 계좌번호",
        entity_type="BANK_ACCOUNT",
        regex_pattern=r"(\d{3,6}-\d{2,6}-\d{3,6})",
        confidence_threshold=0.85,
        action="HASH",
    ),
    PiiRuleConfig(
        rule_id="pii-card",
        name="신용카드 번호",
        entity_type="CREDIT_CARD",
        regex_pattern=r"\d{4}-\d{4}-\d{4}-\d{4}",
        confidence_threshold=0.90,
        action="MASK",
    ),
    PiiRuleConfig(
        rule_id="pii-employee",
        name="사내 행번/사번",
        entity_type="EMPLOYEE_ID",
        regex_pattern=r"EMP-[A-Z]{2}\d{5}",
        confidence_threshold=0.80,
        action="BLOCK",
    ),
]


def get_default_engine() -> PiiEngine:
    """기본 폴백 PII 엔진 (DB 연결 없이 동작)"""
    return PiiEngine(rules=DEFAULT_RULES)
