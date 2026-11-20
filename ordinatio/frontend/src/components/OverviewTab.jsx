import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Zap, 
  Clock, 
  AlertTriangle, 
  Coins, 
  Server, 
  ExternalLink, 
  TrendingUp, 
  Cpu, 
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { apiClient } from '../api/client';
import { strings } from '../constants/strings';
import { useAuth } from '../context/AuthContext';

export default function OverviewTab({ onNavigateTab }) {
  const { isSuperAdmin, hasPermission } = useAuth();
  const canAccessRouting = isSuperAdmin || hasPermission('routing:read');
  const canAccessCompliance = isSuperAdmin || hasPermission('compliance:read');
  const canAccessFinops = isSuperAdmin || hasPermission('finops:read');
  const [kpis, setKpis] = useState({
    rps: 0,
    tps: 0,
    ttft: 0,
    errorRate: 0,
    dailyCost: 0
  });
  const [clusterPools, setClusterPools] = useState([]);
  const [modelTraffic, setModelTraffic] = useState([]);
  const [latestAuditLog, setLatestAuditLog] = useState(null);
  const [finOpsSummary, setFinOpsSummary] = useState(null);
  const [isLiveWs, setIsLiveWs] = useState(false);
  const isLiveWsRef = useRef(false);

  // Helper to map backend ComputePoolStatus to UI
  const mapComputePools = (pools) => {
    if (!pools || pools.length === 0) return [];
    return pools.map((p, idx) => ({
      id: `pool-${(p.infra || 'infra').toLowerCase().replace(/[^a-z0-9]/g, '')}-${idx}`,
      name: p.pool_name || p.model_id,
      model: p.model_id || p.pool_name,
      engine: p.engine || 'vLLM',
      workload: p.workload || strings.overview.onPremInstance(p.engine),
      pods: p.pod_count,
      queueDepth: p.waiting_queue,
      gpuMemoryPercent: p.gpu_memory_pct != null ? Math.round(p.gpu_memory_pct) : null,
      gpuMetricSource: p.gpu_metric_source || (p.gpu_memory_pct != null ? strings.overview.sysMeasure : strings.overview.remoteEndpoint),
      scalingTech: p.scaling_tech || strings.overview.infraSuffix(p.infra),
      status: p.status || 'HEALTHY',
      endpointUrl: p.endpoint_url || ''
    }));
  };

  useEffect(() => {
    let ws = null;
    let fallbackTimer = null;
    let reconnectTimeout = null;
    let isUnmounted = false;

    // 1. Initial immediate load from summary API + live Audit/FinOps context
    const loadInitialSummary = async () => {
      const summary = await apiClient.getMetricsSummary();
      if (summary && !isUnmounted) {
        setKpis((prev) => ({
          ...prev,
          rps: Math.round(summary.current_rps),
          tps: Math.round(summary.current_tps),
          ttft: Math.round(summary.p95_ttft_ms),
          errorRate: summary.error_rate,
        }));
        if (summary.compute_pools && summary.compute_pools.length > 0) {
          setClusterPools(mapComputePools(summary.compute_pools));
        }
        if (summary.model_traffic_breakdown && summary.model_traffic_breakdown.length > 0) {
          setModelTraffic(summary.model_traffic_breakdown);
        }
      }
      if (canAccessCompliance) {
        const logs = await apiClient.getAuditLogs({ limit: 1 });
        if (Array.isArray(logs) && logs.length > 0 && !isUnmounted) {
          setLatestAuditLog(logs[0]);
        }
      }
      if (canAccessFinops) {
        const finops = await apiClient.getFinOpsOverview();
        if (finops && !isUnmounted) {
          setFinOpsSummary(finops);
          setKpis((prev) => ({
            ...prev,
            dailyCost: Math.round(finops.total_spent_krw || prev.dailyCost),
          }));
        }
      }
    };
    loadInitialSummary();

    // 2. Real-time WebSocket connection manager
    const connectWebSocket = () => {
      if (isUnmounted) return;
      try {
        const wsUrl = apiClient.getObservabilityWsUrl();
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isUnmounted) {
            isLiveWsRef.current = true;
            setIsLiveWs(true);
          }
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const packet = JSON.parse(event.data);
            if (packet.rps !== undefined) {
              setKpis((prev) => ({
                ...prev,
                rps: Math.round(packet.rps),
                tps: Math.round(packet.tps),
                ttft: Math.round(packet.ttft_ms),
                errorRate: packet.error_rate_5xx,
                dailyCost: Math.round(packet.cumulative_cost_krw || prev.dailyCost),
              }));

              if (packet.compute_pools && packet.compute_pools.length > 0) {
                setClusterPools(mapComputePools(packet.compute_pools));
              }

              if (packet.model_traffic_breakdown) {
                setModelTraffic(packet.model_traffic_breakdown);
              }
            }
          } catch (e) {
            // ignore non-JSON or ping/pong
          }
        };

        ws.onerror = () => {
          if (!isUnmounted) {
            isLiveWsRef.current = false;
            setIsLiveWs(false);
          }
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            isLiveWsRef.current = false;
            setIsLiveWs(false);
            // Auto reconnect after 3 seconds if disconnected
            reconnectTimeout = setTimeout(connectWebSocket, 3000);
          }
        };
      } catch (e) {
        if (!isUnmounted) {
          isLiveWsRef.current = false;
          setIsLiveWs(false);
        }
      }
    };

    connectWebSocket();

    // 3. Fallback polling only when WebSocket is inactive
    fallbackTimer = setInterval(async () => {
      if (!isLiveWsRef.current && !isUnmounted) {
        const summary = await apiClient.getMetricsSummary();
        if (summary && !isUnmounted) {
          setKpis((prev) => ({
            ...prev,
            rps: Math.round(summary.current_rps),
            tps: Math.round(summary.current_tps),
            ttft: Math.round(summary.p95_ttft_ms),
            errorRate: summary.error_rate,
          }));
          if (summary.compute_pools && summary.compute_pools.length > 0) {
            setClusterPools(mapComputePools(summary.compute_pools));
          }
          if (summary.model_traffic_breakdown) {
            setModelTraffic(summary.model_traffic_breakdown);
          }
        }
      }
    }, 2000);

    return () => {
      isUnmounted = true;
      isLiveWsRef.current = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, []);

  return (
    <div className="tab-pane" data-testid="scr-overview-view" data-screen-id="SCR-OV-01">
      {/* Page Header */}
      <div className="page-header" data-testid="ov-header-section">
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1>{strings.overview.title}</h1>
            <button
              onClick={async () => {
                try {
                  const summary = await apiClient.getMetricsSummary();
                  if (summary) {
                    setKpis((prev) => ({
                      ...prev,
                      rps: Math.round(summary.current_rps),
                      tps: Math.round(summary.current_tps),
                      ttft: Math.round(summary.p95_ttft_ms),
                      errorRate: summary.error_rate,
                    }));
                    if (summary.compute_pools?.length > 0) {
                      setClusterPools(mapComputePools(summary.compute_pools));
                    }
                    if (summary.model_traffic_breakdown) {
                      setModelTraffic(summary.model_traffic_breakdown);
                    }
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
              data-testid="ov-btn-stream-toggle"
              data-function-id="FNC-OV-STREAM"
              className={`badge ${isLiveWs ? 'active' : 'info'}`}
              style={{
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                border: isLiveWs ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.4)',
                background: isLiveWs ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                padding: '4px 9px',
                borderRadius: '6px',
                transition: 'all 0.15s ease'
              }}
              title={strings.overview.refreshManualTooltip}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isLiveWs ? '#10b981' : '#38bdf8' }}></span>
              {isLiveWs ? strings.overview.streamModeOn : strings.overview.streamModeOff}
            </button>
          </div>
          <p>{strings.overview.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {canAccessRouting && (
            <button 
              className="btn btn-secondary" 
              onClick={() => onNavigateTab('routing')}
              data-testid="ov-btn-nav-routing"
              data-function-id="FNC-OV-NAV-ROUTING"
            >
              <Cpu size={16} />
              <span>{strings.overview.btnRoutingConfig}</span>
            </button>
          )}
        </div>
      </div>

      {/* 5대 운영 관제 KPI - Envoy L7 Gateway 실시간 통계 연동 (Real Data) */}
      <div className="kpi-grid" data-testid="ov-grid-kpis">
        <div className="kpi-card" data-testid="ov-kpi-card-rps" style={{ '--card-accent': '#3b82f6' }}>
          <div className="kpi-header">
            <span>{strings.overview.kpi.rpsTitle}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span> {strings.overview.kpi.envoyBadge}
            </span>
          </div>
          <div className="kpi-value" data-testid="ov-kpi-value-rps">{kpis.rps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>RPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Activity size={13} color="#3b82f6" /> {strings.overview.kpi.rpsSub}
            </span>
            <span className="kpi-badge-neutral">{strings.overview.kpi.liveMeasure}</span>
          </div>
        </div>

        <div className="kpi-card" data-testid="ov-kpi-card-tps" style={{ '--card-accent': '#06b6d4' }}>
          <div className="kpi-header">
            <span>{strings.overview.kpi.tpsTitle}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span> {strings.overview.kpi.envoyBadge}
            </span>
          </div>
          <div className="kpi-value" data-testid="ov-kpi-value-tps">{kpis.tps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>TPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Zap size={13} color="#06b6d4" /> {strings.overview.kpi.tpsSub}
            </span>
            <span className="kpi-badge-neutral">{strings.overview.kpi.tpsSub}</span>
          </div>
        </div>

        <div className="kpi-card" data-testid="ov-kpi-card-ttft" style={{ '--card-accent': '#8b5cf6' }}>
          <div className="kpi-header">
            <span>{strings.overview.kpi.ttftTitle}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span> {strings.overview.kpi.envoyBadge}
            </span>
          </div>
          <div className="kpi-value" data-testid="ov-kpi-value-ttft">{kpis.ttft} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>ms</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Clock size={13} color="#8b5cf6" /> P95 Latency
            </span>
            <span className="kpi-badge-neutral">{strings.overview.kpi.slaSatisfied}</span>
          </div>
        </div>

        <div className="kpi-card" data-testid="ov-kpi-card-error" style={{ '--card-accent': Number(kpis.errorRate) > 0 ? '#f59e0b' : '#10b981' }}>
          <div className="kpi-header">
            <span>{strings.overview.kpi.errorTitle}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: Number(kpis.errorRate) > 0 ? '#f59e0b' : '#10b981' }}></span> {strings.overview.kpi.envoyBadge}
            </span>
          </div>
          <div className="kpi-value" data-testid="ov-kpi-value-error">{kpis.errorRate}%</div>
          <div className="kpi-footer">
            <span className={`badge ${Number(kpis.errorRate) > 0 ? 'warning' : 'active'}`}>
              <CheckCircle2 size={12} style={{ marginRight: '4px' }} /> {Number(kpis.errorRate) > 0 ? strings.overview.kpi.errorStatusWarn(kpis.errorRate) : strings.overview.kpi.normalStatus}
            </span>
            <span className="kpi-badge-neutral">{strings.overview.kpi.errorSubDynamic(kpis.errorRate)}</span>
          </div>
        </div>

        <div className="kpi-card" data-testid="ov-kpi-card-cost" style={{ '--card-accent': '#f59e0b' }}>
          <div className="kpi-header">
            <span>{strings.overview.kpi.costTitle}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b' }}></span> {strings.overview.kpi.dbBadge}
            </span>
          </div>
          <div className="kpi-value" data-testid="ov-kpi-value-cost" style={{ fontSize: '1.6rem' }}>₩ {(kpis.dailyCost).toLocaleString()}</div>
          <div className="kpi-footer">
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{strings.overview.kpi.tenantRealtime}</span>
            <span className="kpi-badge-neutral">{strings.overview.kpi.krwCurrency}</span>
          </div>
        </div>
      </div>

      {/* LLM Serving Infrastructure Pool Section - 100% Real DB Models & Envoy Live Data */}
      <div className="card" data-testid="ov-card-infra-pool" data-screen-id="SCR-OV-02" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div className="card-title">
            <Server size={20} color="#38bdf8" />
            <span>{strings.overview.infraPool.title}</span>
          </div>
          <span className="badge active" data-testid="ov-badge-infra-pool">{strings.overview.infraPool.badge}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '16px' }} data-testid="ov-grid-pools">
          {clusterPools && clusterPools.length > 0 ? (
            clusterPools.map((pool) => (
              <div 
                key={pool.id} 
                data-testid={`ov-pool-item-${pool.id}`}
                style={{
                  background: 'var(--bg-panel)',
                  borderRadius: 'var(--radius-md)',
                  padding: '18px',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: '0.92rem', 
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono, monospace)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginRight: '8px'
                    }}
                    title={pool.name || pool.model}
                    data-testid={`ov-pool-name-${pool.id}`}
                  >
                    {pool.name || pool.model}
                  </div>
                  <span className={`badge ${pool.status === 'HEALTHY' ? 'active' : 'warn'}`} data-testid={`ov-pool-badge-${pool.id}`} style={{ flexShrink: 0 }}>
                    {pool.status === 'HEALTHY' ? strings.common.status.active : strings.common.status.needsAttention}
                  </span>
                </div>
                
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  {pool.workload} {pool.endpointUrl && <span style={{ opacity: 0.75, fontFamily: 'var(--font-mono)' }}>({pool.endpointUrl})</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{strings.overview.infraPool.assignedModel}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontSize: '0.76rem' }} data-testid={`ov-pool-model-${pool.id}`}>{pool.model}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{strings.overview.infraPool.activeInstances}</span>
                    <span style={{ fontWeight: 600, color: '#38bdf8' }} data-testid={`ov-pool-pods-${pool.id}`}>{pool.pods} {strings.common.units.items}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{strings.overview.infraPool.queueDepth}</span>
                    <span style={{ fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)' }} data-testid={`ov-pool-queue-${pool.id}`}>
                      {pool.queueDepth} reqs
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{strings.overview.infraPool.gpuOccupancy}</span>
                    {pool.gpuMemoryPercent !== null && pool.gpuMemoryPercent !== undefined ? (
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#38bdf8' }} data-testid={`ov-pool-gpu-${pool.id}`}>
                        {pool.gpuMemoryPercent}%
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }} data-testid={`ov-pool-gpu-na-${pool.id}`}>
                        {strings.overview.infraPool.remoteEndpointNA}
                      </span>
                    )}
                  </div>

                  {/* Progress bar or Remote indicator */}
                  {pool.gpuMemoryPercent !== null && pool.gpuMemoryPercent !== undefined ? (
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${Math.min(100, Math.max(2, pool.gpuMemoryPercent))}%`, 
                          height: '100%', 
                          background: 'linear-gradient(90deg, #38bdf8, #06b6d4)',
                          borderRadius: '999px'
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '999px', border: '1px dashed rgba(255, 255, 255, 0.15)' }} />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span>🔧 {pool.scalingTech}</span>
                    <span style={{ fontSize: '0.68rem', color: pool.gpuMemoryPercent != null ? '#38bdf8' : '#64748b' }}>
                      {pool.gpuMetricSource}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              {strings.overview.infraPool.loadingPools}
            </div>
          )}
        </div>
      </div>

      {/* Traffic & Alerts Grid - 100% Real Live Data */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Model Traffic Breakdown */}
        <div className="card" data-testid="ov-card-traffic-share" data-screen-id="SCR-OV-03">
          <div className="card-header">
            <div className="card-title">
              <Activity size={18} color="#38bdf8" />
              <span>{strings.overview.trafficShare.title}</span>
            </div>
            <span className="badge active" data-testid="ov-badge-traffic-share" style={{ fontSize: '0.68rem' }}>{strings.overview.trafficShare.badge}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} data-testid="ov-list-traffic-share">
            {modelTraffic && modelTraffic.filter((item) => item.total_requests > 0 || item.share_pct > 0).length > 0 ? (
              modelTraffic
                .filter((item) => item.total_requests > 0 || item.share_pct > 0)
                .map((item, idx) => {
                  const palette = ['#38bdf8', '#06b6d4', '#818cf8', '#10b981', '#f59e0b', '#ec4899'];
                  const accent = palette[idx % palette.length];
                  return (
                    <div key={item.model_id} data-testid={`ov-traffic-item-${item.model_id}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }} data-testid={`ov-traffic-name-${item.model_id}`}>
                          {item.name} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({item.total_requests.toLocaleString()}{strings.common.units.count})</span>
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: accent }} data-testid={`ov-traffic-pct-${item.model_id}`}>
                          {item.share_pct}% ({item.rps} RPS)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.max(item.share_pct > 0 ? item.share_pct : (item.total_requests > 0 ? 1 : 0), 0)}%`, 
                            height: '100%', 
                            background: `linear-gradient(90deg, ${accent}, #60a5fa)`,
                            borderRadius: '999px'
                          }} 
                        />
                      </div>
                    </div>
                  );
                })
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }} data-testid="ov-traffic-no-data">
                {strings.overview.trafficShare.noData}
              </div>
            )}
          </div>
        </div>

        {/* Real-time Alerts */}
        <div className="card" data-testid="ov-card-system-alerts" data-screen-id="SCR-OV-04">
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={18} color="#f59e0b" />
              <span>{strings.overview.systemAlerts.title}</span>
            </div>
            {canAccessCompliance && (
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => onNavigateTab('compliance')}
                data-testid="ov-btn-view-all-alerts"
                data-function-id="FNC-OV-VIEW-ALERTS"
              >
                <span>{strings.overview.systemAlerts.viewAll}</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} data-testid="ov-list-system-alerts">
            {!latestAuditLog && clusterPools.length === 0 && !finOpsSummary ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }} data-testid="ov-alerts-empty">
                {strings.overview.systemAlerts.noAlerts}
              </div>
            ) : (
              <>
                {/* 1. Security & Compliance Log Alert */}
                {latestAuditLog ? (
                  <div data-testid="ov-alert-security" style={{ padding: '10px 12px', background: latestAuditLog.action_taken === 'BLOCK' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)', borderLeft: `3px solid ${latestAuditLog.action_taken === 'BLOCK' ? '#ef4444' : '#10b981'}`, borderRadius: '4px', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: latestAuditLog.action_taken === 'BLOCK' ? '#ef4444' : '#34d399' }}>
                      <span data-testid="ov-alert-security-title">
                        {strings.overview.systemAlerts.auditEventTitle(latestAuditLog.action_taken, latestAuditLog.model_id)}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {latestAuditLog.created_at
                          ? new Date(latestAuditLog.created_at).toLocaleTimeString('ko-KR', { hour12: false })
                          : strings.overview.systemAlerts.realTime}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }} data-testid="ov-alert-security-desc">
                      {strings.overview.systemAlerts.auditEventDesc(latestAuditLog.requester_id, latestAuditLog.worm_storage_id, latestAuditLog.pii_detected_count)}
                    </div>
                  </div>
                ) : (
                  <div data-testid="ov-alert-security-none" style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderLeft: '3px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {strings.overview.systemAlerts.noSecurityAlerts}
                  </div>
                )}

                {/* 2. Serving Pool Health & Infrastructure Alert */}
                {clusterPools.length > 0 ? (
                  <div data-testid="ov-alert-infra" style={{ padding: '10px 12px', background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid #38bdf8', borderRadius: '4px', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#38bdf8' }}>
                      <span data-testid="ov-alert-infra-title">
                        {strings.overview.systemAlerts.infraDynamicTitle(
                          clusterPools.filter((p) => p.status === 'HEALTHY').length,
                          clusterPools.length
                        )}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.overview.systemAlerts.realTime}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }} data-testid="ov-alert-infra-desc">
                      {strings.overview.systemAlerts.infraDynamicDesc(
                        clusterPools.map((p) => p.name || p.model).slice(0, 3).join(', ')
                      )}
                    </div>
                  </div>
                ) : (
                  <div data-testid="ov-alert-infra-none" style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderLeft: '3px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {strings.overview.systemAlerts.noInfraAlerts}
                  </div>
                )}

                {/* 3. FinOps & Tenant Budget Alert */}
                {finOpsSummary ? (
                  <div data-testid="ov-alert-finops" style={{ padding: '10px 12px', background: 'rgba(245, 158, 11, 0.08)', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#f59e0b' }}>
                      <span data-testid="ov-alert-finops-title">
                        {strings.overview.systemAlerts.finopsDynamicTitle(
                          finOpsSummary.overall_burn_rate_pct,
                          (finOpsSummary.tenants || []).filter((t) => t.is_blocked).length
                        )}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.overview.systemAlerts.realTime}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }} data-testid="ov-alert-finops-desc">
                      {strings.overview.systemAlerts.finopsDynamicDesc(
                        finOpsSummary.total_spent_krw,
                        finOpsSummary.total_budget_krw,
                        finOpsSummary.active_tenants_count
                      )}
                    </div>
                  </div>
                ) : (
                  <div data-testid="ov-alert-finops-none" style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderLeft: '3px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {strings.overview.systemAlerts.noFinopsAlerts}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
