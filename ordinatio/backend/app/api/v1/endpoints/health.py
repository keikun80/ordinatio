import time
from fastapi import APIRouter, Response, status
from sqlalchemy import text
from app.core.config import settings
from app.db import session as db_session

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

@router.get("/health/ready")
def readiness_check(response: Response):
    """Readiness probe: validates actual database and cache connectivity for accepting traffic."""
    db_status = "DISCONNECTED"
    db_latency_ms = None
    t0 = time.perf_counter()
    try:
        with db_session.SessionLocal() as db:
            db.execute(text("SELECT 1"))
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        db_status = "CONNECTED"
    except Exception:
        db_status = "DISCONNECTED"

    redis_status = "IN_MEMORY_FALLBACK"
    redis_latency_ms = None
    t1 = time.perf_counter()
    try:
        import redis
        r = redis.Redis(host=settings.REDIS_HOST, port=settings.REDIS_PORT, socket_timeout=0.3)
        if r.ping():
            redis_latency_ms = round((time.perf_counter() - t1) * 1000, 2)
            redis_status = "CONNECTED"
    except Exception:
        redis_status = "IN_MEMORY_FALLBACK"

    is_ready = (db_status == "CONNECTED")
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "READY" if is_ready else "NOT_READY",
        "database": db_status,
        "database_latency_ms": db_latency_ms,
        "redis": redis_status,
        "redis_latency_ms": redis_latency_ms,
        "air_gapped": True
    }
