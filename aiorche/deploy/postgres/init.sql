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
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
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
    backend_infra VARCHAR(32) NOT NULL,
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

-- 초기 시드 데이터 삽입
INSERT INTO tenants (tenant_id, name, department_code, monthly_budget_krw, is_hard_cap_enabled)
VALUES
    ('dept-01', '자산관리본부 (WM)', 'WM-100', 10000000.00, TRUE),
    ('dept-02', '여신심사부', 'LOAN-200', 5000000.00, TRUE),
    ('dept-03', '리스크관리부', 'RISK-300', 10000000.00, TRUE),
    ('dept-04', '마케팅본부', 'MKT-400', 2000000.00, TRUE),
    ('dept-05', '준법감시팀', 'COMP-500', 3000000.00, FALSE)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO model_catalogs (model_id, alias, backend_infra, target_endpoint, input_price_per_1k, output_price_per_1k)
VALUES
    ('meta-llama/Llama-3.1-8B-Instruct', 'financial-advisor-v1', 'EKS', 'http://vllm-llama8b.ai-serving:8000', 0.8000, 2.4000),
    ('meta-llama/Llama-3.1-8B-FineTuned-v2', 'financial-advisor-canary', 'EKS', 'http://vllm-llama8b-canary.ai-serving:8000', 0.8000, 2.4000),
    ('meta-llama/Llama-3.1-70B-Instruct', 'deep-risk-evaluator', 'EC2', 'http://10.20.4.12:8000', 3.5000, 10.5000),
    ('Solar-10.7B-Financial', 'compliance-auditor', 'ECS', 'http://vllm-solar.ai-serving:8000', 1.2000, 3.6000)
ON CONFLICT (model_id) DO NOTHING;

INSERT INTO pii_rules (rule_id, name, entity_type, regex_pattern, confidence_threshold, action)
VALUES
    ('pii-rrn', '주민등록번호', 'RRN', '\d{2}([0]\d|[1][0-2])\d{2}-[1-4]\d{6}', 0.95, 'MASK'),
    ('pii-account', '은행 계좌번호', 'BANK_ACCOUNT', '(\d{3,6}-\d{2,6}-\d{3,6})', 0.85, 'HASH'),
    ('pii-card', '신용카드 번호', 'CREDIT_CARD', '\d{4}-\d{4}-\d{4}-\d{4}', 0.90, 'MASK'),
    ('pii-employee', '사내 행번/사번', 'EMPLOYEE_ID', 'EMP-[A-Z]{2}\d{5}', 0.80, 'BLOCK')
ON CONFLICT (rule_id) DO NOTHING;

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

