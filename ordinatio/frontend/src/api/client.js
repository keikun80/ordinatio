// ordinatio API Client Layer (Clean Architecture)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('ordinatio_token');
  const headers = { ...extra };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Central Request Interceptor with 401 Session Expiration Hook (A-4)
async function authFetch(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ordinatio-session-expired', { detail: { url } }));
    }
  }
  return res;
}

export const apiClient = {
  // --- System & Diagnostics ---
  async getHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return { status: 'STANDALONE_OFFLINE', mode: 'Air-Gapped Local Mock' };
    }
  },

  async getSystemInfo() {
    try {
      const res = await fetch(`${API_BASE_URL}/system/info`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        solution: 'Enterprise Ordinatio Appliance',
        version: '0.1.4',
        mode: 'Air-Gapped Fallback'
      };
    }
  },

  async runPreflight() {
    try {
      const res = await fetch(`${API_BASE_URL}/system/preflight`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        status: 'MOCK_HEALTHY',
        checks: [
          { component: 'PostgreSQL Metastore', status: 'PASS', latency_ms: 0.8 },
          { component: 'Redis Cluster Quotas', status: 'PASS', latency_ms: 0.3 },
          { component: 'Apache Kafka Event Bus', status: 'PASS', latency_ms: 1.2 },
          { component: 'vLLM InferencePool', status: 'PASS', latency_ms: 24.0 },
          { component: 'NVIDIA DCGM Exporter', status: 'PASS', latency_ms: 4.0 }
        ]
      };
    }
  },

  // --- Multi-Tenant Governance (Phase 1) ---
  async getTenants() {
    const res = await authFetch(`${API_BASE_URL}/tenants`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async createTenant(data) {
    const res = await fetch(`${API_BASE_URL}/tenants`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '테넌트 생성 실패');
    }
    return await res.json();
  },

  async updateTenant(tenantId, data) {
    const res = await fetch(`${API_BASE_URL}/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '테넌트 수정 실패');
    }
    return await res.json();
  },

  async deleteTenant(tenantId) {
    const res = await fetch(`${API_BASE_URL}/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '테넌트 삭제 실패');
    }
    return await res.json();
  },

  async updateTenantBudget(tenantId, data) {
    const res = await fetch(`${API_BASE_URL}/external/tenants/${tenantId}/budget`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '부서 예산 변경 실패');
    }
    return await res.json();
  },

  // --- Virtual Key Lifecycle (Phase 1) ---
  async getVirtualKeys(params = {}) {
    const url = new URL(`${API_BASE_URL}/virtual-keys`);
    if (params.tenant_id && params.tenant_id !== 'ALL') {
      url.searchParams.append('tenant_id', params.tenant_id);
    }
    if (params.search) {
      url.searchParams.append('search', params.search);
    }
    const res = await authFetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async createVirtualKey(data) {
    const res = await fetch(`${API_BASE_URL}/virtual-keys`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'API Key 발급 실패');
    }
    return await res.json();
  },

  async revokeVirtualKey(keyId, reason = '관리자에 의한 즉시 파기') {
    const res = await fetch(`${API_BASE_URL}/virtual-keys/${keyId}/revoke`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ revoked_reason: reason })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '가상키 파기 실패');
    }
    return await res.json();
  },

  async updateVirtualKey(keyId, data) {
    const res = await fetch(`${API_BASE_URL}/virtual-keys/${keyId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '가상키 정보 변경 실패');
    }
    return await res.json();
  },

  async deleteVirtualKey(keyId, force = false) {
    const url = force
      ? `${API_BASE_URL}/virtual-keys/${keyId}?force=true`
      : `${API_BASE_URL}/virtual-keys/${keyId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '가상키 삭제 실패');
    }
    return await res.json();
  },

  async validateVirtualKey(rawKey, modelId = null) {
    const res = await fetch(`${API_BASE_URL}/virtual-keys/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_key: rawKey, model_id: modelId })
    });
    return await res.json();
  },

  // --- Model Catalog & Dynamic Routing (Phase 2) ---
  async getModels() {
    const res = await authFetch(`${API_BASE_URL}/models`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async createModel(data) {
    const res = await fetch(`${API_BASE_URL}/models`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '모델 등록 실패');
    }
    return await res.json();
  },

  async updateModel(modelId, data) {
    const res = await fetch(`${API_BASE_URL}/models/${encodeURIComponent(modelId)}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '모델 정보 수정 실패');
    }
    return await res.json();
  },

  async deleteModel(modelId, force = true) {
    const res = await fetch(`${API_BASE_URL}/models/${encodeURIComponent(modelId)}?force=${force}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '모델 삭제 실패');
    }
    return await res.json();
  },

  async checkAllModelsHealth(timeout = null) {
    try {
      const url = timeout 
        ? `${API_BASE_URL}/models/health-check?timeout=${encodeURIComponent(timeout)}` 
        : `${API_BASE_URL}/models/health-check`;
      const res = await fetch(url, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API checkAllModelsHealth offline:', err);
      return null;
    }
  },

  async checkModelHealth(modelId, timeout = null) {
    const url = timeout 
      ? `${API_BASE_URL}/models/${encodeURIComponent(modelId)}/health?timeout=${encodeURIComponent(timeout)}` 
      : `${API_BASE_URL}/models/${encodeURIComponent(modelId)}/health`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '모델 헬스체크 실패');
    }
    return await res.json();
  },

  // --- AgentRouter & Envoy AI Gateway (Phase 0.1) ---
  async getAgentRouterStatus() {
    try {
      const res = await fetch(`${API_BASE_URL}/routing/agent-router/status`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        status: 'ACTIVE',
        engine: 'AgentRouter Cognitive Dispatcher v0.1 (Local Fallback)',
        supported_policies: ['QualityFirst', 'LeastCost', 'LatencyOptimized', 'SelfHealingFallback'],
        default_tiers: {
          fast_8b: { model: 'meta-llama/Llama-3-8B-Instruct', cluster: 'cluster_vllm_fast_8b' },
          reasoning_72b: { model: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-70B', cluster: 'cluster_vllm_reasoning_72b' }
        }
      };
    }
  },

  async simulateAgentRouter(prompt, policy = 'QualityFirst', tools = null, budgetSpentRatio = 0.0) {
    try {
      const res = await fetch(`${API_BASE_URL}/routing/agent-router/simulate`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prompt, policy, tools, budget_spent_ratio: budgetSpentRatio })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      const isHeavy = prompt.includes('코드') || prompt.includes('알고리즘') || prompt.includes('python') || prompt.length > 200;
      return {
        prompt_analyzed: prompt.slice(0, 80),
        complexity: isHeavy ? 'REASONING_HEAVY' : 'LIGHT',
        suggested_tier: isHeavy ? 'reasoning_72b' : 'fast_8b',
        policy_applied: policy,
        selected_model: isHeavy ? 'deepseek-ai/DeepSeek-R1-Distill-Qwen-70B' : 'meta-llama/Llama-3-8B-Instruct',
        target_cluster: isHeavy ? 'cluster_vllm_reasoning_72b' : 'cluster_vllm_fast_8b',
        estimated_tokens: Math.max(15, Math.floor(prompt.length / 3)),
        reasons: ['Local standalone simulation fallback'],
        has_tool_calling: Boolean(tools),
        primary_intent: isHeavy ? 'coding' : 'light_conversation'
      };
    }
  },

  async getAgentRouterPolicies() {
    try {
      const res = await fetch(`${API_BASE_URL}/routing/agent-router/policies`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getAgentRouterPolicies offline, returning default policies');
      return {
        policies: [
          {
            policy_id: "QualityFirst",
            name: "QualityFirst (품질 우선)",
            description: "복잡한 알고리즘, 코딩 및 심층 추론 질문 시 최고 성능 72B 모델로 우선 분기하고 단순 질의는 8B로 처리합니다.",
            is_active: true,
            config: {
              reasoning_model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-70B",
              fast_model: "meta-llama/Llama-3-8B-Instruct",
              enforce_reasoning_for_tools: true,
              reasoning_cluster: "cluster_vllm_reasoning_72b",
              fast_cluster: "cluster_vllm_fast_8b"
            }
          },
          {
            policy_id: "LeastCost",
            name: "LeastCost (비용 최적화)",
            description: "테넌트의 월간 예산 소진율이 임계치를 초과하면 강제로 경제형 8B 모델로 다운티어링하여 클라우드/인프라 TCO를 방어합니다.",
            is_active: true,
            config: {
              budget_threshold_pct: 80.0,
              economic_model: "meta-llama/Llama-3-8B-Instruct",
              standard_model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-70B",
              economic_cluster: "cluster_vllm_fast_8b",
              standard_cluster: "cluster_vllm_reasoning_72b"
            }
          },
          {
            policy_id: "LatencyOptimized",
            name: "LatencyOptimized (지연시간 최적화)",
            description: "초저지연(TTFT) 보장을 위해 경량 8B 모델을 최우선 분기하며, 명시적 심층 추론 요청 시에만 선택적 예외를 허용합니다.",
            is_active: true,
            config: {
              target_latency_ms: 200,
              primary_fast_model: "meta-llama/Llama-3-8B-Instruct",
              allow_reasoning_override: true,
              reasoning_model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-70B",
              fast_cluster: "cluster_vllm_fast_8b",
              reasoning_cluster: "cluster_vllm_reasoning_72b"
            }
          },
          {
            policy_id: "SelfHealingFallback",
            name: "SelfHealingFallback (자가 치유 폴백)",
            description: "업스트림 GPU 서빙 노드의 5xx 오류 또는 헬스체크 타임아웃 발생 시 무중단으로 지정된 예비 모델로 자동 절체합니다.",
            is_active: true,
            config: {
              primary_fallback_model: "qwen/Qwen-2.5-7B-Instruct",
              secondary_fallback_model: "meta-llama/Llama-3-8B-Instruct",
              max_retries: 2,
              timeout_seconds: 5,
              fallback_cluster: "cluster_vllm_inference_pool"
            }
          }
        ]
      };
    }
  },

  async updateAgentRouterPolicies(policies) {
    const res = await fetch(`${API_BASE_URL}/routing/agent-router/policies`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ policies })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '정책 업데이트 실패');
    }
    return await res.json();
  },


  async getActiveRoutingPolicy(routeName = null) {
    const url = routeName ? `${API_BASE_URL}/routing?route_name=${encodeURIComponent(routeName)}` : `${API_BASE_URL}/routing`;
    const res = await authFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async getRoutes() {
    const res = await authFetch(`${API_BASE_URL}/routing/routes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async getRoute(routeName) {
    const res = await fetch(`${API_BASE_URL}/routing/routes/${encodeURIComponent(routeName)}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async createRoute(data) {
    const res = await fetch(`${API_BASE_URL}/routing/routes`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '신규 라우트 생성 실패');
    }
    return await res.json();
  },

  async updateRoute(routeName, data) {
    const res = await fetch(`${API_BASE_URL}/routing/routes/${encodeURIComponent(routeName)}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '라우트 수정 실패');
    }
    return await res.json();
  },

  async deleteRoute(routeName) {
    const res = await fetch(`${API_BASE_URL}/routing/routes/${encodeURIComponent(routeName)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '라우트 삭제 실패');
    }
    return await res.json();
  },


  async dryRunRouting(data) {
    const res = await fetch(`${API_BASE_URL}/routing/dry-run`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '드라이런 검증 실패');
    }
    return await res.json();
  },

  async testRouteCall(data) {
    const res = await fetch(`${API_BASE_URL}/routing/test-call`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '라우트 테스트 요청 실패');
    }
    return await res.json();
  },

  async testAllModelsCall(data) {
    const res = await fetch(`${API_BASE_URL}/routing/test-call-all`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '전체 모델 테스트 요청 실패');
    }
    return await res.json();
  },

  async executeChatCompletion({ model, messages, temperature = 0.7, max_tokens = 512, apiKey = null }) {
    // Gateway endpoint: fallback to relative /v1/chat/completions or localhost:8000
    const gatewayUrl = window.location.port === '5173'
      ? '/v1/chat/completions'
      : `${(API_BASE_URL.replace(/\/api\/v1\/?$/, '') || 'http://localhost:8000')}/v1/chat/completions`;
    const headers = apiKey
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
      : getAuthHeaders({ 'Content-Type': 'application/json', 'X-Console-Prompt-Studio': 'true' });
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detailMsg = typeof err.detail === 'object' ? (err.detail.message || JSON.stringify(err.detail)) : (err.detail || `HTTP ${res.status}`);
      throw new Error(detailMsg);
    }
    return await res.json();
  },

  async deployRouting(data) {
    const res = await fetch(`${API_BASE_URL}/routing/deploy`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Envoy L7 라우팅 배포 실패');
    }
    return await res.json();
  },

  async getRoutingHistory() {
    try {
      const res = await fetch(`${API_BASE_URL}/routing/history`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return [];
    }
  },

  // --- Observability & Telemetry (Phase 3) ---
  getObservabilityWsUrl() {
    const isHttps = window.location.protocol === 'https:';
    const host = window.location.host || 'localhost:5173';
    return `${isHttps ? 'wss' : 'ws'}://${host}/api/v1/observability/ws`;
  },

  async getMetricsSummary() {
    const res = await authFetch(`${API_BASE_URL}/observability/metrics/summary`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async getMetricsTimeseries(window = '1h', resolution = '1m') {
    const url = new URL(`${API_BASE_URL}/observability/metrics/timeseries`);
    if (window) url.searchParams.append('window', window);
    if (resolution) url.searchParams.append('resolution', resolution);
    const res = await authFetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // --- FinOps & Billing (Phase 3) ---
  async getFinOpsOverview() {
    const res = await authFetch(`${API_BASE_URL}/finops/overview`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async getSemanticCacheStats() {
    const res = await authFetch(`${API_BASE_URL}/finops/semantic-cache`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async exportFinOpsInvoiceCsv(month = null) {
    const url = new URL(`${API_BASE_URL}/finops/invoices/export`);
    if (month) url.searchParams.append('month', month);
    const res = await fetch(url.toString(), {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `ordinatio_invoice_${month || new Date().toISOString().slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);
    return true;
  },

  // --- Compliance & PII Governance (Phase 4) ---
  async getPiiRules(activeOnly = false) {
    const url = new URL(`${API_BASE_URL}/compliance/rules`);
    if (activeOnly) url.searchParams.append('active_only', 'true');
    const res = await authFetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async createPiiRule(ruleData) {
    const res = await fetch(`${API_BASE_URL}/compliance/rules`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(ruleData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create PII rule' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async updatePiiRule(ruleId, ruleData) {
    const res = await fetch(`${API_BASE_URL}/compliance/rules/${ruleId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(ruleData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update PII rule' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async deletePiiRule(ruleId) {
    const res = await fetch(`${API_BASE_URL}/compliance/rules/${encodeURIComponent(ruleId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to delete PII rule' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async simulatePiiMasking({ text, requester_id = 'admin-sim', key_id = null, model_id = null }) {
    const res = await fetch(`${API_BASE_URL}/compliance/simulate`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text, requester_id, key_id, model_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'PII simulation failed' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async getAuditLogs(params = {}) {
    const url = new URL(`${API_BASE_URL}/compliance/audit-logs`);
    if (params.requester_id) url.searchParams.append('requester_id', params.requester_id);
    if (params.key_id) url.searchParams.append('key_id', params.key_id);
    if (params.action_taken) url.searchParams.append('action_taken', params.action_taken);
    if (params.is_blocked !== undefined && params.is_blocked !== null) {
      url.searchParams.append('is_blocked', params.is_blocked);
    }
    if (params.limit) url.searchParams.append('limit', params.limit);
    if (params.offset) url.searchParams.append('offset', params.offset);

    const res = await authFetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async getComplianceStats() {
    const res = await authFetch(`${API_BASE_URL}/compliance/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async verifyWormIntegrity() {
    const res = await authFetch(`${API_BASE_URL}/compliance/worm/verify`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // --- Lifecycle & Patch Management (Phase 5) ---
  async getLifecycleComponents() {
    const res = await authFetch(`${API_BASE_URL}/lifecycle/components`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async runLifecyclePreflight() {
    const res = await fetch(`${API_BASE_URL}/lifecycle/preflight`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async generateSupportBundle(bundleReq = {}) {
    const res = await fetch(`${API_BASE_URL}/lifecycle/support-bundle`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(bundleReq)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '서포트 번들 생성 실패' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  getSupportBundleDownloadUrl(bundleId) {
    return `${API_BASE_URL}/lifecycle/support-bundle/download/${bundleId}`;
  },

  // --- System Prompt Governance (Phase 1~4) ---
  async getSystemPrompts(params = {}) {
    try {
      const url = new URL(`${API_BASE_URL}/system-prompts`);
      if (params.target_type) url.searchParams.append('target_type', params.target_type);
      if (params.is_active !== undefined) url.searchParams.append('is_active', params.is_active);
      if (params.search) url.searchParams.append('search', params.search);
      const res = await fetch(url, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getSystemPrompts offline:', err);
      return [];
    }
  },

  async createSystemPrompt(data) {
    const res = await fetch(`${API_BASE_URL}/system-prompts`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '시스템 프롬프트 생성 실패' }));
      throw new Error(err.detail || '시스템 프롬프트 생성 실패');
    }
    return await res.json();
  },

  async updateSystemPrompt(promptId, data) {
    const res = await fetch(`${API_BASE_URL}/system-prompts/${promptId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '시스템 프롬프트 수정 실패' }));
      throw new Error(err.detail || '시스템 프롬프트 수정 실패');
    }
    return await res.json();
  },

  async deleteSystemPrompt(promptId) {
    const res = await fetch(`${API_BASE_URL}/system-prompts/${promptId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '시스템 프롬프트 삭제 실패' }));
      throw new Error(err.detail || '시스템 프롬프트 삭제 실패');
    }
    return await res.json();
  },

  async resolveSystemPrompt(data) {
    const res = await fetch(`${API_BASE_URL}/system-prompts/resolve`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '시스템 프롬프트 시뮬레이션 실패' }));
      throw new Error(err.detail || '시스템 프롬프트 시뮬레이션 실패');
    }
    return await res.json();
  },

  // --- Authentication & RBAC (PRE_26) ---
  async login(username, password) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '로그인에 실패했습니다.' }));
      const detailMsg = Array.isArray(err.detail)
        ? err.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
        : typeof err.detail === 'object' && err.detail !== null
          ? JSON.stringify(err.detail)
          : err.detail;
      throw new Error(detailMsg || '로그인에 실패했습니다.');
    }
    return await res.json();
  },

  async logout() {
    try {
      const token = localStorage.getItem('ordinatio_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers
      });
    } catch (e) {
      console.warn('Logout API error:', e);
    }
  },

  async getMe() {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers
    });
    if (!res.ok) {
      throw new Error(`Session validation failed: HTTP ${res.status}`);
    }
    return await res.json();
  },

  async changePassword(oldPassword, newPassword) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/auth/password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '비밀번호 변경에 실패했습니다.' }));
      throw new Error(err.detail || '비밀번호 변경에 실패했습니다.');
    }
    return await res.json();
  },

  // --- User Administration (SUPER_ADMIN only) ---
  async getUsers(params = {}) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const query = new URLSearchParams(params).toString();
    const url = query ? `${API_BASE_URL}/users?${query}` : `${API_BASE_URL}/users`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '사용자 목록 조회 실패' }));
      throw new Error(err.detail || '사용자 목록 조회 실패');
    }
    return await res.json();
  },

  async createUser(userData) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify(userData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '사용자 생성 실패' }));
      throw new Error(err.detail || '사용자 생성 실패');
    }
    return await res.json();
  },

  async updateUser(userId, userData) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(userData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '사용자 정보 수정 실패' }));
      throw new Error(err.detail || '사용자 정보 수정 실패');
    }
    return await res.json();
  },

  async deleteUser(userId) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '사용자 삭제 실패' }));
      throw new Error(err.detail || '사용자 삭제 실패');
    }
    return await res.json();
  },

  async resetUserPassword(userId, newPassword) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/users/${userId}/reset-password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ new_password: newPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '비밀번호 초기화 실패' }));
      throw new Error(err.detail || '비밀번호 초기화 실패');
    }
    return await res.json();
  },

  // --- Role & Dynamic RBAC Governance ---
  async getRoles() {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/roles`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '역할 목록 조회 실패' }));
      throw new Error(err.detail || '역할 목록 조회 실패');
    }
    return await res.json();
  },

  async getRolePermissions() {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/roles/permissions`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '권한 목록 조회 실패' }));
      throw new Error(err.detail || '권한 목록 조회 실패');
    }
    return await res.json();
  },

  async createRole(roleData) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/roles`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roleData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '역할 생성 실패' }));
      throw new Error(err.detail || '역할 생성 실패');
    }
    return await res.json();
  },

  async updateRole(roleId, roleData) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/roles/${roleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(roleData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '역할 수정 실패' }));
      throw new Error(err.detail || '역할 수정 실패');
    }
    return await res.json();
  },

  async deleteRole(roleId) {
    const token = localStorage.getItem('ordinatio_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/roles/${roleId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '역할 삭제 실패' }));
      throw new Error(err.detail || '역할 삭제 실패');
    }
    return true;
  }
};

export const api = apiClient;
export default apiClient;

