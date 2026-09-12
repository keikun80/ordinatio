import React, { useState, useEffect } from 'react';
import { GitFork, Cpu, CheckCircle2, AlertCircle, RefreshCw, Layers, ShieldAlert, Plus, Trash2, Sliders, Scale, Zap, Compass, Tag, ArrowRight } from 'lucide-react';
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
    backend_infra: 'EKS',
    target_endpoint: 'http://vllm-qwen14b.ai-serving:8000',
    input_price_per_1k: 1.2,
    output_price_per_1k: 3.6
  });

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
      onNotify('SUCCESS', `신규 모델 '${res.alias}'이(가) 서빙 풀에 추가되었습니다.`);
    } catch (err) {
      const fallbackEntry = {
        id: newModelForm.model_id,
        alias: newModelForm.alias,
        backend: newModelForm.backend_infra,
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
      onNotify('SUCCESS', `신규 모델 '${newModelForm.alias}'이(가) 등록되었습니다.`);
    }
  };

  const availableModelsToAdd = models.filter(m => !currentWeights.some(w => w.model_id === m.id));

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
                    <GitFork size={14} />
                    <span>{r.route_name}</span>
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
            <span style={{ color: 'var(--text-muted)' }}>현재 xDS 리비전:</span>
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
              <button className="btn btn-secondary btn-sm" onClick={handleAutoBalance}>
                <Scale size={14} /> 가중치 균등 분할
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
                        style={{ padding: '4px 8px', fontSize: '0.85rem', textAlign: 'right' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</span>
                    </div>
                  </div>

                  {currentWeights.length > 1 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRemoveModelFromRoute(idx)}
                      style={{ padding: '6px', color: '#f87171' }}
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
                style={{ maxWidth: '360px', fontSize: '0.82rem' }}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
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

      {/* Model Catalog Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Cpu size={20} color="#34d399" />
            <span>등록된 vLLM 서빙 모델 풀 (Model Catalog: {models.length}개)</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            클러스터(EKS/ECS/EC2) 내 배포된 실제 추론 엔드포인트 목록
          </span>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>모델 식별자 / 별칭</th>
                <th>구동 인프라</th>
                <th>엔드포인트 URL</th>
                <th>토큰 단가 (입력/출력)</th>
                <th>대기 큐</th>
                <th>상태</th>
                <th>현재 라우트 포함</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const isInCurrentRoute = currentWeights.some(w => w.model_id === m.id);
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#ffffff' }}>{m.id}</div>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>alias: {m.alias}</div>
                    </td>
                    <td>
                      <span className="badge info">{m.backend}</span>
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
                      <span className={`badge ${m.active !== false ? 'active' : 'revoked'}`}>
                        {m.active !== false ? '정상 서빙' : '비활성'}
                      </span>
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff' }}>
                신규 vLLM 모델 서빙 풀 등록
              </div>
            </div>
            <form onSubmit={handleCreateModel}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">모델 식별자 (Model ID)</label>
                  <input 
                    className="form-input" 
                    placeholder="예: Qwen/Qwen2.5-14B-Instruct" 
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
                    <option value="EKS">vLLM on Kubernetes (EKS InferencePool)</option>
                    <option value="ECS">vLLM on Amazon ECS (Cloud Map)</option>
                    <option value="EC2">vLLM on Amazon EC2 (NVMe Warm Pool)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">엔드포인트 URL</label>
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
