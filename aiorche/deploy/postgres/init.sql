-- PostgreSQL Domain Schema Initialization for AI Orchestrator
-- Matches dashboard_engineering_plan.md Section 3

-- 1. 테넌트 (사내 부서 및 조직)
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    department_code VARCHAR(32) NOT NULL UNIQUE,
    monthly_budget_krw NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    spent_budget_krw NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    is_hard_cap_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 가상 API Key 테이블
CREATE TABLE IF NOT EXISTS virtual_keys (
    key_id VARCHAR(64) PRIMARY KEY,
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,
    tenant_id VARCHAR(64) REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
    name VARCHAR(128) NOT NULL,
    allowed_models JSONB NOT NULL DEFAULT '[]'::jsonb,
    allowed_ip_cidrs JSONB NOT NULL DEFAULT '[]'::jsonb,
    rpm_limit INT NOT NULL DEFAULT 120,
    tpm_limit INT NOT NULL DEFAULT 200000,
    spent_krw NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_tokens INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_tenant ON virtual_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_prefix ON virtual_keys(key_prefix);

-- 3. 서빙 모델 카탈로그
CREATE TABLE IF NOT EXISTS model_catalogs (
    model_id VARCHAR(128) PRIMARY KEY,
    alias VARCHAR(64) NOT NULL UNIQUE,
    backend_infra VARCHAR(32) NOT NULL DEFAULT 'On-Prem K8s',
    serving_engine VARCHAR(32) NOT NULL DEFAULT 'vLLM',
    execution_method VARCHAR(32) NOT NULL DEFAULT 'k8s',
    target_endpoint VARCHAR(255) NOT NULL,
    input_price_per_1k NUMERIC(10, 4) NOT NULL DEFAULT 0.8,
    output_price_per_1k NUMERIC(10, 4) NOT NULL DEFAULT 2.4,
    cache_discount_ratio NUMERIC(5, 4) NOT NULL DEFAULT 0.25,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. 동적 라우팅 정책 테이블 (멀티 라우팅 지원)
CREATE TABLE IF NOT EXISTS routing_policies (
    policy_id VARCHAR(64) PRIMARY KEY,
    route_name VARCHAR(128) NOT NULL UNIQUE,
    traffic_weights JSONB NOT NULL,
    load_balancing_strategy VARCHAR(32) NOT NULL DEFAULT 'LeastQueueDepth',
    failover_model_id VARCHAR(128) REFERENCES model_catalogs(model_id),
    xds_revision VARCHAR(64) NOT NULL,
    deployed_by VARCHAR(64) NOT NULL,
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    priority INT NOT NULL DEFAULT 10,
    match_conditions JSONB DEFAULT '{}'::jsonb,
    failover_chain JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT
);

-- 5. PII 보안 룰셋 테이블
CREATE TABLE IF NOT EXISTS pii_rules (
    rule_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    regex_pattern TEXT NOT NULL,
    confidence_threshold NUMERIC(3, 2) NOT NULL DEFAULT 0.85,
    action VARCHAR(32) NOT NULL DEFAULT 'MASK',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5-1. WORM 불변 감사 로그 테이블 (INSERT-only)
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    requester_id VARCHAR(64) NOT NULL,
    key_id VARCHAR(64),
    model_id VARCHAR(128),
    original_prompt_hash VARCHAR(128) NOT NULL,
    masked_payload_hash VARCHAR(128) NOT NULL,
    detections_json TEXT NOT NULL DEFAULT '[]',
    pii_count INT NOT NULL DEFAULT 0,
    action_taken VARCHAR(32) NOT NULL DEFAULT 'PASS',
    latency_ms NUMERIC(10, 3) NOT NULL DEFAULT 0,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    worm_reference_id VARCHAR(128)
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_requester ON audit_logs(requester_id);

-- 6. 핫픽스 및 패치 릴리즈 히스토리
CREATE TABLE IF NOT EXISTS patch_histories (
    patch_id VARCHAR(64) PRIMARY KEY,
    bundle_filename VARCHAR(255) NOT NULL,
    target_component VARCHAR(64) NOT NULL,
    installed_version VARCHAR(32) NOT NULL,
    previous_version VARCHAR(32) NOT NULL,
    rsa_signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_status VARCHAR(32) NOT NULL,
    applied_by VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. 긴급 패치 및 배포 이력 (Patch History)
CREATE TABLE IF NOT EXISTS patch_history (
    patch_id VARCHAR(64) PRIMARY KEY,
    package_name VARCHAR(255) NOT NULL,          -- 'patch-v1.2.1-hotfix.tar.gz'
    target_component VARCHAR(64) NOT NULL,       -- 'ext_proc', 'envoy', 'control_plane'
    previous_version VARCHAR(32) NOT NULL,
    applied_version VARCHAR(32) NOT NULL,
    signature_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'APPLIED', -- 'APPLIED', 'ROLLED_BACK', 'FAILED'
    applied_by VARCHAR(64) NOT NULL DEFAULT 'sysadmin-ops',
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_patch_history_applied_at ON patch_history (applied_at DESC);

-- 7. AgentRouter 4대 지능형 라우팅 정책 슬롯 (모델 매핑은 웹 UI에서 사용자가 직접 지정)
CREATE TABLE IF NOT EXISTS agent_router_policies (
    policy_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO agent_router_policies (policy_id, name, description, is_active, config)
VALUES
    ('QualityFirst', 'QualityFirst (품질 우선)', '복잡한 알고리즘, 코딩 및 심층 추론 질문 시 최고 성능 모델로 우선 분기하고 단순 질의는 경량 모델로 처리합니다.', TRUE, '{"reasoning_model": "", "fast_model": "", "enforce_reasoning_for_tools": true, "reasoning_cluster": "", "fast_cluster": ""}'::jsonb),
    ('LeastCost', 'LeastCost (비용 최적화)', '테넌트의 월간 예산 소진율이 임계치를 초과하면 강제로 경제형 모델로 다운티어링하여 클라우드/인프라 TCO를 방어합니다.', TRUE, '{"budget_threshold_pct": 80.0, "economic_model": "", "standard_model": "", "economic_cluster": "", "standard_cluster": ""}'::jsonb),
    ('LatencyOptimized', 'LatencyOptimized (지연시간 최적화)', '초저지연(TTFT) 보장을 위해 경량 모델을 최우선 분기하며, 명시적 심층 추론 요청 시에만 선택적 예외를 허용합니다.', TRUE, '{"target_latency_ms": 200, "primary_fast_model": "", "allow_reasoning_override": true, "reasoning_model": "", "fast_cluster": "", "reasoning_cluster": ""}'::jsonb),
    ('SelfHealingFallback', 'SelfHealingFallback (자가 치유 폴백)', '업스트림 GPU 서빙 노드의 5xx 오류 또는 헬스체크 타임아웃 발생 시 무중단으로 지정된 예비 모델로 자동 절체합니다.', TRUE, '{"primary_fallback_model": "", "secondary_fallback_model": "", "max_retries": 2, "timeout_seconds": 5, "fallback_cluster": ""}'::jsonb)
ON CONFLICT (policy_id) DO NOTHING;


