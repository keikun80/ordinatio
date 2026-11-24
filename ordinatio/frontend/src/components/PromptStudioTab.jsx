import React, { useState, useEffect } from 'react';
import { Sparkles, Play, Sliders, Shield, ArrowRight, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { apiClient } from '../api/client';
import { strings } from '../constants/strings';
import { useAuth } from '../context/AuthContext';

export default function PromptStudioTab({ onNotify }) {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const canExecuteStudio = isSuperAdmin || hasPermission('prompt_studio:execute');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(128);
  const [prompt, setPrompt] = useState(strings.promptStudio.defaultPrompt);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [output, setOutput] = useState(null);

  useEffect(() => {
    let timer;
    if (isRunning) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    apiClient.getModels().then(res => {
      if (res && res.length > 0) {
        const mapped = res.map(m => ({
          id: m.model_id,
          alias: m.alias,
          backend: m.backend_infra,
          engine: m.serving_engine,
          inputPricePer1k: Number(m.input_price_per_1k ?? 0.80),
          outputPricePer1k: Number(m.output_price_per_1k ?? 2.40)
        }));
        setModels(mapped);
        setSelectedModel(mapped[0].id);
      }
    }).catch(err => {
      console.warn('Failed to load registered models in PromptStudioTab:', err);
    });
  }, []);

  const handleRunInference = async () => {
    setIsRunning(true);
    setOutput(null);

    const startTime = performance.now();
    let simRes = null;

    try {
      // 1. Run Real PII Inspection & Masking via Backend API
      simRes = await apiClient.simulatePiiMasking({
        text: prompt,
        requester_id: user?.username || 'studio-user',
        model_id: selectedModel
      });

      if (simRes.is_blocked) {
        setOutput({
          isBlocked: true,
          error: null,
          maskedPrompt: simRes.masked_text,
          detections: simRes.detections,
          originalHash: simRes.original_hash,
          maskedHash: simRes.masked_hash,
          auditLogId: simRes.audit_log_id,
          response: null,
          stats: {
            piiCount: simRes.pii_count,
            piiLatencyMs: simRes.latency_ms,
            totalLatencyMs: simRes.latency_ms
          }
        });
        onNotify('ERROR', strings.promptStudio.alertBlocked);
        setIsRunning(false);
        return;
      }

      // 2. Call Real Model Inference via Gateway API with Temperature & Max Tokens
      const effectivePrompt = simRes.masked_text || prompt;
      const chatRes = await apiClient.executeChatCompletion({
        model: selectedModel,
        messages: [
          { role: 'user', content: effectivePrompt }
        ],
        temperature: Number(temperature),
        max_tokens: Number(maxTokens)
      });

      const totalLatency = Math.round(performance.now() - startTime);
      const assistantMsg = chatRes.choices?.[0]?.message?.content || strings.promptStudio.alertNoResponse;
      const meta = chatRes.orche_metadata || {};
      const usage = chatRes.usage || {};
      const inTokens = usage.prompt_tokens || Math.round(effectivePrompt.length / 4);
      const outTokens = usage.completion_tokens || Math.round(assistantMsg.length / 4);
      const modelObj = models.find((m) => m.id === (meta.selected_model || selectedModel)) || models.find((m) => m.id === selectedModel);
      const dynamicCostKrw = meta.cost_krw ?? (meta.finops?.cost_krw ?? 0);

      setOutput({
        isBlocked: false,
        error: null,
        maskedPrompt: simRes.masked_text,
        detections: simRes.detections,
        originalHash: simRes.original_hash,
        maskedHash: simRes.masked_hash,
        auditLogId: simRes.audit_log_id,
        response: assistantMsg,
        stats: {
          piiCount: simRes.pii_count || 0,
          piiLatencyMs: simRes.latency_ms || 0,
          inputTokens: inTokens,
          outputTokens: outTokens,
          ttftMs: Math.round(meta.latency_ms ? meta.latency_ms * 0.3 : totalLatency * 0.3),
          totalLatencyMs: meta.latency_ms ? Math.round(meta.latency_ms) : totalLatency,
          costKrw: dynamicCostKrw,
          servingEngine: meta.serving_engine || modelObj?.engine || 'vLLM',
          routedBy: meta.routed_by || 'Envoy AI Gateway',
          status: meta.status || 'LIVE_UPSTREAM'
        }
      });

      onNotify('SUCCESS', strings.promptStudio.alertSuccess(meta.selected_model || selectedModel, usage.total_tokens || 0, meta.latency_ms ? Math.round(meta.latency_ms) : totalLatency));
    } catch (err) {
      console.error('Real model inference error:', err);
      const totalLatency = Math.round(performance.now() - startTime);
      setOutput({
        isBlocked: false,
        error: err.message || strings.promptStudio.unknownError,
        maskedPrompt: simRes?.masked_text || strings.promptStudio.failedBeforeMasking,
        detections: simRes?.detections || [],
        originalHash: simRes?.original_hash,
        maskedHash: simRes?.masked_hash,
        response: null,
        stats: {
          totalLatencyMs: totalLatency
        }
      });
      onNotify('ERROR', strings.promptStudio.alertFailed(err.message));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="tab-pane" data-testid="scr-prompt-studio-view" data-screen-id="SCR-PS-01">
      {/* Page Header */}
      <div className="page-header" data-testid="ps-header">
        <div className="page-title-wrap">
          <h1>{strings.promptStudio.title}</h1>
          <p>{strings.promptStudio.subtitle}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '22px' }}>
        {/* Controls Sidebar */}
        <div className="card" data-testid="ps-card-controls" data-screen-id="SCR-PS-02">
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '0.95rem' }}>
              <Sliders size={18} color="#38bdf8" />
              <span>{strings.promptStudio.controlsTitle}</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{strings.promptStudio.targetModelLabel(models.length)}</label>
            <select 
              className="form-select"
              data-testid="ps-select-model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({m.alias}) [{m.backend || m.engine || 'vLLM'}]
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>{strings.promptStudio.tempLabel}</label>
              <span data-testid="ps-val-temperature" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 }}>{temperature}</span>
            </div>
            <input 
              type="range" 
              data-testid="ps-slider-temperature"
              min="0" 
              max="1" 
              step="0.1" 
              value={temperature} 
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="custom-range"
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>{strings.promptStudio.maxTokensLabel}</label>
              <span data-testid="ps-val-max-tokens" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 }}>{maxTokens}</span>
            </div>
            <input 
              type="range" 
              data-testid="ps-slider-max-tokens"
              min="16" 
              max="2048" 
              step="16" 
              value={maxTokens} 
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="custom-range"
            />
          </div>

          <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '0.82rem', fontWeight: 600 }}>
              <Shield size={14} />
              <span>{strings.promptStudio.piiProtectionTitle}</span>
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
              {strings.promptStudio.piiProtectionDesc}
            </p>
          </div>
        </div>

        {/* Playground Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Prompt Input Box */}
          <div className="card" data-testid="ps-card-input" data-screen-id="SCR-PS-03">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: '0.95rem' }}>
                <Sparkles size={18} color="#a855f7" />
                <span>{strings.promptStudio.writePromptTitle}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {!canExecuteStudio && (
                  <span className="badge warning" data-testid="ps-badge-readonly" style={{ fontSize: '0.78rem' }}>
                    {strings.virtualKeys.readOnlyBadge}
                  </span>
                )}
                <button 
                  className="btn btn-primary btn-sm"
                  data-testid="ps-btn-run"
                  data-function-id="FNC-PS-RUN-INFERENCE"
                  onClick={() => canExecuteStudio && handleRunInference()}
                  disabled={isRunning || !canExecuteStudio}
                  style={{ opacity: canExecuteStudio ? 1 : 0.45, cursor: canExecuteStudio ? 'pointer' : 'not-allowed' }}
                >
                  <Play size={14} />
                  <span>{isRunning ? strings.promptStudio.btnExecuting(elapsedSeconds) : strings.promptStudio.btnExecute}</span>
                </button>
              </div>
            </div>

            <textarea 
              className="form-textarea"
              data-testid="ps-textarea-prompt"
              rows={4}
              disabled={!canExecuteStudio}
              value={prompt}
              onChange={(e) => canExecuteStudio && setPrompt(e.target.value)}
              placeholder={strings.promptStudio.inputPlaceholder}
              style={{ opacity: canExecuteStudio ? 1 : 0.65 }}
            />
          </div>

          {/* Side-by-Side Payload & Output Inspector */}
          {output && (
            <div className="card" data-testid="ps-card-output" data-screen-id="SCR-PS-04">
              <div className="card-header">
                <div className="card-title">
                  {output.error ? (
                    <>
                      <AlertTriangle size={18} color="#f59e0b" />
                      <span data-testid="ps-output-status-error" style={{ color: '#f59e0b' }}>{strings.promptStudio.errorNoticeTitle}</span>
                    </>
                  ) : output.isBlocked ? (
                    <>
                      <AlertTriangle size={18} color="#f43f5e" />
                      <span data-testid="ps-output-status-blocked" style={{ color: '#f43f5e' }}>{strings.promptStudio.blockedNoticeTitle}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} color="#34d399" />
                      <span data-testid="ps-output-status-success">{strings.promptStudio.successNoticeTitle}</span>
                    </>
                  )}
                </div>
                {output.stats && !output.isBlocked && !output.error && (
                  <div data-testid="ps-output-stats" style={{ display: 'flex', gap: '14px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                    <span>{strings.promptStudio.piiLatency} <strong style={{ color: '#38bdf8' }}>{output.stats.piiLatencyMs?.toFixed(2)}{strings.common.units.ms}</strong></span>
                    <span>{strings.promptStudio.ttft} <strong style={{ color: '#38bdf8' }}>{output.stats.ttftMs}{strings.common.units.ms}</strong></span>
                    <span>{strings.promptStudio.totalLatency} <strong style={{ color: '#a855f7' }}>{output.stats.totalLatencyMs}{strings.common.units.ms}</strong></span>
                    <span>{strings.promptStudio.outputTokens} <strong>{output.stats.outputTokens}</strong></span>
                    <span>{strings.promptStudio.cost} <strong style={{ color: '#f59e0b' }}>₩{output.stats.costKrw}</strong></span>
                  </div>
                )}
                {output.error && output.stats && (
                  <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {strings.promptStudio.elapsed} <strong style={{ color: '#f59e0b' }}>{output.stats.totalLatencyMs}{strings.common.units.ms}</strong>
                  </div>
                )}
              </div>

              {/* Error Notice if Present */}
              {output.error && (
                <div data-testid="ps-output-error-box" style={{ 
                  background: 'rgba(245, 158, 11, 0.1)', 
                  border: '1px solid rgba(245, 158, 11, 0.3)', 
                  borderRadius: '6px', 
                  padding: '12px 16px', 
                  marginBottom: '16px',
                  color: '#fbbf24',
                  fontSize: '0.84rem',
                  lineHeight: 1.5
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{strings.promptStudio.errorDetailTitle}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#fde68a' }}>{output.error}</div>
                  <div style={{ marginTop: '8px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    {strings.promptStudio.cpuWarning}
                  </div>
                </div>
              )}

              {/* Side-by-Side Comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {strings.promptStudio.maskedPayloadTitle}
                  </div>
                  <div 
                    data-testid="ps-output-masked-prompt"
                    style={{ 
                      background: '#090d16', 
                      padding: '12px', 
                      borderRadius: '6px', 
                      fontSize: '0.82rem', 
                      fontFamily: 'var(--font-mono)', 
                      color: output.isBlocked ? '#fb7185' : output.error ? '#fcd34d' : '#38bdf8', 
                      minHeight: '90px',
                      borderLeft: `3px solid ${output.isBlocked ? '#f43f5e' : output.error ? '#f59e0b' : '#38bdf8'}`
                    }}
                  >
                    {output.maskedPrompt}
                  </div>
                  {output.maskedHash && (
                    <div data-testid="ps-output-masked-hash" style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Payload SHA: {output.maskedHash}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {strings.promptStudio.rawPayloadTitle}
                  </div>
                  <div data-testid="ps-output-raw-prompt" style={{ background: '#090d16', padding: '12px', borderRadius: '6px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minHeight: '90px' }}>
                    {prompt}
                  </div>
                  {output.originalHash && (
                    <div data-testid="ps-output-raw-hash" style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Original SHA: {output.originalHash}
                    </div>
                  )}
                </div>
              </div>

              {/* Completion Output - 실제 LLM 서빙 연동 */}
              {output.response && (
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {strings.promptStudio.completionOutputTitle}
                  </div>
                  <div data-testid="ps-output-completion-response" style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', fontSize: '0.86rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.7', border: '1px solid var(--border-subtle)' }}>
                    {output.response}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
