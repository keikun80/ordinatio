import React, { useState } from 'react';
import { Sparkles, Play, Sliders, Shield, ArrowRight, CheckCircle2 } from 'lucide-react';
import { initialModels } from '../data/mockData';

export default function PromptStudioTab({ onNotify }) {
  const [selectedModel, setSelectedModel] = useState('meta-llama/Llama-3.1-8B-Instruct');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [prompt, setPrompt] = useState('고객 홍길동(주민번호 880101-1234567, 계좌 110-123-456789)의 신용대출 심사를 위한 소득 및 상환 능력 분석 요약서를 금융감독 규정에 맞게 작성해줘.');
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState(null);

  const handleRunInference = () => {
    setIsRunning(true);
    setOutput(null);

    setTimeout(() => {
      setIsRunning(false);
      setOutput({
        maskedPrompt: '고객 홍길동(주민번호 [MASKED_RRN_880101], 계좌 [HASH_ACC_9f2a1b])의 신용대출 심사를 위한 소득 및 상환 능력 분석 요약서를 금융감독 규정에 맞게 작성해줘.',
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
          inputTokens: 48,
          outputTokens: 184,
          ttftMs: 168,
          totalLatencyMs: 1420,
          costKrw: 0.48
        }
      });
      onNotify('SUCCESS', 'vLLM 모델 추론이 완료되었습니다. PII 마스킹 완료 페이로드가 정상 처리되었습니다.');
    }, 1200);
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
            <label className="form-label">호출 대상 vLLM 서빙 모델</label>
            <select 
              className="form-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {initialModels.map((m) => (
                <option key={m.id} value={m.id}>{m.id.split('/')[1]} ({m.backend})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>Temperature</label>
              <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{temperature}</span>
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
              <label className="form-label" style={{ margin: 0 }}>Max Output Tokens</label>
              <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{maxTokens}</span>
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

          <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.25)', marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, color: '#34d399' }}>
              <Shield size={16} />
              <span>Presidio PII 필터 자동 적용됨</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              추론 실행 시 프롬프트 내 민감정보가 자동 마스킹 치환되어 GPU로 전송됩니다.
            </div>
          </div>
        </div>

        {/* Input & Output Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Prompt Input Box */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: '10px' }}>
              <div className="card-title" style={{ fontSize: '0.95rem' }}>
                <Sparkles size={18} color="#a855f7" />
                <span>테스트 프롬프트 입력</span>
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleRunInference}
                disabled={isRunning}
              >
                <Play size={14} />
                <span>{isRunning ? 'vLLM 추론 처리 중...' : '추론 실행 (Run)'}</span>
              </button>
            </div>

            <textarea 
              className="form-textarea"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="테스트할 프롬프트를 입력하세요..."
            />
          </div>

          {/* Side-by-Side Payload & Output Inspector */}
          {output && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <CheckCircle2 size={18} color="#34d399" />
                  <span>vLLM 모델 응답 결과 & 페이로드 분석</span>
                </div>
                <div style={{ display: 'flex', gap: '14px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                  <span>TTFT: <strong style={{ color: '#38bdf8' }}>{output.stats.ttftMs}ms</strong></span>
                  <span>총 지연: <strong style={{ color: '#a855f7' }}>{output.stats.totalLatencyMs}ms</strong></span>
                  <span>출력 토큰: <strong>{output.stats.outputTokens}</strong></span>
                  <span>추론 비용: <strong style={{ color: '#f59e0b' }}>₩{output.stats.costKrw}</strong></span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    1. ext_proc PII 마스킹 치환 페이로드 (vLLM 실제 인입)
                  </div>
                  <div style={{ background: '#090d16', padding: '12px', borderRadius: '6px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: '#38bdf8', minHeight: '90px' }}>
                    {output.maskedPrompt}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    2. 원문 프롬프트 (Client Raw Input)
                  </div>
                  <div style={{ background: '#090d16', padding: '12px', borderRadius: '6px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minHeight: '90px' }}>
                    {prompt}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                  생성된 vLLM 스트리밍 완료 텍스트 (Completion Output):
                </div>
                <div style={{ background: '#090d16', padding: '16px', borderRadius: '8px', fontSize: '0.86rem', color: '#f8fafc', whiteSpace: 'pre-wrap', lineHeight: '1.7', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {output.response}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
