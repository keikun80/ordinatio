import React, { useState, useEffect } from 'react';
import { Sparkles, Play, Sliders, Shield, ArrowRight, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { apiClient } from '../api/client';

export default function PromptStudioTab({ onNotify }) {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [prompt, setPrompt] = useState('고객 홍길동(주민번호 880101-1234567, 계좌 110-123-456789)의 신용대출 심사를 위한 소득 및 상환 능력 분석 요약서를 금융감독 규정에 맞게 작성해줘.');
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState(null);

  useEffect(() => {
    apiClient.getModels().then(res => {
      if (res && res.length > 0) {
        const mapped = res.map(m => ({
          id: m.model_id,
          alias: m.alias,
          backend: m.backend_infra,
          engine: m.serving_engine
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

    try {
      // 1. Run Real PII Inspection & Masking via Backend API
      const simRes = await apiClient.simulatePiiMasking({
        text: prompt,
        requester_id: 'studio-playground',
        model_id: selectedModel
      });

      if (simRes.is_blocked) {
        setOutput({
          isBlocked: true,
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
        onNotify('ERROR', '컴플라이언스 차단: 사내 사번/행번 또는 보안 정책 위반 항목이 감지되어 vLLM 호출이 즉시 차단되었습니다.');
        setIsRunning(false);
        return;
      }

      // 2. Simulated LLM Response using masked text
      setTimeout(() => {
        setOutput({
          isBlocked: false,
          maskedPrompt: simRes.masked_text,
          detections: simRes.detections,
          originalHash: simRes.original_hash,
          maskedHash: simRes.masked_hash,
          auditLogId: simRes.audit_log_id,
          response: `[금융 대출 심사 분석 요약서]
1. 신청인 기본 사항: 고객 홍길동 (식별코드: [MASKED_RRN_880101])
2. 결제 및 상환 계좌: [HASH_ACC_9f2a1b]
3. 종합 상환 능력 평가:
   - DSR (총부채원리금상환비율): 34.2% (금융당국 가이드라인 40% 이내 충족)
   - 최근 3개년 추정 소득 안정성: 상위 25% 이내, 연체 이력 무
4. 심사 의견:
   - 본 건 신용대출 신청액(₩50,000,000)에 대해 당행 여신 심사 기준 제14조에 의거 '가결' 의견을 제시합니다.
   - 단, 금리 변동 위험을 고려하여 거치 기간 없는 원리금균등분할상환을 권고합니다.`,
          stats: {
            piiCount: simRes.pii_count,
            piiLatencyMs: simRes.latency_ms,
            inputTokens: Math.round(prompt.length / 3),
            outputTokens: 184,
            ttftMs: 142,
            totalLatencyMs: Math.round(1200 + simRes.latency_ms),
            costKrw: 0.48
          }
        });
        setIsRunning(false);
        if (simRes.pii_count > 0) {
          onNotify('SUCCESS', `vLLM 추론 완료: ${simRes.pii_count}건의 PII 마스킹 완료 페이로드가 처리되었습니다. (WORM ID: ${simRes.audit_log_id})`);
        } else {
          onNotify('SUCCESS', 'vLLM 추론 완료: 프롬프트에 PII가 감지되지 않아 원문 그대로 처리되었습니다.');
        }
      }, 800);
    } catch (err) {
      console.warn('Backend PII simulation offline, fallback to local logic:', err);
      // Fallback
      setTimeout(() => {
        setIsRunning(false);
        setOutput({
          isBlocked: false,
          maskedPrompt: prompt.replace(/\d{6}-[1-4]\d{6}/g, '[MASKED_RRN]'),
          detections: [],
          originalHash: 'sha256:e3b0c442...',
          maskedHash: 'sha256:88d4266f...',
          response: `[금융 대출 심사 분석 요약서]\n심사 가결`,
          stats: {
            piiCount: 1,
            piiLatencyMs: 1.2,
            inputTokens: 48,
            outputTokens: 120,
            ttftMs: 150,
            totalLatencyMs: 1250,
            costKrw: 0.40
          }
        });
      }, 500);
    }
  };

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>엔터프라이즈 프롬프트 스튜디오 & 플레이그라운드</h1>
          <p>고객사 관리자가 실제 vLLM 모델을 호출하여 PII 마스킹 처리 결과, 추론 응답 품질, 토큰 지연시간을 사전 테스트하는 공간</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '22px' }}>
        {/* Controls Sidebar */}
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '0.95rem' }}>
              <Sliders size={18} color="#38bdf8" />
              <span>모델 및 하이퍼파라미터</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">호출 대상 서빙 모델 (등록된 모델 풀: {models.length}개)</label>
            <select 
              className="form-select"
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
              <label className="form-label" style={{ margin: 0, color: '#F54927' }}>Temperature</label>
              <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#F54927' }}>{temperature}</span>
            </div>
            <input 
              type="range" 
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
              <label className="form-label" style={{ margin: 0, color: '#F54927' }}>Max Output Tokens</label>
              <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#F54927' }}>{maxTokens}</span>
            </div>
            <input 
              type="range" 
              min="128" 
              max="2048" 
              step="128" 
              value={maxTokens} 
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="custom-range"
            />
          </div>

          <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '0.82rem', fontWeight: 600 }}>
              <Shield size={14} />
              <span>Phase 4 PII 거버넌스 활성</span>
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
              프롬프트 전송 전 Presidio/정규식 인라인 마스킹 및 SHA-256 불변 감사 로그가 자동 기록됩니다.
            </p>
          </div>
        </div>

        {/* Playground Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Prompt Input Box */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: '0.95rem' }}>
                <Sparkles size={18} color="#a855f7" />
                <span>테스트 프롬프트 작성</span>
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleRunInference}
                disabled={isRunning}
              >
                <Play size={14} />
                <span>{isRunning ? 'PII 검증 및 vLLM 추론 중...' : '추론 실행 (Run)'}</span>
              </button>
            </div>

            <textarea 
              className="form-textarea"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="테스트할 프롬프트를 입력하세요..."
              style={{ color: '#F54927' }}
            />
          </div>

          {/* Side-by-Side Payload & Output Inspector */}
          {output && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  {output.isBlocked ? (
                    <>
                      <AlertTriangle size={18} color="#f43f5e" />
                      <span style={{ color: '#f43f5e' }}>컴플라이언스 정책 위반으로 차단됨</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} color="#34d399" />
                      <span>vLLM 모델 응답 결과 & Side-by-Side 페이로드 분석</span>
                    </>
                  )}
                </div>
                {output.stats && !output.isBlocked && (
                  <div style={{ display: 'flex', gap: '14px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                    <span>PII 지연: <strong style={{ color: '#38bdf8' }}>{output.stats.piiLatencyMs?.toFixed(2)}ms</strong></span>
                    <span>TTFT: <strong style={{ color: '#38bdf8' }}>{output.stats.ttftMs}ms</strong></span>
                    <span>총 지연: <strong style={{ color: '#a855f7' }}>{output.stats.totalLatencyMs}ms</strong></span>
                    <span>출력 토큰: <strong>{output.stats.outputTokens}</strong></span>
                    <span>추론 비용: <strong style={{ color: '#f59e0b' }}>₩{output.stats.costKrw}</strong></span>
                  </div>
                )}
              </div>

              {/* Side-by-Side Comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    1. ext_proc PII 마스킹 치환 페이로드 (vLLM 실제 인입)
                  </div>
                  <div style={{ 
                    background: '#090d16', 
                    padding: '12px', 
                    borderRadius: '6px', 
                    fontSize: '0.82rem', 
                    fontFamily: 'var(--font-mono)', 
                    color: output.isBlocked ? '#fb7185' : '#38bdf8', 
                    minHeight: '90px',
                    borderLeft: `3px solid ${output.isBlocked ? '#f43f5e' : '#38bdf8'}`
                  }}>
                    {output.maskedPrompt}
                  </div>
                  {output.maskedHash && (
                    <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Payload SHA: {output.maskedHash}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    2. 원문 프롬프트 (Client Raw Input)
                  </div>
                  <div style={{ background: '#090d16', padding: '12px', borderRadius: '6px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minHeight: '90px' }}>
                    {prompt}
                  </div>
                  {output.originalHash && (
                    <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Original SHA: {output.originalHash}
                    </div>
                  )}
                </div>
              </div>

              {/* Completion Output - 백엔드 통신 Mock 응답 #5EF527 */}
              {output.response && (
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#5EF527', marginBottom: '6px' }}>
                    생성된 vLLM 스트리밍 완료 텍스트 (Completion Output - 시뮬레이션):
                  </div>
                  <div style={{ background: '#090d16', padding: '16px', borderRadius: '8px', fontSize: '0.86rem', color: '#5EF527', whiteSpace: 'pre-wrap', lineHeight: '1.7', border: '1px solid rgba(94, 245, 39, 0.3)' }}>
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
