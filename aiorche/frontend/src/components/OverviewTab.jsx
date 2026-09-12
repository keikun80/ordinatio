import React, { useState, useEffect } from 'react';
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
import { initialKPIs, initialClusterPools } from '../data/mockData';
import { apiClient } from '../api/client';

export default function OverviewTab({ onNavigateTab }) {
  const [kpis, setKpis] = useState(initialKPIs);
  const [clusterPools, setClusterPools] = useState(initialClusterPools);
  const [isLiveWs, setIsLiveWs] = useState(false);

  useEffect(() => {
    let ws = null;
    let fallbackTimer = null;

    try {
      const wsUrl = apiClient.getObservabilityWsUrl();
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsLiveWs(true);
      };

      ws.onmessage = (event) => {
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
              setClusterPools(packet.compute_pools.map((p, idx) => ({
                id: `pool-${p.infra.toLowerCase()}-${idx}`,
                name: p.pool_name,
                model: p.infra === 'EKS' ? 'meta-llama/Llama-3.1-8B-Instruct' : p.infra === 'ECS' ? 'upstage/SOLAR-10.7B-Instruct' : 'Qwen/Qwen2.5-72B-Instruct',
                workload: p.infra === 'EKS' ? '사내 AI 비서 / 챗봇' : p.infra === 'ECS' ? '배치 문서 요약' : '심층 리스크 분석',
                pods: p.pod_count,
                queueDepth: p.waiting_queue,
                gpuMemoryPercent: Math.round(p.gpu_memory_pct),
                scalingTech: p.infra === 'EKS' ? 'KEDA + HPA v2' : p.infra === 'ECS' ? 'ECS Target Tracking' : 'Static Multi-Instance'
              })));
            }
          }
        } catch (e) {
          // ignore non-JSON or ping/pong
        }
      };

      ws.onerror = () => {
        setIsLiveWs(false);
      };

      ws.onclose = () => {
        setIsLiveWs(false);
      };
    } catch (e) {
      setIsLiveWs(false);
    }

    // Fallback polling if WS is disconnected
    fallbackTimer = setInterval(async () => {
      if (!isLiveWs) {
        const summary = await apiClient.getMetricsSummary();
        if (summary) {
          setKpis((prev) => ({
            ...prev,
            rps: Math.round(summary.current_rps),
            tps: Math.round(summary.current_tps),
            ttft: Math.round(summary.p95_ttft_ms),
            errorRate: summary.error_rate,
          }));
        }
      }
    }, 2000);

    return () => {
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
            <h1>글로벌 관제 대시보드</h1>
            <span className={`badge ${isLiveWs ? 'active' : 'info'}`} style={{ fontSize: '0.75rem' }}>
              {isLiveWs ? '🟢 실시간 WebSocket (1s 스트림)' : '🟡 지표 요약 모드'}
            </span>
          </div>
          <p>고객사 폐쇄망 클러스터의 실시간 인프라 부하, vLLM 추론 지연 및 비용 현황</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => onNavigateTab('routing')}>
            <Cpu size={16} />
            <span>모델 라우팅 설정</span>
          </button>
        </div>
      </div>

      {/* 5대 글로벌 관제 KPI - Envoy L7 Gateway 실시간 통계 연동 (Real Data) */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#3b82f6' }}>
          <div className="kpi-header">
            <span>실시간 처리 트래픽 (RPS)</span>
            <span className="badge active" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Envoy Live</span>
          </div>
          <div className="kpi-value">{kpis.rps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>RPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Activity size={13} color="#3b82f6" /> downstream_rq
            </span>
            <span className="kpi-badge-neutral">실시간 Envoy 측정</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#06b6d4' }}>
          <div className="kpi-header">
            <span>토큰 생성 속도 (TPS)</span>
            <span className="badge active" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Envoy Live</span>
          </div>
          <div className="kpi-value">{kpis.tps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>TPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <Zap size={13} color="#06b6d4" /> tx_bytes/4
            </span>
            <span className="kpi-badge-neutral">초당 토큰 출력량</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#8b5cf6' }}>
          <div className="kpi-header">
            <span>첫 토큰 생성 지연 (TTFT)</span>
            <span className="badge active" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Envoy Live</span>
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
            <span className="badge active" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Envoy Live</span>
          </div>
          <div className="kpi-value">{kpis.errorRate}%</div>
          <div className="kpi-footer">
            <span className="badge active">
              <CheckCircle2 size={12} style={{ marginRight: '4px' }} /> 정상 가동
            </span>
            <span className="kpi-badge-neutral">downstream_rq_5xx</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#f59e0b' }}>
          <div className="kpi-header">
            <span>금일 누적 추론 비용</span>
            <span className="badge active" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>DB Live</span>
          </div>
          <div className="kpi-value" style={{ fontSize: '1.6rem' }}>₩ {(kpis.dailyCost).toLocaleString()}</div>
          <div className="kpi-footer">
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>테넌트 실시간 집계</span>
            <span className="kpi-badge-neutral">원화(KRW) 기준</span>
          </div>
        </div>
      </div>

      {/* GPU Clusters Section - 백엔드 통신 Mock/시뮬레이션 #5EF527 */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div className="card-title">
            <Server size={20} color="#38bdf8" />
            <span>vLLM 서빙 인프라 풀 상태 (Multi-Compute Pools)</span>
          </div>
          <span className="badge info">K8s Gateway API InferencePool 연동</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '16px' }}>
          {clusterPools.map((pool) => (
            <div 
              key={pool.id} 
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                borderRadius: 'var(--radius-md)',
                padding: '18px',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#ffffff' }}>{pool.name}</div>
                <span className="badge active">정상 서빙</span>
              </div>
              
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                {pool.workload}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>할당 모델:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontSize: '0.76rem' }}>{pool.model.split('/')[1] || pool.model}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>가동 인스턴스:</span>
                  <span style={{ fontWeight: 600, color: '#5EF527' }}>{pool.pods} pods</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>대기열 큐 (Queue Depth):</span>
                  <span style={{ fontWeight: 700, color: '#5EF527', fontFamily: 'var(--font-mono)' }}>
                    {pool.queueDepth} reqs
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GPU 메모리 점유율:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#5EF527' }}>{pool.gpuMemoryPercent}%</span>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${pool.gpuMemoryPercent}%`, 
                      height: '100%', 
                      background: 'linear-gradient(90deg, #5EF527, #06b6d4)',
                      borderRadius: '999px'
                    }}
                  />
                </div>

                <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  🔧 {pool.scalingTech}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Traffic & Alerts Grid - 백엔드 미통신 정적 UI #F54927 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Model Traffic Breakdown */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Activity size={18} color="#F54927" />
              <span style={{ color: '#F54927' }}>모델별 실시간 트래픽 점유율</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#F54927' }}>1초 주기 갱신</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500, color: '#F54927' }}>Llama-3.1-8B-Instruct (금융 상담 챗봇)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#F54927' }}>68% (965 RPS)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: '68%', height: '100%', background: 'linear-gradient(90deg, #F54927, #fb923c)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500, color: '#F54927' }}>Llama-3.1-70B-Instruct (여신/리스크 심사)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#F54927' }}>24% (340 RPS)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: '24%', height: '100%', background: 'linear-gradient(90deg, #F54927, #fb923c)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500, color: '#F54927' }}>Solar-10.7B-Financial (준법감시 리포트)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#F54927' }}>8% (115 RPS)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: '8%', height: '100%', background: 'linear-gradient(90deg, #F54927, #fb923c)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Alerts */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={18} color="#F54927" />
              <span style={{ color: '#F54927' }}>최근 시스템 이상 징후 및 알림</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigateTab('compliance')} style={{ color: '#F54927' }}>
              <span style={{ color: '#F54927' }}>로그 전체보기</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '10px 12px', background: 'rgba(245, 73, 39, 0.1)', borderLeft: '3px solid #F54927', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#F54927' }}>
                <span>[보안] 비정상 카드번호 대량 탐지 및 차단</span>
                <span style={{ fontSize: '0.72rem', color: '#F54927' }}>14:22</span>
              </div>
              <div style={{ color: '#F54927', marginTop: '3px', fontSize: '0.78rem' }}>
                IP 10.100.42.19에서 10초간 48건의 카드번호 페이로드 감지 ➔ Presidio 엔진 자동 차단 완료
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(245, 73, 39, 0.08)', borderLeft: '3px solid #F54927', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#F54927' }}>
                <span>[인프라] EKS vLLM Pod 오토스케일 (+2 Pods)</span>
                <span style={{ fontSize: '0.72rem', color: '#F54927' }}>13:50</span>
              </div>
              <div style={{ color: '#F54927', marginTop: '3px', fontSize: '0.78rem' }}>
                KEDA 트리거: 대기열 큐 10건 초과 ➔ Karpenter가 g5.12xlarge 노드 1대 JIT 프로비저닝
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(245, 73, 39, 0.08)', borderLeft: '3px solid #F54927', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#F54927' }}>
                <span>[FinOps] 리스크관리부 월간 예산 88% 도달</span>
                <span style={{ fontSize: '0.72rem', color: '#F54927' }}>11:10</span>
              </div>
              <div style={{ color: '#F54927', marginTop: '3px', fontSize: '0.78rem' }}>
                소프트 캡 경고 발송 완료 (부서 담당자 슬랙 및 이메일). 100% 도달 시 즉시 차단 예정
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
