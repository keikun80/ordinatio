from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.api.v1.endpoints import metrics, gateway

from contextlib import asynccontextmanager
from app.db.init_db import init_db
from app.core.telemetry_hub import telemetry_hub

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    telemetry_hub.start_background_loop()
    yield
    await telemetry_hub.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan
)

# Reverse Proxy / AWS ELB Proxy Headers Support (X-Forwarded-For, X-Forwarded-Proto)
if settings.BEHIND_PROXY:
    trusted_hosts = [h.strip() for h in settings.TRUSTED_PROXIES.split(",") if h.strip()]
    if "*" in trusted_hosts:
        app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
    else:
        app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=trusted_hosts)

# CORS 설정
if settings.ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# 1. 표준 컨트롤 플레인 관리 API (/api/v1/...)
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(metrics.router)

# 2. OpenAI 표준 L7 AI 게이트웨이 엔드포인트 (/v1/...)
app.include_router(gateway.router, prefix="/v1", tags=["OpenAI L7 AI Gateway Ingress"])

@app.get("/health", status_code=200, tags=["Health & Probes"])
def health_root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

@app.get("/")
def root():
    return {
        "message": "Ordinatio Control Plane API is online",
        "docs": f"{settings.API_V1_STR}/docs",
        "health": f"{settings.API_V1_STR}/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
