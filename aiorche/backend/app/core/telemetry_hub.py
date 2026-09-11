import asyncio
import time
import random
import logging
from typing import Set, Dict, Any, List
from fastapi import WebSocket, WebSocketDisconnect
from app.schemas.observability import TelemetryPacket, ComputePoolStatus

logger = logging.getLogger("telemetry_hub")

class TelemetryHub:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._broadcast_task: asyncio.Task = None
        self._is_running: bool = False
        self._base_cumulative_cost: float = 1428500.0
        self._start_time: float = time.time()

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

    def generate_current_telemetry(self) -> TelemetryPacket:
        # Realistic slight jitter for live appliance telemetry
        rps = round(random.uniform(138.0, 155.0), 1)
        tps = round(random.uniform(4150.0, 4600.0), 1)
        ttft = round(random.uniform(31.5, 36.8), 1)
        error_rate = round(random.uniform(0.01, 0.04), 3)
        cache_hit_rate = round(random.uniform(41.0, 45.5), 1)
        self._base_cumulative_cost += random.uniform(120.0, 280.0)

        pools = [
            ComputePoolStatus(
                pool_name="EKS (vLLM)",
                infra="EKS",
                pod_count=16,
                waiting_queue=random.randint(0, 3),
                gpu_memory_pct=round(random.uniform(78.5, 84.0), 1),
                status="HEALTHY"
            ),
            ComputePoolStatus(
                pool_name="ECS (vLLM-Batch)",
                infra="ECS",
                pod_count=8,
                waiting_queue=random.randint(2, 7),
                gpu_memory_pct=round(random.uniform(85.0, 91.5), 1),
                status="HEALTHY"
            ),
            ComputePoolStatus(
                pool_name="EC2 (Ollama-Fallback)",
                infra="EC2",
                pod_count=4,
                waiting_queue=0,
                gpu_memory_pct=round(random.uniform(42.0, 50.0), 1),
                status="HEALTHY"
            )
        ]

        return TelemetryPacket(
            timestamp=time.time(),
            rps=rps,
            tps=tps,
            ttft_ms=ttft,
            error_rate_5xx=error_rate,
            cache_hit_rate=cache_hit_rate,
            cumulative_cost_krw=round(self._base_cumulative_cost, 0),
            active_connections=len(self.active_connections),
            compute_pools=pools
        )

    async def _periodic_broadcast(self):
        while self._is_running:
            try:
                if self.active_connections:
                    packet = self.generate_current_telemetry()
                    packet_dict = packet.model_dump()
                    # Broadcast to all connected clients
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
