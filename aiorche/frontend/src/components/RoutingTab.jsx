import React, { useState, useEffect } from 'react';
import { 
  GitFork, Cpu, CheckCircle2, AlertCircle, RefreshCw, Layers, ShieldAlert, 
  Plus, Trash2, Sliders, Scale, Zap, Compass, Tag, ArrowRight, 
  Copy, Check, Globe, Terminal, Play, Send, ExternalLink, Code, Settings,
  Key, Lock, Eye, EyeOff, Edit3, Timer
} from 'lucide-react';
import { initialModels } from '../data/mockData';
import { apiClient } from '../api/client';

const DEFAULT_COLOR_PALETTE = [
  '#38bdf8', // Sky
  '#c084fc', // Purple
  '#34d399', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6'  // Teal
];

const INITIAL_FALLBACK_ROUTES = [];

export const LLM_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI 호환 표준',
    badge: 'OpenAI / vLLM / NIM',
    desc: 'OpenAI API 표준 규격 (/v1/chat/completions)',
    pathSuffix: '/v1/chat/completions',
    defaultDomain: 'http://127.0.0.1:8000',
    color: '#38bdf8',
    isCompatible: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek API',
    badge: 'DeepSeek 규격',
    desc: 'DeepSeek 공식 엔드포인트 규격 (/chat/completions)',
    pathSuffix: '/chat/completions',
    defaultDomain: 'https://api.deepseek.com',
    color: '#2dd4bf',
    isCompatible: true
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    badge: 'OpenAI 비호환 (Messages)',
    desc: 'Claude Messages API 규격 (/v1/messages)',
    pathSuffix: '/v1/messages',
    defaultDomain: 'https://api.anthropic.com',
    color: '#fb923c',
    isCompatible: false
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'OpenAI 비호환 (Gemini REST)',
    desc: 'Google Gemini API 규격 (/v1beta/models/{model}:generateContent)',
    pathSuffix: '/v1beta/models/{model_id}:generateContent',
    defaultDomain: 'https://generativelanguage.googleapis.com',
    color: '#a78bfa',
    isCompatible: false
  },
  {
    id: 'cohere',
    name: 'Cohere Command',
    badge: 'OpenAI 비호환 (Cohere v2)',
    desc: 'Cohere Chat v2 API 규격 (/v2/chat)',
    pathSuffix: '/v2/chat',
    defaultDomain: 'https://api.cohere.com',
    color: '#f43f5e',
    isCompatible: false
  },
  {
    id: 'custom',
    name: '직접 지정 (Custom)',
    badge: '사용자 정의',
    desc: '사용자 정의 엔드포인트 전체 경로 직접 입력',
    pathSuffix: '',
    defaultDomain: '',
    color: '#94a3b8',
    isCompatible: true
  }
];

export const buildEndpointUrl = (domain, providerId, modelId = '') => {
  const cleanDomain = (domain || '').trim().replace(/\/+$/, '');
  if (!cleanDomain) return '';
  if (providerId === 'custom') return cleanDomain;
  const prov = LLM_PROVIDERS.find(p => p.id === providerId) || LLM_PROVIDERS[0];
  let suffix = prov.pathSuffix;
  if (suffix.includes('{model_id}')) {
    suffix = suffix.replace('{model_id}', modelId || '{model_id}');
  }
  if (cleanDomain.endsWith(suffix)) {
    return cleanDomain;
  }
  return `${cleanDomain}${suffix}`;
};

export const extractDomainAndProvider = (endpointUrl) => {
  if (!endpointUrl) return { domain: '', provider: 'openai' };
  const clean = endpointUrl.trim();
  for (const prov of LLM_PROVIDERS) {
    if (!prov.pathSuffix) continue;
    const baseSuffix = prov.pathSuffix.split('{model_id}')[0];
    if (clean.includes(baseSuffix)) {
      const parts = clean.split(baseSuffix);
      return { domain: parts[0], provider: prov.id };
    }
  }
  return { domain: clean, provider: 'custom' };
};

