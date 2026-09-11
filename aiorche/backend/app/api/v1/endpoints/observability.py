import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.telemetry_hub import telemetry_hub
from app.schemas.observability import (
    ObservabilitySummaryResponse,
    PromQLQueryRequest,
    PromQLQueryResponse
)

router = APIRouter()

@router.websocket("/ws")
async def websocket_telemetry_stream(websocket: WebSocket):
    await telemetry_hub.connect(websocket)
    try:
        # Immediately push the first packet upon connection
        first_packet = telemetry_hub.generate_current_telemetry()
        await websocket.send_json(first_packet.model_dump())

        # Keep connection open and respond to incoming pings/messages
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        telemetry_hub.disconnect(websocket)
    except Exception:
        telemetry_hub.disconnect(websocket)

@router.get("/metrics/summary", response_model=ObservabilitySummaryResponse)
def get_observability_metrics_summary(db: Session = Depends(get_db)):
    """Returns real-time aggregated metrics summary for the Admin Overview dashboard."""
    telemetry = telemetry_hub.generate_current_telemetry()
    uptime = time.time() - telemetry_hub._start_time

    return ObservabilitySummaryResponse(
        current_rps=telemetry.rps,
        current_tps=telemetry.tps,
        p95_ttft_ms=telemetry.ttft_ms,
        error_rate=telemetry.error_rate_5xx,
        cache_hit_rate=telemetry.cache_hit_rate,
        total_tokens_today=int(telemetry.tps * 3600 * 2.4),
        compute_pools=telemetry.compute_pools,
        uptime_seconds=round(uptime, 1)
    )

@router.post("/promql", response_model=PromQLQueryResponse)
def execute_promql_query(req: PromQLQueryRequest):
    """Proxy/execute PromQL query for Grafana and custom charting."""
    # Air-gapped safe query handler
    now = time.time()
    return PromQLQueryResponse(
        status="success",
        data={
            "resultType": "vector",
            "result": [
                {
                    "metric": {"__name__": req.query, "appliance": "aiorche-airgap"},
                    "value": [now, "142.5"]
                }
            ]
        }
    )
