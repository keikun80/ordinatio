import os
import socket
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

def _resolve_database_url(url: str) -> str:
    """When running on the host outside Docker, rewrite '@postgres:' to '@localhost:' if 'postgres' is unresolvable."""
    if "@postgres:" in url and not os.path.exists("/.dockerenv"):
        try:
            socket.gethostbyname("postgres")
        except socket.gaierror:
            return url.replace("@postgres:", "@localhost:")
    return url

# In dev / test, if PostgreSQL is not available, we gracefully fallback or handle connect
connect_args = {}
engine_kwargs = {"pool_pre_ping": True}
resolved_db_url = _resolve_database_url(settings.DATABASE_URL)

if resolved_db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_engine(
    resolved_db_url,
    connect_args=connect_args,
    **engine_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