export default function RoutingTab({ 
  onNotify, 
  activeSubTab: externalActiveSubTab, 
  setActiveSubTab: externalSetActiveSubTab 
}) {
  const [models, setModels] = useState(() => {
    try {
      const saved = localStorage.getItem('aiorche_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Exclude legacy mock models if any
        return parsed.filter(m => !['meta-llama/Llama-3.1-8B-Instruct', 'meta-llama/Llama-3.1-8B-FineTuned-v2', 'meta-llama/Llama-3.1-70B-Instruct', 'Solar-10.7B-Financial'].includes(m.id));
      }
    } catch (e) {}
    return [];
  });

  const [routes, setRoutes] = useState(() => {
    try {
      const saved = localStorage.getItem('aiorche_multi_routes');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.filter(r => !['pol-default', 'pol-cs-v1', 'pol-code-v2'].includes(r.policy_id));
      }
    } catch (e) {}
    return [];
  });

  const [selectedRouteName, setSelectedRouteName] = useState(() => {
    return localStorage.getItem('aiorche_selected_route') || "";
  });

  const [isDeploying, setIsDeploying] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [xdsRevision, setXdsRevision] = useState(() => {
    return localStorage.getItem('aiorche_xds_revision') || 'xds-rev-20260911-1422';
  });

  // Health Check States
  const [healthStatus, setHealthStatus] = useState({});
  const [isHealthCheckingAll, setIsHealthCheckingAll] = useState(false);
  const [healthCheckTimeout, setHealthCheckTimeout] = useState(() => {
    const saved = localStorage.getItem('aiorche_health_timeout');
    return saved ? Number(saved) : 3.0;
  });

  const handleHealthTimeoutChange = (val) => {
    const num = Number(val);
    setHealthCheckTimeout(num);
    localStorage.setItem('aiorche_health_timeout', num);
    if (onNotify) onNotify('INFO', `헬스체크 타임아웃이 ${num}초로 변경되었습니다.`);
  };

  // Gateway Endpoint & Developer Guide States
  const [activeEndpointTab, setActiveEndpointTab] = useState('path'); // 'path' | 'header' | 'python'
  const [copiedField, setCopiedField] = useState(null);
  const [isTestingRoute, setIsTestingRoute] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Phase 0.1: AgentRouter & Envoy AI Gateway States
  const [agentRouterStatus, setAgentRouterStatus] = useState(null);
  const [agentSimPrompt, setAgentSimPrompt] = useState("파이썬 코드로 비동기 FastAPI 게이트웨이를 구현하고 성능 최적화 방안을 설명해줘.");
  const [agentSimPolicy, setAgentSimPolicy] = useState("QualityFirst");
  const [agentSimResult, setAgentSimResult] = useState(null);
  const [isSimulatingAgent, setIsSimulatingAgent] = useState(false);

  // 4대 라우팅 정책 편집 상태
  const [routerPolicies, setRouterPolicies] = useState([]);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [activePolicyTab, setActivePolicyTab] = useState('QualityFirst');
  const [isSavingPolicies, setIsSavingPolicies] = useState(false);

  useEffect(() => {
    apiClient.getAgentRouterStatus().then(status => {
      if (status) setAgentRouterStatus(status);
    });
    apiClient.getAgentRouterPolicies().then(res => {
      if (res?.policies) setRouterPolicies(res.policies);
    });
  }, []);

  const handleUpdatePolicyConfig = (policyId, key, value) => {
    setRouterPolicies(prev => prev.map(p => {
      if (p.policy_id === policyId) {
        return {
          ...p,
          config: {
            ...p.config,
            [key]: value
          }
        };
      }
      return p;
    }));
  };

  const handleSavePolicies = async () => {
    setIsSavingPolicies(true);
    try {
      const res = await apiClient.updateAgentRouterPolicies(routerPolicies);
      if (res?.policies) {
        setRouterPolicies(res.policies);
      }
      setShowPolicyModal(false);
      if (onNotify) onNotify('SUCCESS', 'AgentRouter 4대 라우팅 정책이 성공적으로 저장 및 게이트웨이에 반영되었습니다.');
    } catch (err) {
      if (onNotify) onNotify('ERROR', `정책 저장 실패: ${err.message}`);
    } finally {
      setIsSavingPolicies(false);
    }
  };

  const handleSimulateAgent = async () => {
    if (!agentSimPrompt.trim()) return;
    setIsSimulatingAgent(true);
    try {
      const res = await apiClient.simulateAgentRouter(agentSimPrompt, agentSimPolicy);
      setAgentSimResult(res);
      if (onNotify) onNotify('SUCCESS', `AgentRouter 분석 완료: [${res.complexity}] ➔ ${res.suggested_tier}`);
    } catch (err) {
      if (onNotify) onNotify('ERROR', 'AgentRouter 시뮬레이션 실패');
    } finally {
      setIsSimulatingAgent(false);
    }
  };

  // Modal States
  const [showNewRouteModal, setShowNewRouteModal] = useState(false);
  const [newRouteForm, setNewRouteForm] = useState({
    route_name: '',
    description: '',
    priority: 15,
    match_tenant: '',
    match_path: ''
  });

  // Sub-Tab Navigation: 'routing' (라우팅 스튜디오) | 'catalog' (서빙 모델 풀) | 'dispatch' (AgentRouter & 테스트)
  const [internalActiveSubTab, setInternalActiveSubTab] = useState('routing');
  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalActiveSubTab;
  const setActiveSubTab = externalSetActiveSubTab || setInternalActiveSubTab;

  const [showNewModelModal, setShowNewModelModal] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [newModelForm, setNewModelForm] = useState({
    model_id: 'deepseek-ai/deepseek-v4.1-flash',
    alias: 'deepseek-v4.1-flash',
    provider: 'openai',
    base_domain: 'https://integrate.api.nvidia.com',
    target_endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    input_price_per_1k: 1.2,
    output_price_per_1k: 3.6,
    health_check_timeout: 3.0,
    api_key: '',
    auth_type: 'bearer' // 'none' | 'apikey' | 'bearer'
  });

  const handleNewModelProviderChange = (provId) => {
    const computed = buildEndpointUrl(newModelForm.base_domain, provId, newModelForm.model_id);
    setNewModelForm(prev => ({
      ...prev,
      provider: provId,
      target_endpoint: computed
    }));
  };

  const handleNewModelDomainChange = (domain) => {
    const computed = buildEndpointUrl(domain, newModelForm.provider, newModelForm.model_id);
    setNewModelForm(prev => ({
      ...prev,
      base_domain: domain,
      target_endpoint: computed
    }));
  };

  const handleNewModelIdChange = (modelId) => {
    const computed = buildEndpointUrl(newModelForm.base_domain, newModelForm.provider, modelId);
    setNewModelForm(prev => ({
      ...prev,
      model_id: modelId,
      target_endpoint: computed
    }));
  };

  // Edit Model States & Handlers
  const [editingModel, setEditingModel] = useState(null);
  const [showEditApiKey, setShowEditApiKey] = useState(false);
  const [editModelForm, setEditModelForm] = useState({
    model_id: '',
    alias: '',
    provider: 'openai',
    base_domain: '',
    target_endpoint: '',
    input_price_per_1k: 0.8,
    output_price_per_1k: 2.4,
    health_check_timeout: 3.0,
    cache_discount_ratio: 0.25,
    api_key: '',
    auth_type: 'none',
    is_active: true
  });

  const handleOpenEditModal = (model) => {
    setEditingModel(model);
    const { domain, provider } = extractDomainAndProvider(model.endpoint || '');
    const activeProvider = model.provider || provider || 'openai';
    setEditModelForm({
      model_id: model.id,
      alias: model.alias || '',
      provider: activeProvider,
      base_domain: domain || model.endpoint || '',
      target_endpoint: model.endpoint || '',
      input_price_per_1k: model.inputPricePer1k !== undefined ? model.inputPricePer1k : 0.8,
      output_price_per_1k: model.outputPricePer1k !== undefined ? model.outputPricePer1k : 2.4,
      health_check_timeout: model.healthCheckTimeout !== undefined ? model.healthCheckTimeout : 3.0,
      cache_discount_ratio: model.cache_discount_ratio !== undefined ? model.cache_discount_ratio : 0.25,
      api_key: model.apiKey || '',
      auth_type: model.authType || 'none',
      is_active: model.active !== false
    });
    setShowEditApiKey(false);
  };

  const handleEditModelProviderChange = (provId) => {
    const computed = buildEndpointUrl(editModelForm.base_domain, provId, editModelForm.model_id);
    setEditModelForm(prev => ({
      ...prev,
      provider: provId,
      target_endpoint: computed
    }));
  };

  const handleEditModelDomainChange = (domain) => {
    const computed = buildEndpointUrl(domain, editModelForm.provider, editModelForm.model_id);
    setEditModelForm(prev => ({
      ...prev,
      base_domain: domain,
      target_endpoint: computed
    }));
  };

  const handleUpdateModel = async (e) => {
    e.preventDefault();
    if (!editingModel) return;

    try {
      const res = await apiClient.updateModel(editingModel.id, {
        alias: editModelForm.alias,
        target_endpoint: editModelForm.target_endpoint,
        provider: editModelForm.provider,
        input_price_per_1k: Number(editModelForm.input_price_per_1k),
        output_price_per_1k: Number(editModelForm.output_price_per_1k),
        health_check_timeout: Number(editModelForm.health_check_timeout || 3.0),
        cache_discount_ratio: Number(editModelForm.cache_discount_ratio || 0.25),
        is_active: editModelForm.is_active,
        api_key: editModelForm.api_key?.trim() || null,
        auth_type: editModelForm.auth_type || 'none'
      });

      const updated = models.map(m => m.id === editingModel.id ? {
        ...m,
        alias: res.alias || editModelForm.alias,
        endpoint: res.target_endpoint || editModelForm.target_endpoint,
        provider: res.provider || editModelForm.provider || 'openai',
        inputPricePer1k: res.input_price_per_1k !== undefined ? res.input_price_per_1k : Number(editModelForm.input_price_per_1k),
        outputPricePer1k: res.output_price_per_1k !== undefined ? res.output_price_per_1k : Number(editModelForm.output_price_per_1k),
        healthCheckTimeout: res.health_check_timeout !== undefined ? Number(res.health_check_timeout) : Number(editModelForm.health_check_timeout || 3.0),
        apiKey: res.api_key !== undefined ? res.api_key : editModelForm.api_key,
        authType: res.auth_type || editModelForm.auth_type || 'none',
        active: res.is_active !== undefined ? res.is_active : editModelForm.is_active
      } : m);

      setModels(updated);
      localStorage.setItem('aiorche_models', JSON.stringify(updated));
      setEditingModel(null);
      onNotify('SUCCESS', `모델 '${editModelForm.alias}' 정보가 성공적으로 수정되었습니다.`);
    } catch (err) {
      console.warn('Update model via API failed, updating locally:', err);
      const updated = models.map(m => m.id === editingModel.id ? {
        ...m,
        alias: editModelForm.alias,
        endpoint: editModelForm.target_endpoint,
        provider: editModelForm.provider || 'openai',
        inputPricePer1k: Number(editModelForm.input_price_per_1k),
        outputPricePer1k: Number(editModelForm.output_price_per_1k),
        healthCheckTimeout: Number(editModelForm.health_check_timeout || 3.0),
        apiKey: editModelForm.api_key,
        authType: editModelForm.auth_type || 'none',
        active: editModelForm.is_active
      } : m);
      setModels(updated);
      localStorage.setItem('aiorche_models', JSON.stringify(updated));
      setEditingModel(null);
      onNotify('SUCCESS', `모델 '${editModelForm.alias}' 정보가 수정되었습니다.`);
    }
  };

  // Load Models and Multi-Routes on Mount
  useEffect(() => {
    async function loadData() {
      try {
        const [modelsRes, routesRes, activePolicyRes] = await Promise.all([
          apiClient.getModels(),
          apiClient.getRoutes(),
          apiClient.getActiveRoutingPolicy()
        ]);

        if (Array.isArray(modelsRes)) {
          const mapped = modelsRes.map(m => ({
            id: m.model_id,
            alias: m.alias,
            backend: m.backend_infra,
            engine: m.serving_engine || (m.backend_infra?.toLowerCase().includes('ollama') ? 'Ollama' : 'vLLM'),
            executionMethod: m.execution_method || 'k8s',
            endpoint: m.target_endpoint,
            provider: m.provider || 'openai',
            healthCheckTimeout: m.health_check_timeout !== undefined && m.health_check_timeout !== null ? Number(m.health_check_timeout) : 3.0,
            inputPricePer1k: m.input_price_per_1k,
            outputPricePer1k: m.output_price_per_1k,
            apiKey: m.api_key || '',
            authType: m.auth_type || 'none',
            waitingQueue: 0,
            active: m.is_active
          }));
          setModels(mapped);
          localStorage.setItem('aiorche_models', JSON.stringify(mapped));
        }

        if (Array.isArray(routesRes)) {
          setRoutes(routesRes);
          localStorage.setItem('aiorche_multi_routes', JSON.stringify(routesRes));
          if (routesRes.length > 0 && !routesRes.some(r => r.route_name === selectedRouteName)) {
            setSelectedRouteName(routesRes[0].route_name);
          }
        }

        if (activePolicyRes && activePolicyRes.xds_revision) {
          setXdsRevision(activePolicyRes.xds_revision);
          localStorage.setItem('aiorche_xds_revision', activePolicyRes.xds_revision);
        }

        // Automatic initial health check on load
        apiClient.checkAllModelsHealth().then(results => {
          if (results && Array.isArray(results)) {
            const statusMap = {};
            results.forEach(r => {
              statusMap[r.model_id] = {
                is_healthy: r.is_healthy,
                latency_ms: r.latency_ms,
                status_code: r.status_code,
                error_message: r.error_message,
                checked_at: r.checked_at,
                checking: false
              };
            });
            setHealthStatus(statusMap);
          }
        }).catch(err => console.warn('Initial health check failed:', err));
      } catch (err) {
        console.warn('Using local fallback state for multi-routing:', err);
      }
    }
    loadData();
  }, []);

  // Current active route object
  const currentRoute = routes.find(r => r.route_name === selectedRouteName) || routes[0] || {
    route_name: "financial-advisor-v1",
    description: "기본 라우트",
    priority: 10,
    traffic_weights: [{ model_id: "meta-llama/Llama-3.1-8B-Instruct", weight: 100 }],
    load_balancing_strategy: "LeastQueueDepth",
    failover_model_id: "meta-llama/Llama-3.1-70B-Instruct",
    failover_chain: ["meta-llama/Llama-3.1-70B-Instruct"],
    match_conditions: {},
    is_active: true
  };

  const currentWeights = currentRoute.traffic_weights || [];
  const totalWeight = currentWeights.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  // Helper to update current route in local state & storage
  const updateCurrentRoute = (updates) => {
    const updatedRoutes = routes.map(r => {
      if (r.route_name === currentRoute.route_name) {
        return { ...r, ...updates };
      }
      return r;
    });
    setRoutes(updatedRoutes);
    localStorage.setItem('aiorche_multi_routes', JSON.stringify(updatedRoutes));
  };

  // Health Check Handlers
  const handleCheckAllHealth = async (customTimeout = null) => {
    const effTimeout = customTimeout || healthCheckTimeout;
    setIsHealthCheckingAll(true);
    try {
      const results = await apiClient.checkAllModelsHealth(effTimeout);
      if (results && Array.isArray(results)) {
        const statusMap = {};
        results.forEach(r => {
          statusMap[r.model_id] = {
            is_healthy: r.is_healthy,
            latency_ms: r.latency_ms,
            status_code: r.status_code,
            error_message: r.error_message,
            checked_at: r.checked_at,
            checking: false
          };
        });
        setHealthStatus(prev => ({ ...prev, ...statusMap }));
        const healthyCount = results.filter(r => r.is_healthy).length;
        if (onNotify) {
          onNotify('SUCCESS', `전체 ${results.length}개 모델 헬스체크 완료 (타임아웃: ${effTimeout}초 | 정상: ${healthyCount}개, 오프라인: ${results.length - healthyCount}개)`);
        }
      } else {
        if (onNotify) onNotify('WARNING', '헬스체크 응답을 가져오지 못했습니다.');
      }
    } catch (err) {
      if (onNotify) onNotify('ERROR', `헬스체크 실패: ${err.message}`);
    } finally {
      setIsHealthCheckingAll(false);
    }
  };

  const handleCheckSingleHealth = async (modelId, overrideTimeout = null) => {
    const effTimeout = overrideTimeout || healthCheckTimeout;
    setHealthStatus(prev => ({
      ...prev,
      [modelId]: { ...(prev[modelId] || {}), checking: true }
    }));
    try {
      const res = await apiClient.checkModelHealth(modelId, effTimeout);
      setHealthStatus(prev => ({
        ...prev,
        [modelId]: {
          is_healthy: res.is_healthy,
          latency_ms: res.latency_ms,
          status_code: res.status_code,
          error_message: res.error_message,
          checked_at: res.checked_at,
          checking: false
        }
      }));
      if (onNotify) {
        if (res.is_healthy) {
          onNotify('SUCCESS', `[${res.alias || modelId}] 헬스체크 정상: ${res.latency_ms}ms (HTTP ${res.status_code} | 타임아웃 ${effTimeout}s)`);
        } else {
          onNotify('WARNING', `[${res.alias || modelId}] 헬스체크 실패: ${res.error_message || '응답 없음'} (타임아웃 ${effTimeout}s)`);
        }
      }
    } catch (err) {
      setHealthStatus(prev => ({
        ...prev,
        [modelId]: {
          is_healthy: false,
          error_message: err.message,
          checking: false
        }
      }));
      if (onNotify) onNotify('ERROR', `[${modelId}] 헬스체크 오류: ${err.message}`);
    }
  };

  // Copy to clipboard helper
  const handleCopy = (text, fieldKey) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
    if (onNotify) onNotify('SUCCESS', '클립보드에 복사되었습니다.');
  };

  // Test Route Call via Envoy Gateway
  const handleTestCall = async (methodType) => {
    if (!currentWeights || currentWeights.length === 0) {
      if (onNotify) onNotify('ERROR', '현재 라우트에 할당된 서빙 모델이 없습니다. 모델을 먼저 추가하십시오.');
      setTestResult({
        is_success: false,
        status_code: 502,
        latency_ms: 0,
        target_url: activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`,
        request_headers: {},
        response_body: {
          error: "No Upstream Models Configured (HTTP 502 Bad Gateway)",
          message: `라우트 '${currentRoute.route_name}'에 연결된 서빙 모델이 없습니다. 모델 풀에 모델을 추가하고 가중치를 설정하십시오.`
        },
        error_message: "라우트에 연결된 모델이 없습니다. (HTTP 502 Bad Gateway)"
      });
      return;
    }

    setIsTestingRoute(true);
    setTestResult(null);
    try {
      const res = await apiClient.testRouteCall({
        route_name: currentRoute.route_name,
        method: methodType || activeEndpointTab,
        message: "안녕하세요. Envoy 게이트웨이 라우팅 테스트 요청입니다.",
        traffic_weights: currentWeights
      });
      setTestResult(res);
      if (res.is_success) {
        if (onNotify) onNotify('SUCCESS', `Envoy 게이트웨이 호출 성공: HTTP ${res.status_code || 200} (${res.latency_ms}ms)`);
      } else {
        if (onNotify) onNotify('ERROR', `Envoy 게이트웨이 오류: ${res.error_message || `HTTP ${res.status_code || 502}`}`);
      }
    } catch (err) {
      setTestResult({
        is_success: false,
        status_code: 502,
        latency_ms: 0,
        target_url: activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`,
        request_headers: {},
        response_body: { error: err.message },
        error_message: err.message
      });
      if (onNotify) onNotify('ERROR', `테스트 요청 실패: ${err.message}`);
    } finally {
      setIsTestingRoute(false);
    }
  };

  // Change individual weight
  const handleWeightChange = (index, newWeight) => {
    const val = Math.max(0, Math.min(100, Number(newWeight)));
    const updatedWeights = currentWeights.map((w, idx) => {
      if (idx === index) return { ...w, weight: val };
      return w;
    });
    updateCurrentRoute({ traffic_weights: updatedWeights });
  };

  // Auto-Balance Weights across all models in route
  const handleAutoBalance = () => {
    const count = currentWeights.length;
    if (count === 0) return;
    const base = Math.floor(100 / count);
    const remainder = 100 - (base * count);

    const balanced = currentWeights.map((item, idx) => ({
      ...item,
      weight: idx === 0 ? base + remainder : base
    }));
    updateCurrentRoute({ traffic_weights: balanced });
    onNotify('INFO', `가중치가 ${count}개 모델에 균등하게 분할되었습니다.`);
  };

  // Add a model to current route with automatic 100% weight balancing
  const handleAddModelToRoute = (modelId) => {
    if (!modelId) return;
    if (currentWeights.some(w => w.model_id === modelId)) {
      onNotify('WARNING', '이미 해당 라우트의 가중치 풀에 포함된 모델입니다.');
      return;
    }
    
    let updatedWeights;
    if (currentWeights.length === 0) {
      updatedWeights = [{ model_id: modelId, weight: 100 }];
    } else {
      const nextCount = currentWeights.length + 1;
      const base = Math.floor(100 / nextCount);
      const remainder = 100 - (base * nextCount);
      updatedWeights = [
        ...currentWeights.map((w, idx) => ({
          ...w,
          weight: idx === 0 ? base + remainder : base
        })),
        { model_id: modelId, weight: base }
      ];
    }
    
    updateCurrentRoute({ traffic_weights: updatedWeights });
    onNotify('SUCCESS', `모델 '${modelId}'이(가) 라우트 풀에 추가되었습니다. (100% 균등 가중치 자동 분할)`);
  };

  // Remove a model from current route with automatic 100% weight rebalancing
  const handleRemoveModelFromRoute = (index) => {
    if (currentWeights.length <= 1) {
      onNotify('ERROR', '라우트에는 최소 1개 이상의 서빙 모델이 지정되어야 합니다.');
      return;
    }
    const filtered = currentWeights.filter((_, idx) => idx !== index);
    
    let updatedWeights;
    if (filtered.length === 1) {
      updatedWeights = [{ ...filtered[0], weight: 100 }];
    } else {
      const count = filtered.length;
      const base = Math.floor(100 / count);
      const remainder = 100 - (base * count);
      updatedWeights = filtered.map((w, idx) => ({
        ...w,
        weight: idx === 0 ? base + remainder : base
      }));
    }

    updateCurrentRoute({ traffic_weights: updatedWeights });
    onNotify('INFO', '모델이 라우트 풀에서 제외되었으며, 남은 모델에 가중치 100%가 자동 재분배되었습니다.');
  };

  // Dry-Run Validation
  const handleDryRun = async () => {
    setIsDryRunning(true);
    try {
      const payload = {
        route_name: currentRoute.route_name,
        traffic_weights: currentRoute.traffic_weights,
        failover_model_id: currentRoute.failover_model_id || null,
        failover_chain: currentRoute.failover_chain || [],
        match_conditions: currentRoute.match_conditions || {}
      };
      const res = await apiClient.dryRunRouting(payload);
      if (res.is_valid) {
        onNotify('SUCCESS', `드라이런 검증 통과: Envoy RDS v3 [${currentRoute.route_name}] 경로 유효 (총 가중치 ${res.total_weight}%, 활성 엔드포인트: ${res.active_endpoints_count}개).`);
      } else {
        onNotify('ERROR', `드라이런 검증 실패: ${res.validation_errors.join(', ')}`);
      }
    } catch (err) {
      if (totalWeight === 100) {
        onNotify('INFO', `드라이런 검증 통과 (오프라인 모의): 가중치 합계 100% 정상.`);
      } else {
        onNotify('ERROR', `드라이런 검증 실패: 가중치 합계가 100%여야 합니다 (현재: ${totalWeight}%).`);
      }
    } finally {
      setIsDryRunning(false);
    }
  };

  // Deploy xDS Config without downtime & persist to backend
  const handleDeployXds = async () => {
    if (totalWeight !== 100) {
      onNotify('ERROR', `가중치 총합이 반드시 100%여야 배포할 수 있습니다 (현재: ${totalWeight}%).`);
      return;
    }

    setIsDeploying(true);
    try {
      const payload = {
        route_name: currentRoute.route_name,
        traffic_weights: currentRoute.traffic_weights,
        load_balancing_strategy: currentRoute.load_balancing_strategy || 'LeastQueueDepth',
        failover_model_id: currentRoute.failover_model_id || null,
        failover_chain: currentRoute.failover_chain || [],
        match_conditions: currentRoute.match_conditions || {},
        priority: currentRoute.priority || 10,
        is_active: currentRoute.is_active !== false,
        description: currentRoute.description,
        deployed_by: "admin"
      };

      const res = await apiClient.deployRouting(payload);
      const newRev = res.xds_revision;
      setXdsRevision(newRev);
      localStorage.setItem('aiorche_xds_revision', newRev);
      
      // Resync route list from backend to ensure persistence consistency
      try {
        const freshRoutes = await apiClient.getRoutes();
        if (freshRoutes && freshRoutes.length > 0) {
          setRoutes(freshRoutes);
          localStorage.setItem('aiorche_multi_routes', JSON.stringify(freshRoutes));
        }
      } catch (syncErr) {
        console.warn('Could not resync fresh routes after deploy:', syncErr);
      }

      onNotify('SUCCESS', `Envoy L7 게이트웨이에 라우트 [${currentRoute.route_name}] 정책이 무중단 실시간 배포 및 저장되었습니다. (리비전: ${newRev})`);
    } catch (err) {
      console.error('Failed to deploy routing policy:', err);
      onNotify('ERROR', `라우트 정책 저장 및 배포 실패: ${err.message || '서버 응답 오류'}`);
    } finally {
      setIsDeploying(false);
    }
  };

  // Create New Route
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    if (!newRouteForm.route_name.trim()) return;

    const routeName = newRouteForm.route_name.trim();
    if (routes.some(r => r.route_name === routeName)) {
      onNotify('ERROR', `'${routeName}' 라우트가 이미 존재합니다.`);
      return;
    }

    const defaultWeights = models.slice(0, 2).map((m, idx) => ({
      model_id: m.id,
      weight: idx === 0 ? 80 : 20
    }));

    const matchConditions = {};
    if (newRouteForm.match_tenant) {
      matchConditions.tenant_codes = [newRouteForm.match_tenant.trim()];
    }
    if (newRouteForm.match_path) {
      matchConditions.path_prefix = newRouteForm.match_path.trim();
    }

    const newRoute = {
      policy_id: `pol-${Date.now().toString().slice(-6)}`,
      route_name: routeName,
      description: newRouteForm.description || "사용자 정의 멀티 라우트",
      priority: Number(newRouteForm.priority || 10),
      traffic_weights: defaultWeights.length > 0 ? defaultWeights : [{ model_id: "meta-llama/Llama-3.1-8B-Instruct", weight: 100 }],
      load_balancing_strategy: "LeastQueueDepth",
      failover_model_id: models[0]?.id || "meta-llama/Llama-3.1-70B-Instruct",
      failover_chain: [models[0]?.id || "meta-llama/Llama-3.1-70B-Instruct"],
      match_conditions: matchConditions,
      is_active: true
    };

    try {
      await apiClient.createRoute(newRoute);
    } catch (err) {
      console.warn('Backend route creation fallback');
    }

    const updated = [...routes, newRoute];
    setRoutes(updated);
    localStorage.setItem('aiorche_multi_routes', JSON.stringify(updated));
    setSelectedRouteName(routeName);
    setShowNewRouteModal(false);
    setNewRouteForm({ route_name: '', description: '', priority: 15, match_tenant: '', match_path: '' });
    onNotify('SUCCESS', `신규 라우트 '${routeName}'이(가) 생성되었습니다.`);
  };

  // Delete Current Route
  const handleDeleteRoute = async () => {
    if (routes.length <= 1) {
      onNotify('ERROR', '최소 1개 이상의 기본 라우팅 정책이 유지되어야 합니다.');
      return;
    }

    if (!window.confirm(`정말 라우트 '${currentRoute.route_name}'을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await apiClient.deleteRoute(currentRoute.route_name);
    } catch (err) {
      console.warn('Backend route deletion fallback');
    }

    const filtered = routes.filter(r => r.route_name !== currentRoute.route_name);
    setRoutes(filtered);
    localStorage.setItem('aiorche_multi_routes', JSON.stringify(filtered));
    setSelectedRouteName(filtered[0].route_name);
    onNotify('SUCCESS', `라우트 '${currentRoute.route_name}'이(가) 삭제되었습니다.`);
  };

  // Register New Model
  const handleCreateModel = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.createModel({
        model_id: newModelForm.model_id,
        alias: newModelForm.alias,
        target_endpoint: newModelForm.target_endpoint,
        provider: newModelForm.provider || 'openai',
        input_price_per_1k: Number(newModelForm.input_price_per_1k),
        output_price_per_1k: Number(newModelForm.output_price_per_1k),
        health_check_timeout: Number(newModelForm.health_check_timeout || 3.0),
        cache_discount_ratio: 0.25,
        is_active: true,
        api_key: newModelForm.api_key?.trim() || null,
        auth_type: newModelForm.auth_type || 'none'
      });

      const newEntry = {
        id: res.model_id,
        alias: res.alias,
        endpoint: res.target_endpoint,
        provider: res.provider || newModelForm.provider || 'openai',
        healthCheckTimeout: res.health_check_timeout !== undefined ? Number(res.health_check_timeout) : Number(newModelForm.health_check_timeout || 3.0),
        inputPricePer1k: res.input_price_per_1k,
        outputPricePer1k: res.output_price_per_1k,
        apiKey: res.api_key || newModelForm.api_key,
        authType: res.auth_type || newModelForm.auth_type || 'none',
        waitingQueue: 0,
        active: true
      };

      const updated = [...models, newEntry];
      setModels(updated);
      localStorage.setItem('aiorche_models', JSON.stringify(updated));
      setShowNewModelModal(false);
      onNotify('SUCCESS', `신규 모델 '${res.alias}'이(가) 서빙 풀에 추가되었습니다.`);
    } catch (err) {
      const fallbackEntry = {
        id: newModelForm.model_id,
        alias: newModelForm.alias,
        endpoint: newModelForm.target_endpoint,
        provider: newModelForm.provider || 'openai',
        healthCheckTimeout: Number(newModelForm.health_check_timeout || 3.0),
        inputPricePer1k: Number(newModelForm.input_price_per_1k),
        outputPricePer1k: Number(newModelForm.output_price_per_1k),
        apiKey: newModelForm.api_key,
        authType: newModelForm.auth_type || 'none',
        waitingQueue: 0,
        active: true
      };
      const updated = [...models, fallbackEntry];
      setModels(updated);
      localStorage.setItem('aiorche_models', JSON.stringify(updated));
      setShowNewModelModal(false);
      onNotify('SUCCESS', `신규 모델 '${newModelForm.alias}'이(가) 등록되었습니다.`);
    }
  };

  // Delete Model from Catalog
  const handleDeleteModel = async (modelId) => {
    const inCurrentRoute = currentWeights.some(w => w.model_id === modelId);
    const inAnyRoute = routes.some(r => 
      (r.traffic_weights || []).some(w => w.model_id === modelId) || 
      r.failover_model_id === modelId
    );

    let confirmMsg = `정말 모델 '${modelId}'을(를) 서빙 모델 풀에서 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`;
    if (inCurrentRoute || inAnyRoute) {
      confirmMsg = `⚠️ 모델 '${modelId}'은(는) 현재 라우팅 정책에 포함되어 있습니다.\n\n[확인]을 클릭하시면 해당 라우트의 트래픽 분할에서 자동으로 제외되고 카탈로그에서 영구 삭제됩니다.\n\n정말 삭제하시겠습니까?`;
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      await apiClient.deleteModel(modelId, true);
      const filtered = models.filter(m => m.id !== modelId);
      setModels(filtered);
      localStorage.setItem('aiorche_models', JSON.stringify(filtered));

      // Remove from currentWeights if present and rebalance
      if (inCurrentRoute) {
        const remaining = currentWeights.filter(w => w.model_id !== modelId);
        if (remaining.length > 0) {
          const base = Math.floor(100 / remaining.length);
          const remainder = 100 - (base * remaining.length);
          const rebalanced = remaining.map((item, idx) => ({
            ...item,
            weight: idx === 0 ? base + remainder : base
          }));
          updateCurrentRoute({ traffic_weights: rebalanced });
        } else {
          updateCurrentRoute({ traffic_weights: [] });
        }
      }

      // Re-fetch routes to synchronize backend updates
      apiClient.getRoutes().then(updatedRoutes => {
        if (updatedRoutes && updatedRoutes.length > 0) {
          setRoutes(updatedRoutes);
          localStorage.setItem('aiorche_multi_routes', JSON.stringify(updatedRoutes));
        }
      }).catch(() => {});

      onNotify('SUCCESS', `모델 '${modelId}'이(가) 서빙 모델 풀 및 라우트에서 삭제되었습니다.`);
    } catch (err) {
      onNotify('ERROR', `모델 삭제 실패: ${err.message}`);
    }
  };

  const availableModelsToAdd = models.filter(m => !currentWeights.some(w => w.model_id === m.id));

  // Gateway Connection URLs & Snippets
  const gatewayHost = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8080` : 'http://localhost:8080';
  const routePathPrefix = currentRoute.match_conditions?.path_prefix || `/v1/routes/${currentRoute.route_name}`;
  const routeFullPath = `${gatewayHost}${routePathPrefix}`;
  const standardEndpointUrl = `${gatewayHost}/v1/chat/completions`;
  const primaryTenantCode = currentRoute.match_conditions?.tenant_codes?.[0] || 'WM-01';

  const curlSnippetPath = `curl -X POST "${routeFullPath}" \\
  -H "Authorization: Bearer sk-orch-your-virtual-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {"role": "user", "content": "안녕하세요. 포트폴리오 자산 배분 조언을 요청합니다."}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'`;

  const curlSnippetHeader = `curl -X POST "${standardEndpointUrl}" \\
  -H "Authorization: Bearer sk-orch-your-virtual-key" \\
  -H "x-orche-route: ${currentRoute.route_name}" \\
  -H "x-orche-tenant: ${primaryTenantCode}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${currentRoute.route_name}",
    "messages": [
      {"role": "user", "content": "안녕하세요. 포트폴리오 자산 배분 조언을 요청합니다."}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'`;

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${routeFullPath}",
    api_key="sk-orch-your-virtual-key"
)

response = client.chat.completions.create(
    model="${currentRoute.route_name}",
    messages=[
        {"role": "user", "content": "안녕하세요. 포트폴리오 자산 배분 조언을 요청합니다."}
    ],
    temperature=0.7
)

print(response.choices[0].message.content)`;


  // ==========================================
  // Sub-Tab 1: 라우팅 스튜디오 (Routing Studio)
  // ==========================================
  const renderRoutingStudio = () => (
    <div className="subtab-content" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Multi-Route Selector Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label htmlFor="route-profile-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitFork size={15} color="var(--accent-cyan)" />
              <span>가상 라우트 프로필 ({routes.length}개):</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select
                id="route-profile-select"
                className="form-select"
                value={selectedRouteName}
                onChange={(e) => {
                  setSelectedRouteName(e.target.value);
                  localStorage.setItem('aiorche_selected_route', e.target.value);
                }}
                style={{
                  minWidth: '260px',
                  padding: '7px 12px',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border-card)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                {routes.map((r) => (
                  <option key={r.route_name} value={r.route_name} style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)' }}>
                    {r.route_name} — ({r.match_conditions?.path_prefix || `/v1/routes/${r.route_name}`} · 우선순위 {r.priority || 10})
                  </option>
                ))}
              </select>

              {currentRoute && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--accent-cyan)'
                  }}>
                    {currentRoute.match_conditions?.path_prefix || `/v1/routes/${currentRoute.route_name}`}
                  </span>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: currentRoute.is_active !== false ? 'rgba(5, 150, 105, 0.12)' : 'rgba(225, 29, 72, 0.12)',
                    color: currentRoute.is_active !== false ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    border: currentRoute.is_active !== false ? '1px solid rgba(5, 150, 105, 0.25)' : '1px solid rgba(225, 29, 72, 0.25)'
                  }}>
                    우선순위 {currentRoute.priority || 10}
                  </span>
                  <span className={`badge ${currentRoute.is_active !== false ? 'active' : 'revoked'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                    {currentRoute.is_active !== false ? '활성 프로필' : '비활성'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Envoy 진입점:</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 }}>port 8080</span>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span style={{ color: 'var(--text-muted)' }}>xDS 리비전:</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', fontWeight: 600 }}>{xdsRevision}</span>
          </div>
        </div>
      </div>

      {/* Selected Route Configuration Studio */}
      <div className="card" style={{ marginBottom: '24px', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="card-title">
                <GitFork size={20} color="var(--accent-cyan)" />
                <span>라우트 정책 편집: "{currentRoute.route_name}"</span>
              </div>
              <span className={`badge ${currentRoute.is_active !== false ? 'active' : 'revoked'}`}>
                {currentRoute.is_active !== false ? '활성 상태' : '비활성'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {currentRoute.description || "등록된 설명이 없습니다."}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => updateCurrentRoute({ is_active: !currentRoute.is_active })}
            >
              {currentRoute.is_active !== false ? '라우트 비활성화' : '라우트 활성화'}
            </button>
            {routes.length > 1 && (
              <button 
                className="btn btn-secondary btn-sm" 
                style={{ color: 'var(--accent-rose)', borderColor: 'rgba(225, 29, 72, 0.3)' }}
                onClick={handleDeleteRoute}
              >
                <Trash2 size={14} /> 라우트 삭제
              </button>
            )}
          </div>
        </div>
        {/* 1. N-Way Multi-Model Traffic Splitter */}
        <div className="panel-sub" style={{ padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={18} color="var(--accent-cyan)" />
                <span>1. 다중 모델 가중치 분할기 (N-Target Multi-Weighted Traffic Splitter)</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                이 라우트로 인입되는 추론 요청을 {currentWeights.length}개 모델 풀 간에 실시간 비율로 분산 처리합니다.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleAutoBalance}>
                <Scale size={14} color="var(--accent-cyan)" /> <span>가중치 균등 분할</span>
              </button>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                background: totalWeight === 100 ? 'rgba(5, 150, 105, 0.12)' : 'rgba(225, 29, 72, 0.12)',
                color: totalWeight === 100 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                border: totalWeight === 100 ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(225, 29, 72, 0.3)'
              }}>
                {totalWeight === 100 ? '총합: 100% (정상)' : `총합: ${totalWeight}% (차이: ${100 - totalWeight}%)`}
              </div>
            </div>
          </div>

          {/* Visual Stacked Progress Bar */}
          <div style={{
            height: '24px',
            width: '100%',
            background: 'var(--bg-panel)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            display: 'flex',
            marginBottom: '18px',
            border: '1px solid var(--border-subtle)'
          }}>
            {currentWeights.map((item, idx) => {
              const color = DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length];
              if (item.weight <= 0) return null;
              return (
                <div
                  key={item.model_id}
                  style={{
                    width: `${item.weight}%`,
                    background: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    transition: 'width 0.2s ease',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 4px'
                  }}
                  title={`${item.model_id}: ${item.weight}%`}
                >
                  {item.weight >= 10 ? `${item.weight}%` : ''}
                </div>
              );
            })}
          </div>

          {/* Model Weights List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {currentWeights.map((item, idx) => {
              const color = DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length];
              const modelMeta = models.find(m => m.id === item.model_id);
              return (
                <div 
                  key={item.model_id} 
                  className="panel-nested"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px', 
                    padding: '12px 16px', 
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  
                  <div style={{ width: '260px', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      {item.model_id}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: color, fontFamily: 'var(--font-mono)' }}>
                      alias: {modelMeta?.alias || 'vllm-serving'} ({modelMeta?.backend || 'EKS'})
                    </div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={item.weight}
                      onChange={(e) => handleWeightChange(idx, e.target.value)}
                      className="custom-range"
                      style={{ flex: 1 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '75px' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.weight}
                        onChange={(e) => handleWeightChange(idx, e.target.value)}
                        className="form-input"
                        style={{ padding: '4px 8px', fontSize: '0.85rem', textAlign: 'right', color: 'var(--text-primary)' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>%</span>
                    </div>
                  </div>

                  {currentWeights.length > 1 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRemoveModelFromRoute(idx)}
                      style={{ padding: '6px', color: 'var(--accent-rose)' }}
                      title="모델 제외"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Model Selector */}
          {availableModelsToAdd.length > 0 && (
            <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                id="addModelSelect"
                className="form-select"
                style={{ 
                  maxWidth: '360px', 
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border-card)'
                }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddModelToRoute(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="" disabled style={{ color: 'var(--text-muted)' }}>
                  + 카탈로그에서 추가할 모델 선택...
                </option>
                {availableModelsToAdd.map(m => (
                  <option key={m.id} value={m.id} style={{ color: 'var(--text-primary)' }}>
                    {m.id} ({m.alias})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                등록된 서빙 모델을 이 라우트의 트래픽 분할 대상에 포함시킵니다.
              </span>
            </div>
          )}
        </div>

        {/* 2. Routing Match Conditions & Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '22px' }}>
          <div className="panel-sub" style={{ padding: '18px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={18} color="var(--accent-cyan)" />
              <span>2. 조건부 트래픽 매칭 규칙 (Traffic Matchers)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.82rem' }}>
              <div>
                <label className="form-label" style={{ marginBottom: '4px' }}>가상 엔드포인트 URL 접두사 (Path Prefix)</label>
                <input
                  className="form-input"
                  placeholder="예: /v1/routes/financial-advisor"
                  value={currentRoute.match_conditions?.path_prefix || ''}
                  onChange={(e) => {
                    updateCurrentRoute({
                      match_conditions: { ...currentRoute.match_conditions, path_prefix: e.target.value }
                    });
                  }}
                />
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: '4px' }}>적용 대상 부서/테넌트 코드 (쉼표로 구분)</label>
                <input
                  className="form-input"
                  placeholder="예: WM-01, LOAN-01"
                  value={(currentRoute.match_conditions?.tenant_codes || []).join(', ')}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const codes = raw.split(',').map(s => s.trim()).filter(Boolean);
                    updateCurrentRoute({
                      match_conditions: { ...currentRoute.match_conditions, tenant_codes: codes }
                    });
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  해당 테넌트의 가상 API Key(헤더 `x-orche-tenant`)로 호출 시 이 라우트가 자동 선택됩니다.
                </span>
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: '4px' }}>매칭 우선순위 (Priority: 1~100, 낮을수록 우선)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="form-input"
                  value={currentRoute.priority || 10}
                  onChange={(e) => updateCurrentRoute({ priority: Number(e.target.value) })}
                  style={{ maxWidth: '120px' }}
                />
              </div>
            </div>
          </div>

          {/* 3. Load Balancing Strategy & Failover Chain */}
          <div className="panel-sub" style={{ padding: '18px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color="var(--accent-emerald)" />
              <span>3. 부하 분산 전략 & 다단계 장애 우회 (Failover Chain)</span>
            </div>
            
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ marginBottom: '6px' }}>지능형 부하 분산 알고리즘</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="strategy"
                    value="LeastQueueDepth"
                    checked={(currentRoute.load_balancing_strategy || 'LeastQueueDepth') === 'LeastQueueDepth'}
                    onChange={() => updateCurrentRoute({ load_balancing_strategy: 'LeastQueueDepth' })}
                  />
                  <span><strong>최소 큐 깊이 (Least Queue Depth)</strong> - KV-Cache 및 vLLM 대기 큐 최적 분산</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="strategy"
                    value="PrefixCacheAffinity"
                    checked={currentRoute.load_balancing_strategy === 'PrefixCacheAffinity'}
                    onChange={() => updateCurrentRoute({ load_balancing_strategy: 'PrefixCacheAffinity' })}
                  />
                  <span><strong>프롬프트 캐시 친화도 (Prefix Cache Affinity)</strong> - 동일 시스템 프롬프트 캐시 적중률 극대화</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="strategy"
                    value="RoundRobin"
                    checked={currentRoute.load_balancing_strategy === 'RoundRobin'}
                    onChange={() => updateCurrentRoute({ load_balancing_strategy: 'RoundRobin' })}
                  />
                  <span><strong>단순 라운드로빈 (Weighted Round Robin)</strong> - 단순 분할</span>
                </label>
              </div>
            </div>

            <div>
              <label className="form-label" style={{ marginBottom: '4px' }}>1차 장애 우회 (Failover Target)</label>
              <select
                className="form-select"
                value={currentRoute.failover_model_id || ''}
                onChange={(e) => updateCurrentRoute({ failover_model_id: e.target.value })}
                style={{ fontSize: '0.82rem', marginBottom: '8px' }}
              >
                <option value="">(선택 안 함 - 기본 라운드로빈 유지)</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.id} ({m.alias})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Envoy L7 헬스체크 실패(5xx/Timeout) 시 무중단 자동 페일오버되는 대상 모델입니다.
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {totalWeight === 100 ? (
              <span style={{ fontSize: '0.84rem', color: 'var(--accent-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={16} />
                <span>가중치 합계 100% 정상 (저장 및 배포 준비 완료)</span>
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--accent-amber)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={16} />
                  <span>가중치 합계: {totalWeight}% (100% 일치 시 저장 가능)</span>
                </span>
                {currentWeights.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAutoBalance}
                    style={{ fontSize: '0.76rem', padding: '4px 10px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                  >
                    ⚡ 100% 균등 자동 맞춤
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={handleDryRun} disabled={isDryRunning}>
              {isDryRunning ? '검증 중...' : '드라이런 사전 검증'}
            </button>
            <button className="btn btn-primary" onClick={handleDeployXds} disabled={isDeploying || totalWeight !== 100}>
              {isDeploying ? '저장 및 배포 중...' : 'Envoy xDS 라우팅 즉시 배포 및 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // Sub-Tab 2: 서빙 모델 풀 (Model Catalog)
  // ==========================================
  const renderModelCatalog = () => (
    <div className="subtab-content" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Upstream Clarification Notice */}
      <div className="callout-notice" style={{ marginBottom: '14px' }}>
        💡 <strong>안내:</strong> 아래 모델 카탈로그의 엔드포인트는 주전산센터 내부 <strong>'Upstream 원본 서빙 인프라'</strong> 주소입니다. 외부 개발자 및 클라이언트는 상단의 <strong>'Envoy L7 게이트웨이 엔드포인트(포트 8080)'</strong>로 인입되며, 게이트웨이가 가중치에 따라 아래 원본 모델 풀로 트래픽을 자동 분산합니다.
      </div>

      {/* Model Catalog Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">
              <Cpu size={20} color="var(--accent-emerald)" />
              <span>LLM 서빙 모델 풀</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              주전산센터(K8s/Bare-Metal/VM/Host) 내 배포된 실제 추론 엔드포인트 실시간 헬스 상태
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* 수동 타임아웃 조절 컨트롤러 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(15, 23, 42, 0.65)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.76rem'
            }}>
              <Timer size={13} color="var(--accent-amber)" />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>타임아웃:</span>
              <select
                value={healthCheckTimeout}
                onChange={(e) => handleHealthTimeoutChange(Number(e.target.value))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-amber)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)'
                }}
                title="헬스체크 응답 대기 최대 시간 (초)"
              >
                <option value={1.0} style={{ background: '#0f172a', color: '#fff' }}>1.0초 (초고속)</option>
                <option value={2.0} style={{ background: '#0f172a', color: '#fff' }}>2.0초 (사내망 권장)</option>
                <option value={3.0} style={{ background: '#0f172a', color: '#fff' }}>3.0초 (기본값)</option>
                <option value={5.0} style={{ background: '#0f172a', color: '#fff' }}>5.0초 (원격 서버)</option>
                <option value={10.0} style={{ background: '#0f172a', color: '#fff' }}>10.0초 (외부 API)</option>
                <option value={15.0} style={{ background: '#0f172a', color: '#fff' }}>15.0초 (대형 LLM)</option>
                <option value={30.0} style={{ background: '#0f172a', color: '#fff' }}>30.0초 (최대 대기)</option>
              </select>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleCheckAllHealth()}
              disabled={isHealthCheckingAll}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
              title={`설정된 타임아웃(${healthCheckTimeout}초)으로 전체 서빙 모델 엔드포인트 헬스체크 수행`}
            >
              <RefreshCw size={14} className={isHealthCheckingAll ? 'spin' : ''} />
              <span>{isHealthCheckingAll ? '전체 점검 중...' : '전체 헬스체크 (Ping All)'}</span>
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowNewModelModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
            >
              <Plus size={14} />
              <span>신규 모델 등록</span>
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>모델 식별자 / 별칭</th>
                <th>엔드포인트 URL & 인증 방식</th>
                <th>토큰 단가 (입력/출력)</th>
                <th>대기 큐</th>
                <th>상태 & 헬스</th>
                <th>현재 라우트 포함</th>
                <th style={{ textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <Cpu size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        등록된 LLM 서빙 모델이 없습니다
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        우측 상단의 '+ 신규 모델 등록' 버튼을 눌러 첫 번째 추론 엔드포인트를 등록하세요.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                models.map((m) => {
                  const isInCurrentRoute = currentWeights.some(w => w.model_id === m.id);
                  return (
                    <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>alias: {m.alias}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                      {(() => {
                        const prov = LLM_PROVIDERS.find(p => p.id === m.provider) || LLM_PROVIDERS[0];
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span 
                              style={{ 
                                fontSize: '0.66rem', 
                                fontWeight: 700, 
                                padding: '1px 6px', 
                                borderRadius: '4px', 
                                background: `${prov.color}20`, 
                                color: prov.color, 
                                border: `1px solid ${prov.color}50` 
                              }}
                              title={prov.desc}
                            >
                              {prov.name}
                            </span>
                            {!prov.isCompatible && prov.id !== 'custom' && (
                              <span style={{ fontSize: '0.62rem', color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                                비호환
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{m.endpoint}</div>
                      <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {m.authType === 'apikey' ? (
                          <span className="badge warning" style={{ fontSize: '0.65rem', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={`엔드포인트 연결 시 header 'apikey = {api_key}' 전송`}>
                            <Key size={10} />
                            <span>apikey Header</span>
                          </span>
                        ) : m.authType === 'bearer' ? (
                          <span className="badge info" style={{ fontSize: '0.65rem', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={`엔드포인트 연결 시 header 'Authorization: Bearer {api_key}' 전송`}>
                            <Lock size={10} />
                            <span>Bearer Token</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            인증 없음
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      ₩{m.inputPricePer1k} / ₩{m.outputPricePer1k} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>/ 1k tok</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {m.waitingQueue} reqs
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>
                          <span className={`badge ${m.active !== false ? 'active' : 'revoked'}`} style={{ fontSize: '0.7rem' }}>
                            {m.active !== false ? '정상 서빙' : '비활성'}
                          </span>
                        </div>
                        {(() => {
                          const hs = healthStatus[m.id];
                          const effTimeout = m.healthCheckTimeout || healthCheckTimeout;
                          if (!hs) {
                            return (
                              <button
                                onClick={() => handleCheckSingleHealth(m.id, effTimeout)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: '0.68rem', height: '22px', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}
                                title={`실시간 엔드포인트 핑 테스트 (타임아웃: ${effTimeout}초)`}
                              >
                                <Zap size={11} color="var(--accent-cyan)" />
                                <span>핑 테스트</span>
                              </button>
                            );
                          }
                          if (hs.checking) {
                            return (
                              <span
                                className="badge info"
                                style={{
                                  fontSize: '0.68rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  width: 'fit-content'
                                }}
                              >
                                <RefreshCw size={11} className="spin" />
                                <span>점검 중 ({effTimeout}s)...</span>
                              </span>
                            );
                          }
                          if (hs.is_healthy) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span
                                  className="badge active"
                                  style={{
                                    fontSize: '0.68rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title={`HTTP ${hs.status_code || 200} OK | 지연시간: ${hs.latency_ms}ms (타임아웃: ${effTimeout}s)`}
                                >
                                  <CheckCircle2 size={11} />
                                  <span>정상 ({hs.latency_ms}ms)</span>
                                </span>
                                <button
                                  onClick={() => handleCheckSingleHealth(m.id, effTimeout)}
                                  title={`다시 점검 (타임아웃: ${effTimeout}초)`}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center' }}
                                >
                                  <RefreshCw size={12} />
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span
                                className="badge danger"
                                style={{
                                  fontSize: '0.68rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title={hs.error_message || '연결 불가'}
                              >
                                <AlertCircle size={11} />
                                <span>오프라인</span>
                              </span>
                              <button
                                onClick={() => handleCheckSingleHealth(m.id, effTimeout)}
                                title={`재시도 (타임아웃: ${effTimeout}초): ${hs.error_message || '연결 실패'}`}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-rose)', padding: '2px', display: 'flex', alignItems: 'center' }}
                              >
                                <RefreshCw size={12} />
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td>
                      {isInCurrentRoute ? (
                        <span style={{ color: 'var(--accent-emerald)', fontSize: '0.8rem', fontWeight: 600 }}>
                          포함됨 ({currentWeights.find(w => w.model_id === m.id)?.weight}%)
                        </span>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleAddModelToRoute(m.id)}
                          style={{ fontSize: '0.75rem' }}
                        >
                          + 라우트에 추가
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEditModal(m)}
                          style={{
                            padding: '3px 8px',
                            color: 'var(--accent-cyan)',
                            borderColor: 'rgba(56, 189, 248, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem'
                          }}
                          title="서빙 모델 속성 및 엔드포인트/인증 정보 수정"
                        >
                          <Edit3 size={12} />
                          <span>수정</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDeleteModel(m.id)}
                          style={{
                            padding: '3px 8px',
                            color: 'var(--accent-rose)',
                            borderColor: 'rgba(225, 29, 72, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem'
                          }}
                          title="서빙 모델 풀에서 영구 삭제"
                        >
                          <Trash2 size={12} />
                          <span>삭제</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ========================================================
  // Sub-Tab 3: AgentRouter 관제 & 테스트 (Dispatch & Testbench)
  // ========================================================
  const renderDispatchAndTestbench = () => (
    <div className="subtab-content" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* Phase 0.1: AgentRouter Cognitive Dispatcher Panel */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px', borderColor: 'rgba(124, 58, 237, 0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(124, 58, 237, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
              <Compass size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>AgentRouter 지능형 디스패치 관제</h3>
                <span className="badge active" style={{ fontSize: '0.7rem' }}>2-Tier L7 AI Gateway</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Envoy AI Gateway의 L7 ext_proc 파이프라인에서 프롬프트 난이도를 실시간 분석하여 Fast 8B와 Reasoning 72B로 스마트 분기합니다.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="badge info" style={{ fontSize: '0.75rem' }}>Fast 8B Tier</span>
            <span className="badge purple" style={{ fontSize: '0.75rem' }}>Reasoning 72B Tier</span>
            <span className="badge active" style={{ fontSize: '0.75rem' }}>Self-Healing Fallback</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPolicyModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                padding: '4px 10px',
                color: 'var(--accent-purple)',
                borderColor: 'rgba(124, 58, 237, 0.4)',
                cursor: 'pointer'
              }}
            >
              <Settings size={14} color="currentColor" />
              <span>4대 정책 상세 편집</span>
            </button>
          </div>
        </div>

        {/* Live Simulator Form */}
        <div className="panel-nested" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 500px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                프롬프트 인텐트 & 복잡도 실시간 시뮬레이터 (Simulate Live Dispatch)
              </label>
              <textarea
                className="form-control"
                rows={2}
                value={agentSimPrompt}
                onChange={(e) => setAgentSimPrompt(e.target.value)}
                placeholder="테스트할 질문을 입력하십시오. (예: 단순 날씨 질의, 복잡한 파이썬 알고리즘/SQL, 도구 호출 등)"
                style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ width: '160px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                라우팅 정책
              </label>
              <select
                className="form-control"
                value={agentSimPolicy}
                onChange={(e) => setAgentSimPolicy(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
              >
                <option value="QualityFirst">QualityFirst (품질 우선)</option>
                <option value="LeastCost">LeastCost (비용 최적화)</option>
                <option value="LatencyOptimized">LatencyOptimized (지연시간)</option>
                <option value="SelfHealingFallback">SelfHealingFallback (폴백)</option>
              </select>
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleSimulateAgent}
                disabled={isSimulatingAgent}
                style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isSimulatingAgent ? <RefreshCw className="spin" size={15} /> : <Play size={15} />}
                <span>인텐트 분석 실행</span>
              </button>
            </div>
          </div>

          {/* Simulation Output Card */}
          {agentSimResult && (
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="panel-kpi-sub">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>판정된 복잡도 (Complexity)</span>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: agentSimResult.complexity === 'REASONING_HEAVY' ? 'var(--accent-purple)' : (agentSimResult.complexity === 'LIGHT' ? 'var(--accent-cyan)' : 'var(--accent-emerald)'), marginTop: '2px' }}>
                  {agentSimResult.complexity}
                </div>
              </div>
              <div className="panel-kpi-sub">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>디스패치 모델 티어</span>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-amber)', marginTop: '2px' }}>
                  {agentSimResult.suggested_tier.toUpperCase()}
                </div>
              </div>
              <div className="panel-kpi-sub">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>선택된 타깃 모델</span>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agentSimResult.selected_model}
                </div>
              </div>
              <div className="panel-kpi-sub">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Envoy 업스트림 클러스터</span>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)', marginTop: '4px' }}>
                  {agentSimResult.target_cluster}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: 'var(--bg-panel)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>판정 사유:</strong> {agentSimResult.reasons?.join(' | ') || '기본 휴리스틱 인텐트 분류'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Envoy Gateway API 엔드포인트 & 실시간 테스트 벤치 카드 */}
      <div className="card" style={{ marginBottom: '24px', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="card-title">
                <Globe size={20} color="var(--accent-cyan)" />
                <span>Envoy Gateway API 엔드포인트 & 실시간 테스트 벤치</span>
              </div>
              <span className="badge active">포트 8080 Ingress</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              현재 선택된 라우트 프로필(<strong>"{currentRoute.route_name}"</strong>)로 실제 인그레스 HTTP 요청을 전송하고 L7 xDS 라우팅 응답을 실시간 검증합니다.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label htmlFor="testbench-route-select" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>테스트 라우트:</label>
            <select
              id="testbench-route-select"
              className="form-select"
              value={selectedRouteName}
              onChange={(e) => {
                setSelectedRouteName(e.target.value);
                localStorage.setItem('aiorche_selected_route', e.target.value);
              }}
              style={{ fontSize: '0.82rem', padding: '5px 10px', minWidth: '180px' }}
            >
              {routes.map(r => (
                <option key={r.route_name} value={r.route_name}>
                  {r.route_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 0. Envoy Gateway API Endpoint & Connection Guide */}
        <div className="panel-sub" style={{
          padding: '20px',
          marginBottom: '20px',
          maxWidth: '100%',
          width: '100%',
          minWidth: 0,
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ minWidth: 0, flex: '1 1 300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Globe size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                  게이트웨이 API 엔드포인트 (Gateway Ingress Port: 8080)
                </span>
                <span className="badge active" style={{ fontSize: '0.7rem' }}>
                  무중단 xDS 라우팅 활성
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                외부 애플리케이션 및 개발자는 아래 엔드포인트를 호출하여 <strong style={{ color: 'var(--text-primary)' }}>"{currentRoute.route_name}"</strong> 정책에 정의된 모델 풀({currentWeights.length}개 가중치 분할)로 트래픽을 전송합니다.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleTestCall(activeEndpointTab)}
                disabled={isTestingRoute}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
              >
                <Play size={13} fill="currentColor" />
                <span>{isTestingRoute ? '게이트웨이 호출 중...' : '⚡ 게이트웨이 즉시 테스트 호출'}</span>
              </button>
            </div>
          </div>

          {/* Primary Endpoint Box */}
          <div className="panel-nested" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
            maxWidth: '100%',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px', minWidth: 0, flexWrap: 'wrap' }}>
              <span className="badge active" style={{ fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                POST
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.92rem',
                fontWeight: 600,
                color: 'var(--accent-cyan)',
                wordBreak: 'break-all',
                overflowWrap: 'anywhere',
                minWidth: 0
              }}>
                {activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`}
              </span>
              {activeEndpointTab === 'header' && (
                <span className="badge warning" style={{ fontSize: '0.7rem', flexShrink: 0 }}>
                  Header: x-orche-route: {currentRoute.route_name}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => handleCopy(activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`, 'endpoint')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedField === 'endpoint' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                <span>{copiedField === 'endpoint' ? '복사됨!' : 'URL 복사'}</span>
              </button>
            </div>
          </div>

          {/* Integration Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '14px', flexWrap: 'wrap' }}>
            {[
              { id: 'path', label: '1. 경로 기반 호출 (Path Prefix / OpenAI base_url 호환)' },
              { id: 'header', label: '2. 공통 엔드포인트 + 라우트 헤더 지정 (Standard OpenAI)' },
              { id: 'python', label: '3. Python (OpenAI SDK 연동 스니펫)' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveEndpointTab(tab.id)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeEndpointTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  color: activeEndpointTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: activeEndpointTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Path Based */}
          {activeEndpointTab === 'path' && (
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                💡 별도 헤더 없이 고유 URL 접두사로 즉시 라우팅됩니다. OpenAI SDK의 <code style={{ color: 'var(--accent-cyan)', background: 'var(--bg-panel)', padding: '2px 4px', borderRadius: '4px' }}>base_url</code>에 그대로 지정할 수 있습니다.
              </div>
              <div style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#a7f3d0',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  boxSizing: 'border-box',
                  border: '1px solid #1e293b'
                }}>
                  <code>{curlSnippetPath}</code>
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippetPath, 'curl-path')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'curl-path' ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  <span>{copiedField === 'curl-path' ? '복사됨' : 'cURL 복사'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Header Based */}
          {activeEndpointTab === 'header' && (
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                💡 공통 엔드포인트(<code style={{ color: 'var(--accent-cyan)', background: 'var(--bg-panel)', padding: '2px 4px', borderRadius: '4px' }}>/v1/chat/completions</code>)를 사용하면서 <code style={{ color: 'var(--accent-amber)', background: 'var(--bg-panel)', padding: '2px 4px', borderRadius: '4px' }}>x-orche-route</code> 헤더로 목적지 라우트를 지정합니다.
              </div>
              <div style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#a7f3d0',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  boxSizing: 'border-box',
                  border: '1px solid #1e293b'
                }}>
                  <code>{curlSnippetHeader}</code>
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippetHeader, 'curl-header')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'curl-header' ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  <span>{copiedField === 'curl-header' ? '복사됨' : 'cURL 복사'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Python OpenAI SDK */}
          {activeEndpointTab === 'python' && (
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                💡 파이썬 공식 OpenAI SDK 클라이언트 초기화 코드 예시입니다.
              </div>
              <div style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#93c5fd',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  boxSizing: 'border-box',
                  border: '1px solid #1e293b'
                }}>
                  <code>{pythonSnippet}</code>
                </pre>
                <button
                  onClick={() => handleCopy(pythonSnippet, 'python')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'python' ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  <span>{copiedField === 'python' ? '복사됨' : '코드 복사'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Test Call Response Box */}
          {testResult && (
            <div className="panel-nested" style={{
              marginTop: '16px',
              padding: '14px 16px',
              border: `1px solid ${testResult.is_success ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
              maxWidth: '100%',
              width: '100%',
              minWidth: 0,
              overflow: 'hidden',
              boxSizing: 'border-box'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
                flexWrap: 'wrap',
                gap: '8px',
                minWidth: 0,
                maxWidth: '100%',
                width: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%', flex: '1 1 0' }}>
                  <span className={`badge ${testResult.is_success ? 'active' : 'revoked'}`} style={{ fontSize: '0.72rem', flexShrink: 0 }}>
                    {testResult.is_success ? `HTTP ${testResult.status_code || 200} OK` : `HTTP ${testResult.status_code || '오류'}`}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600, flexShrink: 0 }}>
                    게이트웨이 응답 테스트 결과 ({testResult.latency_ms}ms)
                  </span>
                  <span style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                    minWidth: 0,
                    maxWidth: '100%',
                    display: 'inline-block'
                  }}>
                    대상 URL: {testResult.target_url}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const body = testResult.response_body;
                      let text = '';
                      if (!body) text = testResult.error_message || '결과 없음';
                      else if (typeof body === 'object') {
                        try { text = JSON.stringify(body, null, 2); } catch { text = String(body); }
                      } else if (typeof body === 'string') {
                        try { text = JSON.stringify(JSON.parse(body), null, 2); } catch { text = body; }
                      } else { text = String(body); }
                      handleCopy(text, 'test-res-body');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      height: '24px'
                    }}
                    title="응답 JSON 복사"
                  >
                    {copiedField === 'test-res-body' ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                    <span>{copiedField === 'test-res-body' ? '복사됨' : '복사'}</span>
                  </button>
                  <button
                    onClick={() => setTestResult(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      flexShrink: 0,
                      padding: '2px 6px'
                    }}
                  >
                    닫기 ✕
                  </button>
                </div>
              </div>
              {(() => {
                const body = testResult.response_body;
                let parsedJson = null;
                let extractedContent = null;

                if (body) {
                  if (typeof body === 'object') {
                    parsedJson = body;
                  } else if (typeof body === 'string') {
                    try { parsedJson = JSON.parse(body); } catch { /* raw string */ }
                  }
                }

                if (parsedJson && typeof parsedJson === 'object') {
                  extractedContent = 
                    parsedJson.choices?.[0]?.message?.content ||
                    parsedJson.choices?.[0]?.text ||
                    (typeof parsedJson.response === 'string' ? parsedJson.response : null) ||
                    parsedJson.message?.content ||
                    (typeof parsedJson.message === 'string' ? parsedJson.message : null);
                }

                const rawJsonString = body
                  ? (parsedJson ? JSON.stringify(parsedJson, null, 2) : String(body))
                  : (testResult.error_message || '결과 없음');

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                    {/* 1. 모델이 응답한 실제 텍스트 본문 (\\n 개행을 실제 엔터 줄바꿈으로 완벽 렌더링) */}
                    {extractedContent && (
                      <div style={{
                        padding: '12px 14px',
                        background: 'rgba(6, 182, 212, 0.08)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        borderRadius: '6px',
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                          gap: '6px',
                          minWidth: 0
                        }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={14} color="var(--accent-cyan)" />
                            <span>AI 모델 생성 본문 (줄바꿈 서식 적용 완료):</span>
                          </span>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCopy(extractedContent, 'test-res-content')}
                            style={{ fontSize: '0.7rem', padding: '2px 8px', height: '22px' }}
                          >
                            {copiedField === 'test-res-content' ? <Check size={11} color="var(--accent-emerald)" /> : <Copy size={11} />}
                            <span>{copiedField === 'test-res-content' ? '본문 복사됨' : '본문 복사'}</span>
                          </button>
                        </div>
                        <div style={{
                          fontSize: '0.82rem',
                          lineHeight: '1.7',
                          color: '#f8fafc',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          fontFamily: 'inherit'
                        }}>
                          {extractedContent}
                        </div>
                      </div>
                    )}

                    {/* 2. 전체 JSON 페이로드 (Raw JSON 포맷팅) */}
                    <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Code size={12} />
                        <span>{extractedContent ? '전체 게이트웨이 HTTP 원본 JSON 응답 전문 (Full Payload):' : '게이트웨이 응답 JSON 전문:'}</span>
                      </div>
                      <textarea
                        readOnly
                        value={rawJsonString}
                        rows={extractedContent ? 8 : 12}
                        style={{
                          width: '100%',
                          maxWidth: '100%',
                          minWidth: 0,
                          margin: 0,
                          padding: '12px 14px',
                          background: '#040711',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          color: testResult.is_success ? '#a7f3d0' : '#fca5a5',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          boxSizing: 'border-box',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                          resize: 'vertical',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1>모델 & 라우팅</h1>
            <span className="badge info" style={{ fontSize: '0.75rem' }}>Envoy AI Gateway (ext_proc)</span>
            <span className="badge purple" style={{ fontSize: '0.75rem' }}>AgentRouter 탑재</span>
            <span className="badge active" style={{ fontSize: '0.75rem' }}>Phase 0.1 활성</span>
          </div>
          <p>CNCF Envoy AI Gateway L7 관문과 AgentRouter 인지 지능 엔진을 통해 프롬프트 인텐트/복잡도별 최적 모델 자동 분기 및 무중단 카나리 트래픽을 제어합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowNewRouteModal(true)}>
            <Plus size={16} /> 신규 라우트 생성
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewModelModal(true)}>
            + 신규 서빙 모델 등록
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {[
            {
              id: 'routing',
              label: '라우팅 스튜디오 (Routing Studio)',
              icon: GitFork,
              badge: `${routes.length}개 프로필`,
              badgeColor: 'info'
            },
            {
              id: 'catalog',
              label: '서빙 모델 풀 (Model Catalog)',
              icon: Cpu,
              badge: `${models.length}개 모델`,
              badgeColor: 'active'
            },
            {
              id: 'dispatch',
              label: 'AgentRouter & 테스트 (Dispatch & Testbench)',
              icon: Compass,
              badge: 'Live Ingress',
              badgeColor: 'purple'
            }
          ].map(tab => {
            const isActive = activeSubTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: isActive ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid var(--border-subtle)',
                  background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-panel)',
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 0 12px rgba(56, 189, 248, 0.12)' : 'none'
                }}
              >
                <Icon size={16} color={isActive ? 'var(--accent-cyan)' : 'currentColor'} />
                <span>{tab.label}</span>
                <span className={`badge ${tab.badgeColor}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* SubTab Specific Quick Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeSubTab === 'routing' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewRouteModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> <span>신규 라우트 생성</span>
            </button>
          )}
          {activeSubTab === 'catalog' && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(15, 23, 42, 0.65)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.76rem'
              }}>
                <Timer size={13} color="var(--accent-amber)" />
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>타임아웃:</span>
                <select
                  value={healthCheckTimeout}
                  onChange={(e) => handleHealthTimeoutChange(Number(e.target.value))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-amber)',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)'
                  }}
                  title="헬스체크 응답 대기 최대 시간 (초)"
                >
                  <option value={1.0} style={{ background: '#0f172a', color: '#fff' }}>1.0초 (초고속)</option>
                  <option value={2.0} style={{ background: '#0f172a', color: '#fff' }}>2.0초 (사내망 권장)</option>
                  <option value={3.0} style={{ background: '#0f172a', color: '#fff' }}>3.0초 (기본값)</option>
                  <option value={5.0} style={{ background: '#0f172a', color: '#fff' }}>5.0초 (원격 서버)</option>
                  <option value={10.0} style={{ background: '#0f172a', color: '#fff' }}>10.0초 (외부 API)</option>
                  <option value={15.0} style={{ background: '#0f172a', color: '#fff' }}>15.0초 (대형 LLM)</option>
                  <option value={30.0} style={{ background: '#0f172a', color: '#fff' }}>30.0초 (최대 대기)</option>
                </select>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => handleCheckAllHealth()} disabled={isHealthCheckingAll} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`설정된 타임아웃(${healthCheckTimeout}초)으로 전체 헬스체크`}>
                <Zap size={14} color="var(--accent-cyan)" /> <span>{isHealthCheckingAll ? '점검 중...' : '전체 헬스체크 (Ping All)'}</span>
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewModelModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> <span>신규 모델 등록</span>
              </button>
            </>
          )}
          {activeSubTab === 'dispatch' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPolicyModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-purple)', borderColor: 'rgba(124, 58, 237, 0.4)' }}>
              <Settings size={14} /> <span>4대 정책 상세 편집</span>
            </button>
          )}
        </div>
      </div>

      {/* Render Active Sub-Tab View */}
      {activeSubTab === 'routing' && renderRoutingStudio()}
      {activeSubTab === 'catalog' && renderModelCatalog()}
      {activeSubTab === 'dispatch' && renderDispatchAndTestbench()}


      {/* New Route Modal */}
      {showNewRouteModal && (
        <div className="modal-overlay" onClick={() => setShowNewRouteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitFork size={18} color="var(--accent-cyan)" />
                <span>신규 가상 라우트 프로필 생성</span>
              </div>
            </div>
            <form onSubmit={handleCreateRoute}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">라우트 고유 식별자 (Route Name)</label>
                  <input
                    className="form-input"
                    placeholder="예: wealth-management-v2, loan-audit-v1"
                    value={newRouteForm.route_name}
                    onChange={(e) => setNewRouteForm({ ...newRouteForm, route_name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">라우트 설명 (Description)</label>
                  <input
                    className="form-input"
                    placeholder="예: 여신심사 및 기업 대출 심사 전용 카나리 풀"
                    value={newRouteForm.description}
                    onChange={(e) => setNewRouteForm({ ...newRouteForm, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">우선순위 (Priority)</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="form-input"
                      value={newRouteForm.priority}
                      onChange={(e) => setNewRouteForm({ ...newRouteForm, priority: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">매칭 테넌트 (선택)</label>
                    <input
                      className="form-input"
                      placeholder="예: LOAN-01"
                      value={newRouteForm.match_tenant}
                      onChange={(e) => setNewRouteForm({ ...newRouteForm, match_tenant: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">엔드포인트 접두사 (선택)</label>
                  <input
                    className="form-input"
                    placeholder="예: /v1/routes/loan-audit"
                    value={newRouteForm.match_path}
                    onChange={(e) => setNewRouteForm({ ...newRouteForm, match_path: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewRouteModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">
                  라우트 생성 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Model Modal */}
      {showNewModelModal && (
        <div className="modal-overlay" onClick={() => setShowNewModelModal(false)}>
          <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={20} color="var(--accent-cyan)" />
                <span>신규 LLM 서빙 모델 등록</span>
              </div>
            </div>
            <form onSubmit={handleCreateModel}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">모델 식별자 (Model ID)</label>
                  <input 
                    className="form-input" 
                    placeholder="예: Qwen/Qwen2.5-14B-Instruct 또는 qwen2.5:14b" 
                    value={newModelForm.model_id}
                    onChange={(e) => setNewModelForm({...newModelForm, model_id: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">서비스 가상 별칭 (Route Alias)</label>
                  <input 
                    className="form-input" 
                    placeholder="예: qwen-14b-enterprise" 
                    value={newModelForm.alias}
                    onChange={(e) => setNewModelForm({...newModelForm, alias: e.target.value})}
                    required
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
                      <span>LLM Provider 규격 선택</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>* 선택 시 URL 접미사 자동 완성</span>
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
                                비호환
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'left', wordBreak: 'break-all' }}>
                            {p.pathSuffix || '직접 지정'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 베이스 도메인 입력 */}
                  <div style={{ marginTop: '8px' }}>
                    <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>베이스 도메인 / 호스트 (Base Domain / Host)</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>도메인만 입력하면 완성</span>
                    </label>
                    <input 
                      className="form-input" 
                      placeholder="예: https://integrate.api.nvidia.com 또는 http://192.168.1.100:8000" 
                      value={newModelForm.base_domain}
                      onChange={(e) => handleNewModelDomainChange(e.target.value)}
                    />
                  </div>

                  {/* 자동 완성된 최종 Target Endpoint */}
                  <div style={{ marginTop: '10px' }}>
                    <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, color: 'var(--heading-color)' }}>
                        완성된 최종 엔드포인트 URL (Target Endpoint)
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>
                        실제 호출 대상
                      </span>
                    </label>
                    <input 
                      className="form-input" 
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'rgba(15, 23, 42, 0.7)' }}
                      placeholder="예: https://integrate.api.nvidia.com/v1/chat/completions"
                      value={newModelForm.target_endpoint}
                      onChange={(e) => setNewModelForm({...newModelForm, target_endpoint: e.target.value})}
                      required
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      * 선택한 Provider 규격의 접미사가 베이스 도메인 뒤에 덧붙여 완성됩니다. 필요한 경우 직접 미세 조정할 수 있습니다.
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
                      <span>엔드포인트 연결 인증 옵션 (Auth Header Option)</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>* 업스트림 호출 시 주입</span>
                  </label>

                  {/* 3가지 인증 방식 선택 세그먼트 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {[
                      { 
                        id: 'none', 
                        label: '인증 없음', 
                        sub: '사내 폐쇄망 / No Auth', 
                        color: 'var(--text-muted)' 
                      },
                      { 
                        id: 'apikey', 
                        label: 'header: apikey', 
                        sub: 'apikey = {API Key}', 
                        color: '#fb923c' 
                      },
                      { 
                        id: 'bearer', 
                        label: 'Authorization: Bearer', 
                        sub: 'Bearer {API Key}', 
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
                          {newModelForm.auth_type === 'apikey' ? 'API Key (헤더 apikey 로 전송)' : 'API Key (Bearer 토큰으로 전송)'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)' }}>필수 입력</span>
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Lock size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                        <input 
                          type={showApiKey ? 'text' : 'password'}
                          className="form-input" 
                          style={{ paddingLeft: '36px', paddingRight: '40px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                          placeholder={newModelForm.auth_type === 'apikey' 
                            ? 'header 에 apikey = {입력받은 api key} 로 전송됩니다' 
                            : 'header 에 Authorization: Bearer {입력받은 api key} 로 전송됩니다'}
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
                          title={showApiKey ? 'API 키 숨기기' : 'API 키 표시'}
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
                          ⚡ 엔드포인트 연결 시 전송되는 HTTP 헤더 미리보기:
                        </div>
                        <div style={{ color: '#94a3b8' }}>Content-Type: application/json</div>
                        <div style={{ color: newModelForm.auth_type === 'apikey' ? '#fb923c' : '#38bdf8', fontWeight: 600 }}>
                          {newModelForm.auth_type === 'apikey' 
                            ? `apikey: ${newModelForm.api_key ? (showApiKey ? newModelForm.api_key : '••••••••••••••••') : '{입력받은 api key}'}`
                            : `Authorization: Bearer ${newModelForm.api_key ? (showApiKey ? newModelForm.api_key : '••••••••••••••••') : '{입력받은 api key}'}`
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">입력 단가 (₩/1k)</label>
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
                    <label className="form-label">출력 단가 (₩/1k)</label>
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
                      <span>타임아웃 (초)</span>
                    </label>
                    <input 
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="60"
                      className="form-input" 
                      placeholder="기본: 3.0"
                      value={newModelForm.health_check_timeout}
                      onChange={(e) => setNewModelForm({...newModelForm, health_check_timeout: e.target.value})}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewModelModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Model Modal */}
      {editingModel && (
        <div className="modal-overlay" onClick={() => setEditingModel(null)}>
          <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={20} color="var(--accent-cyan)" />
                <span>LLM 서빙 모델 정보 수정</span>
              </div>
            </div>
            <form onSubmit={handleUpdateModel}>
              <div className="modal-body">
                {/* Model ID (고유 식별자 - 비활성화 표시) */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>모델 식별자 (Model ID)</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>* 고유 식별자는 수정 불가</span>
                  </label>
                  <input 
                    className="form-input" 
                    value={editModelForm.model_id}
                    disabled
                    style={{ opacity: 0.65, cursor: 'not-allowed', fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                {/* Route Alias */}
                <div className="form-group">
                  <label className="form-label">서비스 가상 별칭 (Route Alias)</label>
                  <input 
                    className="form-input" 
                    placeholder="예: qwen-14b-enterprise" 
                    value={editModelForm.alias}
                    onChange={(e) => setEditModelForm({...editModelForm, alias: e.target.value})}
                    required
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
                      <span>LLM Provider 규격 선택</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>* 선택 시 URL 접미사 자동 완성</span>
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
                                비호환
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'left', wordBreak: 'break-all' }}>
                            {p.pathSuffix || '직접 지정'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 베이스 도메인 입력 */}
                  <div style={{ marginTop: '8px' }}>
                    <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>베이스 도메인 / 호스트 (Base Domain / Host)</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>도메인만 입력하면 완성</span>
                    </label>
                    <input 
                      className="form-input" 
                      placeholder="예: https://integrate.api.nvidia.com 또는 http://192.168.1.100:8000" 
                      value={editModelForm.base_domain}
                      onChange={(e) => handleEditModelDomainChange(e.target.value)}
                    />
                  </div>

                  {/* 자동 완성된 최종 Target Endpoint */}
                  <div style={{ marginTop: '10px' }}>
                    <label className="form-label" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, color: 'var(--heading-color)' }}>
                        완성된 최종 엔드포인트 URL (Target Endpoint)
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>
                        실제 호출 대상
                      </span>
                    </label>
                    <input 
                      className="form-input" 
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'rgba(15, 23, 42, 0.7)' }}
                      placeholder="예: https://integrate.api.nvidia.com/v1/chat/completions"
                      value={editModelForm.target_endpoint}
                      onChange={(e) => setEditModelForm({...editModelForm, target_endpoint: e.target.value})}
                      required
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      * 선택한 Provider 규격의 접미사가 베이스 도메인 뒤에 덧붙여 완성됩니다. 필요한 경우 직접 미세 조정할 수 있습니다.
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
                      <span>엔드포인트 연결 인증 옵션 (Auth Header Option)</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>* 업스트림 호출 시 주입</span>
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {[
                      { id: 'none', label: '인증 없음', sub: '사내 폐쇄망 / No Auth', color: 'var(--text-muted)' },
                      { id: 'apikey', label: 'header: apikey', sub: 'apikey = {API Key}', color: '#fb923c' },
                      { id: 'bearer', label: 'Authorization: Bearer', sub: 'Bearer {API Key}', color: '#38bdf8' }
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
                          {editModelForm.auth_type === 'apikey' ? 'API Key (헤더 apikey 로 전송)' : 'API Key (Bearer 토큰으로 전송)'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)' }}>필수 입력</span>
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Lock size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                        <input 
                          type={showEditApiKey ? 'text' : 'password'}
                          className="form-input" 
                          style={{ paddingLeft: '36px', paddingRight: '40px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                          placeholder={editModelForm.auth_type === 'apikey' 
                            ? "header apikey 로 전달할 인증키 입력 (예: sec-key-1234)" 
                            : "Authorization: Bearer 로 전달할 토큰 입력 (예: sk-proj-...)"
                          }
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
                    <label className="form-label">입력 단가 (₩/1k)</label>
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
                    <label className="form-label">출력 단가 (₩/1k)</label>
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
                      <span>타임아웃 (초)</span>
                    </label>
                    <input 
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="60"
                      className="form-input" 
                      placeholder="기본: 3.0"
                      value={editModelForm.health_check_timeout}
                      onChange={(e) => setEditModelForm({...editModelForm, health_check_timeout: e.target.value})}
                      required
                    />
                  </div>
                </div>

                {/* Active / Inactive Status */}
                <div className="form-group">
                  <label className="form-label">서비스 활성화 상태 (Status)</label>
                  <select 
                    className="form-select"
                    value={editModelForm.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setEditModelForm({...editModelForm, is_active: e.target.value === 'active'})}
                  >
                    <option value="active">정상 서빙 활성화 (Active)</option>
                    <option value="inactive">비활성화 / 점검 모드 (Inactive)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingModel(null)}>취소</button>
                <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} />
                  <span>수정 내용 저장</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phase 0.1: AgentRouter 4-Tier Policy Settings Modal */}
      {showPolicyModal && (
        <div className="modal-overlay" onClick={() => setShowPolicyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(124, 58, 237, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
                  <Settings size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>AgentRouter 4대 지능형 라우팅 정책 편집</span>
                    <span className="badge active" style={{ fontSize: '0.7rem' }}>Live xDS Sync</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    정책별 매핑 모델, 예산 임계치(%), 목표 지연시간(ms) 및 자가 치유 폴백 설정을 온프레미스 인프라에 맞춰 실시간 제어합니다.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowPolicyModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            {/* Policy Navigation Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', padding: '0 16px', gap: '8px', overflowX: 'auto' }}>
              {[
                { id: 'QualityFirst', name: '1. QualityFirst (품질 우선)', color: '#c084fc' },
                { id: 'LeastCost', name: '2. LeastCost (비용 최적화)', color: '#34d399' },
                { id: 'LatencyOptimized', name: '3. LatencyOptimized (지연시간)', color: '#38bdf8' },
                { id: 'SelfHealingFallback', name: '4. SelfHealingFallback (폴백)', color: '#f59e0b' }
              ].map(tab => {
                const isCurrent = activePolicyTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePolicyTab(tab.id)}
                    style={{
                      padding: '12px 14px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: isCurrent ? `2px solid ${tab.color}` : '2px solid transparent',
                      color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: isCurrent ? 600 : 400,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tab.color, display: 'inline-block' }} />
                    {tab.name}
                  </button>
                );
              })}
            </div>

            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '20px' }}>
              {/* Tab 1: QualityFirst */}
              {activePolicyTab === 'QualityFirst' && (() => {
                const pol = routerPolicies.find(p => p.policy_id === 'QualityFirst') || { config: {} };
                const cfg = pol.config || {};
                return (
                  <div>
                    <div style={{ padding: '10px 14px', background: 'rgba(124, 58, 237, 0.08)', borderRadius: '6px', border: '1px solid rgba(124, 58, 237, 0.25)', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--accent-purple)' }}>
                      💡 <strong>QualityFirst 정책:</strong> 복잡한 알고리즘, 파이썬/SQL 코딩 및 심층 논리 추론 질문 감지 시 최고 성능 모델로 우선 분기하고 단순 일상 대화는 경량 고속 모델로 디스패치합니다.
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>심층 추론·코딩 전용 고성능 모델 (Reasoning 72B Tier)</span>
                        <span style={{ color: 'var(--accent-purple)', fontSize: '0.75rem' }}>클러스터: cluster_vllm_reasoning_72b</span>
                      </label>
                      <select
                        className="form-input"
                        value={cfg.reasoning_model || ''}
                        onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'reasoning_model', e.target.value)}
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.alias}) - {m.backend || m.serving_engine}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>일반 대화 및 단순 질의 모델 (Fast 8B Tier)</span>
                        <span style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem' }}>클러스터: cluster_vllm_fast_8b</span>
                      </label>
                      <select
                        className="form-input"
                        value={cfg.fast_model || ''}
                        onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'fast_model', e.target.value)}
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.alias}) - {m.backend || m.serving_engine}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
                      <input
                        type="checkbox"
                        id="enforce_reasoning_tools"
                        checked={cfg.enforce_reasoning_for_tools ?? true}
                        onChange={(e) => handleUpdatePolicyConfig('QualityFirst', 'enforce_reasoning_for_tools', e.target.checked)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <label htmlFor="enforce_reasoning_tools" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        도구/함수 호출(Tool & Function Calling) 스키마 감지 시 강제로 추론 전용 모델로 라우팅
                      </label>
                    </div>
                  </div>
                );
              })()}

              {/* Tab 2: LeastCost */}
              {activePolicyTab === 'LeastCost' && (() => {
                const pol = routerPolicies.find(p => p.policy_id === 'LeastCost') || { config: {} };
                const cfg = pol.config || {};
                return (
                  <div>
                    <div style={{ padding: '10px 14px', background: 'rgba(5, 150, 105, 0.08)', borderRadius: '6px', border: '1px solid rgba(5, 150, 105, 0.25)', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--accent-emerald)' }}>
                      💡 <strong>LeastCost 정책:</strong> 부서/테넌트의 월간 예산 소진율이 설정된 임계치(%)를 초과하면 무거운 질문이라도 경제형 모델로 강제 다운티어링하여 클라우드 및 GPU 컴퓨팅 비용 초과를 방지합니다.
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>예산 경보 및 다운티어링 임계치 (%)</span>
                        <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{cfg.budget_threshold_pct || 80}% 소진 시 발동</span>
                      </label>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        step="5"
                        value={cfg.budget_threshold_pct || 80}
                        onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'budget_threshold_pct', parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent-emerald)' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <span>20% (극단적 절약)</span>
                        <span>50% (조기 경보)</span>
                        <span>80% (표준 권장)</span>
                        <span>100% (완전 소진 시)</span>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">예산 초과 시 다운티어링할 경제형 모델 (Economic Model)</label>
                      <select
                        className="form-input"
                        value={cfg.economic_model || ''}
                        onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'economic_model', e.target.value)}
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.alias}) - 입력 ₩{m.input_price || m.input_price_per_1k}/1k</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">일반 상태(예산 여유) 시 표준 고성능 모델 (Standard Model)</label>
                      <select
                        className="form-input"
                        value={cfg.standard_model || ''}
                        onChange={(e) => handleUpdatePolicyConfig('LeastCost', 'standard_model', e.target.value)}
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.alias})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })()}

              {/* Tab 3: LatencyOptimized */}
              {activePolicyTab === 'LatencyOptimized' && (() => {
                const pol = routerPolicies.find(p => p.policy_id === 'LatencyOptimized') || { config: {} };
                const cfg = pol.config || {};
                return (
                  <div>
                    <div style={{ padding: '10px 14px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '6px', border: '1px solid rgba(2, 132, 199, 0.25)', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                      💡 <strong>LatencyOptimized 정책:</strong> P99 응답시간 및 초저지연 TTFT(Time to First Token) 보장을 위해 경량 8B 모델을 최우선 분기하며, 명시적 심층 추론 요청 시에만 예외를 허용합니다.
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>목표 최대 응답 지연시간 (Target Latency ms)</span>
                        <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{cfg.target_latency_ms || 200} ms</span>
                      </label>
                      <input
                        type="number"
                        min="50"
                        max="2000"
                        step="25"
                        className="form-input"
                        value={cfg.target_latency_ms || 200}
                        onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'target_latency_ms', parseInt(e.target.value) || 200)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">초저지연 최우선 처리 모델 (Primary Fast Model)</label>
                      <select
                        className="form-input"
                        value={cfg.primary_fast_model || ''}
                        onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'primary_fast_model', e.target.value)}
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.alias})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                      <input
                        type="checkbox"
                        id="allow_reasoning_override"
                        checked={cfg.allow_reasoning_override ?? true}
                        onChange={(e) => handleUpdatePolicyConfig('LatencyOptimized', 'allow_reasoning_override', e.target.checked)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <label htmlFor="allow_reasoning_override" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        심층 논리 추론 필수 질문 시 72B 전용 모델로의 예외 라우팅 허용
                      </label>
                    </div>
                  </div>
                );
              })()}

              {/* Tab 4: SelfHealingFallback */}
              {activePolicyTab === 'SelfHealingFallback' && (() => {
                const pol = routerPolicies.find(p => p.policy_id === 'SelfHealingFallback') || { config: {} };
                const cfg = pol.config || {};
                return (
                  <div>
                    <div style={{ padding: '10px 14px', background: 'rgba(217, 119, 6, 0.08)', borderRadius: '6px', border: '1px solid rgba(217, 119, 6, 0.25)', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--accent-amber)' }}>
                      💡 <strong>SelfHealingFallback 정책:</strong> 업스트림 GPU 서빙 노드의 5xx 오류 또는 헬스체크 타임아웃 발생 시, 무중단으로 지정된 예비 모델로 자동 절체(Failover)합니다.
                    </div>

                    <div className="form-group">
                      <label className="form-label">1차 장애 발생 시 자동 절체 모델 (Primary Fallback Model)</label>
                      <select
                        className="form-input"
                        value={cfg.primary_fallback_model || ''}
                        onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'primary_fallback_model', e.target.value)}
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.alias})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">2차 예비 모델 (Secondary Fallback Model)</label>
                      <select
                        className="form-input"
                        value={cfg.secondary_fallback_model || ''}
                        onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'secondary_fallback_model', e.target.value)}
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.alias})</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">최대 재시도 횟수 (Max Retries)</label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          className="form-input"
                          value={cfg.max_retries || 2}
                          onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'max_retries', parseInt(e.target.value) || 2)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">장애 판정 타임아웃 (초)</label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          className="form-input"
                          value={cfg.timeout_seconds || 5}
                          onChange={(e) => handleUpdatePolicyConfig('SelfHealingFallback', 'timeout_seconds', parseInt(e.target.value) || 5)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  apiClient.getAgentRouterPolicies().then(res => {
                    if (res?.policies) setRouterPolicies(res.policies);
                    if (onNotify) onNotify('INFO', '정책 설정이 서버 저장값으로 초기화되었습니다.');
                  });
                }}
                style={{ fontSize: '0.8rem' }}
              >
                <RefreshCw size={13} style={{ marginRight: '4px' }} /> 설정 초기화
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPolicyModal(false)}>
                  닫기
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSavePolicies}
                  disabled={isSavingPolicies}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {isSavingPolicies ? <RefreshCw className="spin" size={14} /> : <Check size={14} />}
                  <span>정책 저장 및 게이트웨이 즉시 적용</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
