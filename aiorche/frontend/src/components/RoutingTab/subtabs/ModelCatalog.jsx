import React from 'react';
import { 
  Cpu, Timer, RefreshCw, Plus, Key, Lock, Zap, CheckCircle2, AlertCircle, Edit3, Trash2 
} from 'lucide-react';
import { strings } from '../../../constants/strings';
import { LLM_PROVIDERS } from '../constants';

export default function ModelCatalog({
  healthCheckTimeout,
  handleHealthTimeoutChange,
  handleCheckAllHealth,
  isHealthCheckingAll,
  canWriteRouting,
  setShowNewModelModal,
  models = [],
  currentWeights = [],
  healthStatus = {},
  handleCheckSingleHealth,
  handleAddModelToRoute,
  handleOpenEditModal,
  handleDeleteModel
}) {
  return (
    <div className="subtab-content" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Model Catalog Table */}
      <div className="card" data-testid="rt-card-catalog" data-screen-id="SCR-RT-02">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">
              <Cpu size={20} color="var(--accent-emerald)" />
              <span>{strings.routing.catalog.title}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* 수동 타임아웃 조절 컨트롤러 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(15, 23, 42, 0.65)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.76rem'
            }}>
              <Timer size={13} color="var(--accent-amber)" />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{strings.routing.catalog.timeoutLabel}:</span>
              <select
                data-testid="rt-catalog-select-timeout"
                value={healthCheckTimeout}
                onChange={(e) => handleHealthTimeoutChange(Number(e.target.value))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-amber)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)'
                }}
                title={strings.routing.catalog.timeoutLabel}
              >
                <option value={1.0} style={{ background: '#0f172a', color: '#fff' }}>1.0s</option>
                <option value={2.0} style={{ background: '#0f172a', color: '#fff' }}>2.0s</option>
                <option value={3.0} style={{ background: '#0f172a', color: '#fff' }}>3.0s</option>
                <option value={5.0} style={{ background: '#0f172a', color: '#fff' }}>5.0s</option>
                <option value={10.0} style={{ background: '#0f172a', color: '#fff' }}>10.0s</option>
                <option value={15.0} style={{ background: '#0f172a', color: '#fff' }}>15.0s</option>
                <option value={30.0} style={{ background: '#0f172a', color: '#fff' }}>30.0s</option>
              </select>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              data-testid="rt-catalog-btn-ping-all"
              data-function-id="FNC-RT-PING-ALL"
              onClick={() => handleCheckAllHealth()}
              disabled={isHealthCheckingAll}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
              title={strings.routing.catalog.healthCheckAll}
            >
              <RefreshCw size={14} className={isHealthCheckingAll ? 'spin' : ''} />
              <span>{isHealthCheckingAll ? strings.common.loading : strings.routing.catalog.healthCheckAll}</span>
            </button>
            <button
              className="btn btn-primary btn-sm"
              data-testid="rt-catalog-btn-register"
              data-function-id="FNC-RT-REGISTER-MODEL"
              disabled={!canWriteRouting}
              onClick={() => canWriteRouting && setShowNewModelModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
            >
              <Plus size={14} />
              <span>{strings.routing.catalog.registerModel}</span>
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table" data-testid="rt-catalog-table">
            <thead>
              <tr>
                <th>{strings.routing.catalog.thModelAlias}</th>
                <th>{strings.routing.catalog.thEndpoint}</th>
                <th>{strings.routing.catalog.contextWindow}</th>
                <th>{strings.routing.catalog.engine}</th>
                <th>{strings.routing.catalog.thHealth}</th>
                <th>{strings.routing.studio.table.targets}</th>
                <th style={{ textAlign: 'center' }}>{strings.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <Cpu size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {strings.routing.catalog.title}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                models.map((m) => {
                  const isInCurrentRoute = currentWeights.some(w => w.model_id === m.id);
                  return (
                    <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>alias: {m.alias}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                      {(() => {
                        const prov = LLM_PROVIDERS.find(p => p.id === m.provider) || LLM_PROVIDERS[0];
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span 
                              style={{ 
                                fontSize: '0.66rem', 
                                fontWeight: 700, 
                                padding: '1px 6px', 
                                borderRadius: '4px', 
                                background: `${prov.color}20`, 
                                color: prov.color, 
                                border: `1px solid ${prov.color}50` 
                              }}
                              title={prov.desc}
                            >
                              {prov.name}
                            </span>
                            {!prov.isCompatible && prov.id !== 'custom' && (
                              <span style={{ fontSize: '0.62rem', color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                                Non-Std
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{m.endpoint}</div>
                      <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {m.authType === 'apikey' ? (
                          <span className="badge warning" style={{ fontSize: '0.65rem', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={`header 'apikey = {api_key}'`}>
                            <Key size={10} />
                            <span>apikey Header</span>
                          </span>
                        ) : m.authType === 'bearer' ? (
                          <span className="badge info" style={{ fontSize: '0.65rem', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={`header 'Authorization: Bearer {api_key}'`}>
                            <Lock size={10} />
                            <span>Bearer Token</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            No Auth
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      ₩{m.inputPricePer1k} / ₩{m.outputPricePer1k} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>/ 1k tok</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {m.waitingQueue} reqs
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>
                          <span className={`badge ${m.active !== false ? 'active' : 'revoked'}`} style={{ fontSize: '0.7rem' }}>
                            {m.active !== false ? strings.routing.catalog.statusHealthy : strings.routing.catalog.statusOffline}
                          </span>
                        </div>
                        {(() => {
                          const hs = healthStatus[m.id];
                          const effTimeout = healthCheckTimeout || m.healthCheckTimeout || 3.0;
                          if (!hs) {
                            return (
                              <button
                                onClick={() => handleCheckSingleHealth(m.id, effTimeout)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: '0.68rem', height: '22px', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}
                                title={strings.routing.catalog.btnTestModel}
                              >
                                <Zap size={11} color="var(--accent-cyan)" />
                                <span>{strings.routing.catalog.btnTestModel}</span>
                              </button>
                            );
                          }
                          if (hs.checking) {
                            return (
                              <span
                                className="badge info"
                                style={{
                                  fontSize: '0.68rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  width: 'fit-content'
                                }}
                              >
                                <RefreshCw size={11} className="spin" />
                                <span>{strings.common.loading} ({effTimeout}s)...</span>
                              </span>
                            );
                          }
                          if (hs.is_healthy) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span
                                  className="badge active"
                                  style={{
                                    fontSize: '0.68rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title={`HTTP ${hs.status_code || 200} OK | ${hs.latency_ms}ms`}
                                >
                                  <CheckCircle2 size={11} />
                                  <span>{strings.routing.catalog.statusHealthy} ({hs.latency_ms}ms)</span>
                                </span>
                                <button
                                  onClick={() => handleCheckSingleHealth(m.id, effTimeout)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center' }}
                                >
                                  <RefreshCw size={12} />
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span
                                className="badge danger"
                                style={{
                                  fontSize: '0.68rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title={hs.error_message || strings.routing.catalog.statusOffline}
                              >
                                <AlertCircle size={11} />
                                <span>{strings.routing.catalog.statusOffline}</span>
                              </span>
                              <button
                                onClick={() => handleCheckSingleHealth(m.id, effTimeout)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-rose)', padding: '2px', display: 'flex', alignItems: 'center' }}
                              >
                                <RefreshCw size={12} />
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td>
                      {isInCurrentRoute ? (
                        <span style={{ color: 'var(--accent-emerald)', fontSize: '0.8rem', fontWeight: 600 }}>
                          {currentWeights.find(w => w.model_id === m.id)?.weight}%
                        </span>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={!canWriteRouting}
                          onClick={() => canWriteRouting && handleAddModelToRoute(m.id)}
                          style={{ fontSize: '0.75rem', opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
                        >
                          + {strings.common.add}
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={!canWriteRouting}
                          onClick={() => canWriteRouting && handleOpenEditModal(m)}
                          style={{
                            padding: '3px 8px',
                            color: 'var(--accent-cyan)',
                            borderColor: 'rgba(56, 189, 248, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem',
                            opacity: canWriteRouting ? 1 : 0.45,
                            cursor: canWriteRouting ? 'pointer' : 'not-allowed'
                          }}
                          title={strings.routing.catalog.btnEditModel}
                        >
                          <Edit3 size={12} />
                          <span>{strings.common.edit}</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={!canWriteRouting}
                          onClick={() => canWriteRouting && handleDeleteModel(m.id)}
                          style={{
                            padding: '3px 8px',
                            color: 'var(--accent-rose)',
                            borderColor: 'rgba(225, 29, 72, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem',
                            opacity: canWriteRouting ? 1 : 0.45,
                            cursor: canWriteRouting ? 'pointer' : 'not-allowed'
                          }}
                          title={strings.routing.catalog.btnDeleteModel}
                        >
                          <Trash2 size={12} />
                          <span>{strings.common.delete}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

