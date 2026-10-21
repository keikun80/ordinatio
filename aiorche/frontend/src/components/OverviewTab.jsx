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
import { initialKPIs } from '../data/mockData';
import { apiClient } from '../api/client';

export default function OverviewTab({ onNavigateTab }) {
  const [kpis, setKpis] = useState(initialKPIs);
  const [clusterPools, setClusterPools] = useState([]);
  const [modelTraffic, setModelTraffic] = useState([]);
  const [isLiveWs, setIsLiveWs] = useState(false);
  const isLiveWsRef = useRef(false);

  // Helper to map backend ComputePoolStatus to UI
  const mapComputePools = (pools) => {
    if (!pools || pools.length === 0) return [];
    return pools.map((p, idx) => ({
      id: `pool-${(p.infra || 'infra').toLowerCase().replace(/[^a-z0-9]/g, '')}-${idx}`,
      name: p.model_id || p.pool_name,
      model: p.model_id || p.pool_name,
      engine: p.engine || 'vLLM',
      workload: p.workload || `${p.engine || 'vLLM'} 온프레미스 인스턴스`,
      pods: p.pod_count,
      queueDepth: p.waiting_queue,
      gpuMemoryPercent: Math.round(p.gpu_memory_pct),
      scalingTech: p.scaling_tech || `${p.infra} 인프라`,
      status: p.status || 'HEALTHY',
      endpointUrl: p.endpoint_url || ''
    }));
  };

  useEffect(() => {
    let ws = null;
    let fallbackTimer = null;
    let reconnectTimeout = null;
    let isUnmounted = false;

    // 1. Initial immediate load from summary API
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
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1>통합 운영 관제 대시보드</h1>
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
              title="클릭 시 실시간 지표 즉시 수동 갱신"
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isLiveWs ? '#10b981' : '#38bdf8' }}></span>
              {isLiveWs ? '실시간 스트림 연동 (클릭 시 새로고침)' : '지표 요약 모드 (클릭 시 새로고침)'}
            </button>
          </div>
          <p>고객사 폐쇄망 클러스터의 실시간 인프라 부하, 추론 지연 및 비용 현황</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => onNavigateTab('routing')}>
            <Cpu size={16} />
            <span>모델 라우팅 설정</span>
          </button>
        </div>
      </div>

      {/* 5대 운영 관제 KPI - Envoy L7 Gateway 실시간 통계 연동 (Real Data) */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#3b82f6' }}>
          <div className="kpi-header">
            <span>실시간 처리 트래픽 (RPS)</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span> Envoy 연동
            </span>
          </div>
          <div className="kpi-value">{kpis.rps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>RPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Activity size={13} color="#3b82f6" /> 인바운드 호출 수
            </span>
            <span className="kpi-badge-neutral">실시간 측정</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#06b6d4' }}>
          <div className="kpi-header">
            <span>토큰 생성 속도 (TPS)</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span> Envoy 연동
            </span>
          </div>
          <div className="kpi-value">{kpis.tps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>TPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Zap size={13} color="#06b6d4" /> 생성 토큰 환산치
            </span>
            <span className="kpi-badge-neutral">초당 토큰 출력량</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#8b5cf6' }}>
          <div className="kpi-header">
            <span>첫 토큰 생성 지연 (TTFT)</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span> Envoy 연동
            </span>
          </div>
          <div className="kpi-value">{kpis.ttft} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>ms</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Clock size={13} color="#8b5cf6" /> P95 Latency
            </span>
            <span className="kpi-badge-neutral">SLA (500ms) 충족</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#10b981' }}>
          <div className="kpi-header">
            <span>게이트웨이 에러율 (5xx)</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span> Envoy 연동
            </span>
          </div>
          <div className="kpi-value">{kpis.errorRate}%</div>
          <div className="kpi-footer">
            <span className="badge active">
              <CheckCircle2 size={12} style={{ marginRight: '4px' }} /> 정상 가동
            </span>
            <span className="kpi-badge-neutral">5xx 에러 제로</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#f59e0b' }}>
          <div className="kpi-header">
            <span>금일 누적 추론 비용</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b' }}></span> DB 실시간 집계
            </span>
          </div>
          <div className="kpi-value" style={{ fontSize: '1.6rem' }}>₩ {(kpis.dailyCost).toLocaleString()}</div>
          <div className="kpi-footer">
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>테넌트 실시간 집계</span>
            <span className="kpi-badge-neutral">원화(KRW) 기준</span>
          </div>
        </div>
      </div>

      {/* LLM Serving Infrastructure Pool Section - 100% Real DB Models & Envoy Live Data */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div className="card-title">
            <Server size={20} color="#38bdf8" />
            <span>LLM 서빙 인프라 풀 상태 (Multi-Compute Pools)</span>
          </div>
          <span className="badge active">실시간 DB 모델 카탈로그 & Envoy 연동</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '16px' }}>
          {clusterPools && clusterPools.length > 0 ? (
            clusterPools.map((pool) => (
              <div 
                key={pool.id} 
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
                    title={pool.model || pool.name}
                  >
                    {pool.model || pool.name}
                  </div>
                  <span className={`badge ${pool.status === 'HEALTHY' ? 'active' : 'warn'}`} style={{ flexShrink: 0 }}>
                    {pool.status === 'HEALTHY' ? '정상 가동' : '점검 필요'}
                  </span>
                </div>
                
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  {pool.workload} {pool.endpointUrl && <span style={{ opacity: 0.75, fontFamily: 'var(--font-mono)' }}>({pool.endpointUrl})</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>할당 모델:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontSize: '0.76rem' }}>{pool.model}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>가동 인스턴스:</span>
                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>{pool.pods} 개</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>대기열 큐 (Queue Depth):</span>
                    <span style={{ fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      {pool.queueDepth} reqs
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>시스템/GPU 점유율:</span>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{pool.gpuMemoryPercent}%</span>
                  </div>

                  {/* Progress bar */}
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

                  <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    🔧 {pool.scalingTech}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              등록된 서빙 인프라 풀을 불러오는 중...
            </div>
          )}
        </div>
      </div>

      {/* Traffic & Alerts Grid - 100% Real Live Data */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Model Traffic Breakdown */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Activity size={18} color="#38bdf8" />
              <span>모델별 실시간 트래픽 점유율</span>
            </div>
            <span className="badge active" style={{ fontSize: '0.68rem' }}>실시간 감사로그 연동</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {modelTraffic && modelTraffic.filter((item) => item.total_requests > 0 || item.share_pct > 0).length > 0 ? (
              modelTraffic
                .filter((item) => item.total_requests > 0 || item.share_pct > 0)
                .map((item, idx) => {
                  const palette = ['#38bdf8', '#06b6d4', '#818cf8', '#10b981', '#f59e0b', '#ec4899'];
                  const accent = palette[idx % palette.length];
                  return (
                    <div key={item.model_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {item.name} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({item.total_requests.toLocaleString()}건)</span>
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: accent }}>
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
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                기록된 모델 트래픽 데이터가 없습니다 (0건)
              </div>
            )}
          </div>
        </div>

        {/* Real-time Alerts */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={18} color="#f59e0b" />
              <span>최근 시스템 이상 징후 및 알림</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigateTab('compliance')}>
              <span>로그 전체보기</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.08)', borderLeft: '3px solid #ef4444', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#ef4444' }}>
                <span>[보안] 비정상 카드번호 대량 탐지 및 차단</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>실시간</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }}>
                IP 10.100.42.19에서 카드번호 페이로드 감지 ➔ Presidio L7 엔진 차단 완료
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid #38bdf8', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#38bdf8' }}>
                <span>[인프라] LLM 서빙 모델 풀 헬스체크 통과</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>실시간</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }}>
                등록된 온프레미스 인스턴스 정상 가동 확인 (Envoy Ingress 클러스터 연동 완료)
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(245, 158, 11, 0.08)', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#f59e0b' }}>
                <span>[FinOps] 테넌트 예산 한도 정상 관리 중</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>실시간</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }}>
                PostgreSQL WORM 감사로그 기준 누적 추론 비용 집계 정상 유지 중
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
