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

export default function SystemPromptsTab({ onNotify }) {
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
  const [simUserMessage, setSimUserMessage] = useState('사내 규정에 맞는 대출 상품 추천해줘');
  const [simClientSysMsg, setSimClientSysMsg] = useState('');
  const [simResult, setSimResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Quick Templates
  const TEMPLATES = [
    {
      label: '금융 보안 가드레일',
      name: '금융 보안 및 컴플라이언스 가드레일',
      desc: '개인정보 유출 방지 및 금융소비자보호법 준수 지침',
      targetType: 'GLOBAL',
      content: `[사내 보안 및 금융 컴플라이언스 기본 지침]
1. 금융거래정보, 주민등록번호, 계좌 비밀번호 등 개인 식별 정보를 절대 외부로 유출하거나 요구하지 마십시오.
2. 사내 규정과 금융소비자보호법을 철저히 준수하며 객관적이고 신뢰할 수 있는 정보를 제공하십시오.
3. 불확실한 투자 조언이나 확정적 수익률 보장은 엄격히 금지됩니다.`
    },
    {
      label: 'PB 자산관리 상담',
      name: '자산관리(WM) 고객 상담 표준 페르소나',
      desc: '자산관리부 소속 전용 고품격 금융 상담 페르소나',
      targetType: 'TENANT',
      content: `[자산관리(WM) 고객 상담 표준 페르소나]
- 귀하는 최고 수준의 금융 전문 프라이빗 뱅커(PB) 어시스턴트입니다.
- 고객의 자산 포트폴리오를 다각도로 분석하고, 위험 성향에 맞춘 최적의 자산 배분 방안을 정중하고 격조 높은 어조로 제안하십시오.
- 답변 시 항상 고객의 투자 리스크 관리 방안을 함께 안내해야 합니다.`
    },
    {
      label: '시큐어 코딩 지침',
      name: '사내 개발팀 시큐어 코딩 및 SQL 최적화 지침',
      desc: '개발 지원 라우트 전용 보안 코딩 표준',
      targetType: 'ROUTE',
      content: `[사내 개발 표준 시큐어 코딩 지침]
- 생성되는 모든 코드는 SQL Injection, XSS, 하드코딩된 Secret이 없는지 엄격히 점검하십시오.
- PEP8 및 표준 린트 규칙을 준수하고, 시간 복잡도와 메모리 효율성을 고려한 최적화 코드를 작성하십시오.
- 가능한 한 단위 테스트 코드(Unit Test)를 함께 작성하여 신뢰성을 확보하십시오.`
    }
  ];

  // Load Data
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [promptList, routeList, keyList, tenantList] = await Promise.all([
        apiClient.getSystemPrompts(),
        apiClient.getRoutes(),
        apiClient.getVirtualKeys(),
        apiClient.getTenants()
      ]);

      setPrompts(Array.isArray(promptList) ? promptList : []);
      setRoutes(Array.isArray(routeList) ? routeList : []);
      setVirtualKeys(Array.isArray(keyList) ? keyList : []);
      setTenants(Array.isArray(tenantList) ? tenantList : []);
    } catch (e) {
      console.error('Failed to load system prompts data:', e);
      onNotify('ERROR', '시스템 프롬프트 데이터 로딩에 실패했습니다.');
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

  // Calculate estimated tokens
  const estimatedTokens = Math.max(Math.floor(formContent.length / 3), 0);

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
    setFormTargetId(p.target_id || '');
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
      onNotify('ERROR', '프롬프트 명칭과 본문은 필수 입력 사항입니다.');
      return;
    }

    if (formTargetType !== 'GLOBAL' && !formTargetId) {
      onNotify('ERROR', `${formTargetType} 바인딩 대상을 선택해 주십시오.`);
      return;
    }

    // Determine target name
    let targetName = null;
    if (formTargetType === 'ROUTE') {
      const r = routes.find((x) => x.route_name === formTargetId);
      targetName = r ? r.route_name : formTargetId;
    } else if (formTargetType === 'VIRTUAL_KEY') {
      const k = virtualKeys.find((x) => (x.key_id || x.keyId) === formTargetId);
      targetName = k ? `${k.name} (${k.key_id || k.keyId})` : formTargetId;
    } else if (formTargetType === 'TENANT') {
      const t = tenants.find((x) => (x.tenant_id || x.id) === formTargetId);
      targetName = t ? `${t.name} (${t.department_code || t.code})` : formTargetId;
    } else {
      targetName = '전사 공통 (Global)';
    }

    const payload = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      content: formContent.trim(),
      target_type: formTargetType,
      target_id: formTargetType === 'GLOBAL' ? null : formTargetId,
      target_name: targetName,
      injection_mode: formInjectionMode,
      is_active: formIsActive
    };

    setIsLoading(true);
    try {
      if (editingPrompt) {
        await apiClient.updateSystemPrompt(editingPrompt.prompt_id, payload);
        onNotify('SUCCESS', `시스템 프롬프트 [${payload.name}]가 수정되었습니다.`);
      } else {
        await apiClient.createSystemPrompt(payload);
        onNotify('SUCCESS', `시스템 프롬프트 [${payload.name}]가 성공적으로 등록되었습니다.`);
      }
      setShowEditModal(false);
      await loadAllData();
    } catch (err) {
      console.error('Save prompt error:', err);
      onNotify('ERROR', err.message || '프롬프트 저장에 실패했습니다.');
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
      onNotify('SUCCESS', `[${p.name}] 프롬프트가 ${nextActive ? '활성화' : '비활성화'}되었습니다.`);
    } catch (err) {
      onNotify('ERROR', '상태 변경에 실패했습니다.');
    }
  };

  // Delete Prompt
  const handleConfirmDelete = async () => {
    if (!promptToDelete) return;
    setIsLoading(true);
    try {
      await apiClient.deleteSystemPrompt(promptToDelete.prompt_id);
      onNotify('SUCCESS', `시스템 프롬프트 [${promptToDelete.name}]가 영구 삭제되었습니다.`);
      setPromptToDelete(null);
      await loadAllData();
    } catch (err) {
      onNotify('ERROR', err.message || '프롬프트 삭제에 실패했습니다.');
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
      onNotify('ERROR', '시뮬레이션 실행 중 오류가 발생했습니다.');
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
            <span>시스템 프롬프트 거버넌스</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '4px' }}>
            사내 표준 페르소나 및 금융 보안 가드레일을 등록하고, <strong>[라우팅 정책 · API Key · 테넌트]</strong>에 1:1로 연결하여 LLM 호출 시 자동 주입합니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
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
            <span>주입 시뮬레이터</span>
          </button>
          <button
            className="btn btn-primary"
            data-testid="sp-btn-open-create"
            data-function-id="FNC-SP-OPEN-CREATE"
            onClick={handleOpenCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>신규 시스템 프롬프트 등록</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" data-testid="sp-card-total" style={{ padding: '16px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>총 등록 프롬프트</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {totalCount} <span style={{ fontSize: '0.88rem', fontWeight: 400, color: '#10b981' }}>({activeCount}개 활성)</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            전사 가드레일 & 페르소나 카탈로그
          </div>
        </div>

        <div className="card" data-testid="sp-card-route" style={{ padding: '16px', borderLeft: '4px solid #818cf8' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>라우팅 정책 바인딩</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#818cf8', marginTop: '4px' }}>
            {routeBindingCount} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>개 라우트</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            목적별 인프라 라우트 전용 지침
          </div>
        </div>

        <div className="card" data-testid="sp-card-vkey" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>API Key 바인딩</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
            {vkeyBindingCount} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>개 가상키</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            최우선 적용 (1순위 타겟)
          </div>
        </div>

        <div className="card" data-testid="sp-card-tenant-global" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>테넌트 / 전사 바인딩</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
            {tenantBindingCount + globalBindingCount} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(테넌트 {tenantBindingCount}, 전사 {globalBindingCount})</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            부서 공통 및 전사 보안 가드레일
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Toolbar */}
      <div className="card" data-testid="sp-filter-card" style={{ padding: '14px 18px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginRight: '6px' }}>바인딩 대상:</span>
            {[
              { id: 'ALL', label: '전체 보기' },
              { id: 'ROUTE', label: '라우팅 정책' },
              { id: 'VIRTUAL_KEY', label: 'API Key' },
              { id: 'TENANT', label: '테넌트 / 부서' },
              { id: 'GLOBAL', label: '전사 공통' }
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
              placeholder="프롬프트 명칭, 타겟 검색..."
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
                        onClick={() => handleToggleActive(p)}
                        className={`badge ${p.is_active ? 'active' : 'warn'}`}
                        data-testid={`sp-btn-toggle-${p.prompt_id}`}
                        data-function-id="FNC-SP-TOGGLE"
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="클릭하여 활성화/비활성화 전환"
                      >
                        {p.is_active ? '가동 중' : '비활성'}
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
                      <span>[{p.target_type}] {p.target_name || p.target_id || '전사 공통'}</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }} data-testid={`sp-tokens-${p.prompt_id}`}>
                      ~{p.estimated_tokens} 토큰
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
                      onClick={() => handleOpenEditModal(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                    >
                      <Sliders size={13} />
                      <span>수정</span>
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      data-testid={`sp-btn-delete-${p.prompt_id}`}
                      data-function-id="FNC-SP-DELETE"
                      onClick={() => setPromptToDelete(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                    >
                      <Trash2 size={13} />
                      <span>삭제</span>
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
              조건에 일치하는 시스템 프롬프트가 없습니다.
            </div>
            <p style={{ fontSize: '0.82rem', marginTop: '6px' }}>
              우측 상단의 [+ 신규 시스템 프롬프트 등록] 버튼을 눌러 라우트나 가상키에 지침을 연결해 보십시오.
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
                  <span>{editingPrompt ? '시스템 프롬프트 수정' : '신규 시스템 프롬프트 등록 및 타겟 연결'}</span>
                </div>
              </div>

              <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                {/* Quick Templates Bar (Create Mode only) */}
                {!editingPrompt && (
                  <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.76rem', color: '#38bdf8', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Sparkles size={14} />
                      <span>빠른 템플릿 채우기:</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {TEMPLATES.map((tpl, i) => (
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
                  <label className="form-label" style={{ fontWeight: 600 }}>프롬프트 식별 명칭 <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    data-testid="sp-input-name"
                    placeholder="예: 여신심사부 리스크 평가 표준 페르소나"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label">설명 및 목적</label>
                  <input
                    type="text"
                    className="form-input"
                    data-testid="sp-input-desc"
                    placeholder="예: 대출 심사 봇 호출 시 여신 리스크 가이드라인 자동 삽입"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                  />
                </div>

                {/* 1:1 Target Selection */}
                <div className="form-group" style={{ marginBottom: '16px', background: 'var(--bg-panel)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <label className="form-label" style={{ fontWeight: 600, marginBottom: '10px', color: '#38bdf8' }}>
                    1:1 바인딩 대상 선택 (Scope Target) <span style={{ color: '#ef4444' }}>*</span>
                  </label>

                  {/* Radio Group */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '12px' }}>
                    {[
                      { id: 'ROUTE', label: '라우팅 정책 (Route)', icon: GitFork },
                      { id: 'VIRTUAL_KEY', label: 'API Key', icon: KeyRound },
                      { id: 'TENANT', label: '테넌트 / 부서', icon: Users },
                      { id: 'GLOBAL', label: '전사 공통 (Global)', icon: Globe }
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
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>적용할 라우트 선택</label>
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
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>적용할 API Key 선택 (1순위 최고 우선권)</label>
                      <select
                        className="form-select"
                        data-testid="sp-select-target-vkey"
                        value={formTargetId}
                        onChange={(e) => setFormTargetId(e.target.value)}
                        required
                      >
                        {virtualKeys.map((k) => (
                          <option key={k.key_id || k.keyId} value={k.key_id || k.keyId}>
                            {k.name} ({k.key_id || k.keyId}) - {k.tenant_name || k.tenantName || '테넌트'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formTargetType === 'TENANT' && (
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>적용할 테넌트/부서 선택</label>
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
                      💡 특정 라우트나 가상키에 지정되지 않은 모든 일반 추론 요청에 기본 보안 가드레일로 자동 적용됩니다.
                    </div>
                  )}
                </div>

                {/* Injection Strategy & Active */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>주입 전략 (Injection Strategy)</label>
                    <select
                      className="form-select"
                      data-testid="sp-select-injection-mode"
                      value={formInjectionMode}
                      onChange={(e) => setFormInjectionMode(e.target.value)}
                    >
                      <option value="PREPEND">PREPEND (사내 지침을 최상단에 우선 배치 - 권장)</option>
                      <option value="OVERRIDE">OVERRIDE (클라이언트의 지침을 무시하고 강제 대체)</option>
                      <option value="FALLBACK_ONLY">FALLBACK_ONLY (클라이언트가 지침을 안 보냈을 때만)</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>상태</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}>
                      <input
                        type="checkbox"
                        data-testid="sp-toggle-is-active"
                        checked={formIsActive}
                        onChange={(e) => setFormIsActive(e.target.checked)}
                      />
                      <span>즉시 활성화</span>
                    </label>
                  </div>
                </div>

                {/* Content Editor */}
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                      시스템 프롬프트 본문 (System Prompt Content) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }} data-testid="sp-badge-tokens">
                      글자수: {formContent.length}자 | 예상 토큰: ~{estimatedTokens} tokens
                    </span>
                  </div>
                  <textarea
                    className="form-input"
                    data-testid="sp-textarea-content"
                    rows={7}
                    placeholder="[사내 보안 및 금융 상담 지침]&#10;1. 귀하는 공인된 AI 어시스턴트로서...&#10;2. 고객의 개인 식별 정보를 수집하거나 노출하지 마십시오."
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
                  취소
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
                  <span>{isLoading ? '저장 중...' : (editingPrompt ? '변경사항 저장' : '프롬프트 등록 및 연결')}</span>
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
                <span>L7 게이트웨이 시스템 프롬프트 주입 시뮬레이터</span>
              </div>
            </div>

            <div className="modal-body" style={{ maxHeight: '74vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                호출 컨텍스트(가상키, 라우트, 테넌트)를 조합하여, <strong>4단계 우선순위(Virtual Key &gt; Route &gt; Tenant &gt; Global)</strong>에 따라 어떤 시스템 프롬프트가 매칭되고 최종 페이로드가 어떻게 변조되는지 실시간으로 검증합니다.
              </p>

              {/* Context Selector Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.76rem' }}>1순위: 가상키 (Virtual Key)</label>
                  <select 
                    className="form-select" 
                    data-testid="sp-sim-select-key"
                    value={simKeyId} 
                    onChange={(e) => setSimKeyId(e.target.value)}
                  >
                    <option value="">(선택 안 함 - 무시)</option>
                    {virtualKeys.map((k) => (
                      <option key={k.key_id || k.keyId} value={k.key_id || k.keyId}>{k.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.76rem' }}>2순위: 라우트 (Route)</label>
                  <select 
                    className="form-select" 
                    data-testid="sp-sim-select-route"
                    value={simRouteName} 
                    onChange={(e) => setSimRouteName(e.target.value)}
                  >
                    <option value="">(선택 안 함 - 무시)</option>
                    {routes.map((r) => (
                      <option key={r.policy_id || r.route_name} value={r.route_name}>{r.route_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.76rem' }}>3순위: 테넌트 (Tenant)</label>
                  <select 
                    className="form-select" 
                    data-testid="sp-sim-select-tenant"
                    value={simTenantId} 
                    onChange={(e) => setSimTenantId(e.target.value)}
                  >
                    <option value="">(선택 안 함 - 무시)</option>
                    {tenants.map((t) => (
                      <option key={t.tenant_id || t.id} value={t.tenant_id || t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Client Message Inputs */}
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>클라이언트가 이미 보낸 System 프롬프트 (선택 사항)</label>
                <input
                  className="form-input"
                  data-testid="sp-sim-input-client-sys"
                  placeholder="예: 친절하게 반말로 답변해줘 (공백 시 시스템 프롬프트 미포함)"
                  value={simClientSysMsg}
                  onChange={(e) => setSimClientSysMsg(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>사용자 입력 질문 (User Message)</label>
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
                <span>{isSimulating ? '해석 및 합성 중...' : '시뮬레이션 실행 (우선순위 판정)'}</span>
              </button>

              {/* Simulation Result Box */}
              {simResult && (
                <div data-testid="sp-sim-result-box" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: simResult.matched ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} />
                      <span>{simResult.matched ? `판정 성공: [${simResult.resolved_by}] 프롬프트 적용됨` : '일치하는 프롬프트 없음 (원본 유지)'}</span>
                    </div>
                    {simResult.matched_prompt && (
                      <span className="badge active" data-testid="sp-sim-result-badge" style={{ fontSize: '0.7rem' }}>
                        {simResult.matched_prompt.name} ({simResult.matched_prompt.injection_mode})
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    <strong>최종 LLM에 전달되는 합성 페이로드 (Final Messages):</strong>
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
                시뮬레이터 닫기
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
                <span>시스템 프롬프트 영구 삭제</span>
              </div>
            </div>

            <div className="modal-body">
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.84rem', color: '#fca5a5', lineHeight: 1.5 }}>
                    선택한 시스템 프롬프트를 데이터베이스에서 <strong>영구 삭제</strong>합니다.<br />
                    삭제 시 해당 타겟({promptToDelete.target_type}: {promptToDelete.target_name || promptToDelete.target_id || '전사'})의 자동 주입이 즉시 중단됩니다.
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-panel)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  프롬프트 명칭: <strong style={{ color: '#ffffff' }}>{promptToDelete.name}</strong>
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
                취소
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
                <span>{isLoading ? '삭제 중...' : '영구 삭제 확인'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
