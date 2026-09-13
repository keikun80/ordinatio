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

  async deleteModel(modelId, force = false) {
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

