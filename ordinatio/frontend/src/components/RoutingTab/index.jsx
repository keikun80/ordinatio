import React, { useState, useEffect } from 'react';
import { 
  GitFork, Cpu, RefreshCw, Layers, Plus, Compass, Settings
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { strings } from '../../constants/strings';
import { useAuth } from '../../context/AuthContext';
import { 
  DEFAULT_COLOR_PALETTE, 
  INITIAL_FALLBACK_ROUTES, 
  LLM_PROVIDERS, 
  buildEndpointUrl, 
  extractDomainAndProvider 
} from './constants';
import { copyToClipboard } from '../../utils/clipboard';

import RoutingStudio from './subtabs/RoutingStudio';
import ModelCatalog from './subtabs/ModelCatalog';
import AgentRouterBench from './subtabs/AgentRouterBench';
import NewRouteModal from './modals/NewRouteModal';
import { NewModelModal, EditModelModal } from './modals/ModelFormModal';
import PolicyEditModal from './modals/PolicyEditModal';

export { LLM_PROVIDERS };

const sanitizeModelsForStorage = (modelList) => {
  if (!Array.isArray(modelList)) return [];
  return modelList.map(({ apiKey, api_key, ...rest }) => rest);
};

export default function RoutingTab({ 
  onNotify, 
  activeSubTab: externalActiveSubTab, 
  setActiveSubTab: externalSetActiveSubTab 
}) {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const canWriteRouting = isSuperAdmin || hasPermission('routing:write');
  const [models, setModels] = useState(() => {
    try {
      const saved = localStorage.getItem('ordinatio_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(m => m && (m.id || m.model_id)).map(m => ({
            ...m,
            id: m.id || m.model_id
          }));
        }
      }
    } catch (e) {}
    return [];
  });

  const [routes, setRoutes] = useState(() => {
    try {
      const saved = localStorage.getItem('ordinatio_multi_routes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(r => r && r.route_name);
        }
      }
    } catch (e) {}
    return [];
  });

  const [selectedRouteName, setSelectedRouteName] = useState(() => {
    return localStorage.getItem('ordinatio_selected_route') || "";
  });

  const [isDeploying, setIsDeploying] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [xdsRevision, setXdsRevision] = useState(() => {
    return localStorage.getItem('ordinatio_xds_revision') || '';
  });

  // Registered Tenants & Dynamic Gateway Info for Mapping
  const [availableTenants, setAvailableTenants] = useState([]);
  const [envoyIngressUrl, setEnvoyIngressUrl] = useState('');
  const [activeKeyPrefix, setActiveKeyPrefix] = useState('');

  // Health Check States
  const [healthStatus, setHealthStatus] = useState({});
  const [isHealthCheckingAll, setIsHealthCheckingAll] = useState(false);
  const [healthCheckTimeout, setHealthCheckTimeout] = useState(() => {
    const saved = localStorage.getItem('ordinatio_health_timeout');
    return saved ? Number(saved) : 3.0;
  });

  const handleHealthTimeoutChange = (val) => {
    const num = Number(val);
    setHealthCheckTimeout(num);
    localStorage.setItem('ordinatio_health_timeout', num);
    if (onNotify) onNotify('INFO', strings.routing.alerts.healthTimeoutChanged(num));
  };

  // Gateway Endpoint & Developer Guide States
  const [activeEndpointTab, setActiveEndpointTab] = useState('path'); // 'path' | 'header' | 'python'
  const [copiedField, setCopiedField] = useState(null);
  const [isTestingRoute, setIsTestingRoute] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testTargetScope, setTestTargetScope] = useState('all'); // 'all' (전체 연동 LLM) | 'route' (현재 라우트 모델) | model_id
  const [testMessage, setTestMessage] = useState(strings.routing.studio.testMessageDefault);
  const [allModelsTestResult, setAllModelsTestResult] = useState(null);

  // Phase 0.1: AgentRouter & Envoy AI Gateway States
  const [agentRouterStatus, setAgentRouterStatus] = useState(null);
  const [agentSimPrompt, setAgentSimPrompt] = useState(strings.routing.studio.agentSimPromptDefault);
  const [agentSimPolicy, setAgentSimPolicy] = useState("QualityFirst");
  const [agentSimResult, setAgentSimResult] = useState(null);
  const [agentSimInitialResult, setAgentSimInitialResult] = useState(null);
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
      if (onNotify) onNotify('SUCCESS', strings.routing.alerts.policySaved);
    } catch (err) {
      if (onNotify) onNotify('ERROR', strings.routing.alerts.policySaveFailed(err.message));
    } finally {
      setIsSavingPolicies(false);
    }
  };

  const [isSyncingXds, setIsSyncingXds] = useState(false);

  const handleLiveXdsSync = async () => {
    setIsSyncingXds(true);
    try {
      const [resStatus] = await Promise.all([
        apiClient.getAgentRouterStatus ? apiClient.getAgentRouterStatus() : null,
        apiClient.getRoutes ? apiClient.getRoutes() : null
      ]);
      if (resStatus) {
        setAgentRouterStatus(resStatus);
        if (resStatus.policies) setRouterPolicies(resStatus.policies);
      }
      if (onNotify) onNotify('SUCCESS', strings.routing.alerts.xdsUpdated);
    } catch (err) {
      if (onNotify) onNotify('INFO', strings.routing.alerts.xdsRefreshed);
    } finally {
      setTimeout(() => setIsSyncingXds(false), 500);
    }
  };

  const handleSimulateAgent = async () => {
    if (!agentSimPrompt.trim()) return;
    setIsSimulatingAgent(true);
    try {
      const res = await apiClient.simulateAgentRouter(agentSimPrompt, agentSimPolicy);
      const enrichedRes = { ...res, isOverridden: false };
      setAgentSimResult(enrichedRes);
      setAgentSimInitialResult(enrichedRes);
      if (onNotify) onNotify('SUCCESS', strings.routing.alerts.agentRouterDone(res.complexity, res.suggested_tier));
    } catch (err) {
      if (onNotify) onNotify('ERROR', strings.routing.alerts.agentRouterFailed);
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
    model_id: '',
    alias: '',
    provider: 'openai',
    base_domain: LLM_PROVIDERS[0].defaultDomain,
    target_endpoint: buildEndpointUrl(LLM_PROVIDERS[0].defaultDomain, 'openai'),
    input_price_per_1k: 0.8,
    output_price_per_1k: 2.4,
    health_check_timeout: 3.0,
    api_key: '',
    auth_type: 'none' // 'none' | 'apikey' | 'bearer'
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
      localStorage.setItem('ordinatio_models', JSON.stringify(sanitizeModelsForStorage(updated)));
      setEditingModel(null);
      onNotify('SUCCESS', strings.routing.alerts.modelUpdated(editModelForm.alias));
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
      localStorage.setItem('ordinatio_models', JSON.stringify(sanitizeModelsForStorage(updated)));
      setEditingModel(null);
      onNotify('SUCCESS', strings.routing.alerts.modelUpdated(editModelForm.alias));
    }
  };

  // Load Models and Multi-Routes on Mount
  useEffect(() => {
    async function loadData() {
      try {
        const [modelsRes, routesRes, activePolicyRes, tenantsRes, sysInfoRes, vkeysRes] = await Promise.all([
          apiClient.getModels().catch(() => null),
          apiClient.getRoutes().catch(() => null),
          apiClient.getActiveRoutingPolicy().catch(() => null),
          apiClient.getTenants().catch(() => null),
          apiClient.getSystemInfo().catch(() => null),
          apiClient.getVirtualKeys().catch(() => null)
        ]);

        if (Array.isArray(tenantsRes)) {
          setAvailableTenants(tenantsRes);
        }
        if (sysInfoRes?.envoy_ingress_url) {
          setEnvoyIngressUrl(sysInfoRes.envoy_ingress_url);
        }
        if (Array.isArray(vkeysRes) && vkeysRes.length > 0) {
          const activeKey = vkeysRes.find((k) => k.is_active) || vkeysRes[0];
          if (activeKey?.key_prefix) setActiveKeyPrefix(`${activeKey.key_prefix}...`);
        }

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
          localStorage.setItem('ordinatio_models', JSON.stringify(sanitizeModelsForStorage(mapped)));
        }

        if (Array.isArray(routesRes)) {
          const validRoutes = routesRes.filter(r => r && r.route_name);
          setRoutes(validRoutes);
          localStorage.setItem('ordinatio_multi_routes', JSON.stringify(validRoutes));
          if (validRoutes.length > 0 && !validRoutes.some(r => r.route_name === selectedRouteName)) {
            setSelectedRouteName(validRoutes[0].route_name);
            localStorage.setItem('ordinatio_selected_route', validRoutes[0].route_name);
          }
        }

        if (activePolicyRes && activePolicyRes.xds_revision) {
          setXdsRevision(activePolicyRes.xds_revision);
          localStorage.setItem('ordinatio_xds_revision', activePolicyRes.xds_revision);
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
    route_name: "default",
    description: strings.routing.studio.defaultBaseRouteDesc,
    priority: 10,
    traffic_weights: models.length > 0 ? [{ model_id: models[0].id, weight: 100 }] : [],
    load_balancing_strategy: "LeastQueueDepth",
    failover_model_id: models[0]?.id || "",
    failover_chain: models[0]?.id ? [models[0].id] : [],
    match_conditions: {},
    is_active: true
  };

  const currentWeights = currentRoute.traffic_weights || [];
  const totalWeight = currentWeights.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  // Helper to update current route in local state & storage (and optionally persist to backend)
  const updateCurrentRoute = (updates, persistBackend = false) => {
    const targetRouteName = currentRoute.route_name;
    setRoutes(prevRoutes => {
      let updatedRoutes;
      if (prevRoutes.length === 0) {
        updatedRoutes = [{ ...currentRoute, ...updates }];
      } else if (prevRoutes.some(r => r.route_name === targetRouteName)) {
        updatedRoutes = prevRoutes.map(r =>
          r.route_name === targetRouteName ? { ...r, ...updates } : r
        );
      } else {
        updatedRoutes = [...prevRoutes, { ...currentRoute, ...updates }];
      }
      localStorage.setItem('ordinatio_multi_routes', JSON.stringify(updatedRoutes));
      return updatedRoutes;
    });

    if (selectedRouteName !== targetRouteName) {
      setSelectedRouteName(targetRouteName);
      localStorage.setItem('ordinatio_selected_route', targetRouteName);
    }

    if (persistBackend && targetRouteName) {
      apiClient.updateRoute(targetRouteName, {
        ...updates,
        deployed_by: user?.username || 'admin'
      }).catch(err => console.warn('Background route sync skipped:', err));
    }
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
          onNotify('SUCCESS', strings.routing.alerts.healthCheckSuccessAll(results.length, effTimeout, healthyCount, results.length - healthyCount));
        }
      } else {
        if (onNotify) onNotify('WARNING', strings.routing.alerts.healthCheckNoResponse);
      }
    } catch (err) {
      if (onNotify) onNotify('ERROR', strings.routing.alerts.healthCheckFailed(err.message));
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
          onNotify('SUCCESS', strings.routing.alerts.singleHealthSuccess(res.alias || modelId, res.latency_ms, res.status_code));
        } else {
          onNotify('WARNING', strings.routing.alerts.singleHealthFail(res.alias || modelId, res.error_message || strings.common.noResponse, res.status_code));
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
      if (onNotify) onNotify('ERROR', strings.routing.alerts.singleHealthError(modelId, err.message));
    }
  };

  // Copy to clipboard helper
  const handleCopy = async (text, fieldKey) => {
    try {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopiedField(fieldKey);
        setTimeout(() => setCopiedField(null), 2000);
        if (onNotify) onNotify('SUCCESS', strings.routing.alerts.copiedClipboard);
      } else {
        if (onNotify) onNotify('ERROR', '클립보드 복사에 실패했습니다.');
      }
    } catch (err) {
      console.error('Clipboard copy error:', err);
      if (onNotify) onNotify('ERROR', '클립보드 복사에 실패했습니다.');
    }
  };

  // Test Route Call via Envoy Gateway (Single or All Models)
  const handleTestCall = async (methodType) => {
    setIsTestingRoute(true);
    setTestResult(null);
    setAllModelsTestResult(null);

    const mType = methodType || activeEndpointTab;
    const msg = testMessage || strings.routing.studio.testMessageDefault;

    // 1. 전체 연동 LLM 일괄 동시 테스트
    if (testTargetScope === 'all') {
      try {
        const res = await apiClient.testAllModelsCall({
          route_name: currentRoute.route_name,
          method: mType,
          message: msg,
          scope: 'all'
        });
        setAllModelsTestResult(res);
        if (onNotify) {
          if (res.is_success) {
            onNotify('SUCCESS', strings.routing.alerts.allLlmTestSuccess(res.total_count));
          } else {
            onNotify('WARNING', strings.routing.alerts.allLlmTestWarn(res.total_count, res.success_count, res.failed_count));
          }
        }
      } catch (err) {
        if (onNotify) onNotify('ERROR', strings.routing.alerts.allLlmTestFail(err.message));
      } finally {
        setIsTestingRoute(false);
      }
      return;
    }

    // 2. 현재 라우트 연동 모델 풀 일괄 테스트
    if (testTargetScope === 'route') {
      if (!currentWeights || currentWeights.length === 0) {
        if (onNotify) onNotify('ERROR', strings.routing.alerts.noModelsInRoute);
        setIsTestingRoute(false);
        return;
      }
      try {
        const res = await apiClient.testAllModelsCall({
          route_name: currentRoute.route_name,
          method: mType,
          message: msg,
          scope: 'route'
        });
        setAllModelsTestResult(res);
        if (onNotify) {
          if (res.is_success) {
            onNotify('SUCCESS', strings.routing.alerts.routeTestSuccess(res.total_count));
          } else {
            onNotify('WARNING', strings.routing.alerts.routeTestWarn(res.total_count, res.success_count, res.failed_count));
          }
        }
      } catch (err) {
        if (onNotify) onNotify('ERROR', strings.routing.alerts.routeTestFail(err.message));
      } finally {
        setIsTestingRoute(false);
      }
      return;
    }

    // 3. 특정 단일 모델 지정 테스트 (예: 'deepseek-ai/deepseek-v4.1-flash')
    try {
      const res = await apiClient.testRouteCall({
        route_name: currentRoute.route_name,
        method: mType,
        message: msg,
        traffic_weights: currentWeights,
        target_model_id: testTargetScope
      });
      setTestResult(res);
      if (res.is_success) {
        if (onNotify) onNotify('SUCCESS', strings.routing.alerts.gatewayCallSuccess(testTargetScope, res.status_code || 200, res.latency_ms));
      } else {
        if (onNotify) onNotify('ERROR', strings.routing.alerts.gatewayCallError(testTargetScope, res.error_message || `HTTP ${res.status_code || 502}`, res.status_code));
      }
    } catch (err) {
      setTestResult({
        is_success: false,
        status_code: 502,
        latency_ms: 0,
        target_url: mType === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`,
        request_headers: {},
        response_body: { error: err.message },
        error_message: err.message
      });
      if (onNotify) onNotify('ERROR', strings.routing.alerts.testRequestFail(err.message));
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
    updateCurrentRoute({ traffic_weights: balanced }, true);
    onNotify('INFO', strings.routing.alerts.weightSplitEven(count));
  };

  // Add a model to current route with automatic 100% weight balancing
  const handleAddModelToRoute = (modelId) => {
    if (!modelId) return;
    if (currentWeights.some(w => w.model_id === modelId)) {
      onNotify('WARNING', strings.routing.alerts.modelAlreadyInPool);
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
    
    updateCurrentRoute({ traffic_weights: updatedWeights }, true);
    onNotify('SUCCESS', strings.routing.alerts.modelAddedToPool(modelId));
  };

  // Remove a model from current route with automatic 100% weight rebalancing
  const handleRemoveModelFromRoute = (index) => {
    if (currentWeights.length <= 1) {
      onNotify('ERROR', strings.routing.alerts.minOneModelRequired);
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

    updateCurrentRoute({ traffic_weights: updatedWeights }, true);
    onNotify('INFO', strings.routing.alerts.modelRemovedFromPool);
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
        onNotify('SUCCESS', strings.routing.alerts.dryRunSuccess(currentRoute.route_name, res.total_weight));
      } else {
        onNotify('ERROR', strings.routing.alerts.dryRunFailed(res.validation_errors.join(', ')));
      }
    } catch (err) {
      if (totalWeight === 100) {
        onNotify('INFO', strings.routing.alerts.dryRunMockPass);
      } else {
        onNotify('ERROR', strings.routing.alerts.dryRunMockFail(totalWeight));
      }
    } finally {
      setIsDryRunning(false);
    }
  };

  // Deploy xDS Config without downtime & persist to backend
  const handleDeployXds = async () => {
    if (totalWeight !== 100) {
      onNotify('ERROR', strings.routing.studio.deployWarningWeight(totalWeight));
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
        deployed_by: user?.username || "admin"
      };

      const res = await apiClient.deployRouting(payload);
      const newRev = res.xds_revision;
      setXdsRevision(newRev);
      localStorage.setItem('ordinatio_xds_revision', newRev);
      
      // Resync route list from backend to ensure persistence consistency
      try {
        const freshRoutes = await apiClient.getRoutes();
        if (freshRoutes && freshRoutes.length > 0) {
          setRoutes(freshRoutes);
          localStorage.setItem('ordinatio_multi_routes', JSON.stringify(freshRoutes));
        }
      } catch (syncErr) {
        console.warn('Could not resync fresh routes after deploy:', syncErr);
      }

      onNotify('SUCCESS', strings.routing.alerts.deploySuccess(currentRoute.route_name));
    } catch (err) {
      console.error('Failed to deploy routing policy:', err);
      onNotify('ERROR', strings.routing.alerts.deployFailed(err.message || strings.common.noResponse));
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
      onNotify('ERROR', strings.routing.alerts.routeAlreadyExists(routeName));
      return;
    }

    const sliceModels = models.slice(0, 2);
    const defaultWeights = sliceModels.map((m, idx) => ({
      model_id: m.id,
      weight: sliceModels.length === 1 ? 100 : (idx === 0 ? 80 : 20)
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
      description: newRouteForm.description || strings.routing.studio.defaultRouteDesc,
      priority: Number(newRouteForm.priority || 10),
      traffic_weights: defaultWeights.length > 0 ? defaultWeights : (models.length > 0 ? [{ model_id: models[0].id, weight: 100 }] : []),
      load_balancing_strategy: "LeastQueueDepth",
      failover_model_id: models[0]?.id || "",
      failover_chain: models[0]?.id ? [models[0].id] : [],
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
    localStorage.setItem('ordinatio_multi_routes', JSON.stringify(updated));
    setSelectedRouteName(routeName);
    setShowNewRouteModal(false);
    setNewRouteForm({ route_name: '', description: '', priority: 15, match_tenant: '', match_path: '' });
    onNotify('SUCCESS', strings.routing.alerts.routeCreated(routeName));
  };

  // Delete Current Route
  const handleDeleteRoute = async () => {
    if (routes.length <= 1) {
      onNotify('ERROR', strings.routing.alerts.minOneRouteRequired);
      return;
    }

    if (!window.confirm(strings.routing.alerts.deleteRouteConfirm(currentRoute.route_name))) {
      return;
    }

    try {
      await apiClient.deleteRoute(currentRoute.route_name);
    } catch (err) {
      console.warn('Backend route deletion fallback');
    }

    const filtered = routes.filter(r => r.route_name !== currentRoute.route_name);
    setRoutes(filtered);
    localStorage.setItem('ordinatio_multi_routes', JSON.stringify(filtered));
    setSelectedRouteName(filtered[0].route_name);
    onNotify('SUCCESS', strings.routing.alerts.routeDeleted(currentRoute.route_name));
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
      localStorage.setItem('ordinatio_models', JSON.stringify(sanitizeModelsForStorage(updated)));
      setShowNewModelModal(false);
      onNotify('SUCCESS', strings.routing.alerts.modelAdded(res.alias));
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
      localStorage.setItem('ordinatio_models', JSON.stringify(sanitizeModelsForStorage(updated)));
      setShowNewModelModal(false);
      onNotify('SUCCESS', strings.routing.alerts.modelAdded(newModelForm.alias));
    }
  };

  // Delete Model from Catalog
  const handleDeleteModel = async (modelId) => {
    const inCurrentRoute = currentWeights.some(w => w.model_id === modelId);
    const inAnyRoute = routes.some(r => 
      (r.traffic_weights || []).some(w => w.model_id === modelId) || 
      r.failover_model_id === modelId
    );

    let confirmMsg = strings.routing.alerts.deleteModelConfirm(modelId);
    if (inCurrentRoute || inAnyRoute) {
      confirmMsg = strings.routing.alerts.deleteModelInRouteConfirm(modelId);
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      await apiClient.deleteModel(modelId, true);
      const filtered = models.filter(m => m.id !== modelId);
      setModels(filtered);
      localStorage.setItem('ordinatio_models', JSON.stringify(sanitizeModelsForStorage(filtered)));

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
          localStorage.setItem('ordinatio_multi_routes', JSON.stringify(updatedRoutes));
        }
      }).catch(() => {});

      onNotify('SUCCESS', strings.routing.alerts.modelDeleted(modelId));
    } catch (err) {
      onNotify('ERROR', strings.routing.alerts.modelDeleteFail(err.message));
    }
  };

  const availableModelsToAdd = models.filter(m => !currentWeights.some(w => w.model_id === m.id));

  // Gateway Connection URLs & Snippets (ELB / Reverse Proxy Auto-Detection)
  // 프론트엔드 포트(5137, 5173 등)로 웹 UI에 접속한 경우에도 실제 L7 트래픽 인그레스 포트인 Envoy(:8080)로 정확히 유도합니다.
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
  const browserPort = typeof window !== 'undefined' ? window.location.port : '';
  const browserHostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';

  let gatewayHost = import.meta.env.VITE_ENVOY_INGRESS_URL;
  if (!gatewayHost) {
    if (envoyIngressUrl && !envoyIngressUrl.includes('localhost') && !envoyIngressUrl.includes('127.0.0.1')) {
      gatewayHost = envoyIngressUrl;
    } else if (browserPort === '5137' || browserPort === '5173' || (browserPort && browserPort !== '80' && browserPort !== '443' && browserPort !== '8080')) {
      // 웹 UI 접근 포트(5137, 5173 등)와 Envoy L7 게이트웨이 포트(8080) 분리: 항상 Envoy 포트(:8080)로 매핑
      gatewayHost = `${browserProtocol}//${browserHostname}:8080`;
    } else if (browserPort === '8080') {
      gatewayHost = browserOrigin;
    } else {
      // 포트가 생략된 도메인 접속의 경우 기본 Envoy 포트(:8080) 지정
      gatewayHost = `${browserProtocol}//${browserHostname}:8080`;
    }
  }
  const routePathPrefix = currentRoute.match_conditions?.path_prefix || `/v1/routes/${currentRoute.route_name}`;
  const routeFullPath = `${gatewayHost}${routePathPrefix}`;
  const standardEndpointUrl = `${gatewayHost}/v1/chat/completions`;
  const primaryTenantCode = currentRoute.match_conditions?.tenant_codes?.[0] || availableTenants[0]?.department_code || 'DEFAULT';
  const sampleVirtualKey = activeKeyPrefix || 'sk-ord-<issued-virtual-key>';

  const curlSnippetPath = `curl -X POST "${routeFullPath}" \\
  -H "Authorization: Bearer ${sampleVirtualKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {"role": "user", "content": "${strings.routing.studio.defaultPortfolioMsg}"}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'`;

  const curlSnippetHeader = `curl -X POST "${standardEndpointUrl}" \\
  -H "Authorization: Bearer ${sampleVirtualKey}" \\
  -H "x-orche-route: ${currentRoute.route_name}" \\
  -H "x-orche-tenant: ${primaryTenantCode}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${currentRoute.route_name}",
    "messages": [
      {"role": "user", "content": "${strings.routing.studio.defaultPortfolioMsg}"}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'`;

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${routeFullPath}",
    api_key="${sampleVirtualKey}"
)

response = client.chat.completions.create(
    model="${currentRoute.route_name}",
    messages=[
        {"role": "user", "content": "${strings.routing.studio.defaultPortfolioMsg}"}
    ],
    temperature=0.7
)

print(response.choices[0].message.content)`;

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1>{strings.routing.header.title}</h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.04)', padding: '3px 10px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
              {strings.routing.header.clusterStatus(models.length, routes.length)}
            </span>
          </div>
          <p className="page-description">
            {strings.routing.header.desc}
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {activeSubTab === 'routing' && (
            <button 
              className="btn btn-primary"
              disabled={!canWriteRouting}
              data-testid="rt-btn-new-route"
              data-function-id="FNC-RT-CREATE-ROUTE"
              onClick={() => canWriteRouting && setShowNewRouteModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
            >
              <GitFork size={15} /> <span>{strings.routing.header.btnNewRoute}</span>
            </button>
          )}
          {activeSubTab === 'catalog' && (
            <button 
              className="btn btn-primary"
              disabled={!canWriteRouting}
              data-testid="rt-catalog-btn-register"
              data-function-id="FNC-RT-REGISTER-MODEL"
              onClick={() => canWriteRouting && setShowNewModelModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed' }}
            >
              <Plus size={15} /> <span>{strings.routing.header.btnRegisterModel}</span>
            </button>
          )}
          {activeSubTab === 'dispatch' && (
            <button
              className="btn btn-secondary"
              disabled={!canWriteRouting}
              onClick={() => canWriteRouting && setShowPolicyModal(true)} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: canWriteRouting ? 1 : 0.45, cursor: canWriteRouting ? 'pointer' : 'not-allowed', color: 'var(--accent-purple)' }}
            >
              <Settings size={15} /> <span>{strings.routing.subtabs.agentPolicySettingsBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '20px',
        paddingBottom: '0'
      }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { id: 'routing', label: strings.routing.subtabs.routingStudio, icon: GitFork, count: routes.length },
            { id: 'catalog', label: strings.routing.subtabs.modelCatalog, icon: Cpu, count: models.length },
            { id: 'dispatch', label: strings.routing.subtabs.agentRouterBench, icon: Compass, badge: 'Agent' }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`com-subtab-routing-${tab.id}`}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  background: 'transparent',
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                    color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'
                  }}>
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span style={{
                    fontSize: '0.68rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(124, 58, 237, 0.2)',
                    color: 'var(--accent-purple)',
                    fontWeight: 700
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Render Active Sub-Tab View */}
      {activeSubTab === 'routing' && (
        <RoutingStudio
          routes={routes}
          currentRoute={currentRoute}
          setSelectedRouteName={setSelectedRouteName}
          updateCurrentRoute={updateCurrentRoute}
          handleDeleteRoute={handleDeleteRoute}
          canWriteRouting={canWriteRouting}
          xdsRevision={xdsRevision}
          currentWeights={currentWeights}
          totalWeight={totalWeight}
          models={models}
          availableModelsToAdd={availableModelsToAdd}
          handleWeightChange={handleWeightChange}
          handleRemoveModelFromRoute={handleRemoveModelFromRoute}
          handleAddModelToRoute={handleAddModelToRoute}
          handleAutoBalance={handleAutoBalance}
          availableTenants={availableTenants}
          handleDryRun={handleDryRun}
          isDryRunning={isDryRunning}
          handleDeployXds={handleDeployXds}
          isDeploying={isDeploying}
        />
      )}

      {activeSubTab === 'catalog' && (
        <ModelCatalog
          healthCheckTimeout={healthCheckTimeout}
          handleHealthTimeoutChange={handleHealthTimeoutChange}
          handleCheckAllHealth={handleCheckAllHealth}
          isHealthCheckingAll={isHealthCheckingAll}
          canWriteRouting={canWriteRouting}
          setShowNewModelModal={setShowNewModelModal}
          models={models}
          currentWeights={currentWeights}
          healthStatus={healthStatus}
          handleCheckSingleHealth={handleCheckSingleHealth}
          handleAddModelToRoute={handleAddModelToRoute}
          handleOpenEditModal={handleOpenEditModal}
          handleDeleteModel={handleDeleteModel}
        />
      )}

      {activeSubTab === 'dispatch' && (
        <AgentRouterBench
          agentRouterStatus={agentRouterStatus}
          setShowPolicyModal={setShowPolicyModal}
          agentSimPrompt={agentSimPrompt}
          setAgentSimPrompt={setAgentSimPrompt}
          agentSimPolicy={agentSimPolicy}
          setAgentSimPolicy={setAgentSimPolicy}
          handleSimulateAgent={handleSimulateAgent}
          isSimulatingAgent={isSimulatingAgent}
          agentSimResult={agentSimResult}
          setAgentSimResult={setAgentSimResult}
          agentSimInitialResult={agentSimInitialResult}
          models={models}
          onNotify={onNotify}
          currentRoute={currentRoute}
          routes={routes}
          setSelectedRouteName={setSelectedRouteName}
          currentWeights={currentWeights}
          gatewayHost={gatewayHost}
          routePathPrefix={routePathPrefix}
          testTargetScope={testTargetScope}
          setTestTargetScope={setTestTargetScope}
          handleTestCall={handleTestCall}
          isTestingRoute={isTestingRoute}
          testMessage={testMessage}
          setTestMessage={setTestMessage}
          activeEndpointTab={activeEndpointTab}
          setActiveEndpointTab={setActiveEndpointTab}
          curlSnippetPath={curlSnippetPath}
          curlSnippetHeader={curlSnippetHeader}
          pythonSnippet={pythonSnippet}
          handleCopy={handleCopy}
          copiedField={copiedField}
          testResult={testResult}
          setTestResult={setTestResult}
          allModelsTestResult={allModelsTestResult}
          setAllModelsTestResult={setAllModelsTestResult}
        />
      )}

      {/* Modals */}
      <NewRouteModal
        show={showNewRouteModal}
        onClose={() => setShowNewRouteModal(false)}
        newRouteForm={newRouteForm}
        setNewRouteForm={setNewRouteForm}
        availableTenants={availableTenants}
        handleCreateRoute={handleCreateRoute}
      />

      <NewModelModal
        show={showNewModelModal}
        onClose={() => setShowNewModelModal(false)}
        newModelForm={newModelForm}
        setNewModelForm={setNewModelForm}
        handleCreateModel={handleCreateModel}
        handleNewModelProviderChange={handleNewModelProviderChange}
        handleNewModelDomainChange={handleNewModelDomainChange}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
      />

      <EditModelModal
        editingModel={editingModel}
        onClose={() => setEditingModel(null)}
        editModelForm={editModelForm}
        setEditModelForm={setEditModelForm}
        handleUpdateModel={handleUpdateModel}
        handleEditModelProviderChange={handleEditModelProviderChange}
        handleEditModelDomainChange={handleEditModelDomainChange}
        showEditApiKey={showEditApiKey}
        setShowEditApiKey={setShowEditApiKey}
      />

      <PolicyEditModal
        show={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        handleLiveXdsSync={handleLiveXdsSync}
        isSyncingXds={isSyncingXds}
        activePolicyTab={activePolicyTab}
        setActivePolicyTab={setActivePolicyTab}
        routerPolicies={routerPolicies}
        models={models}
        handleUpdatePolicyConfig={handleUpdatePolicyConfig}
        handleSavePolicies={handleSavePolicies}
        isSavingPolicies={isSavingPolicies}
        setRouterPolicies={setRouterPolicies}
        onNotify={onNotify}
      />
    </div>
  );
}
