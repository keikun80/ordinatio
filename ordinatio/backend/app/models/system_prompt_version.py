from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, Index, func
from app.db.base import Base


class SystemPromptVersion(Base):
    """
    시스템 프롬프트 변경 이력 스냅샷.

    WORM 감사로그(AuditLog)는 해시/무결성 중심 구조로 prompt_id 기준 질의와 본문 복원이
    불가능하므로, 운영자가 조회·비교·롤백할 수 있는 전용 이력 테이블을 둔다.
    롤백은 과거 행을 되살리는 방식이 아니라 '복원 내용으로 새 버전을 생성'하는 방식이므로
    이력은 추가만 되고 수정·삭제되지 않는다(append-only).
    """
    __tablename__ = "system_prompt_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    prompt_id = Column(String(64), nullable=False, index=True)
    version = Column(Integer, nullable=False)

    # 스냅샷 본문
    name = Column(String(128), nullable=False)
    description = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    target_type = Column(String(32), nullable=False)
    target_id = Column(String(128), nullable=True)
    target_name = Column(String(128), nullable=True)
    injection_mode = Column(String(32), nullable=False)
    category = Column(String(32), nullable=True)
    estimated_tokens = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # 변경 메타데이터
    content_hash = Column(String(64), nullable=False)
    change_kind = Column(String(16), nullable=False)  # CREATE / UPDATE / ACTIVATE / DEACTIVATE / RESTORE
    change_summary = Column(String(512), nullable=True)
    changed_by = Column(String(128), nullable=False, default="SYSTEM")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_sp_versions_prompt_created", "prompt_id", "created_at"),
    )
