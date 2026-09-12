import React, { useState } from 'react';
import { X, ExternalLink, RefreshCw, BarChart3, Cpu, Coins, Clock, Activity } from 'lucide-react';

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
                Grafana OSS 전문 관제 (Prometheus & DCGM Exporter)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Dashboards-as-Code 사전 탑재 3종 | Keycloak SSO 단일 로그인 인증됨
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
            <span style={{ color: '#F54927' }}>최근 3시간 (15s 간격 스크랩)</span>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {activeDashboard === 'gateway' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '0.82rem', color: '#F54927' }}>
                📌 메트릭 출처: <code>Envoy (:9901/stats/prometheus)</code>, <code>ext_proc (:9090/metrics)</code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>초당 요청 수 (PromQL: sum(rate(envoy_http_requests_total[1m])))</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>1,424.2 req/s</div>
                  <div style={{ height: '50px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                    {[40, 45, 52, 60, 58, 65, 72, 70, 75, 80, 78, 85].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, background: '#F54927', opacity: 0.7 + i*0.025, borderRadius: '2px' }} />
                    ))}
                  </div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>엔드-투-엔드 지연 시간 (p99 / p95 / p50)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>p99: 412ms | p50: 165ms</div>
                  <div style={{ height: '50px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                    {[60, 55, 50, 48, 52, 45, 42, 40, 38, 42, 45, 40].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, background: '#F54927', opacity: 0.7, borderRadius: '2px' }} />
                    ))}
                  </div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Presidio PII 마스킹 gRPC 오버헤드</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>1.24 ms avg</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>목표치(&lt; 5ms) 대비 75% 여유</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rate Limit 차단율 (TPM / RPM)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>0.04% (정상)</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>Redis Cluster 카운터 정상 동작</div>
                </div>
              </div>
            </div>
          )}

          {activeDashboard === 'vllm' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '0.82rem', color: '#F54927' }}>
                📌 메트릭 출처: <code>vLLM (:8000/metrics)</code>, <code>NVIDIA DCGM Exporter (:9400/metrics)</code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>vLLM 대기열 큐 (vllm:num_requests_waiting)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>2.4 reqs (KEDA &lt; 10)</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>Pod 추가 확장 불필요 (안정권)</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>KV-Cache 점유율 (vllm:gpu_cache_usage_factor)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>76.2%</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>Prefix Cache 적중률: 64.8% (비용 40% 절감)</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>GPU 가동률 및 온도 (DCGM)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>SM: 84% | 63°C</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>소비전력: 280W / 350W TDP (정상)</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>출력 토큰당 지연 시간 (TPOT)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>23.5 ms/tok</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>초당 42.5 토큰 생성 속도 유지</div>
                </div>
              </div>
            </div>
          )}

          {activeDashboard === 'finops' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '0.82rem', color: '#F54927' }}>
                📌 메트릭 출처: <code>Control Plane Metering Service</code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>금일 총 토큰 소비량</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>1.84 억 토큰</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>입력 1.12억 / 출력 0.72억</div>
                </div>

                <div style={{ background: '#0a0e1a', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>KV-Cache Prefix 적중 절감액</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F54927', margin: '6px 0', fontFamily: 'var(--font-mono)' }}>₩ 1,420,000 절감</div>
                  <div style={{ fontSize: '0.75rem', color: '#F54927' }}>동일 프롬프트 재사용으로 75% 단가 적용</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span style={{ fontSize: '0.75rem', color: '#F54927', marginRight: 'auto' }}>
            🔒 Grafana Enterprise 보안 규정: 고객사 내부망 한정 접속 허용
          </span>
          <button className="btn btn-secondary" onClick={onClose} style={{ color: '#F54927' }}>닫기</button>
          <button className="btn btn-primary" onClick={() => alert('실제 배포 시: http://grafana.internal.customer.co.kr 로 새 창이 연결됩니다.')} style={{ color: '#F54927' }}>
            <ExternalLink size={14} color="#F54927" />
            <span style={{ color: '#F54927' }}>Grafana 새 탭에서 열기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
