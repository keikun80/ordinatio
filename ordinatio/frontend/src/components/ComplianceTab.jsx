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
import { strings } from '../constants/strings';
import { useAuth } from '../context/AuthContext';

// 식별 항목 유형별 기본 추천 정규식 패턴 및 표시 명칭 매핑
const DEFAULT_ENTITY_REGEX_MAP = {
  RRN: {
    regex: '\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])-[1-4]\\d{6}',
    name: '주민등록번호 마스킹',
    action: 'MASK'
  },
  BANK_ACCOUNT: {
    regex: '\\b\\d{3,6}-\\d{2,6}-\\d{3,6}\\b',
    name: '은행 계좌번호 가명화',
    action: 'HASH'
  },
  CREDIT_CARD: {
    regex: '\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b',
    name: '신용카드 번호 마스킹',
    action: 'MASK'
  },
  EMPLOYEE_ID: {
    regex: '\\bEMP-[A-Z]{2}\\d{5}\\b',
    name: '사내 사번/행번 차단',
    action: 'BLOCK'
  },
  PASSPORT: {
    regex: '[A-Z]{1}\\d{8}',
    name: '여권번호 마스킹',
    action: 'MASK'
  },
  PHONE: {
    regex: '01[016789]-\\d{3,4}-\\d{4}',
    name: '휴대전화번호 마스킹',
    action: 'MASK'
  },
  CUSTOM: {
    regex: '',
    name: '',
    action: 'MASK'
  }
};

