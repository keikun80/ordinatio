import React from 'react';
import { 
  GitFork, Sliders, Scale, Trash2, Compass, ShieldAlert, Check, AlertCircle 
} from 'lucide-react';
import { strings } from '../../../constants/strings';
import { DEFAULT_COLOR_PALETTE } from '../constants';

export default function RoutingStudio({
  routes = [],
  currentRoute = {},
  setSelectedRouteName,
  updateCurrentRoute,
  handleDeleteRoute,
  canWriteRouting,
  xdsRevision,
  currentWeights = [],
  totalWeight = 0,
  models = [],
  availableModelsToAdd = [],
  handleWeightChange,
  handleRemoveModelFromRoute,
  handleAddModelToRoute,
  handleAutoBalance,
  availableTenants = [],
  handleDryRun,
  isDryRunning,
  handleDeployXds,
  isDeploying
}) {
  return (
    <div className="subtab-content" data-testid="rt-studio-content" data-screen-id="SCR-RT-01" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Multi-Route Selector Bar */}
      <div className="card" data-testid="rt-card-selector" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label htmlFor="route-profile-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitFork size={15} color="var(--accent-cyan)" />
              <span>{strings.routing.studio.routeProfilesLabel(routes.length)}</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select
                id="route-profile-select"
                data-testid="rt-select-profile"
                className="form-select"
                value={currentRoute.route_name}
                onChange={(e) => {
                  setSelectedRouteName(e.target.value);
                  localStorage.setItem('ordinatio_selected_route', e.target.value);
                }}
                style={{
                  minWidth: '260px',
                  padding: '7px 12px',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border-card)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                {routes.map((r) => (
                  <option key={r.route_name} value={r.route_name} style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)' }}>
                    {r.route_name} — ({r.match_conditions?.path_prefix || `/v1/routes/${r.route_name}`} · {strings.routing.studio.priorityLabel(r.priority || 10)})
                  </option>
                ))}
              </select>

              {currentRoute && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--accent-cyan)'
                  }}>
                    {currentRoute.match_conditions?.path_prefix || `/v1/routes/${currentRoute.route_name}`}
                  </span>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: currentRoute.is_active !== false ? 'rgba(5, 150, 105, 0.12)' : 'rgba(225, 29, 72, 0.12)',
                    color: currentRoute.is_active !== false ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    border: currentRoute.is_active !== false ? '1px solid rgba(5, 150, 105, 0.25)' : '1px solid rgba(225, 29, 72, 0.25)'
                  }}>
                    {strings.routing.studio.priorityLabel(currentRoute.priority || 10)}
                  </span>
                  <span className={`badge ${currentRoute.is_active !== false ? 'active' : 'revoked'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                    {currentRoute.is_active !== false ? strings.routing.studio.activeProfile : strings.routing.studio.inactiveProfile}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>{strings.routing.studio.envoyIngressPoint}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 }}>port 8080</span>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span style={{ color: 'var(--text-muted)' }}>{strings.routing.studio.xdsRevision}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', fontWeight: 600 }}>{xdsRevision}</span>
          </div>
        </div>
      </div>

      {/* Selected Route Configuration Studio */}
      <div className="card" style={{ marginBottom: '24px', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="card-title">
                <GitFork size={20} color="var(--accent-cyan)" />
                <span>{strings.routing.studio.editRoutePolicyTitle(currentRoute.route_name)}</span>
              </div>
              <span className={`badge ${currentRoute.is_active !== false ? 'active' : 'revoked'}`}>
                {currentRoute.is_active !== false ? strings.routing.studio.activeStatus : strings.routing.studio.inactiveStatus}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {currentRoute.description || strings.routing.studio.noDescription}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              className="btn btn-secondary btn-sm"
              disabled={!canWriteRouting}
              onClick={() => canWriteRouting && updateCurrentRoute({ is_active: !currentRoute.is_active })}
              style={{ opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
            >
              {currentRoute.is_active !== false ? strings.routing.studio.btnDeactivateRoute : strings.routing.studio.btnActivateRoute}
            </button>
            {routes.length > 1 && (
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={!canWriteRouting}
                style={{ color: 'var(--accent-rose)', borderColor: 'rgba(225, 29, 72, 0.3)', opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
                onClick={() => canWriteRouting && handleDeleteRoute()}
              >
                <Trash2 size={14} /> {strings.routing.studio.btnDeleteRoute}
              </button>
            )}
          </div>
        </div>
        {/* 1. N-Way Multi-Model Traffic Splitter */}
        <div className="panel-sub" style={{ padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={18} color="var(--accent-cyan)" />
                <span>{strings.routing.studio.splitterTitle}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {strings.routing.studio.splitterDesc(currentWeights.length)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={!canWriteRouting}
                onClick={() => canWriteRouting && handleAutoBalance()}
                style={{ opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
              >
                <Scale size={14} color="var(--accent-cyan)" /> <span>{strings.routing.studio.btnEqualSplit}</span>
              </button>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                background: totalWeight === 100 ? 'rgba(5, 150, 105, 0.12)' : 'rgba(225, 29, 72, 0.12)',
                color: totalWeight === 100 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                border: totalWeight === 100 ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(225, 29, 72, 0.3)'
              }}>
                {totalWeight === 100 ? strings.routing.studio.totalWeightNormal : strings.routing.studio.totalWeightMismatch(totalWeight)}
              </div>
            </div>
          </div>

          {/* Visual Stacked Progress Bar */}
          <div style={{
            height: '24px',
            width: '100%',
            background: 'var(--bg-panel)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            display: 'flex',
            marginBottom: '18px',
            border: '1px solid var(--border-subtle)'
          }}>
            {currentWeights.map((item, idx) => {
              const color = DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length];
              if (item.weight <= 0) return null;
              return (
                <div
                  key={item.model_id}
                  style={{
                    width: `${item.weight}%`,
                    background: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    transition: 'width 0.2s ease',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 4px'
                  }}
                  title={`${item.model_id}: ${item.weight}%`}
                >
                  {item.weight >= 10 ? `${item.weight}%` : ''}
                </div>
              );
            })}
          </div>

          {/* Model Weights List */}
          <div data-testid="rt-splitter-weights-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {currentWeights.map((item, idx) => {
              const color = DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length];
              const modelMeta = models.find(m => m.id === item.model_id);
              return (
                <div 
                  key={item.model_id} 
                  className="panel-nested"
                  data-testid={`rt-splitter-row-${item.model_id}`}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px', 
                    padding: '12px 16px', 
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  
                  <div style={{ width: '260px', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      {item.model_id}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: color, fontFamily: 'var(--font-mono)' }}>
                      alias: {modelMeta?.alias || 'vllm-serving'} ({modelMeta?.backend || 'EKS'})
                    </div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      disabled={!canWriteRouting}
                      value={item.weight}
                      data-testid={`rt-splitter-slider-${item.model_id}`}
                      onChange={(e) => canWriteRouting && handleWeightChange(idx, e.target.value)}
                      className="custom-range"
                      style={{ flex: 1, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '75px' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={!canWriteRouting}
                        value={item.weight}
                        data-testid={`rt-splitter-input-${item.model_id}`}
                        onChange={(e) => canWriteRouting && handleWeightChange(idx, e.target.value)}
                        className="form-input"
                        style={{ padding: '4px 8px', fontSize: '0.85rem', textAlign: 'right', color: 'var(--text-primary)' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>%</span>
                    </div>
                  </div>

                  {currentWeights.length > 1 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={!canWriteRouting}
                      data-testid={`rt-splitter-btn-remove-${item.model_id}`}
                      onClick={() => canWriteRouting && handleRemoveModelFromRoute(idx)}
                      style={{ padding: '6px', color: 'var(--accent-rose)', opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
                      title={strings.routing.studio.excludeModelTooltip}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Model Selector */}
          {availableModelsToAdd.length > 0 && (
            <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                id="addModelSelect"
                data-testid="rt-splitter-select-add-model"
                className="form-select"
                disabled={!canWriteRouting}
                style={{ 
                  maxWidth: '360px', 
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border-card)',
                  opacity: canWriteRouting ? 1 : 0.45,
                  cursor: canWriteRouting ? 'pointer' : 'not-allowed'
                }}
                value=""
                onChange={(e) => {
                  const selectedModelId = e.target.value;
                  if (selectedModelId && canWriteRouting) {
                    handleAddModelToRoute(selectedModelId);
                  }
                }}
              >
                <option value="" style={{ color: 'var(--text-muted)' }}>
                  {strings.routing.studio.selectModelToAdd}
                </option>
                {availableModelsToAdd.map(m => (
                  <option key={m.id} value={m.id} style={{ color: 'var(--text-primary)' }}>
                    {m.id} ({m.alias})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {strings.routing.studio.selectModelToAddDesc}
              </span>
            </div>
          )}
        </div>

        {/* 2. Routing Match Conditions & Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '22px' }}>
          <div className="panel-sub" style={{ padding: '18px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={18} color="var(--accent-cyan)" />
              <span>{strings.routing.studio.matchersTitle}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.82rem' }}>
              <div>
                <label className="form-label" style={{ marginBottom: '4px' }}>{strings.routing.studio.pathPrefixLabel}</label>
                <input
                  className="form-input"
                  placeholder={strings.routing.studio.pathPrefixPlaceholder}
                  value={currentRoute.match_conditions?.path_prefix || ''}
                  onChange={(e) => {
                    updateCurrentRoute({
                      match_conditions: { ...currentRoute.match_conditions, path_prefix: e.target.value }
                    });
                  }}
                />
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{strings.routing.studio.tenantMappingLabel}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {strings.routing.studio.tenantSelectHint}
                  </span>
                </label>
                
                {/* Selected tenant badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', minHeight: '26px' }}>
                  {(currentRoute.match_conditions?.tenant_codes || []).length === 0 ? (
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '3px 0' }}>
                      {strings.routing.studio.noTenantSelected}
                    </span>
                  ) : (
                    (currentRoute.match_conditions?.tenant_codes || []).map(code => {
                      const matchedT = availableTenants.find(t => t.department_code === code || t.tenant_id === code);
                      const displayName = matchedT ? `${matchedT.name} (${code})` : code;
                      return (
                        <span
                          key={code}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: '#38bdf8',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '0.76rem',
                            fontWeight: 600
                          }}
                        >
                          <span>{displayName}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const remaining = (currentRoute.match_conditions?.tenant_codes || []).filter(c => c !== code);
                              updateCurrentRoute({
                                match_conditions: { ...currentRoute.match_conditions, tenant_codes: remaining }
                              });
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#38bdf8',
                              cursor: 'pointer',
                              padding: '0 2px',
                              fontSize: '0.85rem',
                              lineHeight: 1
                            }}
                            title={strings.routing.studio.btnRemoveMappingTitle}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Dropdown to select existing tenants */}
                <select
                  className="form-select"
                  value=""
                  onChange={(e) => {
                    const selectedCode = e.target.value;
                    if (!selectedCode) return;
                    const currentCodes = currentRoute.match_conditions?.tenant_codes || [];
                    if (!currentCodes.includes(selectedCode)) {
                      updateCurrentRoute({
                        match_conditions: { ...currentRoute.match_conditions, tenant_codes: [...currentCodes, selectedCode] }
                      });
                    }
                    e.target.value = "";
                  }}
                  style={{ fontSize: '0.82rem' }}
                >
                  <option value="">+ {strings.routing.studio.tenantSelectHint}...</option>
                  {availableTenants.map(t => {
                    const isAlreadySelected = (currentRoute.match_conditions?.tenant_codes || []).includes(t.department_code);
                    return (
                      <option
                        key={t.department_code}
                        value={t.department_code}
                        disabled={isAlreadySelected}
                      >
                        {t.name} ({t.department_code}) {isAlreadySelected ? `✓ ${strings.common.active}` : ''}
                      </option>
                    );
                  })}
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  {strings.routing.studio.tenantRoutingHint}
                </span>
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: '4px' }}>{strings.routing.studio.priorityInputLabel}</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="form-input"
                  value={currentRoute.priority || 10}
                  onChange={(e) => updateCurrentRoute({ priority: Number(e.target.value) })}
                  style={{ maxWidth: '120px' }}
                />
              </div>
            </div>
          </div>

          {/* 3. Load Balancing Strategy & Failover Chain */}
          <div className="panel-sub" data-testid="rt-panel-failover" style={{ padding: '18px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color="var(--accent-emerald)" />
              <span>{strings.routing.studio.failoverTitle}</span>
            </div>
            
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ marginBottom: '6px' }}>{strings.routing.studio.lbAlgoLabel}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="strategy"
                    data-testid="rt-radio-strategy-leastqueue"
                    value="LeastQueueDepth"
                    checked={(currentRoute.load_balancing_strategy || 'LeastQueueDepth') === 'LeastQueueDepth'}
                    onChange={() => updateCurrentRoute({ load_balancing_strategy: 'LeastQueueDepth' })}
                  />
                  <span><strong>{strings.routing.studio.leastQueue}</strong>{strings.routing.studio.leastQueueDesc}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="strategy"
                    data-testid="rt-radio-strategy-prefixcache"
                    value="PrefixCacheAffinity"
                    checked={currentRoute.load_balancing_strategy === 'PrefixCacheAffinity'}
                    onChange={() => updateCurrentRoute({ load_balancing_strategy: 'PrefixCacheAffinity' })}
                  />
                  <span><strong>{strings.routing.studio.prefixCache}</strong>{strings.routing.studio.prefixCacheDesc}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="strategy"
                    data-testid="rt-radio-strategy-roundrobin"
                    value="RoundRobin"
                    checked={currentRoute.load_balancing_strategy === 'RoundRobin'}
                    onChange={() => updateCurrentRoute({ load_balancing_strategy: 'RoundRobin' })}
                  />
                  <span><strong>{strings.routing.studio.roundRobin}</strong>{strings.routing.studio.roundRobinDesc}</span>
                </label>
              </div>
            </div>

            <div>
              <label className="form-label" style={{ marginBottom: '4px' }}>{strings.routing.studio.failoverLabel}</label>
              <select
                className="form-select"
                data-testid="rt-select-failover-target"
                data-function-id="FNC-RT-SET-FAILOVER"
                value={currentRoute.failover_model_id || ''}
                onChange={(e) => updateCurrentRoute({ failover_model_id: e.target.value })}
                style={{ fontSize: '0.82rem', marginBottom: '8px' }}
              >
                <option value="">{strings.routing.studio.failoverDefault}</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.id} ({m.alias})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {strings.routing.studio.failoverHint}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {totalWeight === 100 ? (
              <span style={{ fontSize: '0.84rem', color: 'var(--accent-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={16} />
                <span>{strings.routing.studio.weight100Ready}</span>
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--accent-amber)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={16} />
                  <span>{strings.routing.studio.weightMismatch(totalWeight)}</span>
                </span>
                {currentWeights.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    data-testid="rt-btn-auto-balance"
                    data-function-id="FNC-RT-AUTOBALANCE"
                    onClick={handleAutoBalance}
                    style={{ fontSize: '0.76rem', padding: '4px 10px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                  >
                    {strings.routing.studio.btnAutoBalance}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="btn btn-secondary" 
              data-testid="rt-btn-dry-run"
              data-function-id="FNC-RT-DRY-RUN"
              onClick={() => canWriteRouting && handleDryRun()} 
              disabled={isDryRunning || !canWriteRouting}
              style={{ opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
            >
              {isDryRunning ? strings.common.loading : strings.routing.studio.btnDryRun}
            </button>
            <button 
              className="btn btn-primary" 
              data-testid="rt-btn-deploy-xds"
              data-function-id="FNC-RT-DEPLOY"
              onClick={() => canWriteRouting && handleDeployXds()} 
              disabled={isDeploying || totalWeight !== 100 || !canWriteRouting}
              style={{ opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
            >
              {isDeploying ? strings.common.loading : strings.routing.studio.btnDeployXds}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

