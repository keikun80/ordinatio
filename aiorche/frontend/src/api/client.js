// aiorche API Client Layer (Clean Architecture)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const apiClient = {
  // --- System & Diagnostics ---
  async getHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return { status: 'STANDALONE_OFFLINE', mode: 'Air-Gapped Local Mock' };
    }
  },

  async getSystemInfo() {
    try {
      const res = await fetch(`${API_BASE_URL}/system/info`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        solution: 'Enterprise AI Orchestrator Appliance',
        version: 'v1.2.0',
        mode: 'Air-Gapped Fallback'
      };
    }
  },

  async runPreflight() {
    try {
      const res = await fetch(`${API_BASE_URL}/system/preflight`);
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
    try {
      const res = await fetch(`${API_BASE_URL}/tenants`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getTenants offline, fallback to mock');
      return null;
    }
  },

  async createTenant(data) {
    const res = await fetch(`${API_BASE_URL}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '테넌트 생성 실패');
    }
    return await res.json();
  },

  async updateTenantBudget(tenantId, data) {
    const res = await fetch(`${API_BASE_URL}/external/tenants/${tenantId}/budget`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
    try {
      const url = new URL(`${API_BASE_URL}/virtual-keys`);
      if (params.tenant_id && params.tenant_id !== 'ALL') {
        url.searchParams.append('tenant_id', params.tenant_id);
      }
      if (params.search) {
        url.searchParams.append('search', params.search);
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getVirtualKeys offline, fallback to mock');
      return null;
    }
  },

  async createVirtualKey(data) {
    const res = await fetch(`${API_BASE_URL}/virtual-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '가상 API Key 발급 실패');
    }
    return await res.json();
  },

  async revokeVirtualKey(keyId, reason = '관리자에 의한 즉시 파기') {
    const res = await fetch(`${API_BASE_URL}/virtual-keys/${keyId}/revoke`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '가상키 정보 변경 실패');
    }
    return await res.json();
  },

  async deleteVirtualKey(keyId) {
    const res = await fetch(`${API_BASE_URL}/virtual-keys/${keyId}`, {
      method: 'DELETE'
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
    try {
      const res = await fetch(`${API_BASE_URL}/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getModels offline, fallback to mock');
      return null;
    }
  },

  async createModel(data) {
    const res = await fetch(`${API_BASE_URL}/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '모델 등록 실패');
    }
    return await res.json();
  },

  async deleteModel(modelId, force = true) {
    const res = await fetch(`${API_BASE_URL}/models/${encodeURIComponent(modelId)}?force=${force}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '모델 삭제 실패');
    }
    return await res.json();
  },

  async checkAllModelsHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/models/health-check`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API checkAllModelsHealth offline:', err);
      return null;
    }
  },

  async checkModelHealth(modelId) {
    const res = await fetch(`${API_BASE_URL}/models/${encodeURIComponent(modelId)}/health`, {
      method: 'POST'
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
      const res = await fetch(`${API_BASE_URL}/routing/agent-router/status`);
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
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API_BASE_URL}/routing/agent-router/policies`);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policies })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '정책 업데이트 실패');
    }
    return await res.json();
  },


  async getActiveRoutingPolicy(routeName = null) {
    try {
      const url = routeName ? `${API_BASE_URL}/routing?route_name=${encodeURIComponent(routeName)}` : `${API_BASE_URL}/routing`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getActiveRoutingPolicy offline, fallback to mock');
      return null;
    }
  },

  async getRoutes() {
    try {
      const res = await fetch(`${API_BASE_URL}/routing/routes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getRoutes offline, fallback to local routes');
      return [];
    }
  },

  async getRoute(routeName) {
    const res = await fetch(`${API_BASE_URL}/routing/routes/${encodeURIComponent(routeName)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async createRoute(data) {
    const res = await fetch(`${API_BASE_URL}/routing/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      method: 'DELETE'
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '라우트 테스트 요청 실패');
    }
    return await res.json();
  },

  async executeChatCompletion({ model, messages, temperature = 0.7, max_tokens = 512, apiKey = 'sk-orch-system-diagnostics-appliance-key' }) {
    // Gateway endpoint: fallback to relative /v1/chat/completions or localhost:8000
    const gatewayUrl = window.location.port === '5173'
      ? '/v1/chat/completions'
      : `${(API_BASE_URL.replace(/\/api\/v1\/?$/, '') || 'http://localhost:8000')}/v1/chat/completions`;
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
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
      headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API_BASE_URL}/routing/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return [];
    }
  },

  // --- Observability & Telemetry (Phase 3) ---
  getObservabilityWsUrl() {
    const isHttps = window.location.protocol === 'https:';
    const host = window.location.hostname || 'localhost';
    return `${isHttps ? 'wss' : 'ws'}://${host}:8000/api/v1/observability/ws`;
  },

  async getMetricsSummary() {
    try {
      const res = await fetch(`${API_BASE_URL}/observability/metrics/summary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getMetricsSummary offline, fallback to mock');
      return null;
    }
  },

  // --- FinOps & Billing (Phase 3) ---
  async getFinOpsOverview() {
    try {
      const res = await fetch(`${API_BASE_URL}/finops/overview`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getFinOpsOverview offline, fallback to mock');
      return null;
    }
  },

  async exportFinOpsInvoiceCsv(month = null) {
    const url = new URL(`${API_BASE_URL}/finops/invoices/export`);
    if (month) url.searchParams.append('month', month);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `aiorche_invoice_${month || new Date().toISOString().slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);
    return true;
  },

  // --- Compliance & PII Governance (Phase 4) ---
  async getPiiRules(activeOnly = false) {
    try {
      const url = new URL(`${API_BASE_URL}/compliance/rules`);
      if (activeOnly) url.searchParams.append('active_only', 'true');
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getPiiRules offline, fallback to mock:', err);
      return null;
    }
  },

  async createPiiRule(ruleData) {
    const res = await fetch(`${API_BASE_URL}/compliance/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, requester_id, key_id, model_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'PII simulation failed' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async getAuditLogs(params = {}) {
    try {
      const url = new URL(`${API_BASE_URL}/compliance/audit-logs`);
      if (params.requester_id) url.searchParams.append('requester_id', params.requester_id);
      if (params.key_id) url.searchParams.append('key_id', params.key_id);
      if (params.action_taken) url.searchParams.append('action_taken', params.action_taken);
      if (params.is_blocked !== undefined && params.is_blocked !== null) {
        url.searchParams.append('is_blocked', params.is_blocked);
      }
      if (params.limit) url.searchParams.append('limit', params.limit);
      if (params.offset) url.searchParams.append('offset', params.offset);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getAuditLogs offline, fallback to mock:', err);
      return null;
    }
  },

  async getComplianceStats() {
    try {
      const res = await fetch(`${API_BASE_URL}/compliance/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getComplianceStats offline, fallback to mock:', err);
      return null;
    }
  },

  // --- Lifecycle & Patch Management (Phase 5) ---
  async getLifecycleComponents() {
    try {
      const res = await fetch(`${API_BASE_URL}/lifecycle/components`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getLifecycleComponents offline, fallback to mock:', err);
      return null;
    }
  },

  async verifyPatchBundle(patchData) {
    const res = await fetch(`${API_BASE_URL}/lifecycle/patches/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '서명 검증 실패' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async runPatchDryRun(patchData) {
    const res = await fetch(`${API_BASE_URL}/lifecycle/patches/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '드라이런 검증 실패' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async applyPatch(patchData) {
    const res = await fetch(`${API_BASE_URL}/lifecycle/patches/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '패치 배포 실패' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async rollbackPatch(rollbackData) {
    const res = await fetch(`${API_BASE_URL}/lifecycle/patches/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rollbackData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '롤백 실패' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  async getPatchHistory(limit = 20) {
    try {
      const res = await fetch(`${API_BASE_URL}/lifecycle/patches/history?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getPatchHistory offline:', err);
      return [];
    }
  },

  async runLifecyclePreflight() {
    const res = await fetch(`${API_BASE_URL}/lifecycle/preflight`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async generateSupportBundle(bundleReq = {}) {
    const res = await fetch(`${API_BASE_URL}/lifecycle/support-bundle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  }
};

export const api = apiClient;
export default apiClient;