export default function ComplianceTab({ onNotify }) {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const canWriteCompliance = isSuperAdmin || hasPermission('compliance:write');
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(true);

  // Dynamic Presets State (Single Source of Truth: PostgreSQL)
  const [presets, setPresets] = useState([]);
  const [selectedSample, setSelectedSample] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isAddPresetModalOpen, setIsAddPresetModalOpen] = useState(false);
  const [newPreset, setNewPreset] = useState({ label: '', text: '' });
  const [deletingPresetIndex, setDeletingPresetIndex] = useState(null);

  const [simulationResult, setSimulationResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [stats, setStats] = useState(null);
  const [showWormModal, setShowWormModal] = useState(false);
  const [isVerifyingWorm, setIsVerifyingWorm] = useState(false);
  const [wormVerifyData, setWormVerifyData] = useState(null);

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
      setRules([]);
    }
    setLoadingRules(false);
  };

  const [activeModelId, setActiveModelId] = useState('');
  const [activeKeyId, setActiveKeyId] = useState('');

  const loadLogs = async () => {
    setLoadingLogs(true);
    const logs = await api.getAuditLogs({ limit: 50 });
    if (logs && Array.isArray(logs)) {
      setAuditLogs(logs);
    } else {
      setAuditLogs([]);
    }
    setLoadingLogs(false);
  };

  const loadStats = async () => {
    const s = await api.getComplianceStats();
    if (s) setStats(s);
  };

  const loadPresets = async () => {
    try {
      const data = await api.getPiiPresets();
      if (Array.isArray(data) && data.length > 0) {
        setPresets(data);
        if (!inputText) {
          setInputText(data[0].text);
        }
      }
    } catch (err) {
      console.error('Failed to load presets from backend:', err);
    }
  };

  useEffect(() => {
    loadRules();
    loadLogs();
    loadStats();
    loadPresets();
    api.getModels().then(mList => {
      if (mList && mList.length > 0) {
        const active = mList.find(m => m.is_active) || mList[0];
        setActiveModelId(active.model_id);
      }
    }).catch(() => {});
    api.getVirtualKeys().then(kList => {
      if (Array.isArray(kList) && kList.length > 0) {
        const activeKey = kList.find(k => k.is_active) || kList[0];
        setActiveKeyId(activeKey.key_prefix || activeKey.key_id);
      }
    }).catch(() => {});
  }, []);

  // Live PII Masking Engine (Simulates Presidio + ext_proc)
  const runPiiSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await api.simulatePiiMasking({
        text: inputText,
        requester_id: user?.username || 'admin',
        key_id: activeKeyId || undefined,
        model_id: activeModelId
      });

      setSimulationResult({
        original: res.original_text,
        masked: res.masked_text,
        detected: res.detections.map(d => ({
          type: `${d.rule_name} (${d.entity_type})`,
          action: d.action === 'BLOCK' ? strings.compliance.simulator.actionBlockLabel : (d.action === 'HASH' ? strings.compliance.simulator.actionHashLabel : strings.compliance.simulator.actionMaskLabel),
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
        onNotify('ERROR', strings.compliance.alerts.blockAlert);
      } else if (res.pii_count > 0) {
        onNotify('SUCCESS', strings.compliance.alerts.maskSuccess(res.pii_count));
      } else {
        onNotify('INFO', strings.compliance.alerts.noPii);
      }
    } catch (err) {
      console.error('Simulation error:', err);
      onNotify('ERROR', strings.compliance.alerts.simFailed(err.message));
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSelectSample = (idx) => {
    setSelectedSample(idx);
    if (presets[idx]) {
      setInputText(presets[idx].text);
    }
    setSimulationResult(null);
  };

  const handleAddPreset = async (e) => {
    e.preventDefault();
    if (!newPreset.label.trim() || !newPreset.text.trim()) {
      onNotify('WARNING', strings.compliance.alerts.presetRequired);
      return;
    }
    const labelTrimmed = newPreset.label.trim();
    const textTrimmed = newPreset.text.trim();
    try {
      const created = await api.createPiiPreset({
        label: labelTrimmed,
        text: textTrimmed,
        created_by: user?.username || 'admin'
      });
      const updated = [...presets, created];
      setPresets(updated);
      setSelectedSample(updated.length - 1);
      setInputText(textTrimmed);
      setIsAddPresetModalOpen(false);
      setNewPreset({ label: '', text: '' });
      onNotify('SUCCESS', strings.compliance.alerts.presetAdded(labelTrimmed));
    } catch (err) {
      console.error('Backend create preset failed:', err);
      onNotify('ERROR', `프리셋 저장 실패: ${err.message || '서버 오류'}`);
    }
  };

  const handleDeletePreset = async (idx) => {
    const target = presets[idx];
    if (target?.preset_id) {
      try {
        await api.deletePiiPreset(target.preset_id);
        const updated = presets.filter((_, i) => i !== idx);
        setPresets(updated);
        setDeletingPresetIndex(null);
        if (selectedSample === idx) {
          setSelectedSample(0);
          setInputText(updated[0]?.text || '');
        } else if (selectedSample > idx) {
          setSelectedSample(prev => prev - 1);
        }
        onNotify('INFO', strings.compliance.alerts.presetDeleted(target?.label || ''));
      } catch (err) {
        console.error('Backend delete preset failed:', err);
        onNotify('ERROR', `프리셋 삭제 실패: ${err.message || '서버 오류'}`);
      }
    }
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
      onNotify('SUCCESS', strings.compliance.alerts.ruleUpdated(rule.name));
      loadRules();
      loadStats();
    } catch (err) {
      onNotify('ERROR', strings.compliance.alerts.ruleUpdateFailed(err.message));
    }
  };

  // Rule Delete
  const confirmDeleteRule = async (ruleId) => {
    try {
      // Optimistic UI update
      setRules(prev => prev.filter(r => r.rule_id !== ruleId));
      setDeletingRule(null);
      await api.deletePiiRule(ruleId);
      onNotify('SUCCESS', strings.compliance.alerts.ruleDeleted(ruleId));
      loadRules();
      loadStats();
    } catch (err) {
      onNotify('ERROR', strings.compliance.alerts.ruleDeleteFailed(err.message));
      loadRules();
    }
  };

  // Open Add Rule Modal with initial default entity type preset
  const handleOpenAddModal = () => {
    if (!canWriteCompliance) return;
    const initialType = 'RRN';
    const preset = DEFAULT_ENTITY_REGEX_MAP[initialType];
    setNewRule({
      rule_id: 'pii-custom-' + Math.floor(Math.random() * 1000),
      name: preset?.name || '',
      entity_type: initialType,
      regex_pattern: preset?.regex || '',
      confidence_threshold: 0.85,
      action: preset?.action || 'MASK',
      is_active: true
    });
    setIsAddModalOpen(true);
  };

  // Add Rule
  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      await api.createPiiRule(newRule);
      onNotify('SUCCESS', strings.compliance.alerts.ruleAdded(newRule.name));
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
      onNotify('ERROR', strings.compliance.alerts.ruleAddFailed(err.message));
    }
  };

  // Export Forensic Audit Report (JSON / CSV)
  // Export WORM Audit Logs via Backend Streaming API
  const handleExportAuditLogs = async () => {
    try {
      await api.exportAuditLogs({
        requester_id: logSearch || undefined,
        action_taken: actionFilter !== 'ALL' ? actionFilter : undefined
      });
      onNotify('SUCCESS', strings.compliance.alerts.reportDownloaded);
    } catch (err) {
      console.error('Audit export failed:', err);
      // Client-side fallback if server streaming fails
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `ordinatio_worm_forensics_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      onNotify('SUCCESS', strings.compliance.alerts.reportDownloaded);
    }
  };

  // Filtered Audit Logs with Full-Field Search
  const filteredLogs = auditLogs.filter(log => {
    const query = logSearch.trim().toLowerCase();
    
    let matchSearch = true;
    if (query) {
      const actionText = (log.action_taken || '').toLowerCase();
      const isBlocked = log.is_blocked || log.action_taken === 'BLOCK';
      const koreanAction = isBlocked ? strings.compliance.auditLog.actionBlockedTag : (log.pii_count > 0 ? strings.compliance.auditLog.actionMaskedTag : strings.compliance.auditLog.actionPassedTag);

      matchSearch = 
        (log.requester_id && log.requester_id.toLowerCase().includes(query)) ||
        (log.key_id && log.key_id.toLowerCase().includes(query)) ||
        (log.log_id && log.log_id.toLowerCase().includes(query)) ||
        (log.worm_reference_id && log.worm_reference_id.toLowerCase().includes(query)) ||
        (log.model_id && log.model_id.toLowerCase().includes(query)) ||
        (log.original_prompt_hash && log.original_prompt_hash.toLowerCase().includes(query)) ||
        (log.masked_payload_hash && log.masked_payload_hash.toLowerCase().includes(query)) ||
        (log.timestamp && String(log.timestamp).toLowerCase().includes(query)) ||
        actionText.includes(query) ||
        koreanAction.includes(query);
    }

    const matchAction = actionFilter === 'ALL' || 
      (actionFilter === 'BLOCK' && (log.action_taken === 'BLOCK' || log.is_blocked)) ||
      (actionFilter === 'MASK' && (log.action_taken === 'MASK' || (!log.is_blocked && log.pii_count > 0))) ||
      (actionFilter === 'PASS' && log.action_taken === 'PASS');

    return matchSearch && matchAction;
  });

  return (
    <div className="tab-pane" data-testid="scr-compliance-view" data-screen-id="SCR-CP-01">
      {/* Page Header */}
      <div className="page-header" data-testid="comp-header">
        <div className="page-title-wrap">
          <h1>{strings.compliance.headerTitle}</h1>
          <p>{strings.compliance.headerSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className="badge active" 
            data-testid="comp-btn-verify-worm"
            data-function-id="FNC-CP-VERIFY-WORM"
            style={{ 
              padding: '6px 12px', 
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.15)',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setShowWormModal(true)}
            title={strings.compliance.btnVerifyWormTitle}
          >
            <Lock size={14} /> {strings.compliance.btnVerifyWorm}
          </button>
          <button 
            className="btn btn-secondary btn-sm" 
            data-testid="comp-btn-refresh"
            data-function-id="FNC-CP-REFRESH"
            onClick={() => { loadRules(); loadLogs(); loadStats(); }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Compliance Stats Cards */}
      {stats && (
        <div data-testid="comp-card-kpi" data-screen-id="SCR-CP-02" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '22px' }}>
          <div className="card" data-testid="comp-kpi-card-rules" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.compliance.kpi.activeRules}</div>
            <div className="kpi-value" data-testid="comp-kpi-val-rules" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
              {stats.active_rules} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {stats.total_rules} {strings.common.active}</span>
            </div>
          </div>
          <div className="card" data-testid="comp-kpi-card-logs" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.compliance.kpi.totalAuditLogs}</div>
            <div className="kpi-value" data-testid="comp-kpi-val-logs" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a855f7', marginTop: '4px' }}>
              {stats.total_audit_logs.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{strings.compliance.kpi.countUnit}</span>
            </div>
          </div>
          <div className="card" data-testid="comp-kpi-card-masked" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.compliance.kpi.totalMaskedEvents}</div>
            <div className="kpi-value" data-testid="comp-kpi-val-masked" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
              {stats.total_masked_events.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{strings.compliance.kpi.countUnit}</span>
            </div>
          </div>
          <div className="card" data-testid="comp-kpi-card-blocked" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.compliance.kpi.totalBlocked}</div>
            <div className="kpi-value" data-testid="comp-kpi-val-blocked" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f43f5e', marginTop: '4px' }}>
              {stats.total_blocked} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{strings.compliance.kpi.countUnit}</span>
            </div>
          </div>
        </div>
      )}

      {/* Live PII Masking Simulator (Top Demo Feature) */}
      <div className="card" data-testid="comp-card-simulator" data-screen-id="SCR-CP-03" style={{ marginBottom: '24px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
        <div className="card-header">
          <div className="card-title">
            <ShieldAlert size={20} color="#38bdf8" />
            <span>{strings.compliance.simulator.simCardTitle}</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.compliance.simulator.simCardSubtitle}</span>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>{strings.compliance.simulator.presetLabel}</label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="comp-btn-add-preset"
              data-function-id="FNC-CP-ADD-PRESET"
              onClick={() => {
                setNewPreset({ label: '', text: inputText || '' });
                setIsAddPresetModalOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 10px' }}
            >
              <Plus size={14} />
              <span>{strings.compliance.simulator.btnAddPreset}</span>
            </button>
          </div>
          <div data-testid="comp-preset-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {presets.map((p, idx) => (
              <div 
                key={idx}
                data-testid={`comp-preset-item-${idx}`}
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center',
                  borderRadius: 'var(--radius-sm)',
                  border: selectedSample === idx ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                  background: selectedSample === idx ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  overflow: 'hidden',
                  transition: 'all 0.2s'
                }}
              >
                <button
                  type="button"
                  data-testid={`comp-btn-select-preset-${idx}`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: selectedSample === idx ? '#38bdf8' : 'var(--text-secondary)',
                    padding: '6px 12px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontWeight: selectedSample === idx ? 600 : 400
                  }}
                  onClick={() => handleSelectSample(idx)}
                >
                  {p.label}
                </button>
                <button
                  type="button"
                  data-testid={`comp-btn-delete-preset-${idx}`}
                  title={strings.compliance.simulator.btnDeletePresetTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingPresetIndex(idx);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    padding: '6px 8px 6px 2px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#f43f5e'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{strings.compliance.simulator.inputPromptLabel}</label>
          <textarea
            className="form-textarea"
            data-testid="comp-textarea-input"
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
          <button 
            className="btn btn-primary" 
            data-testid="comp-btn-run-simulation" 
            data-function-id="FNC-CP-RUN-SIM"
            onClick={runPiiSimulation} 
            disabled={isSimulating}
          >
            <Play size={16} />
            <span>{isSimulating ? strings.compliance.simulator.btnSimulating : strings.compliance.simulator.btnSimulate}</span>
          </button>
        </div>

        {/* Simulation Output Area */}
        {simulationResult && (
          <div data-testid="comp-simulation-result-box" style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div data-testid="comp-simulation-status" style={{ fontWeight: 600, fontSize: '0.9rem', color: simulationResult.isBlocked ? '#f43f5e' : '#34d399' }}>
                {simulationResult.isBlocked ? strings.compliance.simulator.resultBlocked : strings.compliance.simulator.resultMasked}
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {strings.compliance.simulator.latencyLabel} <span data-testid="comp-simulation-latency" style={{ color: '#38bdf8', fontWeight: 700 }}>{simulationResult.latencyMs.toFixed(3)} ms</span>
                {simulationResult.auditLogId && (
                  <span data-testid="comp-simulation-worm-id" style={{ marginLeft: '12px', color: '#a855f7' }}>WORM ID: {simulationResult.auditLogId}</span>
                )}
              </div>
            </div>

            <div 
              data-testid="comp-simulation-masked-text"
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
                <span style={{ color: 'var(--text-muted)' }}>{strings.compliance.simulator.rawShaLabel}</span>
                <span data-testid="comp-simulation-original-hash" style={{ color: '#94a3b8' }}>{simulationResult.originalHash}</span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{strings.compliance.simulator.maskedShaLabel}</span>
                <span data-testid="comp-simulation-masked-hash" style={{ color: '#38bdf8' }}>{simulationResult.maskedHash}</span>
              </div>
            </div>

            {simulationResult.detected.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{strings.compliance.simulator.detectionDetails}</div>
                <div data-testid="comp-simulation-detected-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {simulationResult.detected.map((d, i) => (
                    <span 
                      key={i} 
                      data-testid={`comp-simulation-detected-item-${i}`}
                      className={`badge ${d.action.includes(strings.compliance.auditLog.actionBlockedTag) || d.action.includes('BLOCK') ? 'danger' : 'active'}`}
                      style={{ padding: '5px 10px' }}
                    >
                      {d.type}: {d.action} ({strings.compliance.simulator.confidenceLabel} {d.confidence})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PII Rules Management Table */}
      <div className="card" data-testid="comp-card-rules" data-screen-id="SCR-CP-04" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div className="card-title">
            <Sliders size={18} color="#06b6d4" />
            <span>{strings.compliance.rules.title}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {!canWriteCompliance && (
              <span className="badge warning" data-testid="comp-badge-readonly" style={{ fontSize: '0.78rem' }}>
                {strings.virtualKeys.readOnlyBadge}
              </span>
            )}
            <button
              className="btn btn-primary btn-sm"
              data-testid="comp-btn-open-add-rule"
              data-function-id="FNC-CP-OPEN-ADD-RULE"
              disabled={!canWriteCompliance}
              onClick={handleOpenAddModal}
              style={{ opacity: canWriteCompliance ? 1 : 0.45, cursor: canWriteCompliance ? 'pointer' : 'not-allowed' }}
            >
              <Plus size={14} />
              <span>{strings.compliance.rules.btnAddRule}</span>
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table" data-testid="comp-table-rules">
            <thead>
              <tr>
                <th>Rule ID</th>
                <th>{strings.compliance.rules.thRuleName}</th>
                <th>{strings.compliance.rules.thRegex}</th>
                <th>{strings.compliance.rules.thConfidence}</th>
                <th>{strings.compliance.rules.thAction}</th>
                <th>{strings.compliance.rules.thStatus}</th>
                <th>{strings.compliance.rules.thManage}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.rule_id} data-testid={`comp-row-rule-${r.rule_id}`}>
                  <td data-testid={`comp-cell-rule-id-${r.rule_id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#94a3b8' }}>
                    {r.rule_id}
                  </td>
                  <td style={{ fontWeight: 600, color: '#ffffff' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      data-testid={`comp-input-rule-name-${r.rule_id}`}
                      disabled={!canWriteCompliance}
                      value={r.name} 
                      onChange={(e) => canWriteCompliance && setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, name: e.target.value } : item))}
                      style={{ padding: '4px 8px', fontSize: '0.85rem', opacity: canWriteCompliance ? 1 : 0.65 }}
                    />
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      data-testid={`comp-input-rule-regex-${r.rule_id}`}
                      disabled={!canWriteCompliance}
                      value={r.regex_pattern} 
                      onChange={(e) => canWriteCompliance && setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, regex_pattern: e.target.value } : item))}
                      style={{ fontFamily: 'var(--font-mono)', padding: '4px 8px', fontSize: '0.78rem', width: '220px', opacity: canWriteCompliance ? 1 : 0.65 }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                      <input 
                        type="range" 
                        min="50" 
                        max="99" 
                        data-testid={`comp-slider-rule-conf-${r.rule_id}`}
                        disabled={!canWriteCompliance}
                        value={Math.round(r.confidence_threshold * 100)} 
                        onChange={(e) => canWriteCompliance && setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, confidence_threshold: Number(e.target.value) / 100 } : item))}
                        style={{ width: '70px', cursor: canWriteCompliance ? 'pointer' : 'not-allowed' }}
                      />
                      <span data-testid={`comp-val-rule-conf-${r.rule_id}`}>{Math.round(r.confidence_threshold * 100)}%</span>
                    </div>
                  </td>
                  <td>
                    <select 
                      className="form-select"
                      data-testid={`comp-select-rule-action-${r.rule_id}`}
                      disabled={!canWriteCompliance}
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.78rem', opacity: canWriteCompliance ? 1 : 0.65 }}
                      value={r.action}
                      onChange={(e) => {
                        if (!canWriteCompliance) return;
                        setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, action: e.target.value } : item));
                      }}
                    >
                      <option value="MASK">{strings.compliance.rules.optMask}</option>
                      <option value="HASH">{strings.compliance.rules.optHash}</option>
                      <option value="BLOCK">{strings.compliance.rules.optBlock}</option>
                    </select>
                  </td>
                  <td>
                    <span 
                      className={`badge ${r.is_active ? 'active' : 'danger'}`} 
                      data-testid={`comp-badge-rule-status-${r.rule_id}`}
                      style={{ cursor: canWriteCompliance ? 'pointer' : 'not-allowed', opacity: canWriteCompliance ? 1 : 0.65 }}
                      onClick={() => canWriteCompliance && setRules(rules.map(item => item.rule_id === r.rule_id ? { ...item, is_active: !item.is_active } : item))}
                    >
                      {r.is_active ? strings.compliance.rules.statusRunning : strings.compliance.rules.statusInactive}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        data-testid={`comp-btn-save-rule-${r.rule_id}`}
                        data-function-id="FNC-CP-SAVE-RULE"
                        disabled={!canWriteCompliance}
                        onClick={() => canWriteCompliance && handleUpdateRule(r)}
                        style={{ padding: '4px 8px', opacity: canWriteCompliance ? 1 : 0.45, cursor: canWriteCompliance ? 'pointer' : 'not-allowed' }}
                      >
                        {strings.common.save}
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        data-testid={`comp-btn-delete-rule-${r.rule_id}`}
                        data-function-id="FNC-CP-DELETE-RULE"
                        disabled={!canWriteCompliance}
                        onClick={() => canWriteCompliance && setDeletingRule(r)}
                        style={{ padding: '4px 8px', color: '#f43f5e', opacity: canWriteCompliance ? 1 : 0.45, cursor: canWriteCompliance ? 'pointer' : 'not-allowed' }}
                        title={strings.compliance.rules.btnDeleteRuleTitle}
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
      <div className="card" data-testid="comp-card-audit-logs" data-screen-id="SCR-CP-05">
        <div className="card-header">
          <div className="card-title">
            <FileText size={18} color="#a855f7" />
            <span>{strings.compliance.auditLog.wormLogTitle}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-subtle)',
              padding: '4px 10px', 
              borderRadius: 'var(--radius-sm)' 
            }}>
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                data-testid="comp-input-log-search"
                placeholder={strings.compliance.auditLog.searchPlaceholder} 
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--text-primary)', 
                  fontSize: '0.82rem', 
                  outline: 'none', 
                  width: '230px' 
                }}
              />
              {logSearch && (
                <button
                  type="button"
                  data-testid="comp-btn-clear-search"
                  onClick={() => setLogSearch('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                  title={strings.compliance.auditLog.clearSearchTitle}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <select 
              className="form-select" 
              data-testid="comp-select-log-filter"
              style={{ width: 'auto', padding: '4px 8px', fontSize: '0.78rem' }}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="ALL">{strings.compliance.auditLog.filterAllActions}</option>
              <option value="MASK">{strings.compliance.auditLog.filterActionMask}</option>
              <option value="BLOCK">{strings.compliance.auditLog.filterActionBlock}</option>
              <option value="PASS">{strings.compliance.auditLog.filterActionPass}</option>
            </select>
            <button 
              className="btn btn-secondary btn-sm"
              data-testid="comp-btn-export-logs"
              data-function-id="FNC-CP-EXPORT-LOGS"
              onClick={handleExportAuditLogs}
            >
              <Download size={14} />
              <span>{strings.compliance.auditLog.btnExportReport}</span>
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table" data-testid="comp-table-audit-logs">
            <thead>
              <tr>
                <th>{strings.compliance.auditLog.thKstTime}</th>
                <th>{strings.compliance.auditLog.thRequester}</th>
                <th>API Key</th>
                <th>{strings.compliance.auditLog.thModel}</th>
                <th>{strings.compliance.auditLog.thActionTaken}</th>
                <th>{strings.compliance.auditLog.thSha256}</th>
                <th>{strings.compliance.auditLog.thWormId}</th>
                <th>{strings.compliance.auditLog.thCompliance}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '0.92rem', marginBottom: '8px' }}>
                      {strings.compliance.auditLog.noLogsFound}
                    </div>
                    {(logSearch || actionFilter !== 'ALL') && (
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm"
                        data-testid="comp-btn-reset-filter"
                        onClick={() => { setLogSearch(''); setActionFilter('ALL'); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                      >
                        <RefreshCw size={12} />
                        <span>{strings.compliance.auditLog.btnResetFilter}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                <tr key={log.log_id} data-testid={`comp-row-log-${log.log_id}`}>
                  <td data-testid={`comp-cell-log-time-${log.log_id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#94a3b8' }}>
                    {typeof log.timestamp === 'string' ? log.timestamp.replace('T', ' ').slice(0, 19) : log.timestamp}
                  </td>
                  <td data-testid={`comp-cell-log-user-${log.log_id}`} style={{ fontWeight: 600 }}>{log.requester_id}</td>
                  <td data-testid={`comp-cell-log-key-${log.log_id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#38bdf8' }}>
                    {log.key_id || 'sk-ord-direct'}
                  </td>
                  <td>
                    <span className="badge info" data-testid={`comp-cell-log-model-${log.log_id}`} style={{ fontSize: '0.72rem' }}>
                      {log.model_id ? log.model_id.split('/')[1] || log.model_id : 'Default'}
                    </span>
                  </td>
                  <td>
                    <span data-testid={`comp-badge-log-action-${log.log_id}`} className={`badge ${log.is_blocked || log.action_taken === 'BLOCK' ? 'danger' : (log.pii_count > 0 ? 'active' : 'info')}`}>
                      {log.action_taken} ({log.pii_count || 0}{strings.compliance.kpi.countUnit})
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <div><span style={{ color: '#64748b' }}>orig:</span> {log.original_prompt_hash ? log.original_prompt_hash.slice(0, 18) + '...' : '-'}</div>
                    <div><span style={{ color: '#38bdf8' }}>mask:</span> {log.masked_payload_hash ? log.masked_payload_hash.slice(0, 18) + '...' : '-'}</div>
                  </td>
                  <td data-testid={`comp-cell-log-worm-${log.log_id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#a855f7' }}>
                    {log.worm_reference_id}
                  </td>
                  <td>
                    <span data-testid={`comp-badge-log-status-${log.log_id}`} className={`badge ${log.is_blocked ? 'danger' : 'active'}`}>
                      {log.is_blocked ? strings.compliance.auditLog.statusBlockedDone : strings.compliance.auditLog.statusCompliant}
                    </span>
                  </td>
                </tr>
              ))
            )}
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
          <div className="card" data-testid="comp-modal-add-rule" data-screen-id="SCR-CP-M01" style={{ width: '480px', maxWidth: '95%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{strings.compliance.addRuleModal.title}</h3>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                data-testid="comp-modal-add-rule-btn-close"
                data-function-id="FNC-CP-MODAL-CLOSE"
                onClick={() => setIsAddModalOpen(false)}
                style={{ padding: '4px 6px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRule}>
              <div className="form-group">
                <label className="form-label">{strings.compliance.addRuleModal.idLabel}</label>
                <input 
                  type="text" 
                  className="form-input" 
                  data-testid="comp-modal-input-rule-id"
                  required
                  value={newRule.rule_id}
                  onChange={(e) => setNewRule({ ...newRule, rule_id: e.target.value })}
                  placeholder={strings.compliance.addRuleModal.idPlaceholder}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{strings.compliance.addRuleModal.nameLabel}</label>
                <input 
                  type="text" 
                  className="form-input" 
                  data-testid="comp-modal-input-rule-name"
                  required
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder={strings.compliance.addRuleModal.namePlaceholder}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{strings.compliance.addRuleModal.entityTypeLabel}</label>
                <select 
                  className="form-select"
                  data-testid="comp-modal-select-rule-type"
                  value={newRule.entity_type}
                  onChange={(e) => {
                    const selectedType = e.target.value;
                    const matchedPreset = DEFAULT_ENTITY_REGEX_MAP[selectedType];
                    setNewRule((prev) => ({
                      ...prev,
                      entity_type: selectedType,
                      name: matchedPreset?.name && !prev.name ? matchedPreset.name : prev.name,
                      regex_pattern: matchedPreset ? matchedPreset.regex : prev.regex_pattern,
                      action: matchedPreset?.action || prev.action
                    }));
                  }}
                >
                  <option value="RRN">{strings.compliance.addRuleModal.types.rrn}</option>
                  <option value="BANK_ACCOUNT">{strings.compliance.addRuleModal.types.bank}</option>
                  <option value="CREDIT_CARD">{strings.compliance.addRuleModal.types.card}</option>
                  <option value="EMPLOYEE_ID">{strings.compliance.addRuleModal.types.employee}</option>
                  <option value="PASSPORT">{strings.compliance.addRuleModal.types.passport}</option>
                  <option value="PHONE">{strings.compliance.addRuleModal.types.phone}</option>
                  <option value="CUSTOM">{strings.compliance.addRuleModal.types.custom}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{strings.compliance.addRuleModal.regexLabel}</label>
                <input 
                  type="text" 
                  className="form-input" 
                  data-testid="comp-modal-input-rule-regex"
                  required
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                  value={newRule.regex_pattern}
                  onChange={(e) => setNewRule({ ...newRule, regex_pattern: e.target.value })}
                  placeholder={strings.compliance.addRuleModal.regexPlaceholder}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">{strings.compliance.addRuleModal.actionLabel}</label>
                  <select 
                    className="form-select"
                    data-testid="comp-modal-select-rule-action"
                    value={newRule.action}
                    onChange={(e) => setNewRule({ ...newRule, action: e.target.value })}
                  >
                    <option value="MASK">{strings.compliance.addRuleModal.actionMask}</option>
                    <option value="HASH">{strings.compliance.addRuleModal.actionHash}</option>
                    <option value="BLOCK">{strings.compliance.addRuleModal.actionBlock}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.compliance.addRuleModal.confidenceLabel}</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    max="1" 
                    className="form-input"
                    data-testid="comp-modal-input-rule-conf"
                    value={newRule.confidence_threshold}
                    onChange={(e) => setNewRule({ ...newRule, confidence_threshold: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  data-testid="comp-modal-add-rule-btn-cancel"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  {strings.common.cancel}
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  data-testid="comp-modal-add-rule-btn-submit"
                  data-function-id="FNC-CP-SUBMIT-ADD-RULE"
                >
                  {strings.compliance.addRuleModal.btnSubmit}
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
          <div className="card" data-testid="comp-modal-delete-rule" data-screen-id="SCR-CP-M02" style={{ width: '440px', maxWidth: '95%', padding: '24px', border: '1px solid rgba(244, 63, 94, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#f43f5e" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f43f5e' }}>{strings.compliance.deleteRuleModal.title}</h3>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                data-testid="comp-modal-delete-rule-btn-close"
                data-function-id="FNC-CP-MODAL-CLOSE"
                onClick={() => setDeletingRule(null)}
                style={{ padding: '4px 6px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '20px' }}>
              {strings.compliance.deleteRuleModal.confirmMessage}
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: 'rgba(0,0,0,0.35)', 
                borderRadius: '6px', 
                border: '1px solid rgba(255,255,255,0.08)' 
              }}>
                <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{deletingRule.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#94a3b8' }}>ID: {deletingRule.rule_id}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8', marginTop: '4px' }}>Regex: {deletingRule.regex_pattern}</div>
              </div>
              <p style={{ marginTop: '12px', fontSize: '0.82rem', color: '#fca5a5' }}>
                {strings.compliance.deleteRuleModal.warning}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                data-testid="comp-modal-delete-rule-btn-cancel"
                onClick={() => setDeletingRule(null)}
              >
                {strings.common.cancel}
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                data-testid="comp-modal-delete-rule-btn-confirm"
                data-function-id="FNC-CP-CONFIRM-DELETE-RULE"
                style={{ background: '#e11d48', borderColor: '#e11d48', color: '#fff' }}
                onClick={() => confirmDeleteRule(deletingRule.rule_id)}
              >
                {strings.compliance.deleteRuleModal.btnConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Preset Modal */}
      {isAddPresetModalOpen && (
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
          <div className="card" data-testid="comp-modal-add-preset" data-screen-id="SCR-CP-M03" style={{ width: '520px', maxWidth: '95%', padding: '24px', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{strings.compliance.addPresetModal.title}</h3>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                data-testid="comp-modal-add-preset-btn-close"
                data-function-id="FNC-CP-MODAL-CLOSE"
                onClick={() => setIsAddPresetModalOpen(false)}
                style={{ padding: '4px 6px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddPreset}>
              <div className="form-group">
                <label className="form-label">{strings.compliance.addPresetModal.labelLabel}</label>
                <input 
                  type="text" 
                  className="form-input" 
                  data-testid="comp-modal-input-preset-label"
                  required
                  value={newPreset.label}
                  onChange={(e) => setNewPreset({ ...newPreset, label: e.target.value })}
                  placeholder={strings.compliance.addPresetModal.labelPlaceholder}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{strings.compliance.addPresetModal.contentLabel}</label>
                <textarea 
                  className="form-textarea" 
                  data-testid="comp-modal-textarea-preset-text"
                  rows={4}
                  required
                  style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}
                  value={newPreset.text}
                  onChange={(e) => setNewPreset({ ...newPreset, text: e.target.value })}
                  placeholder={strings.compliance.addPresetModal.contentPlaceholder}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  data-testid="comp-modal-add-preset-btn-cancel"
                  onClick={() => setIsAddPresetModalOpen(false)}
                >
                  {strings.common.cancel}
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  data-testid="comp-modal-add-preset-btn-submit"
                  data-function-id="FNC-CP-SUBMIT-ADD-PRESET"
                >
                  {strings.compliance.addPresetModal.btnSubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Preset Confirmation Modal */}
      {deletingPresetIndex !== null && presets[deletingPresetIndex] && (
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
          <div className="card" data-testid="comp-modal-delete-preset" data-screen-id="SCR-CP-M04" style={{ width: '440px', maxWidth: '95%', padding: '24px', border: '1px solid rgba(244, 63, 94, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#f43f5e" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f43f5e' }}>{strings.compliance.deletePresetModal.title}</h3>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                data-testid="comp-modal-delete-preset-btn-close"
                data-function-id="FNC-CP-MODAL-CLOSE"
                onClick={() => setDeletingPresetIndex(null)}
                style={{ padding: '4px 6px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '20px' }}>
              {strings.compliance.deletePresetModal.confirmMessage}
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: 'rgba(0,0,0,0.35)', 
                borderRadius: '6px', 
                border: '1px solid rgba(255,255,255,0.08)' 
              }}>
                <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                  {presets[deletingPresetIndex].label}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {presets[deletingPresetIndex].text}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                data-testid="comp-modal-delete-preset-btn-cancel"
                onClick={() => setDeletingPresetIndex(null)}
              >
                {strings.common.cancel}
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                data-testid="comp-modal-delete-preset-btn-confirm"
                data-function-id="FNC-CP-CONFIRM-DELETE-PRESET"
                style={{ background: '#e11d48', borderColor: '#e11d48', color: '#fff' }}
                onClick={() => handleDeletePreset(deletingPresetIndex)}
              >
                {strings.compliance.deletePresetModal.btnConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORM Integrity Verification Modal */}
      {showWormModal && (
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
          <div className="card" data-testid="comp-modal-worm-verify" data-screen-id="SCR-CP-M05" style={{ width: '560px', maxWidth: '95%', padding: '24px', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#10b981', fontWeight: 700 }}>{strings.compliance.wormModal.title}</h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.compliance.wormModal.subtitle}</div>
                </div>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                data-testid="comp-modal-worm-btn-close-header"
                data-function-id="FNC-CP-MODAL-CLOSE"
                onClick={() => setShowWormModal(false)}
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{strings.compliance.wormModal.storageStatus}</span>
                  <span className="badge active" data-testid="comp-modal-worm-badge-storage" style={{ fontSize: '0.72rem' }}>{strings.compliance.wormModal.storageStatusActive}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {strings.compliance.wormModal.storageDesc}
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{strings.compliance.wormModal.hashChainStatus}</span>
                  <span className="badge active" data-testid="comp-modal-worm-badge-merkle" style={{ fontSize: '0.72rem' }}>SHA-256 Merkle Chain</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {strings.compliance.wormModal.hashChainDesc}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.compliance.wormModal.totalRecords}</div>
                  <div data-testid="comp-modal-worm-val-records" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
                    {wormVerifyData ? wormVerifyData.total_records.toLocaleString() : (stats?.total_logs || auditLogs.length).toLocaleString()} {strings.compliance.kpi.countUnit}
                  </div>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.compliance.wormModal.tamperCount}</div>
                  <div data-testid="comp-modal-worm-val-tamper" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>
                    {wormVerifyData ? `${wormVerifyData.tampered_records}건 (${wormVerifyData.status === 'VERIFIED' ? '무결성 100%' : '변조 감지'})` : strings.compliance.wormModal.tamperZero}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                data-testid="comp-modal-worm-btn-close"
                data-function-id="FNC-CP-MODAL-CLOSE"
                onClick={() => setShowWormModal(false)}
              >
                {strings.common.close}
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                data-testid="comp-modal-worm-btn-reverify"
                data-function-id="FNC-CP-REVERIFY-WORM"
                disabled={isVerifyingWorm}
                onClick={async () => {
                  setIsVerifyingWorm(true);
                  try {
                    const [_, __, wormRes] = await Promise.all([
                      loadLogs(),
                      loadStats(),
                      api.verifyWormIntegrity().catch(() => null)
                    ]);
                    if (wormRes) {
                      setWormVerifyData(wormRes);
                    }
                    if (onNotify) onNotify('SUCCESS', strings.compliance.alerts.wormVerified);
                  } finally {
                    setIsVerifyingWorm(false);
                  }
                }}
              >
                <RefreshCw size={14} className={isVerifyingWorm ? "spin-animation" : ""} />
                <span>{isVerifyingWorm ? strings.compliance.wormModal.btnVerifying : strings.compliance.wormModal.btnReverify}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
