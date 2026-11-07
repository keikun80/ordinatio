import React from 'react';
import { 
  Compass, Settings, RefreshCw, Play, Globe, Copy, Check, Zap, Code, Cpu 
} from 'lucide-react';
import { strings } from '../../../constants/strings';

export default function AgentRouterBench({
  agentRouterStatus,
  setShowPolicyModal,
  agentSimPrompt,
  setAgentSimPrompt,
  agentSimPolicy,
  setAgentSimPolicy,
  handleSimulateAgent,
  isSimulatingAgent,
  agentSimResult,
  setAgentSimResult,
  agentSimInitialResult,
  models,
  onNotify,
  currentRoute,
  routes,
  setSelectedRouteName,
  currentWeights,
  gatewayHost,
  routePathPrefix,
  testTargetScope,
  setTestTargetScope,
  handleTestCall,
  isTestingRoute,
  testMessage,
  setTestMessage,
  activeEndpointTab,
  setActiveEndpointTab,
  curlSnippetPath,
  curlSnippetHeader,
  pythonSnippet,
  handleCopy,
  copiedField,
  testResult,
  setTestResult,
  allModelsTestResult,
  setAllModelsTestResult
}) {
  return (
    <div className="subtab-content" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Phase 0.1: AgentRouter Cognitive Dispatcher Panel */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px', borderColor: 'rgba(124, 58, 237, 0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(124, 58, 237, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
              <Compass size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{strings.routing.dispatch.agentRouterTitle}</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', background: 'rgba(124, 58, 237, 0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, border: '1px solid rgba(124, 58, 237, 0.25)' }}>
                  {strings.routing.dispatch.agentRouterBadge}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {strings.routing.dispatch.agentRouterDesc}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="badge info" style={{ fontSize: '0.75rem' }} title={strings.routing.dispatch.clusterEnvoy(agentRouterStatus?.default_tiers?.fast_8b?.cluster || 'cluster_vllm_fast_8b')}>
              {strings.routing.dispatch.tierFast} {agentRouterStatus?.default_tiers?.fast_8b?.cluster || 'Fast Tier'}
            </span>
            <span className="badge purple" style={{ fontSize: '0.75rem' }} title={strings.routing.dispatch.clusterEnvoy(agentRouterStatus?.default_tiers?.reasoning_72b?.cluster || 'cluster_vllm_reasoning_72b')}>
              {strings.routing.dispatch.tierReasoning} {agentRouterStatus?.default_tiers?.reasoning_72b?.cluster || 'Reasoning Tier'}
            </span>
            <span className="badge active" style={{ fontSize: '0.75rem' }} title={strings.routing.dispatch.clusterEnvoy(agentRouterStatus?.default_tiers?.fallback?.cluster || 'cluster_vllm_inference_pool')}>
              {strings.routing.dispatch.tierFallback} {agentRouterStatus?.default_tiers?.fallback?.cluster || 'Self-Healing'}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPolicyModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                padding: '4px 10px',
                color: 'var(--accent-purple)',
                borderColor: 'rgba(124, 58, 237, 0.4)',
                cursor: 'pointer'
              }}
            >
              <Settings size={14} color="currentColor" />
              <span>{strings.routing.dispatch.btnEditPolicies}</span>
            </button>
          </div>
        </div>

        {/* Live Simulator Form */}
        <div className="panel-nested" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 500px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                {strings.routing.dispatch.simTitle}
              </label>
              <textarea
                className="form-control"
                rows={2}
                value={agentSimPrompt}
                onChange={(e) => setAgentSimPrompt(e.target.value)}
                placeholder={strings.routing.dispatch.simPlaceholder}
                style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ width: '160px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                {strings.routing.dispatch.policySelectLabel}
              </label>
              <select
                className="form-control"
                value={agentSimPolicy}
                onChange={(e) => setAgentSimPolicy(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
              >
                <option value="QualityFirst">QualityFirst</option>
                <option value="LeastCost">LeastCost</option>
                <option value="LatencyOptimized">LatencyOptimized</option>
                <option value="SelfHealingFallback">SelfHealingFallback</option>
              </select>
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleSimulateAgent}
                disabled={isSimulatingAgent}
                style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isSimulatingAgent ? <RefreshCw className="spin" size={15} /> : <Play size={15} />}
                <span>{strings.routing.dispatch.btnRunSim}</span>
              </button>
            </div>
          </div>

          {/* Simulation Output Card (Fully Editable) */}
          {agentSimResult && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              {/* Card Sub-Header with Status & Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {strings.routing.dispatch.resultHeader}
                  </span>
                  {agentSimResult.isOverridden ? (
                    <span className="badge warning" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                      {strings.routing.dispatch.overrideActive}
                    </span>
                  ) : (
                    <span className="badge active" style={{ fontSize: '0.7rem' }}>
                      {strings.routing.dispatch.aiClassified}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {agentSimResult.isOverridden && agentSimInitialResult && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setAgentSimResult({ ...agentSimInitialResult, isOverridden: false });
                        if (onNotify) onNotify('INFO', strings.routing.policyModal.resetAlert);
                      }}
                      style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <RefreshCw size={12} />
                      <span>{strings.routing.dispatch.btnRestoreInitial}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (agentSimResult?.selected_model) {
                        setTestTargetScope(agentSimResult.selected_model);
                      }
                      if (agentSimPrompt) {
                        setTestMessage(agentSimPrompt);
                      }
                      if (onNotify) onNotify('SUCCESS', `[${agentSimResult.selected_model}] -> Testbench`);
                    }}
                    style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                  >
                    <Play size={12} fill="currentColor" />
                    <span>{strings.routing.dispatch.btnApplyTestbench}</span>
                  </button>
                </div>
              </div>

              {/* 4 Editable Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {/* 1. 판정된 복잡도 (Complexity) - Editable */}
                <div className="panel-kpi-sub" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.routing.dispatch.cardComplexity}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-purple)' }}>{strings.routing.dispatch.editableBadge}</span>
                  </div>
                  <select
                    className="form-input"
                    value={agentSimResult.complexity}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAgentSimResult(prev => ({
                        ...prev,
                        complexity: val,
                        isOverridden: true
                      }));
                    }}
                    style={{
                      height: '34px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: agentSimResult.complexity === 'REASONING_HEAVY' ? 'var(--accent-purple)' : (agentSimResult.complexity === 'LIGHT' ? 'var(--accent-cyan)' : 'var(--accent-emerald)'),
                      background: 'var(--bg-panel)',
                      borderColor: 'var(--border-subtle)',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="LIGHT">LIGHT</option>
                    <option value="STANDARD">STANDARD</option>
                    <option value="REASONING_HEAVY">REASONING_HEAVY</option>
                  </select>
                </div>

                {/* 2. 디스패치 모델 티어 - Editable */}
                <div className="panel-kpi-sub" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.routing.dispatch.cardTier}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-amber)' }}>{strings.routing.dispatch.editableBadge}</span>
                  </div>
                  <select
                    className="form-input"
                    value={agentSimResult.suggested_tier}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAgentSimResult(prev => ({
                        ...prev,
                        suggested_tier: val,
                        isOverridden: true
                      }));
                    }}
                    style={{
                      height: '34px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--accent-amber)',
                      background: 'var(--bg-panel)',
                      borderColor: 'var(--border-subtle)',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="fast_8b">{strings.routing.tiers.fast_8b}</option>
                    <option value="reasoning_72b">{strings.routing.tiers.reasoning_72b}</option>
                    <option value="fallback">{strings.routing.tiers.fallback}</option>
                    <option value="agent_worker">{strings.routing.tiers.agent_worker}</option>
                  </select>
                </div>

                {/* 3. 선택된 타깃 모델 - Editable */}
                <div className="panel-kpi-sub" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.routing.dispatch.cardModel}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)' }}>{strings.routing.dispatch.editableBadge}</span>
                  </div>
                  <select
                    className="form-input"
                    value={agentSimResult.selected_model}
                    onChange={(e) => {
                      const selectedModelId = e.target.value;
                      const derivedCluster = `cluster_${selectedModelId.split('/').pop().replace(/[:.-]/g, '_').toLowerCase()}`;
                      setAgentSimResult(prev => ({
                        ...prev,
                        selected_model: selectedModelId,
                        target_cluster: derivedCluster,
                        isOverridden: true
                      }));
                    }}
                    style={{
                      height: '34px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      background: 'var(--bg-panel)',
                      borderColor: 'var(--border-subtle)',
                      cursor: 'pointer'
                    }}
                  >
                    {!models.some(m => m.id === agentSimResult.selected_model) && (
                      <option value={agentSimResult.selected_model}>{agentSimResult.selected_model} {strings.routing.dispatch.customDesignation}</option>
                    )}
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.alias ? `${m.alias} (${m.id})` : m.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Envoy 업스트림 클러스터 - Editable */}
                <div className="panel-kpi-sub" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.routing.dispatch.cardCluster}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)' }}>{strings.routing.dispatch.editableBadge}</span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={agentSimResult.target_cluster || ''}
                    placeholder={strings.routing.dispatch.clusterPlaceholder}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAgentSimResult(prev => ({
                        ...prev,
                        target_cluster: val,
                        isOverridden: true
                      }));
                    }}
                    style={{
                      height: '34px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: 'var(--accent-cyan)',
                      background: 'var(--bg-panel)',
                      borderColor: 'var(--border-subtle)'
                    }}
                  />
                </div>

                {/* 5. 판정 사유 및 오버라이드 안내 바 */}
                <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: 'var(--bg-panel)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{strings.routing.dispatch.reasonLabel}</strong> {agentSimResult.reasons?.join(' | ') || strings.routing.dispatch.defaultHeuristicReason}
                  </div>
                  {agentSimResult.isOverridden && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', fontWeight: 600 }}>
                      {strings.routing.dispatch.overrideNotice}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Envoy Gateway API 엔드포인트 & 실시간 테스트 벤치 카드 */}
      <div className="card" data-testid="rt-card-testbench" data-screen-id="SCR-RT-03" style={{ marginBottom: '24px', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="card-title">
                <Globe size={20} color="var(--accent-cyan)" />
                <span>{strings.routing.dispatch.testbenchTitle}</span>
              </div>
              <span className="badge active">{strings.routing.dispatch.endpointBadge}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {strings.routing.dispatch.testbenchDesc(currentRoute.route_name)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label htmlFor="testbench-route-select" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>{strings.routing.dispatch.selectRouteLabel}</label>
            <select
              id="testbench-route-select"
              data-testid="rt-testbench-select-route"
              className="form-select"
              value={currentRoute.route_name}
              onChange={(e) => {
                setSelectedRouteName(e.target.value);
                localStorage.setItem('aiorche_selected_route', e.target.value);
              }}
              style={{ fontSize: '0.82rem', padding: '5px 10px', minWidth: '180px' }}
            >
              {routes.map(r => (
                <option key={r.route_name} value={r.route_name}>
                  {r.route_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 0. Envoy Gateway API Endpoint & Connection Guide */}
        <div className="panel-sub" style={{
          padding: '20px',
          marginBottom: '20px',
          maxWidth: '100%',
          width: '100%',
          minWidth: 0,
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ minWidth: 0, flex: '1 1 300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Globe size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                  {strings.routing.dispatch.gatewayIngressTitle}
                </span>
                <span className="badge active" style={{ fontSize: '0.7rem' }}>
                  {strings.routing.dispatch.activeXdsBadge}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {strings.routing.dispatch.endpointCallDesc(currentRoute.route_name, currentWeights.length)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{strings.routing.dispatch.testScopeLabel}</span>
                <select
                  className="form-select"
                  data-testid="rt-testbench-select-target"
                  value={testTargetScope}
                  onChange={(e) => setTestTargetScope(e.target.value)}
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 8px',
                    height: '32px',
                    minWidth: '220px',
                    background: 'var(--bg-panel)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                  title={strings.routing.dispatch.testScopeTooltip}
                >
                  <option value="all">{strings.routing.dispatch.optAllModels((models || []).length)}</option>
                  <option value="route">{strings.routing.dispatch.optCurrentRoute((currentWeights || []).length)}</option>
                  <optgroup label={strings.routing.dispatch.optGroupSingle}>
                    {(models || []).map(m => (
                      <option key={m.id} value={m.id}>
                        🤖 {m.alias || m.id} ({m.engine || 'LLM'})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <button
                className="btn btn-primary btn-sm"
                data-testid="rt-testbench-btn-send"
                data-function-id="FNC-RT-TEST"
                onClick={() => handleTestCall(activeEndpointTab)}
                disabled={isTestingRoute}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', height: '32px' }}
                title={strings.routing.dispatch.btnCallTooltip}
              >
                <Play size={13} fill="currentColor" />
                <span>
                  {isTestingRoute
                    ? strings.routing.dispatch.btnCalling
                    : testTargetScope === 'all'
                      ? strings.routing.dispatch.btnCallAll((models || []).length)
                      : testTargetScope === 'route'
                        ? strings.routing.dispatch.btnCallRoute((currentWeights || []).length)
                        : strings.routing.dispatch.btnCallSingle(testTargetScope.split('/').pop())}
                </span>
              </button>
            </div>
          </div>

          {/* Test Prompt Input Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '14px',
            background: 'rgba(15, 23, 42, 0.4)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 600, flexShrink: 0 }}>
              {strings.routing.dispatch.testPromptInputLabel}
            </span>
            <input
              type="text"
              data-testid="rt-testbench-input-msg"
              className="form-input"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder={strings.routing.dispatch.testPromptPlaceholder}
              style={{ fontSize: '0.78rem', padding: '3px 8px', height: '26px', flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Primary Endpoint Box */}
          <div className="panel-nested" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
            maxWidth: '100%',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px', minWidth: 0, flexWrap: 'wrap' }}>
              <span className="badge active" style={{ fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                POST
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.92rem',
                fontWeight: 600,
                color: 'var(--accent-cyan)',
                wordBreak: 'break-all',
                overflowWrap: 'anywhere',
                minWidth: 0
              }}>
                {activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`}
              </span>
              {activeEndpointTab === 'header' && (
                <span className="badge warning" style={{ fontSize: '0.7rem', flexShrink: 0 }}>
                  Header: x-orche-route: {currentRoute.route_name}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => handleCopy(activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`, 'endpoint')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedField === 'endpoint' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                <span>{copiedField === 'endpoint' ? strings.routing.dispatch.copiedUrl : strings.routing.dispatch.copyUrl}</span>
              </button>
            </div>
          </div>

          {/* Integration Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '14px', flexWrap: 'wrap' }}>
            {[
              { id: 'path', label: strings.routing.dispatch.tabPath },
              { id: 'header', label: strings.routing.dispatch.tabHeader },
              { id: 'python', label: strings.routing.dispatch.tabPython }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveEndpointTab(tab.id)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeEndpointTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  color: activeEndpointTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: activeEndpointTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Path Based */}
          {activeEndpointTab === 'path' && (
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {strings.routing.dispatch.pathHint}
              </div>
              <div style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#a7f3d0',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  boxSizing: 'border-box',
                  border: '1px solid #1e293b'
                }}>
                  <code>{curlSnippetPath}</code>
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippetPath, 'curl-path')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'curl-path' ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  <span>{copiedField === 'curl-path' ? strings.routing.dispatch.copiedBadge : strings.routing.dispatch.btnCopyCurl}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Header Based */}
          {activeEndpointTab === 'header' && (
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {strings.routing.dispatch.headerHint}
              </div>
              <div style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#a7f3d0',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  boxSizing: 'border-box',
                  border: '1px solid #1e293b'
                }}>
                  <code>{curlSnippetHeader}</code>
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippetHeader, 'curl-header')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'curl-header' ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  <span>{copiedField === 'curl-header' ? strings.routing.dispatch.copiedBadge : strings.routing.dispatch.btnCopyCurl}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Python OpenAI SDK */}
          {activeEndpointTab === 'python' && (
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {strings.routing.dispatch.pythonHint}
              </div>
              <div style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#93c5fd',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  boxSizing: 'border-box',
                  border: '1px solid #1e293b'
                }}>
                  <code>{pythonSnippet}</code>
                </pre>
                <button
                  onClick={() => handleCopy(pythonSnippet, 'python')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'python' ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  <span>{copiedField === 'python' ? strings.routing.dispatch.copiedBadge : strings.routing.dispatch.btnCopyCode}</span>
                </button>
              </div>
            </div>
          )}

          {/* Test Call Response Box */}
          {testResult && (
            <div className="panel-nested" data-testid="rt-testbench-output" style={{
              marginTop: '16px',
              padding: '14px 16px',
              border: `1px solid ${testResult.is_success ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
              maxWidth: '100%',
              width: '100%',
              minWidth: 0,
              overflow: 'hidden',
              boxSizing: 'border-box'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
                flexWrap: 'wrap',
                gap: '8px',
                minWidth: 0,
                maxWidth: '100%',
                width: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%', flex: '1 1 0' }}>
                  <span className={`badge ${testResult.is_success ? 'active' : 'revoked'}`} style={{ fontSize: '0.72rem', flexShrink: 0 }}>
                    {strings.routing.dispatch.testResultStatus(testResult.is_success, testResult.status_code)}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600, flexShrink: 0 }}>
                    {strings.routing.dispatch.testResultTitle(testResult.latency_ms)}
                  </span>
                  <span style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                    minWidth: 0,
                    maxWidth: '100%',
                    display: 'inline-block'
                  }}>
                    {strings.routing.dispatch.targetUrlLabel} {testResult.target_url}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const body = testResult.response_body;
                      let text = '';
                      if (!body) text = testResult.error_message || strings.routing.dispatch.noResultMsg;
                      else if (typeof body === 'object') {
                        try { text = JSON.stringify(body, null, 2); } catch { text = String(body); }
                      } else if (typeof body === 'string') {
                        try { text = JSON.stringify(JSON.parse(body), null, 2); } catch { text = body; }
                      } else { text = String(body); }
                      handleCopy(text, 'test-res-body');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      height: '24px'
                    }}
                    title={strings.routing.dispatch.copyJsonTooltip}
                  >
                    {copiedField === 'test-res-body' ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                    <span>{copiedField === 'test-res-body' ? strings.routing.dispatch.copiedBadge : strings.routing.dispatch.copyBadge}</span>
                  </button>
                  <button
                    onClick={() => setTestResult(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      flexShrink: 0,
                      padding: '2px 6px'
                    }}
                  >
                    {strings.common.close} ✕
                  </button>
                </div>
              </div>
              {(() => {
                const body = testResult.response_body;
                let parsedJson = null;
                let extractedContent = null;

                if (body) {
                  if (typeof body === 'object') {
                    parsedJson = body;
                  } else if (typeof body === 'string') {
                    try { parsedJson = JSON.parse(body); } catch { /* raw string */ }
                  }
                }

                if (parsedJson && typeof parsedJson === 'object') {
                  extractedContent = 
                    parsedJson.choices?.[0]?.message?.content ||
                    parsedJson.choices?.[0]?.text ||
                    (typeof parsedJson.response === 'string' ? parsedJson.response : null) ||
                    parsedJson.message?.content ||
                    (typeof parsedJson.message === 'string' ? parsedJson.message : null);
                }

                const rawJsonString = body
                  ? (parsedJson ? JSON.stringify(parsedJson, null, 2) : String(body))
                  : (testResult.error_message || strings.routing.dispatch.noResultMsg);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                    {/* 1. 모델이 응답한 실제 텍스트 본문 (\\n 개행을 실제 엔터 줄바꿈으로 완벽 렌더링) */}
                    {extractedContent && (
                      <div style={{
                        padding: '12px 14px',
                        background: 'rgba(6, 182, 212, 0.08)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        borderRadius: '6px',
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                          gap: '6px',
                          minWidth: 0
                        }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={14} color="var(--accent-cyan)" />
                            <span>{strings.routing.dispatch.aiTextTitle}</span>
                          </span>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCopy(extractedContent, 'test-res-content')}
                            style={{ fontSize: '0.7rem', padding: '2px 8px', height: '22px' }}
                          >
                            {copiedField === 'test-res-content' ? <Check size={11} color="var(--accent-emerald)" /> : <Copy size={11} />}
                            <span>{copiedField === 'test-res-content' ? strings.routing.dispatch.copiedBody : strings.routing.dispatch.copyBody}</span>
                          </button>
                        </div>
                        <div style={{
                          fontSize: '0.82rem',
                          lineHeight: '1.7',
                          color: '#f8fafc',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          fontFamily: 'inherit'
                        }}>
                          {extractedContent}
                        </div>
                      </div>
                    )}

                    {/* 2. 전체 JSON 페이로드 (Raw JSON 포맷팅) */}
                    <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Code size={12} />
                        <span>{extractedContent ? strings.routing.dispatch.fullPayloadTitle : strings.routing.dispatch.rawJsonTitle}</span>
                      </div>
                      <textarea
                        readOnly
                        value={rawJsonString}
                        rows={extractedContent ? 8 : 12}
                        style={{
                          width: '100%',
                          maxWidth: '100%',
                          minWidth: 0,
                          margin: 0,
                          padding: '12px 14px',
                          background: '#040711',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          color: testResult.is_success ? '#a7f3d0' : '#fca5a5',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          boxSizing: 'border-box',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                          resize: 'vertical',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* All Linked Models Test Response Box */}
          {allModelsTestResult && (
            <div className="panel-nested" style={{
              marginTop: '16px',
              padding: '16px',
              border: `1px solid ${allModelsTestResult.is_success ? 'var(--accent-emerald)' : 'rgba(239, 68, 68, 0.4)'}`,
              maxWidth: '100%',
              width: '100%',
              minWidth: 0,
              boxSizing: 'border-box'
            }}>
              {/* 상단 통계 바 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
                flexWrap: 'wrap',
                gap: '8px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className={`badge ${allModelsTestResult.is_success ? 'active' : 'warning'}`} style={{ fontSize: '0.72rem' }}>
                    {allModelsTestResult.is_success ? strings.routing.dispatch.allOkServingBadge : strings.routing.dispatch.someCheckBadge}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {strings.routing.dispatch.allBatchResultTitle(allModelsTestResult.total_count)}
                  </span>
                  <span className="badge active" style={{ fontSize: '0.7rem' }}>
                    {strings.routing.dispatch.successCountBadge(allModelsTestResult.success_count)}
                  </span>
                  {allModelsTestResult.failed_count > 0 && (
                    <span className="badge danger" style={{ fontSize: '0.7rem' }}>
                      {strings.routing.dispatch.failedCountBadge(allModelsTestResult.failed_count)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const summary = allModelsTestResult.results.map(r => ({
                        model: r.model_id,
                        status: r.status_code,
                        latency: `${r.latency_ms}ms`,
                        success: r.is_success,
                        response: r.response_body?.choices?.[0]?.message?.content || r.error_message
                      }));
                      handleCopy(JSON.stringify(summary, null, 2), 'all-models-summary');
                    }}
                    style={{ fontSize: '0.7rem', padding: '2px 8px', height: '22px' }}
                    title={strings.routing.dispatch.copyAllSummaryTooltip}
                  >
                    {copiedField === 'all-models-summary' ? <Check size={11} color="var(--accent-emerald)" /> : <Copy size={11} />}
                    <span>{copiedField === 'all-models-summary' ? strings.routing.dispatch.copiedAllSummary : strings.routing.dispatch.copyAllSummary}</span>
                  </button>
                  <button
                    onClick={() => setAllModelsTestResult(null)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    {strings.common.close} ✕
                  </button>
                </div>
              </div>

              {/* 모델별 카드 리스트 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {allModelsTestResult.results.map((r, idx) => {
                  let content = null;
                  if (r.response_body && typeof r.response_body === 'object') {
                    content = r.response_body.choices?.[0]?.message?.content ||
                              r.response_body.choices?.[0]?.text ||
                              r.response_body.message?.content ||
                              (typeof r.response_body.response === 'string' ? r.response_body.response : null);
                  }

                  const rawJson = r.response_body
                    ? (typeof r.response_body === 'object' ? JSON.stringify(r.response_body, null, 2) : String(r.response_body))
                    : (r.error_message || strings.routing.dispatch.noResponseMsg);

                  return (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(15, 23, 42, 0.65)',
                        border: `1px solid ${r.is_success ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '12px 14px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Cpu size={14} color="var(--accent-cyan)" />
                            <span>{r.model_id || strings.routing.dispatch.modelNumLabel(idx+1)}</span>
                          </span>
                          <span className={`badge ${r.is_success ? 'active' : 'revoked'}`} style={{ fontSize: '0.68rem' }}>
                            {strings.routing.dispatch.testResultStatus(r.is_success, r.status_code)}
                          </span>
                          <span className="badge info" style={{ fontSize: '0.68rem' }}>
                            {r.latency_ms}ms
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            URL: {r.target_url}
                          </span>
                        </div>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopy(rawJson, `all-res-${idx}`)}
                          style={{ fontSize: '0.7rem', padding: '2px 8px', height: '22px' }}
                        >
                          {copiedField === `all-res-${idx}` ? <Check size={11} color="var(--accent-emerald)" /> : <Copy size={11} />}
                          <span>{copiedField === `all-res-${idx}` ? strings.routing.dispatch.copiedBadge : strings.routing.dispatch.copyModelJson}</span>
                        </button>
                      </div>

                      {/* 응답 본문 */}
                      {r.is_success ? (
                        <div style={{
                          background: '#040711',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#f8fafc',
                          fontSize: '0.8rem',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all'
                        }}>
                          <div style={{ color: 'var(--accent-emerald)', fontSize: '0.72rem', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Zap size={12} />
                            <span>{strings.routing.dispatch.generatedAnswerLabel}</span>
                          </div>
                          {content || rawJson}
                        </div>
                      ) : (
                        <div style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: 'var(--accent-rose)',
                          fontSize: '0.78rem'
                        }}>
                          <strong>{strings.routing.dispatch.errorMsgLabel}</strong> {r.error_message || strings.routing.dispatch.upstreamUnavailable}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

