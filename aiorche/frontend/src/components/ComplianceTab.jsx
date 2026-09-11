import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, Sliders, Play, Lock, FileText, Download, AlertTriangle } from 'lucide-react';
import { initialPiiRules, samplePrompts, initialAuditLogs } from '../data/mockData';

export default function ComplianceTab({ onNotify }) {
  const [rules, setRules] = useState(initialPiiRules);
  const [selectedSample, setSelectedSample] = useState(0);
  const [inputText, setInputText] = useState(samplePrompts[0].text);
  const [simulationResult, setSimulationResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);

  // Live PII Masking Engine (Simulates Presidio + ext_proc)
  const runPiiSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      let text = inputText;
      const detected = [];
      let isBlocked = false;

      // Check RRN: \d{6}-[1-4]\d{6}
      const rrnRegex = /\d{2}([0]\d|[1][0-2])\d{2}-[1-4]\d{6}/g;
      if (rrnRegex.test(text)) {
        text = text.replace(rrnRegex, '[MASKED_RRN_880101]');
        detected.push({ type: '주민등록번호 (RRN)', action: 'MASK 치환 완료', confidence: '99.2%' });
      }

      // Check Bank Account: \d{3,6}-\d{2,6}-\d{3,6}
      const accRegex = /\d{3,6}-\d{2,6}-\d{3,6}/g;
      if (accRegex.test(text)) {
        text = text.replace(accRegex, '[HASH_ACC_9f2a1b]');
        detected.push({ type: '은행 계좌번호', action: '가명화 해시 치환', confidence: '89.5%' });
      }

      // Check Card: \d{4}-\d{4}-\d{4}-\d{4}
      const cardRegex = /\d{4}-\d{4}-\d{4}-\d{4}/g;
      if (cardRegex.test(text)) {
        text = text.replace(cardRegex, '[MASKED_CARD_****-****-****-3456]');
        detected.push({ type: '신용카드 번호', action: 'MASK 치환 완료', confidence: '96.8%' });
      }

      // Check Employee ID: EMP-[A-Z]{2}\d{5}
      const empRegex = /EMP-[A-Z]{2}\d{5}/g;
      if (empRegex.test(text)) {
        isBlocked = true;
        detected.push({ type: '사내 행번/사번', action: '🚨 요청 즉시 차단 (BLOCK)', confidence: '98.0%' });
      }

      setSimulationResult({
        original: inputText,
        masked: isBlocked ? '❌ [REQUEST_BLOCKED_BY_COMPLIANCE_POLICY: 사내 행번 포함으로 차단됨]' : text,
        detected,
        latencyMs: 1.18,
        isBlocked
      });
      setIsSimulating(false);

      if (isBlocked) {
        onNotify('ERROR', '컴플라이언스 정책 위반: 사내 행번(EMP-*)이 감지되어 요청이 즉시 차단되었습니다.');
      } else if (detected.length > 0) {
        onNotify('SUCCESS', `Presidio 엔진이 ${detected.length}건의 금융 PII를 실시간 마스킹 치환했습니다.`);
      } else {
        onNotify('INFO', 'PII 미탐지: 프롬프트가 변조 없이 vLLM 추론 엔진으로 전달됩니다.');
      }
    }, 300);
  };

  const handleSelectSample = (idx) => {
    setSelectedSample(idx);
    setInputText(samplePrompts[idx].text);
    setSimulationResult(null);
  };

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>PII 보안 룰 스튜디오 & 금융 감사 포렌식</h1>
          <p>Microsoft Presidio 기반 금융 개인정보 실시간 마스킹 치환 및 전자금융감독규정 준수 WORM 불변 감사 증적</p>
        </div>
        <div>
          <span className="badge active" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
            <Lock size={14} /> WORM S3 Object Lock 불변 보관 연동됨
          </span>
        </div>
      </div>

      {/* Live PII Masking Simulator (Top Demo Feature) */}
      <div className="card" style={{ marginBottom: '24px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
        <div className="card-header">
          <div className="card-title">
            <ShieldAlert size={20} color="#38bdf8" />
            <span>실시간 PII 탐지 & 마스킹 시뮬레이터 (Presidio Live Inspector)</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Envoy ext_proc gRPC 에뮬레이터</span>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label className="form-label">테스트용 시나리오 프리셋 선택:</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className={`btn btn-sm ${selectedSample === idx ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleSelectSample(idx)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">클라이언트 인입 프롬프트 (Raw User Prompt)</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
          <button className="btn btn-primary" onClick={runPiiSimulation} disabled={isSimulating}>
            <Play size={16} />
            <span>실시간 Presidio 마스킹 검증 실행</span>
          </button>
        </div>

        {/* Simulation Output Area */}
        {simulationResult && (
          <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: simulationResult.isBlocked ? '#f43f5e' : '#34d399' }}>
                {simulationResult.isBlocked ? '🚫 보안 정책 위반으로 차단됨' : '✅ PII 마스킹 완료 (vLLM 실제 전달 페이로드)'}
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                gRPC ext_proc 처리 지연: <span style={{ color: '#38bdf8', fontWeight: 700 }}>{simulationResult.latencyMs} ms</span>
              </div>
            </div>

            <div 
              style={{ 
                background: '#0a0e1a', 
                padding: '14px', 
                borderRadius: '6px', 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.85rem',
                color: simulationResult.isBlocked ? '#fb7185' : '#e2e8f0',
                marginBottom: '12px',
                borderLeft: `4px solid ${simulationResult.isBlocked ? '#f43f5e' : '#10b981'}`
              }}
            >
              {simulationResult.masked}
            </div>

            {simulationResult.detected.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>탐지 세부 내역:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {simulationResult.detected.map((d, i) => (
                    <span 
                      key={i} 
                      className={`badge ${d.action.includes('차단') ? 'danger' : 'active'}`}
                      style={{ padding: '5px 10px' }}
                    >
                      {d.type}: {d.action} (신뢰도: {d.confidence})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PII Rules Management Table */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div className="card-title">
            <Sliders size={18} color="#06b6d4" />
            <span>금융 PII 탐지 규칙 셋 관리</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNotify('INFO', '신규 PII 정규식 등록 모달이 열렸습니다.')}>
            + 규칙 추가
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>탐지 항목</th>
                <th>식별 정규식 (Regex Pattern)</th>
                <th>신뢰도 임계값</th>
                <th>처리 동작 (Action)</th>
                <th>상태</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: '#ffffff' }}>{r.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8' }}>
                    <code>{r.pattern}</code>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                      <input 
                        type="range" 
                        min="50" 
                        max="99" 
                        value={r.confidenceThreshold} 
                        onChange={(e) => setRules(rules.map(item => item.id === r.id ? { ...item, confidenceThreshold: Number(e.target.value) } : item))}
                        style={{ width: '80px' }}
                      />
                      <span>{r.confidenceThreshold}%</span>
                    </div>
                  </td>
                  <td>
                    <select 
                      className="form-select"
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.78rem' }}
                      value={r.action}
                      onChange={(e) => {
                        setRules(rules.map(item => item.id === r.id ? { ...item, action: e.target.value } : item));
                        onNotify('INFO', `${r.name} 동작이 [${e.target.value}]로 변경되었습니다.`);
                      }}
                    >
                      <option value="MASK">MASK 치환</option>
                      <option value="HASH">가명화 해시</option>
                      <option value="BLOCK">요청 즉시 차단</option>
                    </select>
                  </td>
                  <td>
                    <span className="badge active">가동 중</span>
                  </td>
                  <td>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => onNotify('SUCCESS', `${r.name} 규칙이 성공적으로 갱신되었습니다.`)}
                    >
                      저장
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Forensic Audit Log Viewer */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <FileText size={18} color="#a855f7" />
            <span>금융감독원 제출용 WORM 감사 포렌식 로그 (Kafka ➔ OpenSearch & S3)</span>
          </div>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => onNotify('SUCCESS', '금융감독원 감사 대응용 WORM 무결성 리포트(PDF)가 생성되었습니다.')}
          >
            <Download size={14} />
            <span>감사 증적 리포트 출력</span>
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>발생 일시 (KST)</th>
                <th>요청자 사번</th>
                <th>가상 API Key</th>
                <th>호출 모델</th>
                <th>컴플라이언스 조치 내역</th>
                <th>WORM 불변 스토리지 보관 ID</th>
                <th>규제 준수</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{log.time}</td>
                  <td style={{ fontWeight: 600 }}>{log.requester}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#38bdf8' }}>{log.keyId}</td>
                  <td><span className="badge info">{log.model}</span></td>
                  <td>{log.action}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#a855f7' }}>{log.wormId}</td>
                  <td>
                    <span className={`badge ${log.status === 'BLOCKED' ? 'danger' : 'active'}`}>
                      {log.status === 'BLOCKED' ? '차단 완료' : '규제 충족'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
