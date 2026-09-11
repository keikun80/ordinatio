import React, { useState } from 'react';
import { Coins, Download, TrendingUp, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { initialTenants } from '../data/mockData';

export default function FinOpsTab({ onNotify }) {
  const [tenants, setTenants] = useState(initialTenants);

  // Generate and download real CSV invoice
  const handleDownloadInvoice = () => {
    const headers = ['부서ID', '부서명', '월간예산(KRW)', '실사용액(KRW)', '소진율(%)', '하드캡여부'];
    const rows = tenants.map((t) => [
      t.id,
      t.name,
      t.budget,
      t.spent,
      Math.round((t.spent / t.budget) * 100) + '%',
      t.hardCap ? '적용(100%차단)' : '미적용'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ai-orchestrator-monthly-settlement-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotify('SUCCESS', '사내 회계 결산용 부서별 정산 청구서(CSV)가 성공적으로 다운로드되었습니다.');
  };

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>FinOps 비용 거버넌스 & 예산 관제</h1>
          <p>부서별 실시간 토큰 사용량 계량, 예산 하드 캡(Hard Cap) 제어 및 회계 결산용 쇼백(Showback) 리포트</p>
        </div>
        <div>
          <button className="btn btn-primary" onClick={handleDownloadInvoice}>
            <Download size={16} />
            <span>사내 결산 청구서 다운로드 (CSV)</span>
          </button>
        </div>
      </div>

      {/* Pricing Banner */}
      <div className="card" style={{ marginBottom: '22px' }}>
        <div className="card-header">
          <div className="card-title">
            <Coins size={18} color="#f59e0b" />
            <span>모델 서빙 표준 계량 단가 기준 (Token Pricing Matrix)</span>
          </div>
          <span className="badge active">사내 원가 산정 기준 v2.1</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>입력 토큰 (Prompt Tokens)</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>₩ 0.80 <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ 1k tok</span></div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>사내 GPU 전력 및 감가상각 반영</div>
          </div>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>출력 토큰 (Completion Tokens)</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a855f7', fontFamily: 'var(--font-mono)' }}>₩ 2.40 <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ 1k tok</span></div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Continuous Batching 가중 연산</div>
          </div>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>KV-Cache 적중 토큰 (Prefix Hit)</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>₩ 0.20 <span style={{ fontSize: '0.8rem', color: '#10b981' }}>(75% 절감)</span></div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>PagedAttention 캐싱 재사용 유도</div>
          </div>
        </div>
      </div>

      {/* Department Budget Burn Status */}
      <div className="card" style={{ marginBottom: '22px' }}>
        <div className="card-header">
          <div className="card-title">
            <TrendingUp size={18} color="#38bdf8" />
            <span>부서별 월간 예산 대비 소진율 현황 (Hard Cap 감시)</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>기준일: 2026년 9월 1일 ~ 9월 11일</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tenants.map((t) => {
            const percent = Math.min(100, Math.round((t.spent / t.budget) * 100));
            const isBlocked = percent >= 100 && t.hardCap;
            const isWarning = percent >= 80 && percent < 100;

            return (
              <div 
                key={t.id} 
                style={{ 
                  background: isBlocked ? 'rgba(244, 63, 94, 0.06)' : isWarning ? 'rgba(245, 158, 11, 0.05)' : 'rgba(15, 23, 42, 0.5)', 
                  padding: '16px', 
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isBlocked ? 'rgba(244, 63, 94, 0.3)' : isWarning ? 'rgba(245, 158, 11, 0.25)' : 'var(--border-subtle)'}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#ffffff' }}>{t.name}</span>
                    {isBlocked ? (
                      <span className="badge danger">🔴 예산 100% 한도 초과 (추론 자동 차단됨)</span>
                    ) : isWarning ? (
                      <span className="badge warning">🟡 소프트캡 도달 (경고 알림 발송됨)</span>
                    ) : (
                      <span className="badge active">🟢 예산 사용 정상</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    <strong style={{ color: isBlocked ? '#fb7185' : '#ffffff' }}>₩{(t.spent).toLocaleString()}</strong> / ₩{(t.budget).toLocaleString()}
                    <span style={{ marginLeft: '8px', fontWeight: 700, color: isBlocked ? '#f43f5e' : isWarning ? '#fbbf24' : '#38bdf8' }}>
                      ({percent}%)
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '10px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${percent}%`, 
                      height: '100%', 
                      background: isBlocked ? 'linear-gradient(90deg, #ef4444, #f43f5e)' : isWarning ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #3b82f6, #10b981)',
                      borderRadius: '999px',
                      boxShadow: isBlocked ? '0 0 10px rgba(244, 63, 94, 0.6)' : 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  <span>{t.hardCap ? '🛡️ 하드 캡(Hard Cap) 보호 가동 중' : '⚠️ 초과 사용 허용 모드'}</span>
                  {isBlocked && (
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setTenants(tenants.map(item => item.id === t.id ? { ...item, budget: item.budget + 2000000 } : item));
                        onNotify('SUCCESS', `${t.name}의 월간 예산이 ₩2,000,000 긴급 증액되어 차단이 해제되었습니다.`);
                      }}
                    >
                      월간 예산 ₩200만 긴급 증액 및 차단 해제
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
