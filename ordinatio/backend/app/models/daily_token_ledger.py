"""Daily Token Ledger ORM Model — FinOps 기록 원장 (Ledger of Record).

FinOps 회계의 단일 진실 공급원(SSOT)이다. 날짜 × 테넌트 × 모델 × 가상키 단위로
토큰/비용/요청수를 누적 보관하며, 당월 지출은 날짜 범위 합계로 '파생'한다.

러닝 카운터(Tenant.spent_budget_krw)가 아니라 날짜 범위 원장을 기준으로 삼기 때문에:
  * 월 경계가 자동 처리된다 (월간 리셋 크론 불필요, Hard Cap 영구 차단 해소)
  * 과거 월 청구서를 실제 그 달의 수치로 생성할 수 있다
  * 캐시 컬럼이 어긋나도 원장에서 재구축할 수 있다
"""
from decimal import Decimal
from sqlalchemy import Column, String, Date, Integer, BigInteger, Numeric, DateTime, Index
from sqlalchemy.sql import func
from app.db.base import Base


class DailyTokenLedger(Base):
    __tablename__ = "daily_token_ledger"

    date = Column(Date, primary_key=True, nullable=False)
    tenant_id = Column(String(64), primary_key=True, nullable=False, default="global")
    model_id = Column(String(128), primary_key=True, nullable=False, default="default")
    # key_id 가 PK 에 포함되어야 가상키별 수치(Prometheus / 키 상세)를 원장에서 파생할 수 있다.
    # 없으면 한 테넌트의 여러 키가 한 행으로 합쳐져 키 단위 복구가 불가능하다.
    key_id = Column(String(64), primary_key=True, nullable=False, default="none")

    prompt_tokens = Column(BigInteger, nullable=False, default=0)
    completion_tokens = Column(BigInteger, nullable=False, default=0)
    total_tokens = Column(BigInteger, nullable=False, default=0)
    cost_krw = Column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    request_count = Column(Integer, nullable=False, default=0)

    # 시맨틱 캐시 절감액을 PostgreSQL 에 영속화한다.
    # (이전에는 프로세스 메모리 dict 에만 있어 재시작 시 0, 복제본마다 상이했다)
    cache_hit_count = Column(Integer, nullable=False, default=0)
    cache_saved_krw = Column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # PK 선두가 date 이므로 테넌트별 월 범위 조회를 위한 보조 인덱스를 둔다.
        Index("ix_daily_ledger_tenant_date", "tenant_id", "date"),
    )
