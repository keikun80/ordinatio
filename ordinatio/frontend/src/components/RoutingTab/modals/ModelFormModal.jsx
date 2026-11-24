import React from 'react';
import { Cpu, Globe, Key, Lock, Eye, EyeOff, Edit3, Timer, CheckCircle2, Zap } from 'lucide-react';
import { strings } from '../../../constants/strings';
import { LLM_PROVIDERS } from '../constants';

export function NewModelModal({
  show,
  onClose,
  newModelForm,
  setNewModelForm,
  handleCreateModel,
  handleNewModelProviderChange,
  handleNewModelDomainChange,
  showApiKey,
  setShowApiKey
}) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={20} color="var(--accent-cyan)" />
            <span>{strings.routing.modals.newModelTitle}</span>
          </div>
        </div>
        <form onSubmit={handleCreateModel}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">{strings.routing.modals.modelNameLabel}</label>
              <input 
                className="form-input" 
                placeholder={strings.routing.modals.modelNamePlaceholder} 
                value={newModelForm.name || ''}
                onChange={(e) => setNewModelForm({...newModelForm, name: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{strings.routing.modals.modelIdLabel}</label>
              <input 
                className="form-input" 
                placeholder={strings.routing.modals.modelIdPlaceholder} 
                value={newModelForm.model_id}
                onChange={(e) => setNewModelForm({
                  ...newModelForm, 
                  model_id: e.target.value,
                  // alias가 비어있거나 model_id와 같았던 경우 자동 동기화
                  alias: (!newModelForm.alias || newModelForm.alias === newModelForm.model_id) ? e.target.value : newModelForm.alias
                })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{strings.routing.modals.modelAliasLabel}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.routing.modals.modelAliasHint}</span>
              </label>
              <input 
                className="form-input" 
                placeholder={strings.routing.modals.modelAliasPlaceholder} 
                value={newModelForm.alias || ''}
                onChange={(e) => setNewModelForm({...newModelForm, alias: e.target.value})}
              />
            </div>
            {/* Provider 규격 선택 세그먼트 */}
            <div className="form-group" style={{
              background: 'rgba(15, 23, 42, 0.45)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <Globe size={14} color="var(--accent-cyan)" />
                  <span>{strings.routing.modals.providerSelectTitle}</span>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.routing.modals.providerSelectHint}</span>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                {LLM_PROVIDERS.map(p => {
                  const isSelected = newModelForm.provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleNewModelProviderChange(p.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? `2px solid ${p.color}` : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--bg-active)' : 'var(--bg-panel)',
                        color: isSelected ? p.color : 'var(--text-secondary)',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ color: isSelected ? p.color : 'inherit', fontSize: '0.82rem' }}>{p.name}</span>
                        {!p.isCompatible && p.id !== 'custom' && (
                          <span style={{ fontSize: '0.6rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '1px 4px', borderRadius: '3px' }}>
                            {strings.routing.modals.incompatibleBadge}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'left', wordBreak: 'break-all' }}>
                        {p.pathSuffix || strings.routing.modals.customManual}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 베이스 도메인 입력 */}
              <div style={{ marginTop: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{strings.routing.modals.baseDomainLabel}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>{strings.routing.modals.baseDomainHint}</span>
                </label>
                <input 
                  className="form-input" 
                  placeholder={strings.routing.modals.baseDomainPlaceholder} 
                  value={newModelForm.base_domain}
                  onChange={(e) => handleNewModelDomainChange(e.target.value)}
                />
              </div>

              {/* 자동 완성된 최종 Target Endpoint */}
              <div style={{ marginTop: '10px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, color: 'var(--heading-color)' }}>
                    {strings.routing.modals.targetEndpointLabel}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>
                    {strings.routing.modals.targetEndpointSub}
                  </span>
                </label>
                <input 
                  className="form-input" 
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'rgba(15, 23, 42, 0.7)' }}
                  placeholder={strings.routing.modals.targetEndpointPlaceholder} 
                  value={newModelForm.target_endpoint}
                  onChange={(e) => setNewModelForm({...newModelForm, target_endpoint: e.target.value})}
                  required
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {strings.routing.modals.targetEndpointHelp}
                </div>
              </div>
            </div>

            {/* 4. 업스트림 엔드포인트 연결 인증 (API Key 및 전송 헤더 옵션) */}
            <div className="form-group" style={{
              background: 'rgba(15, 23, 42, 0.45)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <Key size={14} color="var(--accent-cyan)" />
                  <span>{strings.routing.modals.authHeaderOption}</span>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.routing.modals.authHeaderSub}</span>
              </label>

              {/* 3가지 인증 방식 선택 세그먼트 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                {[
                  { 
                    id: 'none', 
                    label: strings.routing.modals.authNone, 
                    sub: strings.routing.modals.authNoneSub, 
                    color: 'var(--text-muted)' 
                  },
                  { 
                    id: 'apikey', 
                    label: strings.routing.modals.authApiKey, 
                    sub: strings.routing.modals.authApiKeySub, 
                    color: '#fb923c' 
                  },
                  { 
                    id: 'bearer', 
                    label: strings.routing.modals.authBearer, 
                    sub: strings.routing.modals.authBearerSub, 
                    color: '#38bdf8' 
                  }
                ].map(opt => {
                  const isSelected = newModelForm.auth_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setNewModelForm({ ...newModelForm, auth_type: opt.id })}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? `2px solid ${opt.color}` : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--bg-active)' : 'var(--bg-panel)',
                        color: isSelected ? opt.color : 'var(--text-secondary)',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ color: isSelected ? opt.color : 'inherit', fontSize: '0.82rem' }}>{opt.label}</span>
                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{opt.sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* API Key 입력창 (auth_type !== 'none' 일 때 표시) */}
              {newModelForm.auth_type !== 'none' && (
                <div style={{ marginTop: '10px' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      {strings.routing.modals.apiKeyAuthHeader(newModelForm.auth_type)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)' }}>{strings.routing.modals.apiKeyRequired}</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Lock size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                    <input 
                      type={showApiKey ? 'text' : 'password'}
                      className="form-input" 
                      style={{ paddingLeft: '36px', paddingRight: '40px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                      placeholder={strings.routing.modals.apiKeyPlaceholderNew(newModelForm.auth_type)}
                      value={newModelForm.api_key}
                      onChange={(e) => setNewModelForm({...newModelForm, api_key: e.target.value})}
                      required={newModelForm.auth_type !== 'none'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px'
                      }}
                      title={showApiKey ? strings.routing.modals.apiKeyHideTooltip : strings.routing.modals.apiKeyShowTooltip}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* 실시간 HTTP 헤더 전송 미리보기 */}
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 10px',
                    background: '#090d16',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    border: '1px solid #1e293b'
                  }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', marginBottom: '3px', fontWeight: 600 }}>
                      {strings.routing.modals.headerPreviewTitle}
                    </div>
                    <div style={{ color: '#94a3b8' }}>Content-Type: application/json</div>
                    <div style={{ color: newModelForm.auth_type === 'apikey' ? '#fb923c' : '#38bdf8', fontWeight: 600 }}>
                      {strings.routing.modals.apiKeyPreview(newModelForm.auth_type, newModelForm.api_key, showApiKey)}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">{strings.routing.modals.inputPriceLabel}</label>
                <input 
                  type="number"
                  step="0.1"
                  className="form-input" 
                  value={newModelForm.input_price_per_1k}
                  onChange={(e) => setNewModelForm({...newModelForm, input_price_per_1k: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{strings.routing.modals.outputPriceLabel}</label>
                <input 
                  type="number"
                  step="0.1"
                  className="form-input" 
                  value={newModelForm.output_price_per_1k}
                  onChange={(e) => setNewModelForm({...newModelForm, output_price_per_1k: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Timer size={13} color="var(--accent-amber)" />
                  <span>{strings.routing.modals.timeoutSecLabel}</span>
                </label>
                <input 
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="60"
                  className="form-input" 
                  placeholder={strings.routing.modals.timeoutSecPlaceholder} 
                  value={newModelForm.health_check_timeout}
                  onChange={(e) => setNewModelForm({...newModelForm, health_check_timeout: e.target.value})}
                  required
                />
              </div>
            </div>

            {/* 스트리밍(SSE) 활성화 옵션 */}
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'rgba(15, 23, 42, 0.65)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                <input 
                  type="checkbox"
                  checked={newModelForm.supports_streaming !== false}
                  onChange={(e) => setNewModelForm({...newModelForm, supports_streaming: e.target.checked})}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
                />
                <Zap size={14} color="var(--accent-cyan)" />
                <span>{strings.routing.modals.streamingSupportLabel}</span>
              </label>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '24px' }}>
                {strings.routing.modals.streamingSupportHint}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{strings.common.cancel}</button>
            <button type="submit" className="btn btn-primary">
              {strings.routing.modals.btnSubmitCreate}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditModelModal({
  editingModel,
  onClose,
  editModelForm,
  setEditModelForm,
  handleUpdateModel,
  handleEditModelProviderChange,
  handleEditModelDomainChange,
  showEditApiKey,
  setShowEditApiKey
}) {
  if (!editingModel) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Edit3 size={20} color="var(--accent-cyan)" />
            <span>{strings.routing.modals.editModelTitle}</span>
          </div>
        </div>
        <form onSubmit={handleUpdateModel}>
          <div className="modal-body">
            {/* Model ID (고유 식별자 - 비활성화 표시) */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{strings.routing.modals.modelIdLabel}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.routing.modals.modelIdReadOnlyDesc}</span>
              </label>
              <input 
                className="form-input" 
                value={editModelForm.model_id}
                disabled
                style={{ opacity: 0.65, cursor: 'not-allowed', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            {/* Model Name */}
            <div className="form-group">
              <label className="form-label">{strings.routing.modals.modelNameLabel}</label>
              <input 
                className="form-input" 
                placeholder={strings.routing.modals.modelNamePlaceholder} 
                value={editModelForm.name || ''}
                onChange={(e) => setEditModelForm({...editModelForm, name: e.target.value})}
              />
            </div>

            {/* Route Alias */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{strings.routing.modals.modelAliasLabel}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.routing.modals.modelAliasHint}</span>
              </label>
              <input 
                className="form-input" 
                placeholder={strings.routing.modals.modelAliasPlaceholder} 
                value={editModelForm.alias || ''}
                onChange={(e) => setEditModelForm({...editModelForm, alias: e.target.value})}
              />
            </div>

            {/* Provider 규격 선택 세그먼트 */}
            <div className="form-group" style={{
              background: 'rgba(15, 23, 42, 0.45)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <Globe size={14} color="var(--accent-cyan)" />
                  <span>{strings.routing.modals.providerSelectTitle}</span>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.routing.modals.providerSelectHint}</span>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                {LLM_PROVIDERS.map(p => {
                  const isSelected = editModelForm.provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleEditModelProviderChange(p.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? `2px solid ${p.color}` : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--bg-active)' : 'var(--bg-panel)',
                        color: isSelected ? p.color : 'var(--text-secondary)',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ color: isSelected ? p.color : 'inherit', fontSize: '0.82rem' }}>{p.name}</span>
                        {!p.isCompatible && p.id !== 'custom' && (
                          <span style={{ fontSize: '0.6rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '1px 4px', borderRadius: '3px' }}>
                            {strings.routing.modals.incompatibleBadge}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'left', wordBreak: 'break-all' }}>
                        {p.pathSuffix || strings.routing.modals.customManual}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 베이스 도메인 입력 */}
              <div style={{ marginTop: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{strings.routing.modals.baseDomainLabel}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>{strings.routing.modals.baseDomainHint}</span>
                </label>
                <input 
                  className="form-input" 
                  placeholder={strings.routing.modals.baseDomainPlaceholder} 
                  value={editModelForm.base_domain}
                  onChange={(e) => handleEditModelDomainChange(e.target.value)}
                />
              </div>

              {/* 자동 완성된 최종 Target Endpoint */}
              <div style={{ marginTop: '10px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, color: 'var(--heading-color)' }}>
                    {strings.routing.modals.targetEndpointLabel}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>
                    {strings.routing.modals.targetEndpointSub}
                  </span>
                </label>
                <input 
                  className="form-input" 
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'rgba(15, 23, 42, 0.7)' }}
                  placeholder={strings.routing.modals.targetEndpointPlaceholder} 
                  value={editModelForm.target_endpoint}
                  onChange={(e) => setEditModelForm({...editModelForm, target_endpoint: e.target.value})}
                  required
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {strings.routing.modals.targetEndpointHelp}
                </div>
              </div>
            </div>

            {/* Auth Type & API Key */}
            <div className="form-group" style={{
              background: 'rgba(15, 23, 42, 0.45)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <Key size={14} color="var(--accent-cyan)" />
                  <span>{strings.routing.modals.authHeaderOption}</span>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.routing.modals.authHeaderSub}</span>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                {[
                  { id: 'none', label: strings.routing.modals.authNone, sub: strings.routing.modals.authNoneSub, color: 'var(--text-muted)' },
                  { id: 'apikey', label: strings.routing.modals.authApiKey, sub: strings.routing.modals.authApiKeySub, color: '#fb923c' },
                  { id: 'bearer', label: strings.routing.modals.authBearer, sub: strings.routing.modals.authBearerSub, color: '#38bdf8' }
                ].map(opt => {
                  const isSelected = editModelForm.auth_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEditModelForm({ ...editModelForm, auth_type: opt.id })}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? `2px solid ${opt.color}` : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--bg-active)' : 'var(--bg-panel)',
                        color: isSelected ? opt.color : 'var(--text-secondary)',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ color: isSelected ? opt.color : 'inherit', fontSize: '0.82rem' }}>{opt.label}</span>
                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{opt.sub}</span>
                    </button>
                  );
                })}
              </div>

              {editModelForm.auth_type !== 'none' && (
                <div style={{ marginTop: '10px' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      {strings.routing.modals.apiKeyAuthHeader(editModelForm.auth_type)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)' }}>{strings.routing.modals.apiKeyRequired}</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Lock size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                    <input 
                      type={showEditApiKey ? 'text' : 'password'}
                      className="form-input" 
                      style={{ paddingLeft: '36px', paddingRight: '40px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                      placeholder={strings.routing.modals.apiKeyPlaceholderEdit(editModelForm.auth_type)}
                      value={editModelForm.api_key}
                      onChange={(e) => setEditModelForm({...editModelForm, api_key: e.target.value})}
                      required={editModelForm.auth_type !== 'none'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditApiKey(!showEditApiKey)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px'
                      }}
                    >
                      {showEditApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Token Pricing */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">{strings.routing.modals.inputPriceLabel}</label>
                <input 
                  type="number"
                  step="0.1"
                  className="form-input" 
                  value={editModelForm.input_price_per_1k}
                  onChange={(e) => setEditModelForm({...editModelForm, input_price_per_1k: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{strings.routing.modals.outputPriceLabel}</label>
                <input 
                  type="number"
                  step="0.1"
                  className="form-input" 
                  value={editModelForm.output_price_per_1k}
                  onChange={(e) => setEditModelForm({...editModelForm, output_price_per_1k: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Timer size={13} color="var(--accent-amber)" />
                  <span>{strings.routing.modals.timeoutSecLabel}</span>
                </label>
                <input 
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="60"
                  className="form-input" 
                  placeholder={strings.routing.modals.timeoutSecPlaceholder} 
                  value={editModelForm.health_check_timeout}
                  onChange={(e) => setEditModelForm({...editModelForm, health_check_timeout: e.target.value})}
                  required
                />
              </div>
            </div>

            {/* Active / Inactive Status */}
            <div className="form-group">
              <label className="form-label">{strings.routing.modals.statusLabel}</label>
              <select 
                className="form-select"
                value={editModelForm.is_active ? 'active' : 'inactive'}
                onChange={(e) => setEditModelForm({...editModelForm, is_active: e.target.value === 'active'})}
              >
                <option value="active">{strings.routing.modals.statusActive}</option>
                <option value="inactive">{strings.routing.modals.statusInactive}</option>
              </select>
            </div>

            {/* 스트리밍(SSE) 활성화 옵션 */}
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'rgba(15, 23, 42, 0.65)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                <input 
                  type="checkbox"
                  checked={editModelForm.supports_streaming !== false}
                  onChange={(e) => setEditModelForm({...editModelForm, supports_streaming: e.target.checked})}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
                />
                <Zap size={14} color="var(--accent-cyan)" />
                <span>{strings.routing.modals.streamingSupportLabel}</span>
              </label>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '24px' }}>
                {strings.routing.modals.streamingSupportHint}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{strings.common.cancel}</button>
            <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} />
              <span>{strings.routing.modals.btnSubmitSave}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

