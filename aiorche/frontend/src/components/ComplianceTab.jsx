import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  Sliders, 
  Play, 
  Lock, 
  FileText, 
  Download, 
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  X,
  Hash
} from 'lucide-react';
import { api } from '../api/client';
import { initialPiiRules, samplePrompts, initialAuditLogs } from '../data/mockData';

export default function ComplianceTab({ onNotify }) {
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [selectedSample, setSelectedSample] = useState(0);
  const [inputText, setInputText] = useState(samplePrompts[0]?.text || '');
  const [simulationResult, setSimulationResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [stats, setStats] = useState(null);

  // Modal State for Adding Rule
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState(null);
  const [newRule, setNewRule] = useState({
    rule_id: 'pii-custom-' + Math.floor(Math.random() * 1000),
    name: '',
    entity_type: 'CUSTOM',
    regex_pattern: '',
    confidence_threshold: 0.85,
    action: 'MASK',
    is_active: true
  });

  // Filter State for Audit Logs
  const [logSearch, setLogSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  // Load Data on Mount
  const loadRules = async () => {
    setLoadingRules(true);
    const data = await api.getPiiRules();
    if (data && data.length > 0) {
      setRules(data);
    } else {
      // Fallback to mock mapped to backend format
      setRules(initialPiiRules.map(r => ({
        rule_id: r.id,
        name: r.name,
        entity_type: r.id.includes('rrn') ? 'RRN' : (r.id.includes('account') ? 'BANK_ACCOUNT' : (r.id.includes('card') ? 'CREDIT_CARD' : 'EMPLOYEE_ID')),
        regex_pattern: r.pattern,
        confidence_threshold: r.confidenceThreshold / 100,
        action: r.action,
        is_active: true
      })));
    }
    setLoadingRules(false);
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    const logs = await api.getAuditLogs({ limit: 50 });
    if (logs && logs.length > 0) {
      setAuditLogs(logs);
    } else {
      setAuditLogs(initialAuditLogs.map(l => ({
        log_id: l.id,
        timestamp: l.time,
        requester_id: l.requester,
        key_id: l.keyId,
        model_id: l.model,
        action_taken: l.action.includes('차단') ? 'BLOCK' : 'MASK',
        is_blocked: l.status === 'BLOCKED',
        latency_ms: 1.2,
        worm_reference_id: l.wormId,
        original_prompt_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        masked_payload_hash: 'sha256:88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589',
        detections_json: '[]',
        pii_count: 1
      })));
    }
    setLoadingLogs(false);
  };

  const loadStats = async () => {
    const s = await api.getComplianceStats();
    if (s) setStats(s);
  };

  useEffect(() => {
    loadRules();
    loadLogs();
    loadStats();
  }, []);

  // Live PII Masking Engine (Simulates Presidio + ext_proc)
  const runPiiSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await api.simulatePiiMasking({
        text: inputText,
        requester_id: 'Presidio-Live-Admin',
        key_id: 'sk-orch-wm-prod-01',
        model_id: 'meta-llama/Llama-3.1-8B-Instruct'
      });

      setSimulationResult({
        original: res.original_text,
        masked: res.masked_text,
        detected: res.detections.map(d => ({
          type: `${d.rule_name} (${d.entity_type})`,
          action: d.action === 'BLOCK' ? '🚨 차단 (BLOCK)' : (d.action === 'HASH' ? '가명화 해시' : 'MASK 치환'),
          confidence: `${Math.round(d.confidence * 100)}%`,
          matched: d.matched_text
        })),
        latencyMs: res.latency_ms,
        isBlocked: res.is_blocked,
        originalHash: res.original_hash,
        maskedHash: res.masked_hash,
        auditLogId: res.audit_log_id
      });

      // Reload audit logs & stats to show the newly inserted WORM log
      loadLogs();
      loadStats();

      if (res.is_blocked) {
        onNotify('ERROR', '컴플라이언스 정책 위반: 차단 규칙(BLOCK)이 발동되어 요청이 즉시 차단되었습니다.');
      } else if (res.pii_count > 0) {
        onNotify('SUCCESS', `Presidio 엔진이 ${res.pii_count}건의 금융 PII를 실시간 마스킹 치환했습니다. WORM 감사 로그가 기록되었습니다.`);
      } else {
        onNotify('INFO', 'PII 미탐지: 프롬프트가 변조 없이 vLLM 추론 엔진으로 전달됩니다.');
      }
    } catch (err) {
      console.error('Simulation error:', err);
      onNotify('ERROR', `시뮬레이션 실행 실패: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSelectSample = (idx) => {
    setSelectedSample(idx);
    setInputText(samplePrompts[idx].text);
    setSimulationResult(null);
  };

  // Rule Update
  const handleUpdateRule = async (rule) => {
    try {
      await api.updatePiiRule(rule.rule_id, {
        name: rule.name,
        regex_pattern: rule.regex_pattern,
        confidence_threshold: rule.confidence_threshold,
        action: rule.action,
        is_active: rule.is_active
      });
      onNotify('SUCCESS', `규칙 '${rule.name}'이(가) 성공적으로 갱신되었습니다.`);
      loadRules();
      loadStats();
    } catch (err) {
      onNotify('ERROR', `규칙 갱신 실패: ${err.message}`);
    }
  };

  // Rule Delete
  const confirmDeleteRule = async (ruleId) => {
    try {
      // Optimistic UI update
      setRules(prev => prev.filter(r => r.rule_id !== ruleId));
      setDeletingRule(null);
      await api.deletePiiRule(ruleId);
      onNotify('SUCCESS', `규칙 '${ruleId}'이(가) 성공적으로 삭제되었습니다.`);
      loadRules();
      loadStats();
    } catch (err) {
      onNotify('ERROR', `규칙 삭제 실패: ${err.message}`);
      loadRules();
    }
  };

  // Add Rule
  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      await api.createPiiRule(newRule);
      onNotify('SUCCESS', `신규 PII 규칙 '${newRule.name}'이(가) 등록되었습니다.`);
      setIsAddModalOpen(false);
      setNewRule({
        rule_id: 'pii-custom-' + Math.floor(Math.random() * 1000),
        name: '',
        entity_type: 'CUSTOM',
        regex_pattern: '',
        confidence_threshold: 0.85,
        action: 'MASK',
        is_active: true
      });
      loadRules();
      loadStats();
    } catch (err) {
      onNotify('ERROR', `규칙 등록 실패: ${err.message}`);
    }
  };

  // Export Forensic Audit Report (JSON / CSV)
  const handleExportAuditLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `aiorche_worm_forensics_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    onNotify('SUCCESS', '금융감독원 감사 대응용 WORM 무결성 포렌식 리포트가 다운로드되었습니다.');
  };

  // Filtered Audit Logs
  const filteredLogs = auditLogs.filter(log => {
    const matchSearch = !logSearch || 
      (log.requester_id && log.requester_id.toLowerCase().includes(logSearch.toLowerCase())) ||
      (log.key_id && log.key_id.toLowerCase().includes(logSearch.toLowerCase())) ||
      (log.log_id && log.log_id.toLowerCase().includes(logSearch.toLowerCase()));

    const matchAction = actionFilter === 'ALL' || 
      (actionFilter === 'BLOCK' && (log.action_taken === 'BLOCK' || log.is_blocked)) ||
      (actionFilter === 'MASK' && log.action_taken === 'MASK') ||
      (actionFilter === 'PASS' && log.action_taken === 'PASS');

    return matchSearch && matchAction;
  });

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>PII 보안 룰 스튜디오 & 금융 감사 포렌식</h1>
          <p>Microsoft Presidio 기반 금융 개인정보 실시간 마스킹 치환 및 전자금융감독규정 준수 WORM 불변 감사 증적</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="badge active" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
            <Lock size={14} /> WORM S3 Object Lock 불변 보관 연동됨
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => { loadRules(); loadLogs(); loadStats(); }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Compliance Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '22px' }}>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>등록 PII 보안 규칙</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
              {stats.active_rules} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {stats.total_rules} 활성</span>
            </div>
          </div>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>누적 WORM 감사 로그</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a855f7', marginTop: '4px' }}>
              {stats.total_audit_logs.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>건</span>
            </div>
          </div>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>PII 마스킹 처리 이벤트</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
              {stats.total_masked_events.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>건</span>
            </div>
          </div>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>규정 위반 즉시 차단 (BLOCK)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f43f5e', marginTop: '4px' }}>
              {stats.total_blocked} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>건</span>
            </div>
          </div>
        </div>
      )}

      {/* Live PII Masking Simulator (Top Demo Feature) */}
      <div className="card" style={{ marginBottom: '24px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
        <div className="card-header">
          <div className="card-title">
            <ShieldAlert size={20} color="#38bdf8" />
            <span>실시간 PII 탐지 & 마스킹 시뮬레이터 (Presidio Live Inspector)</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Envoy ext_proc gRPC 인라인 검사 엔진</span>
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
            <span>{isSimulating ? 'PII 검사 및 마스킹 처리 중...' : '실시간 Presidio 마스킹 검증 실행'}</span>
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
                ext_proc 처리 지연: <span style={{ color: '#38bdf8', fontWeight: 700 }}>{simulationResult.latencyMs.toFixed(3)} ms</span>
                {simulationResult.auditLogId && (
                  <span style={{ marginLeft: '12px', color: '#a855f7' }}>WORM ID: {simulationResult.auditLogId}</span>
                )}
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

            {/* Hashes Integrity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px', fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>원문 SHA-256: </span>
                <span style={{ color: '#94a3b8' }}>{simulationResult.originalHash}</span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>마스킹 페이로드 SHA-256: </span>
                <span style={{ color: '#38bdf8' }}>{simulationResult.maskedHash}</span>
              </div>
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
          <button className="btn btn-primary btn-sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={14} />
            <span>+ 규칙 추가</span>
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rule ID</th>
                <th>탐지 항목명</th>
                <th>식별 정규식 (Regex Pattern)</th>
                <th>신뢰도 임계값</th>
                <th>처리 동작 (Action)</th>
                <th>상태</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.rule_id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#94a3b8' }}>
                    {r.rule_id}
                  </td>
                  <td style={{ fontWeight: 600, color: '#ffffff' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={r.name} 
                      onChange={(e) => setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, name: e.target.value } : item))}
                      style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                    />
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={r.regex_pattern} 
                      onChange={(e) => setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, regex_pattern: e.target.value } : item))}
                      style={{ fontFamily: 'var(--font-mono)', padding: '4px 8px', fontSize: '0.78rem', width: '220px' }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                      <input 
                        type="range" 
                        min="50" 
                        max="99" 
                        value={Math.round(r.confidence_threshold * 100)} 
                        onChange={(e) => setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, confidence_threshold: Number(e.target.value) / 100 } : item))}
                        style={{ width: '70px' }}
                      />
                      <span>{Math.round(r.confidence_threshold * 100)}%</span>
                    </div>
                  </td>
                  <td>
                    <select 
                      className="form-select"
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.78rem' }}
                      value={r.action}
                      onChange={(e) => {
                        setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, action: e.target.value } : item));
                      }}
                    >
                      <option value="MASK">MASK 치환</option>
                      <option value="HASH">가명화 해시</option>
                      <option value="BLOCK">요청 즉시 차단</option>
                    </select>
                  </td>
                  <td>
                    <span 
                      className={`badge ${r.is_active ? 'active' : 'danger'}`} 
                      style={{ cursor: 'pointer' }}
                      onClick={() => setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, is_active: !item.is_active } : item))}
                    >
                      {r.is_active ? '가동 중' : '비활성'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleUpdateRule(r)}
                        style={{ padding: '4px 8px' }}
                      >
                        저장
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDeletingRule(r)}
                        style={{ padding: '4px 8px', color: '#f43f5e' }}
                        title="규칙 삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px' }}>
              <Search size={14} color="var(--text-muted)" />
              <input 
                type="text" 
                placeholder="사번, 키, 로그ID 검색..." 
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', outline: 'none', width: '130px' }}
              />
            </div>
            <select 
              className="form-select" 
              style={{ width: 'auto', padding: '4px 8px', fontSize: '0.78rem' }}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="ALL">전체 조치</option>
              <option value="MASK">마스킹 (MASK)</option>
              <option value="BLOCK">차단 (BLOCK)</option>
              <option value="PASS">통과 (PASS)</option>
            </select>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={handleExportAuditLogs}
            >
              <Download size={14} />
              <span>감사 증적 리포트 출력</span>
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>발생 일시 (KST)</th>
                <th>요청자 식별</th>
                <th>가상 API Key</th>
                <th>호출 모델</th>
                <th>조치 내역</th>
                <th>원문/페이로드 SHA-256</th>
                <th>WORM 불변 스토리지 보관 ID</th>
                <th>규제 준수</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.log_id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#94a3b8' }}>
                    {typeof log.timestamp === 'string' ? log.timestamp.replace('T', ' ').slice(0, 19) : log.timestamp}
                  </td>
                  <td style={{ fontWeight: 600 }}>{log.requester_id}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#38bdf8' }}>
                    {log.key_id || 'sk-orch-direct'}
                  </td>
                  <td>
                    <span className="badge info" style={{ fontSize: '0.72rem' }}>
                      {log.model_id ? log.model_id.split('/')[1] || log.model_id : 'Default'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${log.is_blocked || log.action_taken === 'BLOCK' ? 'danger' : (log.pii_count > 0 ? 'active' : 'info')}`}>
                      {log.action_taken} ({log.pii_count || 0}건)
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <div><span style={{ color: '#64748b' }}>orig:</span> {log.original_prompt_hash ? log.original_prompt_hash.slice(0, 18) + '...' : '-'}</div>
                    <div><span style={{ color: '#38bdf8' }}>mask:</span> {log.masked_payload_hash ? log.masked_payload_hash.slice(0, 18) + '...' : '-'}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#a855f7' }}>
                    {log.worm_reference_id}
                  </td>
                  <td>
                    <span className={`badge ${log.is_blocked ? 'danger' : 'active'}`}>
                      {log.is_blocked ? '차단 완료' : '규제 충족'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add PII Rule Modal */}
      {isAddModalOpen && (
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
          <div className="card" style={{ width: '480px', maxWidth: '95%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>신규 PII 마스킹 규칙 등록</h3>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => setIsAddModalOpen(false)}
                style={{ padding: '4px 6px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRule}>
              <div className="form-group">
                <label className="form-label">Rule ID (식별자)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={newRule.rule_id}
                  onChange={(e) => setNewRule({ ...newRule, rule_id: e.target.value })}
                  placeholder="예: pii-resident-number"
                />
              </div>

              <div className="form-group">
                <label className="form-label">규칙명 (Display Name)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="예: 주민등록번호 마스킹"
                />
              </div>

              <div className="form-group">
                <label className="form-label">식별 항목 유형 (Entity Type)</label>
                <select 
                  className="form-select"
                  value={newRule.entity_type}
                  onChange={(e) => setNewRule({ ...newRule, entity_type: e.target.value })}
                >
                  <option value="RRN">주민등록번호 (RRN)</option>
                  <option value="BANK_ACCOUNT">은행 계좌번호 (BANK_ACCOUNT)</option>
                  <option value="CREDIT_CARD">신용카드 번호 (CREDIT_CARD)</option>
                  <option value="EMPLOYEE_ID">사내 사번/행번 (EMPLOYEE_ID)</option>
                  <option value="PASSPORT">여권번호 (PASSPORT)</option>
                  <option value="PHONE">전화번호 (PHONE)</option>
                  <option value="CUSTOM">사용자 정의 (CUSTOM)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">식별 정규식 (Regex Pattern)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                  value={newRule.regex_pattern}
                  onChange={(e) => setNewRule({ ...newRule, regex_pattern: e.target.value })}
                  placeholder="예: \d{6}-[1-4]\d{6}"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">처리 동작 (Action)</label>
                  <select 
                    className="form-select"
                    value={newRule.action}
                    onChange={(e) => setNewRule({ ...newRule, action: e.target.value })}
                  >
                    <option value="MASK">MASK 치환</option>
                    <option value="HASH">가명화 해시 (HASH)</option>
                    <option value="BLOCK">즉시 차단 (BLOCK)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">신뢰도 임계값</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    max="1" 
                    className="form-input"
                    value={newRule.confidence_threshold}
                    onChange={(e) => setNewRule({ ...newRule, confidence_threshold: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  등록 및 엔진 적용
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Rule Confirmation Modal */}
      {deletingRule && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '440px', maxWidth: '95%', padding: '24px', border: '1px solid rgba(244, 63, 94, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#f43f5e" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f43f5e' }}>PII 규칙 삭제 확인</h3>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => setDeletingRule(null)}
                style={{ padding: '4px 6px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '20px' }}>
              다음 PII 마스킹 규칙을 영구 삭제하시겠습니까?
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: 'rgba(0,0,0,0.35)', 
                borderRadius: '6px', 
                border: '1px solid rgba(255,255,255,0.08)' 
              }}>
                <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{deletingRule.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#94a3b8' }}>ID: {deletingRule.rule_id}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8', marginTop: '4px' }}>패턴: {deletingRule.regex_pattern}</div>
              </div>
              <p style={{ marginTop: '12px', fontSize: '0.82rem', color: '#fca5a5' }}>
                ⚠️ 삭제 즉시 Envoy L7 게이트웨이 및 Presidio 탐지 엔진에서 제외됩니다.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setDeletingRule(null)}
              >
                취소
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                style={{ background: '#e11d48', borderColor: '#e11d48', color: '#fff' }}
                onClick={() => confirmDeleteRule(deletingRule.rule_id)}
              >
                규칙 삭제 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
