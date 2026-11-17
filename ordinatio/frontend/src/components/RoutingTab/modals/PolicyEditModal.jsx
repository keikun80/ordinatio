import React from 'react';
import { Settings, RefreshCw, Check } from 'lucide-react';
import { strings } from '../../../constants/strings';
import { apiClient } from '../../../api/client';

export default function PolicyEditModal({
  show,
  onClose,
  handleLiveXdsSync,
  isSyncingXds,
  activePolicyTab,
  setActivePolicyTab,
  routerPolicies,
  models,
  handleUpdatePolicyConfig,
  handleSavePolicies,
  isSavingPolicies,
  setRouterPolicies,
  onNotify
}) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px', width: '95%' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(124, 58, 237, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
              <Settings size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{strings.routing.policyModal.headerTitle}</span>
                <button
                  onClick={handleLiveXdsSync}
                  disabled={isSyncingXds}
                  className="badge active"
                  style={{
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: 'rgba(16, 185, 129, 0.15)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    transition: 'all 0.15s ease'
                  }}
                  title={strings.routing.policyModal.syncXdsTitle}
                >
                  <RefreshCw size={11} className={isSyncingXds ? "spin-animation" : ""} />
                  <span>{isSyncingXds ? strings.routing.policyModal.syncingXds : strings.routing.policyModal.liveXdsSync}</span>
                </button>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {strings.routing.policyModal.headerDesc}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {/* Policy Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', padding: '0 16px', gap: '8px', overflowX: 'auto' }}>
          {[
            { id: 'QualityFirst', name: strings.routing.policyModal.tabQuality, color: '#c084fc' },
            { id: 'LeastCost', name: strings.routing.policyModal.tabCost, color: '#34d399' },
            { id: 'LatencyOptimized', name: strings.routing.policyModal.tabLatency, color: '#38bdf8' },
            { id: 'SelfHealingFallback', name: strings.routing.policyModal.tabFallback, color: '#f59e0b' }
          ].map(tab => {
            const isCurrent = activePolicyTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePolicyTab(tab.id)}
                style={{
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isCurrent ? `2px solid ${tab.color}` : '2px solid transparent',
                  color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: isCurrent ? 600 : 400,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tab.color, display: 'inline-block' }} />
                {tab.name}
              </button>
            );
          })}
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '20px' }}>
          {/* Tab 1: QualityFirst */}
          {activePolicyTab === 'QualityFirst' && (() => {
            const pol = routerPolicies.find(p => p.policy_id === 'QualityFirst') || { config: {} };
            const cfg = pol.config || {};
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(192, 132, 252, 0.08)', border: '1px solid rgba(192, 132, 252, 0.25)', borderRadius: '6px', padding: '12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {strings.routing.policyModal.qualityNotice}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      {strings.routing.policyModal.reasoningModelLabel}
                    </label>
                    <select
                      className="form-select"
                      value={cfg.reasoning_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'reasoning_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.alias} ({m.id})</option>
                      ))}
                      {cfg.reasoning_model && !models.some(m => m.id === cfg.reasoning_model) && (
                        <option value={cfg.reasoning_model}>{strings.routing.policyModal.unregisteredModel(cfg.reasoning_model)}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.envoyClusterIdLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.reasoning_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderReasoning}
                      onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'reasoning_cluster', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      {strings.routing.policyModal.fastModelLabel}
                    </label>
                    <select
                      className="form-select"
                      value={cfg.fast_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'fast_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.alias} ({m.id})</option>
                      ))}
                      {cfg.fast_model && !models.some(m => m.id === cfg.fast_model) && (
                        <option value={cfg.fast_model}>{strings.routing.policyModal.unregisteredModel(cfg.fast_model)}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.envoyClusterIdLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.fast_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderFast}
                      onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'fast_cluster', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="route-tools-check"
                    checked={cfg.route_tools_to_reasoning ?? true}
                    onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'route_tools_to_reasoning', e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent-purple)' }}
                  />
                  <label htmlFor="route-tools-check" style={{ fontSize: '0.84rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    {strings.routing.policyModal.toolRoutingLabel}
                  </label>
                </div>
              </div>
            );
          })()}

          {/* Tab 2: LeastCost */}
          {activePolicyTab === 'LeastCost' && (() => {
            const pol = routerPolicies.find(p => p.policy_id === 'LeastCost') || { config: {} };
            const cfg = pol.config || {};
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: '6px', padding: '12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {strings.routing.policyModal.leastCostNotice}
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{strings.routing.policyModal.budgetThresholdLabel}</span>
                    <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{strings.routing.policyModal.budgetActiveDesc(cfg.budget_threshold_pct)}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={cfg.budget_threshold_pct || 80}
                    onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'budget_threshold_pct', parseInt(e.target.value) || 80)}
                    style={{ width: '100%', accentColor: 'var(--accent-emerald)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <span>{strings.routing.policyModal.budgetTick20}</span>
                    <span>{strings.routing.policyModal.budgetTick50}</span>
                    <span>{strings.routing.policyModal.budgetTick80}</span>
                    <span>{strings.routing.policyModal.budgetTick100}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.economicModelLabel}</label>
                    <select
                      className="form-select"
                      value={cfg.economic_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'economic_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {cfg.economic_model && !models.some(m => m.id === cfg.economic_model) && (
                        <option value={cfg.economic_model}>{strings.routing.policyModal.unregisteredModel(cfg.economic_model)}</option>
                      )}
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{strings.routing.policyModal.inputPriceOption(m.id, m.alias, m.input_price || m.input_price_per_1k)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.economicClusterLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.economic_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderFast}
                      onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'economic_cluster', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.standardModelLabel}</label>
                    <select
                      className="form-select"
                      value={cfg.standard_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'standard_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {cfg.standard_model && !models.some(m => m.id === cfg.standard_model) && (
                        <option value={cfg.standard_model}>{strings.routing.policyModal.unregisteredModel(cfg.standard_model)}</option>
                      )}
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.alias} ({m.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.standardClusterLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.standard_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderReasoning}
                      onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'standard_cluster', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tab 3: LatencyOptimized */}
          {activePolicyTab === 'LatencyOptimized' && (() => {
            const pol = routerPolicies.find(p => p.policy_id === 'LatencyOptimized') || { config: {} };
            const cfg = pol.config || {};
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {strings.routing.policyModal.latencyNotice}
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{strings.routing.policyModal.targetLatencyLabel}</span>
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{cfg.target_p95_latency_ms || 400} ms</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={cfg.target_p95_latency_ms || 400}
                    onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'target_p95_latency_ms', parseInt(e.target.value) || 400)}
                    style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.primaryFastModelLabel}</label>
                    <select
                      className="form-select"
                      value={cfg.primary_fast_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'primary_fast_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {cfg.primary_fast_model && !models.some(m => m.id === cfg.primary_fast_model) && (
                        <option value={cfg.primary_fast_model}>{strings.routing.policyModal.unregisteredModel(cfg.primary_fast_model)}</option>
                      )}
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.alias} ({m.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.primaryFastClusterLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.primary_fast_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderFast}
                      onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'primary_fast_cluster', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.reasoningModelAllowLabel}</label>
                    <select
                      className="form-select"
                      value={cfg.reasoning_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'reasoning_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {cfg.reasoning_model && !models.some(m => m.id === cfg.reasoning_model) && (
                        <option value={cfg.reasoning_model}>{strings.routing.policyModal.unregisteredModel(cfg.reasoning_model)}</option>
                      )}
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.alias} ({m.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.reasoningClusterLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.reasoning_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderReasoning}
                      onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'reasoning_cluster', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="allow-override-check"
                    checked={cfg.allow_reasoning_override ?? true}
                    onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'allow_reasoning_override', e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent-cyan)' }}
                  />
                  <label htmlFor="allow-override-check" style={{ fontSize: '0.84rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    {strings.routing.policyModal.allowReasoningOverrideLabel}
                  </label>
                </div>
              </div>
            );
          })()}

          {/* Tab 4: SelfHealingFallback */}
          {activePolicyTab === 'SelfHealingFallback' && (() => {
            const pol = routerPolicies.find(p => p.policy_id === 'SelfHealingFallback') || { config: {} };
            const cfg = pol.config || {};
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', padding: '12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {strings.routing.policyModal.fallbackNotice}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.primaryFallbackModelLabel}</label>
                    <select
                      className="form-select"
                      value={cfg.primary_fallback_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'primary_fallback_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {cfg.primary_fallback_model && !models.some(m => m.id === cfg.primary_fallback_model) && (
                        <option value={cfg.primary_fallback_model}>{strings.routing.policyModal.unregisteredModel(cfg.primary_fallback_model)}</option>
                      )}
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.alias} ({m.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.primaryFallbackClusterLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.primary_fallback_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderFallback}
                      onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'primary_fallback_cluster', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.secondaryFallbackModelLabel}</label>
                    <select
                      className="form-select"
                      value={cfg.secondary_fallback_model || ''}
                      onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'secondary_fallback_model', e.target.value)}
                    >
                      <option value="">{strings.common.selectPlaceholder}</option>
                      {cfg.secondary_fallback_model && !models.some(m => m.id === cfg.secondary_fallback_model) && (
                        <option value={cfg.secondary_fallback_model}>{strings.routing.policyModal.unregisteredModel(cfg.secondary_fallback_model)}</option>
                      )}
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.alias} ({m.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{strings.routing.policyModal.secondaryFallbackClusterLabel}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>xDS Cluster</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfg.secondary_fallback_cluster || ''}
                      placeholder={strings.routing.policyModal.clusterPlaceholderSolar}
                      onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'secondary_fallback_cluster', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.maxRetriesLabel}</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="form-input"
                      value={cfg.max_retries || 3}
                      onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'max_retries', parseInt(e.target.value) || 3)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{strings.routing.policyModal.timeoutSecondsLabel}</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      className="form-input"
                      value={cfg.timeout_seconds || 5}
                      onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'timeout_seconds', parseInt(e.target.value) || 5)}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              apiClient.getAgentRouterPolicies().then(res => {
                if (res?.policies) setRouterPolicies(res.policies);
                if (onNotify) onNotify('INFO', strings.routing.policyModal.resetAlert);
              });
            }}
            style={{ fontSize: '0.8rem' }}
          >
            <RefreshCw size={13} style={{ marginRight: '4px' }} /> {strings.routing.policyModal.btnReset}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {strings.common.close}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSavePolicies}
              disabled={isSavingPolicies}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isSavingPolicies ? <RefreshCw className="spin" size={14} /> : <Check size={14} />}
              <span>{strings.routing.policyModal.btnSave}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

