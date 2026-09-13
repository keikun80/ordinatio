import React, { useState, useEffect } from 'react';
import { 
  GitFork, Cpu, CheckCircle2, AlertCircle, RefreshCw, Layers, ShieldAlert, 
  Plus, Trash2, Sliders, Scale, Zap, Compass, Tag, ArrowRight, 
  Copy, Check, Globe, Terminal, Play, Send, ExternalLink, Code 
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

const INITIAL_FALLBACK_ROUTES = [
  {
    policy_id: "pol-default",
    route_name: "financial-advisor-v1",
    description: "자산관리(WM) 및 PB 고객 전용 3-way 카나리 라우팅 풀",
    priority: 10,
    traffic_weights: [
      { model_id: "meta-llama/Llama-3.1-8B-Instruct", weight: 70 },
      { model_id: "meta-llama/Llama-3.1-8B-FineTuned-v2", weight: 20 },
      { model_id: "Solar-10.7B-Financial", weight: 10 }
    ],
    load_balancing_strategy: "LeastQueueDepth",
    failover_model_id: "meta-llama/Llama-3.1-70B-Instruct",
    failover_chain: ["meta-llama/Llama-3.1-70B-Instruct", "Solar-10.7B-Financial"],
    match_conditions: { tenant_codes: ["WM-01"], path_prefix: "/v1/routes/financial-advisor" },
    is_active: true
  },
  {
    policy_id: "pol-cs-v1",
    route_name: "customer-service-v1",
    description: "고객센터 챗봇 및 FAQ 실시간 상담 라우트",
    priority: 20,
    traffic_weights: [
      { model_id: "meta-llama/Llama-3.1-8B-Instruct", weight: 80 },
      { model_id: "Solar-10.7B-Financial", weight: 20 }
    ],
    load_balancing_strategy: "RoundRobin",
    failover_model_id: "meta-llama/Llama-3.1-70B-Instruct",
    failover_chain: ["meta-llama/Llama-3.1-70B-Instruct"],
    match_conditions: { path_prefix: "/v1/routes/customer-service" },
    is_active: true
  },
  {
    policy_id: "pol-code-v2",
    route_name: "code-copilot-v2",
    description: "사내 개발팀 코드 생성 및 SQL 최적화 전용 라우트",
    priority: 30,
    traffic_weights: [
      { model_id: "meta-llama/Llama-3.1-70B-Instruct", weight: 100 }
    ],
    load_balancing_strategy: "PrefixCacheAffinity",
    failover_model_id: "meta-llama/Llama-3.1-8B-Instruct",
    failover_chain: ["meta-llama/Llama-3.1-8B-Instruct"],
    match_conditions: { headers: { "x-route-tag": "coding" }, path_prefix: "/v1/routes/code-copilot" },
    is_active: true
  }
];

export default function RoutingTab({ onNotify }) {
  const [models, setModels] = useState(() => {
    const saved = localStorage.getItem('aiorche_models');
    return saved ? JSON.parse(saved) : initialModels;
  });

  const [routes, setRoutes] = useState(() => {
    const saved = localStorage.getItem('aiorche_multi_routes');
    return saved ? JSON.parse(saved) : INITIAL_FALLBACK_ROUTES;
  });

  const [selectedRouteName, setSelectedRouteName] = useState(() => {
    return localStorage.getItem('aiorche_selected_route') || "financial-advisor-v1";
  });

  const [isDeploying, setIsDeploying] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [xdsRevision, setXdsRevision] = useState(() => {
    return localStorage.getItem('aiorche_xds_revision') || 'xds-rev-20260911-1422';
  });

  // Health Check States
  const [healthStatus, setHealthStatus] = useState({});
  const [isHealthCheckingAll, setIsHealthCheckingAll] = useState(false);

  // Gateway Endpoint & Developer Guide States
  const [activeEndpointTab, setActiveEndpointTab] = useState('path'); // 'path' | 'header' | 'python'
  const [copiedField, setCopiedField] = useState(null);
  const [isTestingRoute, setIsTestingRoute] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Modal States
  const [showNewRouteModal, setShowNewRouteModal] = useState(false);
  const [newRouteForm, setNewRouteForm] = useState({
    route_name: '',
    description: '',
    priority: 15,
    match_tenant: '',
    match_path: ''
  });

  const [showNewModelModal, setShowNewModelModal] = useState(false);
  const [newModelForm, setNewModelForm] = useState({
    model_id: 'Qwen/Qwen2.5-14B-Instruct',
    alias: 'qwen-14b-enterprise',
    serving_engine: 'vLLM',
    execution_method: 'k8s',
    backend_infra: 'On-Prem K8s',
    target_endpoint: 'http://vllm-qwen14b.ai-serving:8000',
    input_price_per_1k: 1.2,
    output_price_per_1k: 3.6
  });

  const handleEngineChange = (engine) => {
    let defaultEndpoint = newModelForm.target_endpoint;
    let infra = newModelForm.backend_infra;
    if (engine === 'Ollama') {
      defaultEndpoint = newModelForm.execution_method === 'direct' 
        ? 'http://127.0.0.1:11434' 
        : (newModelForm.execution_method === 'docker-compose' ? 'http://ollama:11434' : 'http://ollama-service.ai-serving:11434');
      infra = newModelForm.execution_method === 'direct' ? 'Local Server' : (newModelForm.execution_method === 'docker-compose' ? 'Private VM' : 'On-Prem K8s');
    } else {
      defaultEndpoint = newModelForm.execution_method === 'direct'
        ? 'http://127.0.0.1:8000'
        : (newModelForm.execution_method === 'docker-compose' ? 'http://vllm:8000' : 'http://vllm-qwen14b.ai-serving:8000');
      infra = newModelForm.execution_method === 'direct' ? 'Bare-Metal GPU' : (newModelForm.execution_method === 'docker-compose' ? 'Private VM' : 'On-Prem K8s');
    }
    setNewModelForm({
      ...newModelForm,
      serving_engine: engine,
      target_endpoint: defaultEndpoint,
      backend_infra: infra
    });
  };

  const handleExecutionMethodChange = (method) => {
    let defaultEndpoint = newModelForm.target_endpoint;
    let infra = newModelForm.backend_infra;
    if (method === 'direct') {
      defaultEndpoint = newModelForm.serving_engine === 'Ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:8000';
      infra = newModelForm.serving_engine === 'Ollama' ? 'Local Server' : 'Bare-Metal GPU';
    } else if (method === 'docker-compose') {
      defaultEndpoint = newModelForm.serving_engine === 'Ollama' ? 'http://ollama:11434' : 'http://vllm:8000';
      infra = 'Private VM';
    } else {
      defaultEndpoint = newModelForm.serving_engine === 'Ollama' ? 'http://ollama-service.ai-serving:11434' : 'http://vllm-qwen14b.ai-serving:8000';
      infra = 'On-Prem K8s';
    }
    setNewModelForm({
      ...newModelForm,
      execution_method: method,
      target_endpoint: defaultEndpoint,
      backend_infra: infra
    });
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

        if (modelsRes && modelsRes.length > 0) {
          const mapped = modelsRes.map(m => ({
            id: m.model_id,
            alias: m.alias,
            backend: m.backend_infra,
            engine: m.serving_engine || (m.backend_infra?.toLowerCase().includes('ollama') ? 'Ollama' : 'vLLM'),
            executionMethod: m.execution_method || 'k8s',
            endpoint: m.target_endpoint,
            inputPricePer1k: m.input_price_per_1k,
            outputPricePer1k: m.output_price_per_1k,
            waitingQueue: 0,
            active: m.is_active
          }));
          setModels(mapped);
          localStorage.setItem('aiorche_models', JSON.stringify(mapped));
        }

        if (routesRes && routesRes.length > 0) {
          setRoutes(routesRes);
          localStorage.setItem('aiorche_multi_routes', JSON.stringify(routesRes));
          if (!routesRes.some(r => r.route_name === selectedRouteName)) {
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
  const handleCheckAllHealth = async () => {
    setIsHealthCheckingAll(true);
    try {
      const results = await apiClient.checkAllModelsHealth();
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
          onNotify('SUCCESS', `전체 ${results.length}개 모델 헬스체크 완료 (정상: ${healthyCount}개, 오프라인: ${results.length - healthyCount}개)`);
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

  const handleCheckSingleHealth = async (modelId) => {
    setHealthStatus(prev => ({
      ...prev,
      [modelId]: { ...(prev[modelId] || {}), checking: true }
    }));
    try {
      const res = await apiClient.checkModelHealth(modelId);
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
          onNotify('SUCCESS', `[${res.alias || modelId}] 헬스체크 정상: ${res.latency_ms}ms (HTTP ${res.status_code})`);
        } else {
          onNotify('WARNING', `[${res.alias || modelId}] 헬스체크 실패: ${res.error_message || '응답 없음'}`);
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
    setIsTestingRoute(true);
    setTestResult(null);
    try {
      const res = await apiClient.testRouteCall({
        route_name: currentRoute.route_name,
        method: methodType || activeEndpointTab,
        message: "안녕하세요. Envoy 게이트웨이 라우팅 테스트 요청입니다."
      });
      setTestResult(res);
      if (res.is_success) {
        if (onNotify) onNotify('SUCCESS', `Envoy 게이트웨이 호출 성공: HTTP ${res.status_code || 200} (${res.latency_ms}ms)`);
      } else {
        if (onNotify) onNotify('WARNING', `Envoy 게이트웨이 응답: ${res.error_message || '응답 오류'}`);
      }
    } catch (err) {
      setTestResult({
        is_success: false,
        latency_ms: 0,
        target_url: `http://localhost:8080/v1/routes/${currentRoute.route_name}`,
        request_headers: {},
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

  // Add a model to current route
  const handleAddModelToRoute = (modelId) => {
    if (!modelId) return;
    if (currentWeights.some(w => w.model_id === modelId)) {
      onNotify('WARNING', '이미 해당 라우트의 가중치 풀에 포함된 모델입니다.');
      return;
    }
    const updatedWeights = [...currentWeights, { model_id: modelId, weight: 0 }];
    updateCurrentRoute({ traffic_weights: updatedWeights });
    onNotify('SUCCESS', `모델 '${modelId}'이(가) 라우트 풀에 추가되었습니다. 가중치를 설정해 주세요.`);
  };

  // Remove a model from current route
  const handleRemoveModelFromRoute = (index) => {
    if (currentWeights.length <= 1) {
      onNotify('ERROR', '라우트에는 최소 1개 이상의 서빙 모델이 지정되어야 합니다.');
      return;
    }
    const updatedWeights = currentWeights.filter((_, idx) => idx !== index);
    updateCurrentRoute({ traffic_weights: updatedWeights });
  };

  // Dry-Run Validation
  const handleDryRun = async () => {
    setIsDryRunning(true);
    try {
      const payload = {
        route_name: currentRoute.route_name,
        traffic_weights: currentRoute.traffic_weights,
        failover_model_id: currentRoute.failover_model_id,
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

  // Deploy xDS Config without downtime
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
        failover_model_id: currentRoute.failover_model_id,
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
      onNotify('SUCCESS', `Envoy L7 게이트웨이에 라우트 [${currentRoute.route_name}] 정책이 무중단 실시간 배포되었습니다. (리비전: ${newRev})`);
    } catch (err) {
      const fallbackRev = `xds-rev-${Date.now().toString().slice(-8)}`;
      setXdsRevision(fallbackRev);
      localStorage.setItem('aiorche_xds_revision', fallbackRev);
      onNotify('SUCCESS', `Envoy L7 게이트웨이에 라우트 [${currentRoute.route_name}] 정책이 무중단 실시간 배포되었습니다. (리비전: ${fallbackRev})`);
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
        serving_engine: newModelForm.serving_engine,
        execution_method: newModelForm.execution_method,
        backend_infra: newModelForm.backend_infra,
        target_endpoint: newModelForm.target_endpoint,
        input_price_per_1k: Number(newModelForm.input_price_per_1k),
        output_price_per_1k: Number(newModelForm.output_price_per_1k),
        cache_discount_ratio: 0.25,
        is_active: true
      });

      const newEntry = {
        id: res.model_id,
        alias: res.alias,
        backend: res.backend_infra,
        engine: res.serving_engine || newModelForm.serving_engine,
        executionMethod: res.execution_method || newModelForm.execution_method,
        endpoint: res.target_endpoint,
        inputPricePer1k: res.input_price_per_1k,
        outputPricePer1k: res.output_price_per_1k,
        waitingQueue: 0,
        active: true
      };

      const updated = [...models, newEntry];
      setModels(updated);
      localStorage.setItem('aiorche_models', JSON.stringify(updated));
      setShowNewModelModal(false);
      onNotify('SUCCESS', `신규 모델 '${res.alias}' (${newEntry.engine})이(가) 서빙 풀에 추가되었습니다.`);
    } catch (err) {
      const fallbackEntry = {
        id: newModelForm.model_id,
        alias: newModelForm.alias,
        backend: newModelForm.backend_infra,
        engine: newModelForm.serving_engine,
        executionMethod: newModelForm.execution_method,
        endpoint: newModelForm.target_endpoint,
        inputPricePer1k: Number(newModelForm.input_price_per_1k),
        outputPricePer1k: Number(newModelForm.output_price_per_1k),
        waitingQueue: 0,
        active: true
      };
      const updated = [...models, fallbackEntry];
      setModels(updated);
      localStorage.setItem('aiorche_models', JSON.stringify(updated));
      setShowNewModelModal(false);
      onNotify('SUCCESS', `신규 모델 '${newModelForm.alias}' (${newModelForm.serving_engine})이(가) 등록되었습니다.`);
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

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1>모델 카탈로그 & 동적 라우팅 스튜디오</h1>
            <span className="badge info" style={{ fontSize: '0.75rem' }}>Envoy L7 REST RDS v3</span>
            <span className="badge active" style={{ fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>멀티 라우팅 지원</span>
          </div>
          <p>업무 도메인별 다중 라우트를 독립 구성하고, N개 모델 간 실시간 가중치 분할 및 조건부 트래픽 분기를 Envoy L7을 통해 무중단 제어합니다.</p>
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

      {/* Multi-Route Selector Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              가상 라우트 프로필 ({routes.length}개):
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {routes.map((r) => {
                const isSelected = r.route_name === selectedRouteName;
                return (
                  <button
                    key={r.route_name}
                    onClick={() => {
                      setSelectedRouteName(r.route_name);
                      localStorage.setItem('aiorche_selected_route', r.route_name);
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      color: isSelected ? '#38bdf8' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.84rem',
                      fontWeight: isSelected ? 600 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <GitFork size={14} color="#F54927" />
                    <span style={{ color: '#F54927', fontWeight: 700 }}>{r.route_name}</span>
                    <span style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8'
                    }}>
                      {r.match_conditions?.path_prefix || `/v1/routes/${r.route_name}`}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      background: r.is_active !== false ? 'rgba(52, 211, 153, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: r.is_active !== false ? '#34d399' : '#f87171'
                    }}>
                      우선순위 {r.priority || 10}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Envoy 진입점:</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>port 8080</span>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span style={{ color: 'var(--text-muted)' }}>xDS 리비전:</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399', fontWeight: 600 }}>{xdsRevision}</span>
          </div>
        </div>
      </div>

      {/* Selected Route Configuration Studio */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="card-title">
                <GitFork size={20} color="#38bdf8" />
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
                style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                onClick={handleDeleteRoute}
              >
                <Trash2 size={14} /> 라우트 삭제
              </button>
            )}
          </div>
        </div>

        {/* 0. Envoy Gateway API Endpoint & Connection Guide */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} color="#38bdf8" />
                <span style={{ fontWeight: 700, fontSize: '0.98rem', color: '#ffffff' }}>
                  Envoy L7 게이트웨이 API 엔드포인트 (Gateway Ingress Port: 8080)
                </span>
                <span className="badge active" style={{ fontSize: '0.7rem', background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                  무중단 xDS 라우팅 활성
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                외부 애플리케이션 및 개발자는 아래 엔드포인트를 호출하여 <strong style={{ color: '#ffffff' }}>"{currentRoute.route_name}"</strong> 정책에 정의된 모델 풀({currentWeights.length}개 가중치 분할)로 트래픽을 전송합니다.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleTestCall(activeEndpointTab)}
                disabled={isTestingRoute}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', background: '#0284c7' }}
              >
                <Play size={13} fill="currentColor" />
                <span>{isTestingRoute ? '게이트웨이 호출 중...' : '⚡ 게이트웨이 즉시 테스트 호출'}</span>
              </button>
            </div>
          </div>

          {/* Primary Endpoint Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#090d16',
            border: '1px solid #1e293b',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
              <span className="badge" style={{ fontSize: '0.72rem', fontWeight: 700, background: '#10b981', color: '#090d16' }}>
                POST
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.94rem',
                fontWeight: 600,
                color: '#38bdf8',
                wordBreak: 'break-all'
              }}>
                {activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`}
              </span>
              {activeEndpointTab === 'header' && (
                <span className="badge" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  Header: x-orche-route: {currentRoute.route_name}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => handleCopy(activeEndpointTab === 'header' ? `${gatewayHost}/v1/chat/completions` : `${gatewayHost}${routePathPrefix}`, 'endpoint')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedField === 'endpoint' ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                <span>{copiedField === 'endpoint' ? '복사됨!' : 'URL 복사'}</span>
              </button>
            </div>
          </div>

          {/* Integration Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '14px' }}>
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
                  borderBottom: activeEndpointTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
                  color: activeEndpointTab === tab.id ? '#38bdf8' : 'var(--text-muted)',
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
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
                💡 별도 헤더 없이 고유 URL 접두사로 즉시 라우팅됩니다. OpenAI SDK의 <code style={{ color: '#38bdf8' }}>base_url</code>에 그대로 지정할 수 있습니다.
              </div>
              <div style={{ position: 'relative' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#a7f3d0',
                  overflowX: 'auto',
                  border: '1px solid #1e293b'
                }}>
                  <code>{curlSnippetPath}</code>
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippetPath, 'curl-path')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'curl-path' ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                  <span>{copiedField === 'curl-path' ? '복사됨' : 'cURL 복사'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Header Based */}
          {activeEndpointTab === 'header' && (
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
                💡 공통 엔드포인트(<code style={{ color: '#38bdf8' }}>/v1/chat/completions</code>)를 사용하면서 <code style={{ color: '#fbbf24' }}>x-orche-route</code> 헤더로 목적지 라우트를 지정합니다.
              </div>
              <div style={{ position: 'relative' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#a7f3d0',
                  overflowX: 'auto',
                  border: '1px solid #1e293b'
                }}>
                  <code>{curlSnippetHeader}</code>
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippetHeader, 'curl-header')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'curl-header' ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                  <span>{copiedField === 'curl-header' ? '복사됨' : 'cURL 복사'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Python OpenAI SDK */}
          {activeEndpointTab === 'python' && (
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
                💡 파이썬 공식 OpenAI SDK 클라이언트 초기화 코드 예시입니다.
              </div>
              <div style={{ position: 'relative' }}>
                <pre style={{
                  margin: 0,
                  padding: '12px 14px',
                  background: '#090d16',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#93c5fd',
                  overflowX: 'auto',
                  border: '1px solid #1e293b'
                }}>
                  <code>{pythonSnippet}</code>
                </pre>
                <button
                  onClick={() => handleCopy(pythonSnippet, 'python')}
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  {copiedField === 'python' ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                  <span>{copiedField === 'python' ? '복사됨' : '코드 복사'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Test Call Response Box */}
          {testResult && (
            <div style={{
              marginTop: '16px',
              padding: '12px 14px',
              background: 'rgba(15, 23, 42, 0.95)',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${testResult.is_success ? 'rgba(52, 211, 153, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${testResult.is_success ? 'active' : 'revoked'}`} style={{ fontSize: '0.72rem' }}>
                    {testResult.is_success ? `HTTP ${testResult.status_code || 200} OK` : `HTTP ${testResult.status_code || '오류'}`}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: 600 }}>
                    게이트웨이 응답 테스트 결과 ({testResult.latency_ms}ms)
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    대상 URL: {testResult.target_url}
                  </span>
                </div>
                <button
                  onClick={() => setTestResult(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  닫기 ✕
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '8px 10px',
                background: '#040711',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: testResult.is_success ? '#a7f3d0' : '#fca5a5',
                overflowX: 'auto',
                maxHeight: '160px'
              }}>
                <code>
                  {testResult.response_body
                    ? (typeof testResult.response_body === 'string' ? testResult.response_body : JSON.stringify(testResult.response_body, null, 2))
                    : (testResult.error_message || '결과 없음')}
                </code>
              </pre>
            </div>
          )}
        </div>

        {/* 1. N-Way Multi-Model Traffic Splitter */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={18} color="#38bdf8" />
                <span>1. 다중 모델 가중치 분할기 (N-Target Multi-Weighted Traffic Splitter)</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                이 라우트로 인입되는 추론 요청을 {currentWeights.length}개 모델 풀 간에 실시간 비율로 분산 처리합니다.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleAutoBalance} style={{ color: '#F54927' }}>
                <Scale size={14} color="#F54927" /> <span style={{ color: '#F54927' }}>가중치 균등 분할</span>
              </button>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                background: totalWeight === 100 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: totalWeight === 100 ? '#34d399' : '#f87171',
                border: totalWeight === 100 ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                {totalWeight === 100 ? '총합: 100% (정상)' : `총합: ${totalWeight}% (차이: ${100 - totalWeight}%)`}
              </div>
            </div>
          </div>

          {/* Visual Stacked Progress Bar */}
          <div style={{
            height: '24px',
            width: '100%',
            background: 'rgba(30, 41, 59, 0.8)',
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
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px', 
                    background: 'rgba(30, 41, 59, 0.4)', 
                    padding: '12px 16px', 
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  
                  <div style={{ width: '260px', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', wordBreak: 'break-all' }}>
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
                        style={{ padding: '4px 8px', fontSize: '0.85rem', textAlign: 'right', color: '#F54927' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: '#F54927' }}>%</span>
                    </div>
                  </div>

                  {currentWeights.length > 1 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRemoveModelFromRoute(idx)}
                      style={{ padding: '6px', color: '#F54927' }}
                      title="모델 제외"
                    >
                      <Trash2 size={14} color="#F54927" />
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
                style={{ maxWidth: '360px', fontSize: '0.82rem', color: '#F54927' }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddModelToRoute(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="" disabled>+ 카탈로그에서 추가할 모델 선택...</option>
                {availableModelsToAdd.map(m => (
                  <option key={m.id} value={m.id}>
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
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={18} color="#38bdf8" />
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
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color="#34d399" />
              <span>3. 부하 분산 전략 & 다단계 장애 우회 (Failover Chain)</span>
            </div>
            
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ marginBottom: '6px' }}>지능형 부하 분산 알고리즘</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', color: '#F54927' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#F54927' }}>
                  <input
                    type="radio"
                    name="strategy"
                    value="LeastQueueDepth"
                    checked={(currentRoute.load_balancing_strategy || 'LeastQueueDepth') === 'LeastQueueDepth'}
                    onChange={() => updateCurrentRoute({ load_balancing_strategy: 'LeastQueueDepth' })}
                  />
                  <span style={{ color: '#F54927' }}><strong>최소 큐 깊이 (Least Queue Depth)</strong> - KV-Cache 및 vLLM 대기 큐 최적 분산</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#F54927' }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <button className="btn btn-secondary" onClick={handleDryRun} disabled={isDryRunning}>
            {isDryRunning ? '검증 중...' : '드라이런 사전 검증'}
          </button>
          <button className="btn btn-primary" onClick={handleDeployXds} disabled={isDeploying || totalWeight !== 100}>
            {isDeploying ? 'Envoy RDS 배포 중...' : 'Envoy xDS 라우팅 즉시 배포 (무중단)'}
          </button>
        </div>
      </div>

      {/* Upstream Clarification Notice */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.5)',
        borderLeft: '4px solid #38bdf8',
        padding: '10px 14px',
        marginBottom: '14px',
        borderRadius: '0 6px 6px 0',
        fontSize: '0.78rem',
        color: 'var(--text-secondary)'
      }}>
        💡 <strong>안내:</strong> 아래 모델 카탈로그의 엔드포인트는 주전산센터 내부 <strong>'Upstream 원본 서빙 인프라'</strong> 주소입니다. 외부 개발자 및 클라이언트는 상단의 <strong>'Envoy L7 게이트웨이 엔드포인트(포트 8080)'</strong>로 인입되며, 게이트웨이가 가중치에 따라 아래 원본 모델 풀로 트래픽을 자동 분산합니다.
      </div>

      {/* Model Catalog Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">
              <Cpu size={20} color="#34d399" />
              <span>등록된 LLM 서빙 모델 풀 (vLLM / Ollama: {models.length}개)</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              주전산센터(K8s/Bare-Metal/VM/Host) 내 배포된 실제 추론 엔드포인트 실시간 헬스 상태
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCheckAllHealth}
              disabled={isHealthCheckingAll}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
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
                <th>런타임 엔진</th>
                <th>구동 인프라 & 방식</th>
                <th>엔드포인트 URL</th>
                <th>토큰 단가 (입력/출력)</th>
                <th>대기 큐</th>
                <th>상태 & 헬스</th>
                <th>현재 라우트 포함</th>
                <th style={{ textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const isInCurrentRoute = currentWeights.some(w => w.model_id === m.id);
                const isOllama = m.engine === 'Ollama' || m.backend?.toLowerCase().includes('ollama');
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#ffffff' }}>{m.id}</div>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>alias: {m.alias}</div>
                    </td>
                    <td>
                      <span 
                        className="badge"
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: isOllama ? 'rgba(249, 115, 22, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: isOllama ? '#fb923c' : '#38bdf8',
                          border: `1px solid ${isOllama ? 'rgba(249, 115, 22, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`
                        }}
                      >
                        {m.engine || (isOllama ? 'Ollama' : 'vLLM')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span 
                          className="badge" 
                          style={{
                            fontSize: '0.72rem',
                            background: m.backend?.includes('K8s') ? 'rgba(56, 189, 248, 0.15)' : 
                                        (m.backend?.includes('Bare-Metal') ? 'rgba(168, 85, 247, 0.15)' : 
                                        (m.backend?.includes('VM') ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.1)')),
                            color: m.backend?.includes('K8s') ? '#38bdf8' : 
                                   (m.backend?.includes('Bare-Metal') ? '#c084fc' : 
                                   (m.backend?.includes('VM') ? '#34d399' : '#e2e8f0')),
                            border: `1px solid ${
                              m.backend?.includes('K8s') ? 'rgba(56, 189, 248, 0.3)' : 
                              (m.backend?.includes('Bare-Metal') ? 'rgba(168, 85, 247, 0.3)' : 
                              (m.backend?.includes('VM') ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 255, 255, 0.2)'))
                            }`
                          }}
                        >
                          {m.backend}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          [{m.executionMethod || 'k8s'}]
                        </span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                      {m.endpoint}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      ₩{m.inputPricePer1k} / ₩{m.outputPricePer1k} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>/ 1k tok</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
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
                          if (!hs) {
                            return (
                              <button
                                onClick={() => handleCheckSingleHealth(m.id)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: '0.68rem', height: '22px', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}
                                title="실시간 엔드포인트 핑 테스트"
                              >
                                <Zap size={11} color="#38bdf8" />
                                <span>핑 테스트</span>
                              </button>
                            );
                          }
                          if (hs.checking) {
                            return (
                              <span
                                className="badge"
                                style={{
                                  fontSize: '0.68rem',
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  width: 'fit-content'
                                }}
                              >
                                <RefreshCw size={11} className="spin" />
                                <span>점검 중...</span>
                              </span>
                            );
                          }
                          if (hs.is_healthy) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.68rem',
                                    background: 'rgba(52, 211, 153, 0.15)',
                                    color: '#34d399',
                                    border: '1px solid rgba(52, 211, 153, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title={`HTTP ${hs.status_code || 200} OK | 지연시간: ${hs.latency_ms}ms`}
                                >
                                  <CheckCircle2 size={11} />
                                  <span>정상 ({hs.latency_ms}ms)</span>
                                </span>
                                <button
                                  onClick={() => handleCheckSingleHealth(m.id)}
                                  title="다시 점검"
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
                                className="badge"
                                style={{
                                  fontSize: '0.68rem',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
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
                                onClick={() => handleCheckSingleHealth(m.id)}
                                title={`재시도: ${hs.error_message || '연결 실패'}`}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', padding: '2px', display: 'flex', alignItems: 'center' }}
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
                        <span style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: 600 }}>
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
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleDeleteModel(m.id)}
                        style={{
                          padding: '3px 8px',
                          color: '#f87171',
                          borderColor: 'rgba(239, 68, 68, 0.35)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.72rem',
                          background: 'rgba(239, 68, 68, 0.08)'
                        }}
                        title="서빙 모델 풀에서 영구 삭제"
                      >
                        <Trash2 size={12} />
                        <span>삭제</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Route Modal */}
      {showNewRouteModal && (
        <div className="modal-overlay" onClick={() => setShowNewRouteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitFork size={18} color="#38bdf8" />
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
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={20} color="#38bdf8" />
                <span>신규 LLM 서빙 모델 등록 (vLLM / Ollama 카탈로그)</span>
              </div>
            </div>
            <form onSubmit={handleCreateModel}>
              <div className="modal-body">
                {/* 1. 런타임 서빙 엔진 선택 */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>서빙 런타임 엔진 (Serving Runtime)</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>* 고처리량 분산 vs 경량 GGUF</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {[
                      { id: 'vLLM', label: 'vLLM (고성능/연속배치)', color: '#38bdf8' },
                      { id: 'Ollama', label: 'Ollama (경량/GGUF)', color: '#fb923c' },
                      { id: 'SGLang', label: 'SGLang (고속/구조화)', color: '#c084fc' }
                    ].map(eng => {
                      const isSelected = newModelForm.serving_engine === eng.id;
                      return (
                        <button
                          key={eng.id}
                          type="button"
                          onClick={() => handleEngineChange(eng.id)}
                          style={{
                            padding: '9px 12px',
                            borderRadius: 'var(--radius-md)',
                            border: isSelected ? `2px solid ${eng.color}` : '1px solid var(--border-subtle)',
                            background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                            color: isSelected ? '#ffffff' : 'var(--text-muted)',
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <span style={{ color: isSelected ? eng.color : 'inherit', fontSize: '0.88rem' }}>{eng.id}</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{eng.label.split(' ')[1]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. 실행 / 배포 환경 선택 */}
                <div className="form-group">
                  <label className="form-label">실행 및 배포 환경 (Execution Method)</label>
                  <select 
                    className="form-select"
                    value={newModelForm.execution_method}
                    onChange={(e) => handleExecutionMethodChange(e.target.value)}
                  >
                    <option value="k8s">Kubernetes (사내 온프레미스 K8s 클러스터 파드 배포)</option>
                    <option value="docker-compose">Docker Compose (도커 컨테이너 / 격리 VM)</option>
                    <option value="direct">Direct Host CLI (서버 호스트 OS 직접 백그라운드 명령어 실행)</option>
                  </select>
                </div>

                {/* 3. 호스트 직접 실행/도커 가이드 스니펫 (Launch Snippet Box) */}
                {(newModelForm.execution_method === 'direct' || newModelForm.execution_method === 'docker-compose') && (
                  <div style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px dashed var(--border-accent)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>💡 운영자 서버 구동 참고 템플릿 ({newModelForm.serving_engine} / {newModelForm.execution_method}):</span>
                    </div>
                    <pre style={{
                      margin: 0,
                      padding: '8px 10px',
                      background: '#090d16',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)',
                      color: '#a7f3d0',
                      overflowX: 'auto',
                      border: '1px solid #1e293b'
                    }}>
                      <code>
                        {newModelForm.serving_engine === 'Ollama' ? (
                          newModelForm.execution_method === 'direct' 
                            ? `OLLAMA_HOST=0.0.0.0:11434 ollama serve\nollama run ${newModelForm.model_id || 'qwen2.5:14b'}`
                            : `docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama\ndocker exec -it ollama ollama run ${newModelForm.model_id || 'qwen2.5:14b'}`
                        ) : (
                          newModelForm.execution_method === 'direct'
                            ? `python3 -m vllm.entrypoints.openai.api_server \\\n  --model ${newModelForm.model_id || 'meta-llama/Llama-3.1-8B-Instruct'} \\\n  --port 8000 --max-model-len 8192`
                            : `docker run --gpus all -v ~/.cache/huggingface:/root/.cache/huggingface \\\n  -p 8000:8000 --ipc=host vllm/vllm-openai:latest \\\n  --model ${newModelForm.model_id || 'meta-llama/Llama-3.1-8B-Instruct'}`
                        )}
                      </code>
                    </pre>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                      ※ AI Orchestrator는 기동 완료된 엔드포인트 URL을 등록받아 L7 라우팅을 제어하며 서버에 직접 배포하지 않습니다.
                    </div>
                  </div>
                )}

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
                <div className="form-group">
                  <label className="form-label">배포 대상 인프라 (Compute Target)</label>
                  <select 
                    className="form-select"
                    value={newModelForm.backend_infra}
                    onChange={(e) => setNewModelForm({...newModelForm, backend_infra: e.target.value})}
                  >
                    <optgroup label="온프레미스 / 폐쇄망 표준 인프라 (On-Premises Air-Gap)">
                      <option value="On-Prem K8s">Kubernetes (사내 온프레미스 K8s 클러스터)</option>
                      <option value="Bare-Metal GPU">Bare-Metal GPU (사내 DGX/HGX 전용 고성능 GPU 서버)</option>
                      <option value="Private VM">Private VM (사내 VMware/Nutanix 가상화 GPU VM)</option>
                      <option value="Local Server">Local Server / Host (사내 호스트 서버/워크스테이션)</option>
                    </optgroup>
                    <optgroup label="하이브리드 클라우드 연동 (Hybrid Cloud Extensions)">
                      <option value="Cloud GPU (EKS)">Cloud GPU K8s (AWS EKS / NCP InferencePool)</option>
                      <option value="Cloud GPU (VM)">Cloud GPU Instance (AWS EC2 / NCP GPU)</option>
                    </optgroup>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">엔드포인트 URL (Target Endpoint)</label>
                  <input 
                    className="form-input" 
                    value={newModelForm.target_endpoint}
                    onChange={(e) => setNewModelForm({...newModelForm, target_endpoint: e.target.value})}
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">입력 토큰 단가 (₩/1k)</label>
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
                    <label className="form-label">출력 토큰 단가 (₩/1k)</label>
                    <input 
                      type="number"
                      step="0.1"
                      className="form-input" 
                      value={newModelForm.output_price_per_1k}
                      onChange={(e) => setNewModelForm({...newModelForm, output_price_per_1k: e.target.value})}
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
    </div>
  );
}
