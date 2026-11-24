import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { 
  Sliders, 
  Cpu, 
  Boxes, 
  Sparkles, 
  Search, 
  Save, 
  RefreshCw, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Database,
  Pencil,
  X,
  Code
} from 'lucide-react';
import { strings } from '../constants/strings';

export default function SystemSettingsTab({ onNotify }) {
  const { isSuperAdmin, hasPermission } = useAuth();
  const canWrite = isSuperAdmin || hasPermission('system:write');
  const [activeCategory, setActiveCategory] = useState('router'); // 'router' | 'providers' | 'prompts' | 'rules' | 'raw'
  const [settingsList, setSettingsList] = useState([]);
  const [modelCatalog, setModelCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Category: Router defaults form
  const [routerFastModel, setRouterFastModel] = useState('');
  const [routerReasoningModel, setRouterReasoningModel] = useState('');
  const [routerFallbackModel, setRouterFallbackModel] = useState('');
  const [routerFastCluster, setRouterFastCluster] = useState('');
  const [routerReasoningCluster, setRouterReasoningCluster] = useState('');
  const [routerFallbackCluster, setRouterFallbackCluster] = useState('');

  // Category: LLM Providers form
  const [providers, setProviders] = useState([]);
  const [editingProvider, setEditingProvider] = useState(null);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);

  // Category: Prompt Templates form
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Category: Classification Rules form
  const [reasoningKeywordsText, setReasoningKeywordsText] = useState('');
  const [codingPatternsText, setCodingPatternsText] = useState('');

  // Category: Raw JSON editor
  const [selectedRawKey, setSelectedRawKey] = useState('');
  const [rawJsonText, setRawJsonText] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [settingsData, modelsData] = await Promise.all([
        apiClient.getSystemSettings().catch(() => []),
        apiClient.getModels().catch(() => [])
      ]);
      setSettingsList(settingsData || []);
      setModelCatalog(modelsData || []);

      // 1. Initialize Router Default Models
      const routerSetting = settingsData.find(s => s.key === 'router_default_models');
      if (routerSetting && routerSetting.value) {
        const val = routerSetting.value;
        setRouterFastModel(val.fast_model || '');
        setRouterReasoningModel(val.reasoning_model || '');
        setRouterFallbackModel(val.fallback_model || '');
        const clusters = val.clusters || {};
        setRouterFastCluster(clusters.fast_8b || 'cluster_vllm_fast_8b');
        setRouterReasoningCluster(clusters.reasoning_72b || 'cluster_vllm_reasoning_72b');
        setRouterFallbackCluster(clusters.fallback || 'cluster_vllm_inference_pool');
      }

      // 2. Initialize LLM Providers
      const provSetting = settingsData.find(s => s.key === 'llm_providers');
      if (provSetting && Array.isArray(provSetting.value)) {
        setProviders(provSetting.value);
      }

      // 3. Initialize Prompt Templates
      const tplSetting = settingsData.find(s => s.key === 'prompt_templates');
      if (tplSetting && Array.isArray(tplSetting.value)) {
        setPromptTemplates(tplSetting.value);
      }

      // 4. Initialize Classification Rules
      const rulesSetting = settingsData.find(s => s.key === 'classification_rules');
      if (rulesSetting && rulesSetting.value) {
        const rList = rulesSetting.value.reasoning_keywords || [];
        const cList = rulesSetting.value.coding_patterns || [];
        setReasoningKeywordsText(rList.join('\n'));
        setCodingPatternsText(cList.join('\n'));
      }

      // 5. Select first raw key
      if (settingsData && settingsData.length > 0) {
        setSelectedRawKey(settingsData[0].key);
        setRawJsonText(JSON.stringify(settingsData[0].value, null, 2));
      }
    } catch (err) {
      if (onNotify) onNotify('ERROR', `설정 로드 실패: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save Router Defaults
  const handleSaveRouterDefaults = async () => {
    if (!canWrite) return;
    setIsSaving(true);
    try {
      const payload = {
        category: 'router',
        description: 'AgentRouter 티어별 기본 모델 및 폴백 매핑 설정',
        value: {
          fast_model: routerFastModel,
          reasoning_model: routerReasoningModel,
          fallback_model: routerFallbackModel,
          clusters: {
            fast_8b: routerFastCluster,
            reasoning_72b: routerReasoningCluster,
            fallback: routerFallbackCluster
          }
        }
      };
      await apiClient.updateSystemSetting('router_default_models', payload);
      if (onNotify) onNotify('SUCCESS', 'AgentRouter 기본 모델 및 클러스터 설정이 DB에 저장되었습니다.');
      await loadData();
    } catch (err) {
      if (onNotify) onNotify('ERROR', `저장 실패: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Providers
  const handleSaveProviders = async (newProvidersList) => {
    if (!canWrite) return;
    setIsSaving(true);
    try {
      const payload = {
        category: 'providers',
        description: '지원되는 LLM 공급자 및 엔드포인트 URL 경로 템플릿',
        value: newProvidersList
      };
      await apiClient.updateSystemSetting('llm_providers', payload);
      setProviders(newProvidersList);
      if (onNotify) onNotify('SUCCESS', 'LLM 공급자 목록이 DB에 저장되었습니다.');
      await loadData();
    } catch (err) {
      if (onNotify) onNotify('ERROR', `저장 실패: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Prompt Templates
  const handleSaveTemplates = async (newTemplatesList) => {
    if (!canWrite) return;
    setIsSaving(true);
    try {
      const payload = {
        category: 'prompts',
        description: '시스템 프롬프트 신규 작성 시 참조할 수 있는 사전 프리셋 템플릿',
        value: newTemplatesList
      };
      await apiClient.updateSystemSetting('prompt_templates', payload);
      setPromptTemplates(newTemplatesList);
      if (onNotify) onNotify('SUCCESS', '시스템 프롬프트 프리셋 템플릿이 DB에 저장되었습니다.');
      await loadData();
    } catch (err) {
      if (onNotify) onNotify('ERROR', `저장 실패: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Classification Rules
  const handleSaveClassificationRules = async () => {
    if (!canWrite) return;
    setIsSaving(true);
    try {
      const rKeywords = reasoningKeywordsText.split('\n').map(s => s.trim()).filter(Boolean);
      const cPatterns = codingPatternsText.split('\n').map(s => s.trim()).filter(Boolean);
      const payload = {
        category: 'router',
        description: 'AgentRouter 질의 의도 및 복잡도 판별 휴리스틱 정규표현식 규칙',
        value: {
          reasoning_keywords: rKeywords,
          coding_patterns: cPatterns
        }
      };
      await apiClient.updateSystemSetting('classification_rules', payload);
      if (onNotify) onNotify('SUCCESS', '분류기 정규식 규칙이 DB에 저장되었습니다.');
      await loadData();
    } catch (err) {
      if (onNotify) onNotify('ERROR', `저장 실패: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Raw JSON
  const handleSaveRawJson = async () => {
    if (!canWrite || !selectedRawKey) return;
    setIsSaving(true);
    try {
      let parsed;
      try {
        parsed = JSON.parse(rawJsonText);
      } catch (jsonErr) {
        throw new Error(`JSON 문법 오류: ${jsonErr.message}`);
      }
      const existing = settingsList.find(s => s.key === selectedRawKey);
      const payload = {
        category: existing ? existing.category : 'general',
        description: existing ? existing.description : '',
        value: parsed
      };
      await apiClient.updateSystemSetting(selectedRawKey, payload);
      if (onNotify) onNotify('SUCCESS', `설정 키 '${selectedRawKey}'가 DB에 성공적으로 저장되었습니다.`);
      await loadData();
    } catch (err) {
      if (onNotify) onNotify('ERROR', `저장 실패: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="tab-pane active" data-screen-id="SCR-SYS-01">
      {/* Header Banner */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={24} color="var(--accent-cyan)" />
              시스템 환경 설정 (System Settings)
            </h1>
            <p className="page-description" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
              하드코딩을 배제하고 PostgreSQL을 단일 진실 공급원(SSOT)으로 사용하여 모델 라우터 기본값, LLM 공급자, 프롬프트 프리셋 등을 전역 제어합니다.
            </p>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={loadData} 
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <button
          className={`tab-btn ${activeCategory === 'router' ? 'active' : ''}`}
          onClick={() => setActiveCategory('router')}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeCategory === 'router' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeCategory === 'router' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Cpu size={16} />
          라우터 기본 모델
        </button>
        <button
          className={`tab-btn ${activeCategory === 'providers' ? 'active' : ''}`}
          onClick={() => setActiveCategory('providers')}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeCategory === 'providers' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeCategory === 'providers' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Boxes size={16} />
          LLM 공급자 관리
        </button>
        <button
          className={`tab-btn ${activeCategory === 'prompts' ? 'active' : ''}`}
          onClick={() => setActiveCategory('prompts')}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeCategory === 'prompts' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeCategory === 'prompts' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Sparkles size={16} />
          프롬프트 프리셋
        </button>
        <button
          className={`tab-btn ${activeCategory === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveCategory('rules')}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeCategory === 'rules' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeCategory === 'rules' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Code size={16} />
          분류기 키워드 규칙
        </button>
        <button
          className={`tab-btn ${activeCategory === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveCategory('raw')}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeCategory === 'raw' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeCategory === 'raw' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Database size={16} />
          전체 JSON 설정 (SSOT)
        </button>
      </div>

      {/* Tab 1: Router Default Models */}
      {activeCategory === 'router' && (
        <div className="card" style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
            AgentRouter 기본 티어 모델 & Envoy 클러스터 매핑
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            개별 라우팅 정책에서 모델이 명시되지 않았거나 비어있을 때 사용되는 전역 기본값입니다.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Fast Model Tier */}
            <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600, marginBottom: '10px', color: 'var(--accent-cyan)' }}>
                ⚡ 고속 응답 모델 (Fast Tier / 8B급)
              </div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                기본 모델 식별자 (model_id)
              </label>
              <input
                type="text"
                className="input-field"
                value={routerFastModel}
                onChange={(e) => setRouterFastModel(e.target.value)}
                placeholder="예: meta-llama/Llama-3.1-8B-Instruct"
                style={{ width: '100%', marginBottom: '12px' }}
                disabled={!canWrite}
              />
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Envoy 타겟 클러스터명
              </label>
              <input
                type="text"
                className="input-field"
                value={routerFastCluster}
                onChange={(e) => setRouterFastCluster(e.target.value)}
                placeholder="예: cluster_vllm_fast_8b"
                style={{ width: '100%' }}
                disabled={!canWrite}
              />
            </div>

            {/* Reasoning Model Tier */}
            <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600, marginBottom: '10px', color: '#c084fc' }}>
                🧠 심층 추론 모델 (Reasoning Tier / 70B급)
              </div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                기본 모델 식별자 (model_id)
              </label>
              <input
                type="text"
                className="input-field"
                value={routerReasoningModel}
                onChange={(e) => setRouterReasoningModel(e.target.value)}
                placeholder="예: meta-llama/Llama-3.1-70B-Instruct"
                style={{ width: '100%', marginBottom: '12px' }}
                disabled={!canWrite}
              />
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Envoy 타겟 클러스터명
              </label>
              <input
                type="text"
                className="input-field"
                value={routerReasoningCluster}
                onChange={(e) => setRouterReasoningCluster(e.target.value)}
                placeholder="예: cluster_vllm_reasoning_72b"
                style={{ width: '100%' }}
                disabled={!canWrite}
              />
            </div>

            {/* Fallback Model Tier */}
            <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600, marginBottom: '10px', color: '#34d399' }}>
                🛡️ 자가 치유 폴백 모델 (Fallback Tier)
              </div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                기본 모델 식별자 (model_id)
              </label>
              <input
                type="text"
                className="input-field"
                value={routerFallbackModel}
                onChange={(e) => setRouterFallbackModel(e.target.value)}
                placeholder="예: qwen2.5:14b"
                style={{ width: '100%', marginBottom: '12px' }}
                disabled={!canWrite}
              />
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Envoy 타겟 클러스터명
              </label>
              <input
                type="text"
                className="input-field"
                value={routerFallbackCluster}
                onChange={(e) => setRouterFallbackCluster(e.target.value)}
                placeholder="예: cluster_vllm_inference_pool"
                style={{ width: '100%' }}
                disabled={!canWrite}
              />
            </div>
          </div>

          {canWrite && (
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveRouterDefaults}
                disabled={isSaving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={16} />
                {isSaving ? '저장 중...' : '라우터 기본값 DB 저장'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: LLM Providers */}
      {activeCategory === 'providers' && (
        <div className="card" style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                LLM 공급자 및 엔드포인트 템플릿
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                모델 카탈로그 등록 시 사용할 수 있는 공급자 규격 목록입니다.
              </p>
            </div>
            {canWrite && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditingProvider({
                    id: '',
                    name: '',
                    badge: '',
                    desc: '',
                    pathSuffix: '',
                    defaultDomain: 'http://localhost:8000',
                    color: '#38bdf8',
                    isCompatible: true
                  });
                  setIsProviderModalOpen(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} />
                공급자 추가
              </button>
            )}
          </div>

          <div className="table-responsive">
            <table className="table" style={{ width: '100%', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  <th style={{ padding: '10px' }}>공급자 ID</th>
                  <th style={{ padding: '10px' }}>표시명</th>
                  <th style={{ padding: '10px' }}>URL 접미사 (Path Suffix)</th>
                  <th style={{ padding: '10px' }}>기본 도메인</th>
                  <th style={{ padding: '10px' }}>호환성</th>
                  {canWrite && <th style={{ padding: '10px', textAlign: 'right' }}>관리</th>}
                </tr>
              </thead>
              <tbody>
                {providers.map((p, idx) => (
                  <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                    <td style={{ padding: '10px', fontWeight: 600 }}>
                      <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: p.color || '#38bdf8', marginRight: '8px' }}></span>
                      {p.id}
                    </td>
                    <td style={{ padding: '10px' }}>{p.name}</td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{p.pathSuffix || '(직접 입력)'}</td>
                    <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{p.defaultDomain || '-'}</td>
                    <td style={{ padding: '10px' }}>
                      <span className={`badge ${p.isCompatible ? 'badge-success' : 'badge-warning'}`}>
                        {p.isCompatible ? '표준 호환' : '전용 규격'}
                      </span>
                    </td>
                    {canWrite && (
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <button
                          className="btn-icon"
                          onClick={() => {
                            setEditingProvider({ ...p });
                            setIsProviderModalOpen(true);
                          }}
                          style={{ marginRight: '6px', cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}
                          title="수정"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => {
                            if (window.confirm(`공급자 '${p.name}'을(를) 삭제하시겠습니까?`)) {
                              const filtered = providers.filter(item => item.id !== p.id);
                              handleSaveProviders(filtered);
                            }
                          }}
                          style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: '#f43f5e' }}
                          title="삭제"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Prompt Presets */}
      {activeCategory === 'prompts' && (
        <div className="card" style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                시스템 프롬프트 사전 프리셋 템플릿
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                새로운 시스템 프롬프트를 작성할 때 원클릭으로 주입할 수 있는 표준 템플릿입니다.
              </p>
            </div>
            {canWrite && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditingTemplate({
                    label: '',
                    name: '',
                    desc: '',
                    targetType: 'GLOBAL',
                    content: ''
                  });
                  setIsTemplateModalOpen(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} />
                템플릿 추가
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {promptTemplates.map((tpl, idx) => (
              <div 
                key={idx} 
                style={{ 
                  padding: '16px', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '6px',
                  background: 'var(--bg-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {tpl.label}
                    </span>
                    <span className="badge badge-info">{tpl.targetType}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                    {tpl.name}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    {tpl.desc}
                  </div>
                  <div 
                    style={{ 
                      fontSize: '0.75rem', 
                      background: 'var(--bg-secondary)', 
                      padding: '8px', 
                      borderRadius: '4px', 
                      fontFamily: 'monospace',
                      maxHeight: '100px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {tpl.content}
                  </div>
                </div>

                {canWrite && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => {
                        setEditingTemplate({ ...tpl, _index: idx });
                        setIsTemplateModalOpen(true);
                      }}
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    >
                      수정
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        if (window.confirm(`템플릿 '${tpl.name}'을(를) 삭제하시겠습니까?`)) {
                          const updated = promptTemplates.filter((_, i) => i !== idx);
                          handleSaveTemplates(updated);
                        }
                      }}
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Classification Rules */}
      {activeCategory === 'rules' && (
        <div className="card" style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
            AgentRouter 질의 의도 분류기(Classifier) 휴리스틱 규칙
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            프롬프트에 포함된 단어/코드를 분석하여 모델 티어를 결정하는 정규표현식(Regex) 목록입니다. 한 줄에 하나의 패턴을 입력합니다.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#c084fc', display: 'block', marginBottom: '8px' }}>
                🧠 심층 추론/수학/분석 키워드 (Reasoning Keywords)
              </label>
              <textarea
                className="input-field"
                rows={10}
                value={reasoningKeywordsText}
                onChange={(e) => setReasoningKeywordsText(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder="정규표현식 패턴을 한 줄에 하나씩 입력..."
                disabled={!canWrite}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-cyan)', display: 'block', marginBottom: '8px' }}>
                💻 코딩/기술/SQL 패턴 (Coding Patterns)
              </label>
              <textarea
                className="input-field"
                rows={10}
                value={codingPatternsText}
                onChange={(e) => setCodingPatternsText(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder="코딩 정규표현식 패턴을 한 줄에 하나씩 입력..."
                disabled={!canWrite}
              />
            </div>
          </div>

          {canWrite && (
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveClassificationRules}
                disabled={isSaving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={16} />
                {isSaving ? '저장 중...' : '분류기 규칙 DB 저장'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Raw JSON Editor (SSOT) */}
      {activeCategory === 'raw' && (
        <div className="card" style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
            PostgreSQL SSOT 전역 설정 원본 (Raw JSON)
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            PostgreSQL `system_settings` 테이블에 저장된 각 키의 원본 JSON 구조를 직접 조회하고 편집합니다.
          </p>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              설정 키(Key) 선택:
            </label>
            <select
              className="input-field"
              value={selectedRawKey}
              onChange={(e) => {
                const k = e.target.value;
                setSelectedRawKey(k);
                const item = settingsList.find(s => s.key === k);
                if (item) {
                  setRawJsonText(JSON.stringify(item.value, null, 2));
                }
              }}
              style={{ minWidth: '240px' }}
            >
              {settingsList.map(s => (
                <option key={s.key} value={s.key}>
                  {s.key} ({s.category})
                </option>
              ))}
            </select>
          </div>

          <textarea
            className="input-field"
            rows={14}
            value={rawJsonText}
            onChange={(e) => setRawJsonText(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.4' }}
            disabled={!canWrite}
          />

          {canWrite && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveRawJson}
                disabled={isSaving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={16} />
                {isSaving ? '저장 중...' : 'JSON 변경사항 DB 저장'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Edit / Add Provider */}
      {isProviderModalOpen && editingProvider && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '500px', background: 'var(--bg-primary)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>LLM 공급자 설정</h3>
              <button onClick={() => setIsProviderModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>공급자 ID (영문 고유 식별자)</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingProvider.id}
                  onChange={(e) => setEditingProvider({ ...editingProvider, id: e.target.value })}
                  placeholder="예: vllm-cluster"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>공급자 표시명</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingProvider.name}
                  onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                  placeholder="예: 사내 vLLM 클러스터"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>URL 접미사 (Path Suffix)</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingProvider.pathSuffix}
                  onChange={(e) => setEditingProvider({ ...editingProvider, pathSuffix: e.target.value })}
                  placeholder="예: /v1/chat/completions"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>기본 도메인 URL</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingProvider.defaultDomain}
                  onChange={(e) => setEditingProvider({ ...editingProvider, defaultDomain: e.target.value })}
                  placeholder="예: http://127.0.0.1:8000"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>테마 색상 (HEX Code)</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingProvider.color}
                  onChange={(e) => setEditingProvider({ ...editingProvider, color: e.target.value })}
                  placeholder="#38bdf8"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setIsProviderModalOpen(false)}>취소</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!editingProvider.id || !editingProvider.name) {
                    alert('공급자 ID와 표시명을 입력하십시오.');
                    return;
                  }
                  let updated = [...providers];
                  const existingIdx = updated.findIndex(p => p.id === editingProvider.id);
                  if (existingIdx >= 0) {
                    updated[existingIdx] = editingProvider;
                  } else {
                    updated.push(editingProvider);
                  }
                  setIsProviderModalOpen(false);
                  handleSaveProviders(updated);
                }}
              >
                적용 및 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit / Add Prompt Template */}
      {isTemplateModalOpen && editingTemplate && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '560px', background: 'var(--bg-primary)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>프롬프트 프리셋 템플릿</h3>
              <button onClick={() => setIsTemplateModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>라벨 (이모지 및 짧은 버튼명)</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingTemplate.label}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, label: e.target.value })}
                  placeholder="예: 🛡️ 보안 가드레일"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>템플릿 전체 명칭</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  placeholder="예: 전사 AI 안전 가드레일 (Global Safety)"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>타겟 대상 레벨 (Target Type)</label>
                <select
                  className="input-field"
                  value={editingTemplate.targetType}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, targetType: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="GLOBAL">GLOBAL (전사 전역)</option>
                  <option value="TENANT">TENANT (부서/테넌트)</option>
                  <option value="ROUTE">ROUTE (개별 라우트)</option>
                  <option value="VIRTUAL_KEY">VIRTUAL_KEY (개별 가상키)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>설명</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingTemplate.desc}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, desc: e.target.value })}
                  placeholder="간단한 용도 설명..."
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>프롬프트 원문 본문</label>
                <textarea
                  className="input-field"
                  rows={5}
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                  placeholder="주입할 프롬프트 텍스트를 입력하십시오..."
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setIsTemplateModalOpen(false)}>취소</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!editingTemplate.label || !editingTemplate.content) {
                    alert('라벨과 프롬프트 본문을 입력하십시오.');
                    return;
                  }
                  let updated = [...promptTemplates];
                  if (typeof editingTemplate._index === 'number') {
                    const idx = editingTemplate._index;
                    const cleanObj = { ...editingTemplate };
                    delete cleanObj._index;
                    updated[idx] = cleanObj;
                  } else {
                    updated.push(editingTemplate);
                  }
                  setIsTemplateModalOpen(false);
                  handleSaveTemplates(updated);
                }}
              >
                적용 및 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
