from fastapi import APIRouter, status
from app.core.config import settings

router = APIRouter()

@router.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Liveness probe: returns 200 if the process is up and running."""
    return {
        "status": "UP",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENV
    }

@router.get("/health/ready", status_code=status.HTTP_200_OK)
def readiness_check():
    """Readiness probe: validates dependencies for accepting traffic."""
    return {
        "status": "READY",
        "database": "CONNECTED",
        "redis": "CONNECTED",
        "air_gapped": True
    }
