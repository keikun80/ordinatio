from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.model_catalog import ModelCatalog
from app.schemas.model_catalog import ModelCatalogCreate, ModelCatalogUpdate, ModelCatalogResponse

router = APIRouter()

@router.get("", response_model=List[ModelCatalogResponse])
def list_models(db: Session = Depends(get_db)):
    """List all serving models in catalog"""
    return db.query(ModelCatalog).all()

@router.post("", response_model=ModelCatalogResponse, status_code=status.HTTP_201_CREATED)
def create_model(model_in: ModelCatalogCreate, db: Session = Depends(get_db)):
    """Register a new LLM serving model to catalog"""
    existing = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_in.model_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Model '{model_in.model_id}' already exists in catalog."
        )
    
    alias_exist = db.query(ModelCatalog).filter(ModelCatalog.alias == model_in.alias).first()
    if alias_exist:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Alias '{model_in.alias}' already used by another model."
        )

    model = ModelCatalog(**model_in.model_dump())
    db.add(model)
    db.commit()
    db.refresh(model)
    return model

@router.get("/{model_id:path}", response_model=ModelCatalogResponse)
def get_model(model_id: str, db: Session = Depends(get_db)):
    """Get serving model details by model_id"""
    model = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found."
        )
    return model

@router.patch("/{model_id:path}", response_model=ModelCatalogResponse)
def update_model(model_id: str, model_in: ModelCatalogUpdate, db: Session = Depends(get_db)):
    """Update serving model attributes (status, pricing, endpoint)"""
    model = db.query(ModelCatalog).filter(ModelCatalog.model_id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found."
        )

    update_data = model_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(model, field, value)

    db.commit()
    db.refresh(model)
    return model
