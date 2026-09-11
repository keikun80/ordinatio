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

export default function OverviewTab({ onOpenGrafana, onNavigateTab }) {
  const [kpis, setKpis] = useState(initialKPIs);
  const [clusterPools, setClusterPools] = useState(initialClusterPools);

  // Simulate real-time heartbeat fluctuations
  useEffect(() => {
    const timer = setInterval(() => {
      setKpis((prev) => ({
        ...prev,
        rps: Math.floor(1380 + Math.random() * 80),
        tps: Math.floor(41800 + Math.random() * 1400),
        ttft: Math.floor(180 + Math.random() * 12),
      }));
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>글로벌 관제 대시보드</h1>
          <p>고객사 폐쇄망 클러스터의 실시간 인프라 부하, vLLM 추론 지연 및 비용 현황</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => onNavigateTab('routing')}>
            <Cpu size={16} />
            <span>모델 라우팅 설정</span>
          </button>
          <button className="btn btn-primary" onClick={onOpenGrafana}>
            <ExternalLink size={16} />
            <span>Grafana 전문 관제 열기</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--card-accent': '#3b82f6' }}>
          <div className="kpi-header">
            <span>실시간 처리 트래픽</span>
            <Activity size={18} color="#3b82f6" />
          </div>
          <div className="kpi-value">{kpis.rps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>RPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <TrendingUp size={13} /> ▲ 12.4%
            </span>
            <span className="kpi-badge-neutral">전일 동시간 대비</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#06b6d4' }}>
          <div className="kpi-header">
            <span>토큰 생성 속도</span>
            <Zap size={18} color="#06b6d4" />
          </div>
          <div className="kpi-value">{kpis.tps.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>TPS</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">
              <TrendingUp size={13} /> ▲ 8.1%
            </span>
            <span className="kpi-badge-neutral">초당 토큰 출력량</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#8b5cf6' }}>
          <div className="kpi-header">
            <span>첫 토큰 생성 지연 (TTFT)</span>
            <Clock size={18} color="#8b5cf6" />
          </div>
          <div className="kpi-value">{kpis.ttft} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>ms</span></div>
          <div className="kpi-footer">
            <span className="kpi-badge-positive">▼ 15ms 단축</span>
            <span className="kpi-badge-neutral">SLA (500ms) 충족</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#10b981' }}>
          <div className="kpi-header">
            <span>게이트웨이 에러율 (5xx)</span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div className="kpi-value" style={{ color: '#34d399' }}>{kpis.errorRate}%</div>
          <div className="kpi-footer">
            <span className="badge active">정상 가동</span>
            <span className="kpi-badge-neutral">Failover 대기 중</span>
          </div>
        </div>

        <div className="kpi-card" style={{ '--card-accent': '#f59e0b' }}>
          <div className="kpi-header">
            <span>금일 누적 추론 비용</span>
            <Coins size={18} color="#f59e0b" />
          </div>
          <div className="kpi-value" style={{ fontSize: '1.6rem' }}>₩ {(kpis.dailyCost).toLocaleString()}</div>
          <div className="kpi-footer">
            <span style={{ color: '#fbbf24', fontWeight: 600 }}>월간 예산 {kpis.monthlyBudgetUsagePercent}% 소진</span>
          </div>
        </div>
      </div>

      {/* GPU Clusters Section */}
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
                  <span style={{ fontWeight: 600 }}>{pool.pods}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>대기열 큐 (Queue Depth):</span>
                  <span style={{ fontWeight: 700, color: pool.queueDepth > 5 ? '#f59e0b' : '#34d399', fontFamily: 'var(--font-mono)' }}>
                    {pool.queueDepth} reqs
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GPU 메모리 점유율:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{pool.gpuMemoryPercent}%</span>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${pool.gpuMemoryPercent}%`, 
                      height: '100%', 
                      background: pool.gpuMemoryPercent > 85 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #3b82f6, #06b6d4)',
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

      {/* Traffic & Alerts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Model Traffic Breakdown */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Activity size={18} color="#06b6d4" />
              <span>모델별 실시간 트래픽 점유율</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1초 주기 갱신</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500 }}>Llama-3.1-8B-Instruct (금융 상담 챗봇)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>68% (965 RPS)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: '68%', height: '100%', background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500 }}>Llama-3.1-70B-Instruct (여신/리스크 심사)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>24% (340 RPS)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: '24%', height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #a855f7)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500 }}>Solar-10.7B-Financial (준법감시 리포트)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>8% (115 RPS)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: '8%', height: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
              </div>
            </div>
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
              로그 전체보기
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '10px 12px', background: 'rgba(244, 63, 94, 0.1)', borderLeft: '3px solid #f43f5e', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#fda4af' }}>
                <span>[보안] 비정상 카드번호 대량 탐지 및 차단</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>14:22</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }}>
                IP 10.100.42.19에서 10초간 48건의 카드번호 페이로드 감지 ➔ Presidio 엔진 자동 차단 완료
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid #38bdf8', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#38bdf8' }}>
                <span>[인프라] EKS vLLM Pod 오토스케일 (+2 Pods)</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>13:50</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }}>
                KEDA 트리거: 대기열 큐 10건 초과 ➔ Karpenter가 g5.12xlarge 노드 1대 JIT 프로비저닝
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(245, 158, 11, 0.08)', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#fbbf24' }}>
                <span>[FinOps] 리스크관리부 월간 예산 88% 도달</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>11:10</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.78rem' }}>
                소프트 캡 경고 발송 완료 (부서 담당자 슬랙 및 이메일). 100% 도달 시 즉시 차단 예정
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
