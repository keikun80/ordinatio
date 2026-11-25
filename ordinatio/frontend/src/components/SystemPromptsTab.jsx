import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Plus,
  Search,
  Sparkles,
  Sliders,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  ArrowRight,
  ShieldCheck,
  Check,
  KeyRound,
  GitFork,
  Users,
  Globe
} from 'lucide-react';
import { apiClient } from '../api/client';
import { strings } from '../constants/strings';
import { useAuth } from '../context/AuthContext';

export default function SystemPromptsTab({ onNotify }) {
  const { isSuperAdmin, hasPermission } = useAuth();
  const canWritePrompts = isSuperAdmin || hasPermission('prompts:write');
  const [prompts, setPrompts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [virtualKeys, setVirtualKeys] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null); // null means new creation
  const [promptToDelete, setPromptToDelete] = useState(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  // Form States for Creation/Edit
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTargetType, setFormTargetType] = useState('ROUTE'); // ROUTE, VIRTUAL_KEY, TENANT, GLOBAL
  const [formTargetId, setFormTargetId] = useState('');
  const [formInjectionMode, setFormInjectionMode] = useState('PREPEND');
  const [formIsActive, setFormIsActive] = useState(true);

  // Simulator States
  const [simKeyId, setSimKeyId] = useState('');
  const [simRouteName, setSimRouteName] = useState('');
  const [simTenantId, setSimTenantId] = useState('');
  const [simUserMessage, setSimUserMessage] = useState(strings.systemPrompts.defaultSimUserMessage);
  const [simClientSysMsg, setSimClientSysMsg] = useState('');
  const [simResult, setSimResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [templates, setTemplates] = useState([]);

  // Default Quick Templates Fallback
  const DEFAULT_TEMPLATES = [
    {
      label: strings.systemPrompts.presets.guardrailLabel,
      name: strings.systemPrompts.presets.guardrailName,
      desc: strings.systemPrompts.presets.guardrailDesc,
      targetType: 'GLOBAL',
      content: strings.systemPrompts.presets.guardrailContent
    },
    {
      label: strings.systemPrompts.presets.wmLabel,
      name: strings.systemPrompts.presets.wmName,
      desc: strings.systemPrompts.presets.wmDesc,
      targetType: 'TENANT',
      content: strings.systemPrompts.presets.wmContent
    },
    {
      label: strings.systemPrompts.presets.secureCodeLabel,
      name: strings.systemPrompts.presets.secureCodeName,
      desc: strings.systemPrompts.presets.secureCodeDesc,
      targetType: 'ROUTE',
      content: strings.systemPrompts.presets.secureCodeContent
    }
  ];

  // Load Data
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [promptList, routeList, keyList, tenantList, publicSettings] = await Promise.all([
        apiClient.getSystemPrompts(),
        apiClient.getRoutes(),
        apiClient.getVirtualKeys(),
        apiClient.getTenants(),
        apiClient.getPublicSettings().catch(() => ({}))
      ]);

      if (publicSettings && Array.isArray(publicSettings.prompt_templates) && publicSettings.prompt_templates.length > 0) {
        setTemplates(publicSettings.prompt_templates);
      } else {
        setTemplates(DEFAULT_TEMPLATES);
      }

      setPrompts(Array.isArray(promptList) ? promptList : []);
      setRoutes(Array.isArray(routeList) ? routeList : []);
      setVirtualKeys(Array.isArray(keyList) ? keyList : []);
      setTenants(Array.isArray(tenantList) ? tenantList : []);
    } catch (e) {
      console.error('Failed to load system prompts data:', e);
      onNotify('ERROR', strings.systemPrompts.alerts.loadFailed);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Filtered List
  const filteredPrompts = prompts.filter((p) => {
    const matchesFilter = selectedFilter === 'ALL' || p.target_type === selectedFilter;
    const matchesSearch = !searchTerm.trim() ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.target_name && p.target_name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  // Calculate estimated tokens with CJK/Latin weighted heuristics
  const calculateEstimatedTokens = (text) => {
    if (!text) return 0;
    let cjkCount = 0;
    let otherCount = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x30ff)) {
        cjkCount++;
      } else {
        otherCount++;
      }
    }
    const words = text.replace(/[\uac00-\ud7a3\u4e00-\u9fff\u3040-\u30ff]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const otherTokens = Math.floor(words.length * 1.3) + Math.floor((otherCount - words.join('').length) / 4);
    const cjkTokens = Math.floor(cjkCount * 0.65);
    return Math.max(1, cjkTokens + otherTokens);
  };
  const estimatedTokens = calculateEstimatedTokens(formContent);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingPrompt(null);
    setFormName('');
    setFormDesc('');
    setFormContent('');
    setFormTargetType('ROUTE');
    setFormTargetId(routes.length > 0 ? routes[0].route_name : '');
    setFormInjectionMode('PREPEND');
    setFormIsActive(true);
    setShowEditModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (p) => {
    setEditingPrompt(p);
    setFormName(p.name);
    setFormDesc(p.description || '');
    setFormContent(p.content);
    setFormTargetType(p.target_type);
    let targetId = p.target_id || '';
    if (!targetId) {
      if (p.target_type === 'ROUTE' && routes.length > 0) targetId = routes[0].route_name;
      else if (p.target_type === 'VIRTUAL_KEY' && virtualKeys.length > 0) targetId = virtualKeys[0].key_id || virtualKeys[0].keyId;
      else if (p.target_type === 'TENANT' && tenants.length > 0) targetId = tenants[0].tenant_id || tenants[0].id;
    }
    setFormTargetId(targetId);
    setFormInjectionMode(p.injection_mode || 'PREPEND');
    setFormIsActive(p.is_active);
    setShowEditModal(true);
  };

  // Apply Quick Template
  const handleApplyTemplate = (tpl) => {
    setFormName(tpl.name);
    setFormDesc(tpl.desc);
    setFormContent(tpl.content);
    setFormTargetType(tpl.targetType);
    if (tpl.targetType === 'ROUTE' && routes.length > 0) setFormTargetId(routes[0].route_name);
    else if (tpl.targetType === 'TENANT' && tenants.length > 0) setFormTargetId(tenants[0].tenant_id || tenants[0].id);
    else setFormTargetId('');
  };

  // Save (Create or Update)
  const handleSavePrompt = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formContent.trim()) {
      onNotify('ERROR', strings.systemPrompts.alerts.nameAndContentRequired);
      return;
    }

    if (formTargetType !== 'GLOBAL' && !formTargetId) {
      onNotify('ERROR', strings.systemPrompts.alerts.targetRequired(formTargetType));
      return;
    }

    const payload = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      content: formContent.trim(),
      target_type: formTargetType,
      target_id: formTargetType === 'GLOBAL' ? null : formTargetId,
      injection_mode: formInjectionMode,
      is_active: formIsActive
    };

    setIsLoading(true);
    try {
      if (editingPrompt) {
        await apiClient.updateSystemPrompt(editingPrompt.prompt_id, payload);
        onNotify('SUCCESS', strings.systemPrompts.alerts.promptUpdated(payload.name));
      } else {
        await apiClient.createSystemPrompt(payload);
        onNotify('SUCCESS', strings.systemPrompts.alerts.promptCreated(payload.name));
      }
      setShowEditModal(false);
      await loadAllData();
    } catch (err) {
      console.error('Save prompt error:', err);
      onNotify('ERROR', strings.systemPrompts.alerts.saveFailed(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Active Switch directly from Card
  const handleToggleActive = async (p) => {
    try {
      const nextActive = !p.is_active;
      await apiClient.updateSystemPrompt(p.prompt_id, { is_active: nextActive });
      setPrompts((prev) =>
        prev.map((item) =>
          item.prompt_id === p.prompt_id ? { ...item, is_active: nextActive } : item
        )
      );
      onNotify('SUCCESS', strings.systemPrompts.alerts.statusChanged(p.name, nextActive));
    } catch (err) {
      onNotify('ERROR', strings.systemPrompts.alerts.statusFailed);
    }
  };

  // Delete Prompt
  const handleConfirmDelete = async () => {
    if (!promptToDelete) return;
    setIsLoading(true);
    try {
      await apiClient.deleteSystemPrompt(promptToDelete.prompt_id);
      onNotify('SUCCESS', strings.systemPrompts.alerts.deletedSuccess(promptToDelete.name));
      setPromptToDelete(null);
      await loadAllData();
    } catch (err) {
      onNotify('ERROR', strings.systemPrompts.alerts.deleteFailed(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  // Run Simulator
  const handleRunSimulator = async () => {
    setIsSimulating(true);
    try {
      const inputMessages = [];
      if (simClientSysMsg.trim()) {
        inputMessages.push({ role: 'system', content: simClientSysMsg.trim() });
      }
      inputMessages.push({ role: 'user', content: simUserMessage });

      const res = await apiClient.resolveSystemPrompt({
        key_id: simKeyId || null,
        route_name: simRouteName || null,
        tenant_id: simTenantId || null,
        input_messages: inputMessages
      });
      setSimResult(res);
    } catch (e) {
      onNotify('ERROR', strings.systemPrompts.alerts.simError);
    } finally {
      setIsSimulating(false);
    }
  };

  // Stats calculation
  const totalCount = prompts.length;
  const activeCount = prompts.filter((p) => p.is_active).length;
  const routeBindingCount = prompts.filter((p) => p.target_type === 'ROUTE').length;
  const vkeyBindingCount = prompts.filter((p) => p.target_type === 'VIRTUAL_KEY').length;
  const tenantBindingCount = prompts.filter((p) => p.target_type === 'TENANT').length;
  const globalBindingCount = prompts.filter((p) => p.target_type === 'GLOBAL').length;

  return (
    <div className="tab-pane" data-testid="sp-page-container" data-screen-id="SCR-SP-01" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* 1. Header & Summary Stats */}
      <div className="section-header" data-testid="sp-header-section" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ScrollText size={24} color="#38bdf8" />
            <span>{strings.systemPrompts.headerTitle}</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '4px' }}>
            {strings.systemPrompts.headerSubtitlePrefix}<strong>{strings.systemPrompts.headerSubtitleStrong}</strong>{strings.systemPrompts.headerSubtitleSuffix}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {!canWritePrompts && (
            <span className="badge warning" style={{ fontSize: '0.78rem' }}>
              {strings.virtualKeys.readOnlyBadge}
            </span>
          )}
          <button
            className="btn btn-secondary"
            data-testid="sp-btn-open-simulator"
            data-function-id="FNC-SP-OPEN-SIMULATOR"
            onClick={() => {
              if (routes.length > 0) setSimRouteName(routes[0].route_name);
              if (tenants.length > 0) setSimTenantId(tenants[0].tenant_id || tenants[0].id);
              if (virtualKeys.length > 0) setSimKeyId(virtualKeys[0].key_id || virtualKeys[0].keyId);
              setSimulatorOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Play size={15} color="#38bdf8" />
            <span>{strings.systemPrompts.btnOpenSimulator}</span>
          </button>
          <button
            className="btn btn-primary"
            data-testid="sp-btn-open-create"
            data-function-id="FNC-SP-OPEN-CREATE"
            disabled={!canWritePrompts}
            onClick={() => canWritePrompts && handleOpenCreateModal()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: canWritePrompts ? 1 : 0.45, cursor: canWritePrompts ? 'pointer' : 'not-allowed' }}
          >
            <Plus size={16} />
            <span>{strings.systemPrompts.btnRegister}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" data-testid="sp-card-total" style={{ padding: '16px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.systemPrompts.kpi.totalRegistered}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {totalCount} <span style={{ fontSize: '0.88rem', fontWeight: 400, color: '#10b981' }}>{strings.systemPrompts.kpi.activeCountSuffix(activeCount)}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {strings.systemPrompts.kpi.totalDesc}
          </div>
        </div>

        <div className="card" data-testid="sp-card-route" style={{ padding: '16px', borderLeft: '4px solid #818cf8' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.systemPrompts.kpi.routeBinding}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#818cf8', marginTop: '4px' }}>
            {routeBindingCount} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{strings.systemPrompts.kpi.routeCountSuffix}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {strings.systemPrompts.kpi.routeDesc}
          </div>
        </div>

        <div className="card" data-testid="sp-card-vkey" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.systemPrompts.kpi.vkeyBinding}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
            {vkeyBindingCount} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{strings.systemPrompts.kpi.vkeyCountSuffix}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {strings.systemPrompts.kpi.vkeyDesc}
          </div>
        </div>

        <div className="card" data-testid="sp-card-tenant-global" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.systemPrompts.kpi.tenantGlobalBinding}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
            {tenantBindingCount + globalBindingCount} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{strings.systemPrompts.kpi.tenantGlobalCount(tenantBindingCount, globalBindingCount)}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {strings.systemPrompts.kpi.tenantGlobalDesc}
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Toolbar */}
      <div className="card" data-testid="sp-filter-card" style={{ padding: '14px 18px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginRight: '6px' }}>{strings.systemPrompts.filterScopeLabel}</span>
            {[
              { id: 'ALL', label: strings.systemPrompts.filterAll },
              { id: 'ROUTE', label: strings.systemPrompts.filterRouteTab },
              { id: 'VIRTUAL_KEY', label: strings.systemPrompts.filterKeyTab },
              { id: 'TENANT', label: strings.systemPrompts.filterTenantTab },
              { id: 'GLOBAL', label: strings.systemPrompts.filterGlobalTab }
            ].map((tab) => (
              <button
                key={tab.id}
                data-testid={`sp-tab-filter-${tab.id}`}
                onClick={() => setSelectedFilter(tab.id)}
                className={`btn btn-sm ${selectedFilter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '5px 12px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', minWidth: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              data-testid="sp-input-search"
              placeholder={strings.systemPrompts.searchPromptsPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '32px', fontSize: '0.82rem', height: '34px' }}
            />
          </div>
        </div>
      </div>

      {/* 3. Prompts Card Grid */}
      <div data-testid="sp-grid-prompts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '18px' }}>
        {filteredPrompts.length > 0 ? (
          filteredPrompts.map((p) => {
            const targetColor =
              p.target_type === 'VIRTUAL_KEY' ? '#f59e0b' :
              p.target_type === 'ROUTE' ? '#818cf8' :
              p.target_type === 'TENANT' ? '#10b981' : '#38bdf8';

            const TargetIcon =
              p.target_type === 'VIRTUAL_KEY' ? KeyRound :
              p.target_type === 'ROUTE' ? GitFork :
              p.target_type === 'TENANT' ? Users : Globe;

            return (
              <div
                key={p.prompt_id}
                className="card"
                data-testid={`sp-card-prompt-${p.prompt_id}`}
                data-screen-id="SCR-SP-01"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '18px',
                  background: 'var(--bg-panel)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${p.is_active ? 'var(--border-subtle)' : 'rgba(255,255,255,0.05)'}`,
                  opacity: p.is_active ? 1 : 0.65,
                  transition: 'all 0.2s ease'
                }}
              >
                <div>
                  {/* Top Bar: Title & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.98rem', color: 'var(--text-primary)' }} data-testid={`sp-text-name-${p.prompt_id}`}>
                      {p.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className="badge"
                        data-testid={`sp-badge-mode-${p.prompt_id}`}
                        style={{
                          background: p.injection_mode === 'OVERRIDE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: p.injection_mode === 'OVERRIDE' ? '#f87171' : '#38bdf8',
                          fontSize: '0.68rem',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {p.injection_mode}
                      </span>
                      <button
                        onClick={() => canWritePrompts && handleToggleActive(p)}
                        disabled={!canWritePrompts}
                        className={`badge ${p.is_active ? 'active' : 'warn'}`}
                        data-testid={`sp-btn-toggle-${p.prompt_id}`}
                        data-function-id="FNC-SP-TOGGLE"
                        style={{ cursor: canWritePrompts ? 'pointer' : 'not-allowed', border: 'none', opacity: canWritePrompts ? 1 : 0.6 }}
                        title={strings.systemPrompts.toggleActiveTitle}
                      >
                        {p.is_active ? strings.systemPrompts.statusRunning : strings.systemPrompts.statusInactiveShort}
                      </button>
                    </div>
                  </div>

                  {/* Target Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <span
                      data-testid={`sp-badge-target-${p.prompt_id}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        background: `${targetColor}18`,
                        color: targetColor,
                        border: `1px solid ${targetColor}40`,
                        fontWeight: 600
                      }}
                    >
                      <TargetIcon size={12} />
                      <span>[{p.target_type}] {p.target_name || p.target_id || strings.systemPrompts.globalFallback}</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }} data-testid={`sp-tokens-${p.prompt_id}`}>
                      ~{p.estimated_tokens} {strings.systemPrompts.tokensSuffix}
                    </span>
                  </div>

                  {p.description && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.4 }}>
                      {p.description}
                    </div>
                  )}

                  {/* Content Viewport */}
                  <div
                    data-testid={`sp-content-${p.prompt_id}`}
                    style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.78rem',
                      color: '#cbd5e1',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '140px',
                      overflowY: 'auto',
                      lineHeight: 1.45,
                      marginBottom: '14px'
                    }}
                  >
                    {p.content}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    ID: {p.prompt_id}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      data-testid={`sp-btn-edit-${p.prompt_id}`}
                      disabled={!canWritePrompts}
                      onClick={() => canWritePrompts && handleOpenEditModal(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', opacity: canWritePrompts ? 1 : 0.45, cursor: canWritePrompts ? 'pointer' : 'not-allowed' }}
                    >
                      <Sliders size={13} />
                      <span>{strings.common.edit}</span>
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      data-testid={`sp-btn-delete-${p.prompt_id}`}
                      data-function-id="FNC-SP-DELETE"
                      disabled={!canWritePrompts}
                      onClick={() => canWritePrompts && setPromptToDelete(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', opacity: canWritePrompts ? 1 : 0.45, cursor: canWritePrompts ? 'pointer' : 'not-allowed' }}
                    >
                      <Trash2 size={13} />
                      <span>{strings.common.delete}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <ScrollText size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {strings.systemPrompts.noPromptsFound}
            </div>
            <p style={{ fontSize: '0.82rem', marginTop: '6px' }}>
              {strings.systemPrompts.noPromptsHint}
            </p>
          </div>
        )}
      </div>

      {/* 4. Create / Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => !isLoading && setShowEditModal(false)}>
          <div className="modal-content" data-testid="sp-modal-form" data-screen-id="SCR-SP-M01" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSavePrompt}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.08rem', fontWeight: 700, color: '#ffffff' }}>
                  <ScrollText size={20} color="#38bdf8" />
                  <span>{editingPrompt ? strings.systemPrompts.editorModal.editTitle : strings.systemPrompts.editorModal.createTitle}</span>
                </div>
              </div>

              <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                {/* Quick Templates Bar (Create Mode only) */}
                {!editingPrompt && (
                  <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.76rem', color: '#38bdf8', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Sparkles size={14} />
                      <span>{strings.systemPrompts.quickTemplatesLabel}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {templates.map((tpl, i) => (
                        <button
                          key={i}
                          type="button"
                          data-testid={`sp-btn-template-${i}`}
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleApplyTemplate(tpl)}
                          style={{ fontSize: '0.74rem', padding: '4px 10px' }}
                        >
                          + {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Name & Desc */}
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>{strings.systemPrompts.editorModal.nameLabel} <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    data-testid="sp-input-name"
                    placeholder={strings.systemPrompts.editorModal.namePlaceholder}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label">{strings.common.description}</label>
                  <input
                    type="text"
                    className="form-input"
                    data-testid="sp-input-desc"
                    placeholder={strings.systemPrompts.editorModal.namePlaceholder}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                  />
                </div>

                {/* 1:1 Target Selection */}
                <div className="form-group" style={{ marginBottom: '16px', background: 'var(--bg-panel)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <label className="form-label" style={{ fontWeight: 600, marginBottom: '10px', color: '#38bdf8' }}>
                    {strings.systemPrompts.editorModal.scopeTargetLabel} <span style={{ color: '#ef4444' }}>*</span>
                  </label>

                  {/* Radio Group */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '12px' }}>
                    {[
                      { id: 'ROUTE', label: strings.systemPrompts.editorModal.targetRouteLabel, icon: GitFork },
                      { id: 'VIRTUAL_KEY', label: strings.systemPrompts.filterKeyTab, icon: KeyRound },
                      { id: 'TENANT', label: strings.systemPrompts.filterTenantTab, icon: Users },
                      { id: 'GLOBAL', label: strings.systemPrompts.filterGlobalTab, icon: Globe }
                    ].map((item) => (
                      <label
                        key={item.id}
                        data-testid={`sp-radio-target-type-${item.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: formTargetType === item.id ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${formTargetType === item.id ? '#38bdf8' : 'var(--border-subtle)'}`,
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          color: formTargetType === item.id ? '#ffffff' : 'var(--text-secondary)'
                        }}
                      >
                        <input
                          type="radio"
                          name="targetType"
                          checked={formTargetType === item.id}
                          onChange={() => {
                            setFormTargetType(item.id);
                            if (item.id === 'ROUTE' && routes.length > 0) setFormTargetId(routes[0].route_name);
                            else if (item.id === 'VIRTUAL_KEY' && virtualKeys.length > 0) setFormTargetId(virtualKeys[0].key_id || virtualKeys[0].keyId);
                            else if (item.id === 'TENANT' && tenants.length > 0) setFormTargetId(tenants[0].tenant_id || tenants[0].id);
                            else setFormTargetId('');
                          }}
                        />
                        <item.icon size={14} color={formTargetType === item.id ? '#38bdf8' : 'var(--text-muted)'} />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Target Dropdown based on type */}
                  {formTargetType === 'ROUTE' && (
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>{strings.systemPrompts.editorModal.targetRouteLabel}</label>
                      <select
                        className="form-select"
                        data-testid="sp-select-target-route"
                        value={formTargetId}
                        onChange={(e) => setFormTargetId(e.target.value)}
                        required
                      >
                        {routes.map((r) => (
                          <option key={r.policy_id || r.route_name} value={r.route_name}>
                            {r.route_name} {r.description ? `(${r.description})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formTargetType === 'VIRTUAL_KEY' && (
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>{strings.systemPrompts.editorModal.targetVkeyLabel}</label>
                      <select
                        className="form-select"
                        data-testid="sp-select-target-vkey"
                        value={formTargetId}
                        onChange={(e) => setFormTargetId(e.target.value)}
                        required
                      >
                        {virtualKeys.map((k) => {
                          const isKeyActive = k.is_active ?? (k.status === 'ACTIVE');
                          const statusText = isKeyActive ? '' : ' [비활성/차단]';
                          return (
                            <option key={k.key_id || k.keyId} value={k.key_id || k.keyId}>
                              {k.name} ({k.key_id || k.keyId}){statusText} - {k.tenant_name || k.tenantName || strings.systemPrompts.tenantFallback}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {formTargetType === 'TENANT' && (
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>{strings.systemPrompts.editorModal.targetTenantLabel}</label>
                      <select
                        className="form-select"
                        data-testid="sp-select-target-tenant"
                        value={formTargetId}
                        onChange={(e) => setFormTargetId(e.target.value)}
                        required
                      >
                        {tenants.map((t) => (
                          <option key={t.tenant_id || t.id} value={t.tenant_id || t.id}>
                            {t.name} ({t.department_code || t.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formTargetType === 'GLOBAL' && (
                    <div style={{ fontSize: '0.78rem', color: '#38bdf8', padding: '6px 0' }} data-testid="sp-info-target-global">
                      {strings.systemPrompts.editorModal.globalTargetHint}
                    </div>
                  )}
                </div>

                {/* Injection Strategy & Active */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>{strings.systemPrompts.editorModal.strategyLabel}</label>
                    <select
                      className="form-select"
                      data-testid="sp-select-injection-mode"
                      value={formInjectionMode}
                      onChange={(e) => setFormInjectionMode(e.target.value)}
                    >
                      <option value="PREPEND">{strings.systemPrompts.editorModal.strategyPrepend}</option>
                      <option value="OVERRIDE">{strings.systemPrompts.editorModal.strategyOverride}</option>
                      <option value="FALLBACK_ONLY">{strings.systemPrompts.editorModal.strategyFallback}</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>{strings.systemPrompts.editorModal.statusLabel}</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}>
                      <input
                        type="checkbox"
                        data-testid="sp-toggle-is-active"
                        checked={formIsActive}
                        onChange={(e) => setFormIsActive(e.target.checked)}
                      />
                      <span>{strings.systemPrompts.editorModal.statusImmediateActive}</span>
                    </label>
                  </div>
                </div>

                {/* Content Editor */}
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                      {strings.systemPrompts.editorModal.contentLabel} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }} data-testid="sp-badge-tokens">
                      {strings.systemPrompts.editorModal.contentMeta(formContent.length, estimatedTokens)}
                    </span>
                  </div>
                  <textarea
                    className="form-input"
                    data-testid="sp-textarea-content"
                    rows={7}
                    placeholder={strings.systemPrompts.editorModal.contentPlaceholder}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.45 }}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-testid="sp-modal-btn-cancel"
                  onClick={() => setShowEditModal(false)}
                  disabled={isLoading}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="sp-modal-btn-submit"
                  data-function-id="FNC-SP-SAVE"
                  disabled={isLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check size={16} />
                  <span>{isLoading ? strings.systemPrompts.editorModal.btnSaving : (editingPrompt ? strings.systemPrompts.editorModal.btnSaveEdit : strings.systemPrompts.editorModal.btnSaveCreate)}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Simulator Modal */}
      {simulatorOpen && (
        <div className="modal-overlay" onClick={() => setSimulatorOpen(false)}>
          <div className="modal-content" data-testid="sp-modal-simulator" data-screen-id="SCR-SP-M02" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.08rem', fontWeight: 700, color: '#38bdf8' }}>
                <Play size={20} />
                <span>{strings.systemPrompts.simModal.title}</span>
              </div>
            </div>

            <div className="modal-body" style={{ maxHeight: '74vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                {strings.systemPrompts.simModal.descP1}<strong>{strings.systemPrompts.simModal.descP2}</strong>{strings.systemPrompts.simModal.descP3}
              </p>

              {/* Context Selector Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.76rem' }}>{strings.systemPrompts.simModal.vkeyLabel}</label>
                  <select
                    className="form-select"
                    data-testid="sp-sim-select-key"
                    value={simKeyId}
                    onChange={(e) => setSimKeyId(e.target.value)}
                  >
                    <option value="">{strings.systemPrompts.simModal.ignoreOption}</option>
                    {virtualKeys.map((k) => (
                      <option key={k.key_id || k.keyId} value={k.key_id || k.keyId}>{k.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.76rem' }}>{strings.systemPrompts.simModal.routeLabel}</label>
                  <select
                    className="form-select"
                    data-testid="sp-sim-select-route"
                    value={simRouteName}
                    onChange={(e) => setSimRouteName(e.target.value)}
                  >
                    <option value="">{strings.systemPrompts.simModal.ignoreOption}</option>
                    {routes.map((r) => (
                      <option key={r.policy_id || r.route_name} value={r.route_name}>{r.route_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.76rem' }}>{strings.systemPrompts.simModal.tenantLabel}</label>
                  <select
                    className="form-select"
                    data-testid="sp-sim-select-tenant"
                    value={simTenantId}
                    onChange={(e) => setSimTenantId(e.target.value)}
                  >
                    <option value="">{strings.systemPrompts.simModal.ignoreOption}</option>
                    {tenants.map((t) => (
                      <option key={t.tenant_id || t.id} value={t.tenant_id || t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Client Message Inputs */}
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>{strings.systemPrompts.simModal.clientSystemLabel}</label>
                <input
                  className="form-input"
                  data-testid="sp-sim-input-client-sys"
                  placeholder={strings.systemPrompts.simModal.clientSystemPlaceholder}
                  value={simClientSysMsg}
                  onChange={(e) => setSimClientSysMsg(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>{strings.systemPrompts.simModal.userMsgLabel}</label>
                <input
                  className="form-input"
                  data-testid="sp-sim-input-user-msg"
                  value={simUserMessage}
                  onChange={(e) => setSimUserMessage(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                data-testid="sp-sim-btn-run"
                data-function-id="FNC-SP-SIMULATE"
                onClick={handleRunSimulator}
                disabled={isSimulating}
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '16px' }}
              >
                <Play size={16} />
                <span>{isSimulating ? strings.systemPrompts.simModal.btnSimulating : strings.systemPrompts.simModal.btnSimulate}</span>
              </button>

              {/* Simulation Result Box */}
              {simResult && (
                <div data-testid="sp-sim-result-box" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: simResult.matched ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} />
                      <span>{simResult.matched ? strings.systemPrompts.simModal.resultMatched(simResult.resolved_by) : strings.systemPrompts.simModal.resultUnmatched}</span>
                    </div>
                    {simResult.matched_prompt && (
                      <span className="badge active" data-testid="sp-sim-result-badge" style={{ fontSize: '0.7rem' }}>
                        {simResult.matched_prompt.name} ({simResult.matched_prompt.injection_mode})
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    <strong>{strings.systemPrompts.simModal.finalPayloadTitle}</strong>
                  </div>
                  <pre
                    data-testid="sp-sim-result-json"
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontSize: '0.76rem',
                      color: '#38bdf8',
                      fontFamily: 'var(--font-mono)',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      margin: 0
                    }}
                  >
                    {JSON.stringify(simResult.final_messages, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="sp-sim-btn-close"
                onClick={() => setSimulatorOpen(false)}
                style={{ width: '100%' }}
              >
                {strings.systemPrompts.simModal.btnClose}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Custom Delete Confirmation Modal */}
      {promptToDelete && (
        <div className="modal-overlay" onClick={() => !isLoading && setPromptToDelete(null)}>
          <div className="modal-content" data-testid="sp-modal-delete" data-screen-id="SCR-SP-M03" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: 700, fontSize: '1.05rem' }}>
                <Trash2 size={20} />
                <span>{strings.systemPrompts.deleteModal.title}</span>
              </div>
            </div>

            <div className="modal-body">
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.84rem', color: '#fca5a5', lineHeight: 1.5 }}>
                    {strings.systemPrompts.deleteModal.warningP1}<strong>{strings.systemPrompts.deleteModal.warningP2}</strong>{strings.systemPrompts.deleteModal.warningP3}<br />
                    {strings.systemPrompts.deleteModal.warningP4(promptToDelete.target_type, promptToDelete.target_name || promptToDelete.target_id || strings.systemPrompts.globalSimpleFallback)}
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-panel)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {strings.systemPrompts.deleteModal.promptNameLabel} <strong style={{ color: '#ffffff' }}>{promptToDelete.name}</strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  ID: <code style={{ color: '#38bdf8' }}>{promptToDelete.prompt_id}</code>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="sp-modal-delete-btn-cancel"
                onClick={() => setPromptToDelete(null)}
                disabled={isLoading}
              >
                {strings.common.cancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                data-testid="sp-modal-delete-btn-confirm"
                data-function-id="FNC-SP-CONFIRM-DELETE"
                onClick={handleConfirmDelete}
                disabled={isLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={15} />
                <span>{isLoading ? strings.systemPrompts.deleteModal.btnDeleting : strings.systemPrompts.deleteModal.btnConfirmDelete}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
