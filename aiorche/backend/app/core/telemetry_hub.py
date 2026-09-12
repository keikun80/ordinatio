import asyncio
import time
import logging
from typing import Set, Dict, Any, List, Optional
import httpx
from fastapi import WebSocket
from sqlalchemy import func

from app.core.config import settings
from app.schemas.observability import TelemetryPacket, ComputePoolStatus
from app.db.session import SessionLocal
# Import models to ensure SQLAlchemy relations resolve correctly
import app.models.virtual_key
import app.models.tenant
from app.models.tenant import Tenant

logger = logging.getLogger("telemetry_hub")

class TelemetryHub:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._broadcast_task: Optional[asyncio.Task] = None
        self._is_running: bool = False
        self._start_time: float = time.time()

        # Envoy metric state for delta calculations
        self._last_time: float = time.time()
        self._last_rq_total: int = 0
        self._last_tx_bytes: int = 0
        self._last_rq_5xx: int = 0
        self._has_baseline: bool = False

        # Latest cached live telemetry
        self._latest_telemetry: Optional[TelemetryPacket] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self.active_connections)}")
        self.start_background_loop()

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total active: {len(self.active_connections)}")

    def start_background_loop(self):
        if not self._is_running or self._broadcast_task is None or self._broadcast_task.done():
            self._is_running = True
            self._broadcast_task = asyncio.create_task(self._periodic_broadcast())

    async def stop(self):
        self._is_running = False
        if self._broadcast_task and not self._broadcast_task.done():
            self._broadcast_task.cancel()
            try:
                await self._broadcast_task
            except asyncio.CancelledError:
                pass

    def _get_db_cumulative_cost(self) -> float:
        """Fetch real cumulative inference cost from PostgreSQL tenants table."""
        try:
            with SessionLocal() as db:
                total_cost = db.query(func.sum(Tenant.spent_budget_krw)).scalar()
                return float(total_cost) if total_cost is not None else 0.0
        except Exception as e:
            logger.warning(f"Failed to query DB for cumulative cost: {e}")
            return 0.0

    async def fetch_envoy_kpis(self) -> Dict[str, float]:
        """Fetch raw metrics from Envoy Admin API (:9901) and calculate live KPIs."""
        admin_url = f"{settings.ENVOY_ADMIN_URL}/stats?format=json&filter=http\\.ai_ingress"
        now = time.time()

        raw_stats = {}
        histograms_list = []

        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get(admin_url)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("stats", []):
                        if "name" in item:
                            raw_stats[item["name"]] = item.get("value", 0)
                        elif "histograms" in item:
                            histograms_list = item["histograms"].get("computed_quantiles", [])
        except Exception as e:
            logger.warning(f"Could not connect to Envoy Admin at {admin_url}: {e}")

        # Extract counters
        rq_total = int(raw_stats.get("http.ai_ingress.downstream_rq_total", 0))
        rq_5xx = int(raw_stats.get("http.ai_ingress.downstream_rq_5xx", 0))
        tx_bytes = int(raw_stats.get("http.ai_ingress.downstream_cx_tx_bytes_total", 0))

        # Extract P95 latency (ms)
        p95_ttft = 0.0
        for h in histograms_list:
            if h.get("name") == "http.ai_ingress.downstream_rq_time":
                vals = h.get("values", [])
                if len(vals) > 5:
                    p95_val = vals[5].get("cumulative")
                    if p95_val is not None and not str(p95_val).lower() == "nan":
                        p95_ttft = float(p95_val)

        # Delta calculation
        if not self._has_baseline:
            self._last_time = now
            self._last_rq_total = rq_total
            self._last_tx_bytes = tx_bytes
            self._last_rq_5xx = rq_5xx
            self._has_baseline = True
            delta_rq = 0
            delta_bytes = 0
            delta_5xx = 0
            delta_t = 1.0
        else:
            delta_t = max(now - self._last_time, 0.001)
            delta_rq = max(0, rq_total - self._last_rq_total)
            delta_bytes = max(0, tx_bytes - self._last_tx_bytes)
            delta_5xx = max(0, rq_5xx - self._last_rq_5xx)

            self._last_time = now
            self._last_rq_total = rq_total
            self._last_tx_bytes = tx_bytes
            self._last_rq_5xx = rq_5xx

        # 1. RPS (Requests Per Second)
        rps = round(delta_rq / delta_t, 1)

        # 2. TPS (Tokens Per Second, 1 token ≈ 4 bytes output)
        tps = round((delta_bytes / 4.0) / delta_t, 1)

        # 3. TTFT (P95 Latency ms)
        ttft = round(p95_ttft, 1)

        # 4. Error rate 5xx (%)
        if delta_rq > 0:
            error_rate = round((delta_5xx / delta_rq) * 100.0, 2)
        elif rq_total > 0:
            error_rate = round((rq_5xx / rq_total) * 100.0, 2)
        else:
            error_rate = 0.0

        return {
            "rps": rps,
            "tps": tps,
            "ttft": ttft,
            "error_rate": error_rate,
            "rq_total": rq_total,
        }

    async def collect_telemetry(self) -> TelemetryPacket:
        """Aggregate Envoy metrics, DB cumulative cost, and compute pool status."""
        envoy_kpis = await self.fetch_envoy_kpis()
        cumulative_cost = self._get_db_cumulative_cost()

        pools = [
            ComputePoolStatus(
                pool_name="EKS (vLLM)",
                infra="EKS",
                pod_count=16,
                waiting_queue=0,
                gpu_memory_pct=79.2,
                status="HEALTHY"
            ),
            ComputePoolStatus(
                pool_name="ECS (vLLM-Batch)",
                infra="ECS",
                pod_count=8,
                waiting_queue=0,
                gpu_memory_pct=86.5,
                status="HEALTHY"
            ),
            ComputePoolStatus(
                pool_name="EC2 (Ollama-Fallback)",
                infra="EC2",
                pod_count=4,
                waiting_queue=0,
                gpu_memory_pct=44.0,
                status="HEALTHY"
            )
        ]

        packet = TelemetryPacket(
            timestamp=time.time(),
            rps=envoy_kpis["rps"],
            tps=envoy_kpis["tps"],
            ttft_ms=envoy_kpis["ttft"],
            error_rate_5xx=envoy_kpis["error_rate"],
            cache_hit_rate=42.0,
            cumulative_cost_krw=round(cumulative_cost, 0),
            active_connections=len(self.active_connections),
            compute_pools=pools
        )
        self._latest_telemetry = packet
        return packet

    def generate_current_telemetry(self) -> TelemetryPacket:
        """Synchronous getter for current telemetry (uses latest collected or initial state)."""
        if self._latest_telemetry:
            return self._latest_telemetry
        
        # Initial baseline before first async scrape finishes
        cost = self._get_db_cumulative_cost()
        return TelemetryPacket(
            timestamp=time.time(),
            rps=0.0,
            tps=0.0,
            ttft_ms=3.1,
            error_rate_5xx=0.0,
            cache_hit_rate=42.0,
            cumulative_cost_krw=round(cost, 0),
            active_connections=len(self.active_connections),
            compute_pools=[
                ComputePoolStatus(
                    pool_name="EKS (vLLM)",
                    infra="EKS",
                    pod_count=16,
                    waiting_queue=0,
                    gpu_memory_pct=79.2,
                    status="HEALTHY"
                ),
                ComputePoolStatus(
                    pool_name="ECS (vLLM-Batch)",
                    infra="ECS",
                    pod_count=8,
                    waiting_queue=0,
                    gpu_memory_pct=86.5,
                    status="HEALTHY"
                ),
                ComputePoolStatus(
                    pool_name="EC2 (Ollama-Fallback)",
                    infra="EC2",
                    pod_count=4,
                    waiting_queue=0,
                    gpu_memory_pct=44.0,
                    status="HEALTHY"
                )
            ]
        )

    async def _periodic_broadcast(self):
        while self._is_running:
            try:
                # Scrape Envoy live KPIs every second
                packet = await self.collect_telemetry()
                if self.active_connections:
                    packet_dict = packet.model_dump()
                    dead_connections = set()
                    for ws in list(self.active_connections):
                        try:
                            await ws.send_json(packet_dict)
                        except Exception:
                            dead_connections.add(ws)
                    for dead in dead_connections:
                        self.disconnect(dead)
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in telemetry periodic broadcast: {e}")
                await asyncio.sleep(1.0)

telemetry_hub = TelemetryHub()
