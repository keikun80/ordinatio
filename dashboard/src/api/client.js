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

  async getActiveRoutingPolicy() {
    try {
      const res = await fetch(`${API_BASE_URL}/routing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getActiveRoutingPolicy offline, fallback to mock');
      return null;
    }
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
  }
};

