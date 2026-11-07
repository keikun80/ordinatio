import React, { useState } from 'react';
import { X, ExternalLink, RefreshCw, BarChart3, Cpu, Coins, Clock, Activity } from 'lucide-react';
import { strings } from '../constants/strings';

export default function GrafanaModal({ isOpen, onClose }) {
  const [activeDashboard, setActiveDashboard] = useState('gateway');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        style={{ maxWidth: '960px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800 }}>
              G
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#F54927' }}>
                {strings.modals.grafana.title}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {strings.modals.grafana.subtitle}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#F54927', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Dashboard Switcher Tabs - 백엔드 미통신 #F54927 */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 24px', background: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            className={`btn btn-sm ${activeDashboard === 'gateway' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveDashboard('gateway')}
            style={{ color: '#F54927' }}
          >
            <Activity size={14} color="#F54927" />
            <span style={{ color: '#F54927' }}>1. AI Gateway & Traffic L7</span>
          </button>
          <button
            className={`btn btn-sm ${activeDashboard === 'vllm' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveDashboard('vllm')}
            style={{ color: '#F54927' }}
          >
            <Cpu size={14} color="#F54927" />
            <span style={{ color: '#F54927' }}>2. vLLM & NVIDIA GPU DCGM</span>
          </button>
          <button
            className={`btn btn-sm ${activeDashboard === 'finops' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveDashboard('finops')}
            style={{ color: '#F54927' }}
          >
            <Coins size={14} color="#F54927" />
            <span style={{ color: '#F54927' }}>3. FinOps & Token Metering</span>
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#F54927' }}>
            <Clock size={13} color="#F54927" />
            <span style={{ color: '#F54927' }}>{strings.modals.grafana.timeRange}</span>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {activeDashboard === 'gateway' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '0.82rem', color: '#F54927' }}>
                {strings.modals.grafana.metricSourcePrefix} <code>Envoy (:9901/stats/prometheus)</code>, <code>ext_proc (:9090/metrics)</code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.rps}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>1,424.2 req/s</div>
                  <div style={{ height: '50px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                    {[40, 45, 52, 60, 58, 65, 72, 70, 75, 80, 78, 85].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, background: '#F54927', opacity: 0.7 + i*0.025, borderRadius: '2px' }} />
                    ))}
                  </div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.latency}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>p99: 412ms | p50: 165ms</div>
                  <div style={{ height: '50px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                    {[60, 55, 50, 48, 52, 45, 42, 40, 38, 42, 45, 40].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, background: '#F54927', opacity: 0.7, borderRadius: '2px' }} />
                    ))}
                  </div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.piiOverhead}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>1.24 ms avg</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.piiMargin}</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.rateLimitBlock}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>0.04% ({strings.common.status.healthy})</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.redisStatus}</div>
                </div>
              </div>
            </div>
          )}

          {activeDashboard === 'vllm' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '0.82rem', color: '#F54927' }}>
                {strings.modals.grafana.metricSourcePrefix} <code>vLLM (:8000/metrics)</code>, <code>NVIDIA DCGM Exporter (:9400/metrics)</code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.vllmQueue}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>2.4 reqs (KEDA &lt; 10)</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.podScaleStable}</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.kvCacheShare}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>76.2%</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.prefixCacheHit}</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.gpuUtilTemp}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>SM: 84% | 63°C</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.powerUsage}</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.tpot}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>23.5 ms/tok</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.tpotSpeed}</div>
                </div>
              </div>
            </div>
          )}

          {activeDashboard === 'finops' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '0.82rem', color: '#F54927' }}>
                {strings.modals.grafana.metricSourcePrefix} <code>Control Plane Metering Service</code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.dailyTotalTokens}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>184M {strings.common.units.tokens}</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.tokenBreakdown}</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.modals.grafana.metrics.kvCacheSavings}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>₩ 1,420,000</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>{strings.modals.grafana.metrics.savingsDetail}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span style={{ fontSize: '0.75rem', color: '#F54927', marginRight: 'auto' }}>
            {strings.modals.grafana.securityNotice}
          </span>
          <button className="btn btn-secondary" onClick={onClose} style={{ color: '#F54927' }}>{strings.modals.grafana.closeButton}</button>
          <button className="btn btn-primary" onClick={() => alert(strings.modals.grafana.alertNotice)} style={{ color: '#F54927' }}>
            <ExternalLink size={14} color="#F54927" />
            <span style={{ color: '#F54927' }}>{strings.modals.grafana.openNewTab}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
