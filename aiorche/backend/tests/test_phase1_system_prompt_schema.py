import pytest
from app.db.session import SessionLocal
from app.db.init_db import init_db
from app.models.system_prompt import SystemPrompt
from app.schemas.system_prompt import (
    SystemPromptCreate,
    SystemPromptUpdate,
    SystemPromptResponse,
    PromptResolveRequest,
    PromptResolveResponse
)

def test_system_prompt_table_creation_and_seed_data():
    """Verify that system_prompts table is created and default seed templates exist."""
    init_db()
    with SessionLocal() as db:
        prompts = db.query(SystemPrompt).all()
        assert len(prompts) >= 3

        prompt_ids = [p.prompt_id for p in prompts]
        assert "sp-global-guardrail" in prompt_ids
        assert "sp-wm-advisor" in prompt_ids
        assert "sp-route-code" in prompt_ids

        # Check target types
        target_types = {p.target_type for p in prompts}
        assert "GLOBAL" in target_types
        assert "TENANT" in target_types
        assert "ROUTE" in target_types

def test_system_prompt_crud_operations():
    """Verify CRUD operations on SystemPrompt ORM model."""
    init_db()
    test_id = "sp-unit-test-crud"
    with SessionLocal() as db:
        # 1. Clean up existing if any
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == test_id).delete()
        db.commit()

        # 2. Create
        item = SystemPrompt(
            prompt_id=test_id,
            name="단위 테스트용 프롬프트",
            description="CRUD 테스트를 위한 임시 프롬프트",
            content="당신은 테스트 어시스턴트입니다.",
            target_type="VIRTUAL_KEY",
            target_id="vk-test-01",
            target_name="테스트 가상키 (vk-test-01)",
            injection_mode="OVERRIDE",
            estimated_tokens=15,
            is_active=True
        )
        db.add(item)
        db.commit()

        # 3. Read
        fetched = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == test_id).first()
        assert fetched is not None
        assert fetched.name == "단위 테스트용 프롬프트"
        assert fetched.injection_mode == "OVERRIDE"
        assert fetched.target_type == "VIRTUAL_KEY"
        assert fetched.target_id == "vk-test-01"

        # 4. Update
        fetched.name = "수정된 단위 테스트 프롬프트"
        fetched.is_active = False
        db.commit()

        updated = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == test_id).first()
        assert updated.name == "수정된 단위 테스트 프롬프트"
        assert updated.is_active is False

        # 5. Delete
        db.delete(updated)
        db.commit()

        deleted = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == test_id).first()
        assert deleted is None

def test_system_prompt_pydantic_schema_validation():
    """Verify Pydantic V2 schemas for validation, serialization, and typing."""
    # 1. Valid creation payload
    create_dto = SystemPromptCreate(
        name="리스크 심사 가이드",
        description="리스크관리본부 전용 프롬프트",
        content="리스크 등급을 엄격히 산출하십시오.",
        target_type="TENANT",
        target_id="dept-risk",
        target_name="리스크관리부",
        injection_mode="PREPEND"
    )
    assert create_dto.name == "리스크 심사 가이드"
    assert create_dto.injection_mode == "PREPEND"
    assert create_dto.target_type == "TENANT"

    # 2. Validation error on invalid target_type
    with pytest.raises(Exception):
        SystemPromptCreate(
            name="잘못된 프롬프트",
            content="내용",
            target_type="INVALID_TARGET"  # Literal constraint violation
        )

    # 3. Validation error on invalid injection_mode
    with pytest.raises(Exception):
        SystemPromptCreate(
            name="잘못된 주입 모드",
            content="내용",
            target_type="GLOBAL",
            injection_mode="INVALID_MODE"  # Literal constraint violation
        )

def test_prompt_resolve_schemas():
    """Verify PromptResolveRequest and PromptResolveResponse DTOs."""
    req = PromptResolveRequest(
        key_id="vk-finance-01",
        route_name="default-dynamic-route",
        tenant_id="dept-wm",
        input_messages=[{"role": "user", "content": "안녕하세요"}]
    )
    assert req.key_id == "vk-finance-01"
    assert len(req.input_messages) == 1

    res = PromptResolveResponse(
        matched=True,
        resolved_by="VIRTUAL_KEY",
        final_messages=[
            {"role": "system", "content": "시스템 프롬프트"},
            {"role": "user", "content": "안녕하세요"}
        ]
    )
    assert res.matched is True
    assert res.resolved_by == "VIRTUAL_KEY"
    assert len(res.final_messages) == 2
