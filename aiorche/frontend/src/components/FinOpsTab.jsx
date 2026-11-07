import React, { useState, useEffect } from 'react';
import { Coins, Download, TrendingUp, AlertCircle, ShieldAlert, CheckCircle2, RefreshCw, X, FileText } from 'lucide-react';
import { apiClient } from '../api/client';
import { strings } from '../constants/strings';
import { useAuth } from '../context/AuthContext';

export default function FinOpsTab({ onNotify }) {
  const { isSuperAdmin, hasPermission } = useAuth();
  const canWriteFinops = isSuperAdmin || hasPermission('finops:write');
  const [tenants, setTenants] = useState([]);
  const [finOpsData, setFinOpsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  const pricing = finOpsData?.pricing_matrix;
  const modelPricings = pricing?.models || [];
  const stdInputPrice = modelPricings.length > 0
    ? Number(modelPricings[0].input_price_per_1k)
    : Number(pricing?.standard_input_per_1k ?? 0.80);
  const stdOutputPrice = modelPricings.length > 0
    ? Number(modelPricings[0].output_price_per_1k)
    : Number(pricing?.standard_output_per_1k ?? 2.40);
  const stdDiscountRatio = modelPricings.length > 0
    ? Number(modelPricings[0].cache_discount_ratio)
    : Number(pricing?.standard_cache_discount ?? 0.25);
  const stdCachePrice = Number((stdInputPrice * stdDiscountRatio).toFixed(2));
  const savingsPct = Math.round((1 - stdDiscountRatio) * 100);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getFinOpsOverview();
      if (data && Array.isArray(data.tenants)) {
        setFinOpsData(data);
        setTenants(data.tenants.map(t => ({
          id: t.tenant_id,
          name: t.tenant_name,
          budget: t.monthly_budget_krw,
          spent: t.spent_budget_krw,
          hardCap: t.is_hard_cap_enabled,
          isBlocked: t.is_blocked,
          burnRate: t.burn_rate_pct,
          totalTokens: t.total_tokens
        })));
      }
    } catch (err) {
      console.warn('FinOps overview fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  // Real backend CSV streaming download (UTF-8 BOM)
  const handleDownloadInvoice = async () => {
    setDownloading(true);
    try {
      await apiClient.exportFinOpsInvoiceCsv();
      onNotify('SUCCESS', strings.finops.alertExportSuccess);
    } catch (err) {
      console.error(err);
      onNotify('ERROR', strings.finops.alertExportFailed);
    } finally {
      setDownloading(false);
    }
  };

  const getEmergencyIncreaseAmt = (budget) => Math.max(1000000, Math.round((Number(budget) || 10000000) * 0.2));

  const handleEmergencyIncrease = async (tenant) => {
    if (!canWriteFinops) return;
    try {
      const increaseAmt = getEmergencyIncreaseAmt(tenant.budget);
      const newBudget = tenant.budget + increaseAmt;
      await apiClient.updateTenantBudget(tenant.id, { monthly_budget_krw: newBudget });
      onNotify('SUCCESS', strings.finops.alertEmergencySuccessUnblockDynamic(tenant.name, increaseAmt));
      await fetchOverview();
    } catch (err) {
      onNotify('ERROR', err.message || strings.finops.alertExportFailed);
    }
  };

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1>{strings.finops.headerTitle}</h1>
            {finOpsData && (
              <span className="badge active" style={{ fontSize: '0.75rem' }}>
                {strings.finops.dbConnected(finOpsData.active_tenants_count)}
              </span>
            )}
          </div>
          <p>{strings.finops.headerSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {!canWriteFinops && (
            <span className="badge warning" style={{ fontSize: '0.78rem' }}>
              {strings.virtualKeys.readOnlyBadge}
            </span>
          )}
          <button className="btn btn-secondary" onClick={fetchOverview} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>{strings.common.refresh}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => canWriteFinops && handleDownloadInvoice()}
            disabled={downloading || !canWriteFinops}
            style={{ opacity: canWriteFinops ? 1 : 0.45, cursor: canWriteFinops ? 'pointer' : 'not-allowed' }}
          >
            <Download size={16} />
            <span>{downloading ? strings.finops.exportingCsv : strings.finops.btnExportCsv}</span>
          </button>
        </div>
      </div>

      {/* Aggregate FinOps Summary KPIs */}
      {finOpsData && (
        <div className="kpi-grid" style={{ marginBottom: '22px' }}>
          <div className="kpi-card" style={{ '--card-accent': '#38bdf8' }}>
            <div className="kpi-header">
              <span>{strings.finops.kpi.totalBudget}</span>
              <Coins size={18} color="#38bdf8" />
            </div>
            <div className="kpi-value">₩ {Math.round(finOpsData.total_budget_krw).toLocaleString()}</div>
            <div className="kpi-footer">
              <span className="kpi-badge-neutral">{strings.finops.kpi.tenantsSum(finOpsData.active_tenants_count)}</span>
            </div>
          </div>

          <div className="kpi-card" style={{ '--card-accent': '#a855f7' }}>
            <div className="kpi-header">
              <span>{strings.finops.kpi.totalSpent}</span>
              <TrendingUp size={18} color="#a855f7" />
            </div>
            <div className="kpi-value" style={{ color: '#c084fc' }}>₩ {Math.round(finOpsData.total_spent_krw).toLocaleString()}</div>
            <div className="kpi-footer">
              <span className="kpi-badge-neutral">{strings.finops.kpi.remaining(Math.round(finOpsData.total_remaining_krw).toLocaleString())}</span>
            </div>
          </div>

          <div className="kpi-card" style={{ '--card-accent': finOpsData.overall_burn_rate_pct > 80 ? '#f59e0b' : '#10b981' }}>
            <div className="kpi-header">
              <span>{strings.finops.kpi.burnRate}</span>
              <ActivityIcon size={18} color={finOpsData.overall_burn_rate_pct > 80 ? '#f59e0b' : '#10b981'} />
            </div>
            <div className="kpi-value">{finOpsData.overall_burn_rate_pct}%</div>
            <div className="kpi-footer">
              <span className={finOpsData.overall_burn_rate_pct > 80 ? 'badge warning' : 'badge active'}>
                {finOpsData.overall_burn_rate_pct > 80 ? strings.finops.kpi.attentionNeeded : strings.finops.kpi.budgetNormal}
              </span>
            </div>
          </div>

          <div className="kpi-card" style={{ '--card-accent': '#f59e0b' }}>
            <div className="kpi-header">
              <span>{strings.finops.kpi.runRate}</span>
              <TrendingUp size={18} color="#f59e0b" />
            </div>
            <div className="kpi-value">₩ {Math.round(finOpsData.projected_month_end_krw).toLocaleString()}</div>
            <div className="kpi-footer">
              <span className="kpi-badge-neutral">{strings.finops.kpi.trendForecast}</span>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Banner */}
      <div className="card" style={{ marginBottom: '22px' }}>
        <div className="card-header">
          <div className="card-title">
            <Coins size={18} color="#f59e0b" />
            <span>{strings.finops.pricingBanner.title}</span>
          </div>
          <button 
            className="badge active"
            style={{
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '4px 10px',
              borderRadius: '6px',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setShowPricingModal(true)}
            title={strings.finops.pricingBanner.btnDetailTooltip}
          >
            <Coins size={13} />
            <span>{strings.finops.pricingBanner.btnDetail}</span>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.finops.pricingBanner.promptToken}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#5EF527', fontFamily: 'var(--font-mono)' }}>₩ {stdInputPrice.toFixed(2)} <span style={{ fontSize: '0.8rem', color: '#5EF527' }}>/ 1k tok</span></div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{strings.finops.pricingBanner.promptDesc}</div>
          </div>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.finops.pricingBanner.completionToken}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#5EF527', fontFamily: 'var(--font-mono)' }}>₩ {stdOutputPrice.toFixed(2)} <span style={{ fontSize: '0.8rem', color: '#5EF527' }}>/ 1k tok</span></div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{strings.finops.pricingBanner.completionDesc}</div>
          </div>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.finops.pricingBanner.kvCacheToken}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#5EF527', fontFamily: 'var(--font-mono)' }}>₩ {stdCachePrice.toFixed(2)} <span style={{ fontSize: '0.8rem', color: '#5EF527' }}>{strings.finops.pricingBanner.savingsDynamic(savingsPct)}</span></div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{strings.finops.pricingBanner.kvCacheDesc}</div>
          </div>
        </div>
      </div>

      {/* Department Budget Burn Status */}
      <div className="card" style={{ marginBottom: '22px' }}>
        <div className="card-header">
          <div className="card-title">
            <TrendingUp size={18} color="#38bdf8" />
            <span>{strings.finops.tenants.title}</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {strings.finops.tenants.billingMonth(new Date().getFullYear(), new Date().getMonth() + 1)}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tenants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {strings.finops.tenants.emptyTitle}
              </div>
              <div style={{ fontSize: '0.78rem' }}>
                {strings.finops.tenants.emptyDesc}
              </div>
            </div>
          ) : (
            tenants.map((t) => {
            const percent = t.budget > 0 ? Math.min(100, Math.round((t.spent / t.budget) * 100)) : 0;
            const isBlocked = t.isBlocked || (percent >= 100 && t.hardCap);
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
                      <span className="badge danger">{strings.finops.tenants.statusBlocked}</span>
                    ) : isWarning ? (
                      <span className="badge warning">{strings.finops.tenants.statusWarning}</span>
                    ) : (
                      <span className="badge active">{strings.finops.tenants.statusNormal}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ 
                      fontSize: '0.78rem', 
                      background: 'rgba(56, 189, 248, 0.12)', 
                      border: '1px solid rgba(56, 189, 248, 0.3)', 
                      borderRadius: '4px', 
                      padding: '2px 8px', 
                      color: '#38bdf8', 
                      fontFamily: 'var(--font-mono)' 
                    }}>
                      ⚡ {(t.totalTokens || 0).toLocaleString()} {strings.common.units.tokens}
                    </span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      <strong style={{ color: isBlocked ? '#fb7185' : '#ffffff' }}>
                        ₩{t.spent > 0 && t.spent < 100 ? Number(t.spent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(t.spent).toLocaleString()}
                      </strong> / ₩{Math.round(t.budget).toLocaleString()}
                      <span style={{ marginLeft: '8px', fontWeight: 700, color: isBlocked ? '#f43f5e' : isWarning ? '#fbbf24' : '#38bdf8' }}>
                        ({percent}%)
                      </span>
                    </div>
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
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <span>{t.hardCap ? strings.finops.tenants.hardCapActive : strings.finops.tenants.softCapActive}</span>
                    <span style={{ color: '#94a3b8' }}>
                      {strings.finops.tenants.totalTokens} <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{(t.totalTokens || 0).toLocaleString()}</strong> {strings.common.units.tokens}
                    </span>
                  </div>
                  {isBlocked && (
                    <button 
                      className="btn btn-secondary btn-sm"
                      disabled={!canWriteFinops}
                      onClick={() => canWriteFinops && handleEmergencyIncrease(t)}
                      style={{ opacity: canWriteFinops ? 1 : 0.45, cursor: canWriteFinops ? 'pointer' : 'not-allowed' }}
                    >
                      {strings.finops.tenants.btnEmergencyUnblockDynamic(Math.round(getEmergencyIncreaseAmt(t.budget) / 10000).toLocaleString())}
                    </button>
                  )}
                </div>
              </div>
            );
          }))}
        </div>
      </div>

      {/* Pricing Standard Details Modal */}
      {showPricingModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '640px', maxWidth: '95%', padding: '24px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                  <Coins size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f59e0b', fontWeight: 700 }}>{strings.finops.modal.title}</h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.finops.modal.subtitle}</div>
                </div>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => setShowPricingModal(false)}
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '22px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.85rem', marginBottom: '4px' }}>
                  {strings.finops.modal.tcoFormulaTitle}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {strings.finops.modal.tcoFormulaDesc}
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 10px' }}>{strings.finops.modal.colItem}</th>
                      <th style={{ padding: '8px 10px' }}>{strings.finops.modal.colPrice}</th>
                      <th style={{ padding: '8px 10px' }}>{strings.finops.modal.colReason}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#e2e8f0' }}>{strings.finops.modal.itemPrompt}</td>
                      <td style={{ padding: '10px', color: '#5EF527', fontFamily: 'var(--font-mono)' }}>₩ {stdInputPrice.toFixed(2)}</td>
                      <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{strings.finops.modal.reasonPrompt}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#e2e8f0' }}>{strings.finops.modal.itemCompletion}</td>
                      <td style={{ padding: '10px', color: '#5EF527', fontFamily: 'var(--font-mono)' }}>₩ {stdOutputPrice.toFixed(2)}</td>
                      <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{strings.finops.modal.reasonCompletion}</td>
                    </tr>
                    <tr style={{ borderBottom: modelPricings.length > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#e2e8f0' }}>{strings.finops.modal.itemKvCache}</td>
                      <td style={{ padding: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>₩ {stdCachePrice.toFixed(2)}</td>
                      <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{strings.finops.modal.reasonKvCacheDynamic(savingsPct)}</td>
                    </tr>
                    {modelPricings.map((mp) => (
                      <tr key={mp.model_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#93c5fd' }}>
                          {mp.alias || mp.model_id}
                        </td>
                        <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#34d399' }}>
                          ₩{Number(mp.input_price_per_1k).toFixed(2)} / ₩{Number(mp.output_price_per_1k).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {mp.backend_infra || mp.model_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.78rem', color: '#93c5fd' }}>
                💡 <strong>{strings.finops.modal.hardCapPolicyPrefix}</strong> {strings.finops.modal.hardCapNotice}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowPricingModal(false)}
              >
                {strings.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityIcon({ size = 18, color = '#38bdf8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  );
}
