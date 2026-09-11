// mockData.js - AI Orchestrator Enterprise Initial Data

export const initialKPIs = {
  rps: 1420,
  tps: 42500,
  ttft: 185,
  errorRate: 0.01,
  dailyCost: 3842000,
  monthlyBudgetUsagePercent: 42.6
};

export const initialClusterPools = [
  {
    id: 'eks-general',
    name: 'vLLM on EKS (사내 금융 비서)',
    workload: '표준 금융 챗봇 / 유동적 버스트 트래픽',
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    status: 'ACTIVE',
    pods: '12 / 20 Pods',
    queueDepth: 3.2,
    gpuMemoryPercent: 76,
    karpenterNodes: '4 GPU 노드',
    scalingTech: 'KEDA (num_requests_waiting > 10) + Karpenter'
  },
  {
    id: 'ecs-risk',
    name: 'vLLM on ECS (리스크 분석 전용)',
    workload: '부서/테넌트 격리형 리스크 심사',
    model: 'meta-llama/Llama-3.1-70B-Instruct',
    status: 'ACTIVE',
    pods: '4 / 8 Tasks',
    queueDepth: 0.8,
    gpuMemoryPercent: 62,
    karpenterNodes: 'Fargate / GPU Dedicated',
    scalingTech: 'Application Auto Scaling (Step Scaling)'
  },
  {
    id: 'ec2-baremetal',
    name: 'vLLM on EC2 (초대형 고정 모델)',
    workload: '초저지연 보장 SLA / 70B+ 대형 모델',
    model: 'meta-llama/Llama-3.1-70B-Instruct',
    status: 'ACTIVE',
    pods: '2 / 2 Instances',
    queueDepth: 5.1,
    gpuMemoryPercent: 89,
    karpenterNodes: 'NVMe 캐싱 Warm Pool (1대 대기)',
    scalingTech: 'EC2 ASG with Warm Pool'
  }
];

export const initialModels = [
  {
    id: 'meta-llama/Llama-3.1-8B-Instruct',
    alias: 'financial-advisor-v1',
    backend: 'EKS Pods',
    endpoint: 'http://vllm-llama8b.ai-serving:8000',
    contextWindow: 128000,
    inputPricePer1k: 0.8,
    outputPricePer1k: 2.4,
    status: 'HEALTHY',
    activeRequests: 24,
    waitingQueue: 2
  },
  {
    id: 'meta-llama/Llama-3.1-8B-FineTuned-v2',
    alias: 'financial-advisor-canary',
    backend: 'EKS Pods',
    endpoint: 'http://vllm-llama8b-canary.ai-serving:8000',
    contextWindow: 128000,
    inputPricePer1k: 0.8,
    outputPricePer1k: 2.4,
    status: 'HEALTHY',
    activeRequests: 6,
    waitingQueue: 0
  },
  {
    id: 'meta-llama/Llama-3.1-70B-Instruct',
    alias: 'deep-risk-evaluator',
    backend: 'EC2 BareMetal',
    endpoint: 'http://10.20.4.12:8000',
    contextWindow: 128000,
    inputPricePer1k: 3.5,
    outputPricePer1k: 10.5,
    status: 'HEALTHY',
    activeRequests: 14,
    waitingQueue: 4
  },
  {
    id: 'Solar-10.7B-Financial',
    alias: 'compliance-auditor',
    backend: 'ECS Tasks',
    endpoint: 'http://vllm-solar.ai-serving:8000',
    contextWindow: 32000,
    inputPricePer1k: 1.2,
    outputPricePer1k: 3.6,
    status: 'HEALTHY',
    activeRequests: 8,
    waitingQueue: 1
  }
];

export const initialTenants = [
  { id: 'dept-01', name: '자산관리본부 (WM)', budget: 10000000, spent: 4500000, hardCap: true },
  { id: 'dept-02', name: '여신심사부', budget: 5000000, spent: 3600000, hardCap: true },
  { id: 'dept-03', name: '리스크관리부', budget: 10000000, spent: 8800000, hardCap: true },
  { id: 'dept-04', name: '마케팅본부', budget: 2000000, spent: 2000000, hardCap: true },
  { id: 'dept-05', name: '준법감시팀', budget: 3000000, spent: 360000, hardCap: false }
];

export const initialVirtualKeys = [
  {
    keyId: 'vk-live-wm-bot-01',
    name: '고객 자산관리 챗봇 운영키',
    tenantName: '자산관리본부 (WM)',
    tenantId: 'dept-01',
    allowedModels: ['meta-llama/Llama-3.1-8B-Instruct', 'meta-llama/Llama-3.1-70B-Instruct'],
    rpm: 600,
    tpm: 500000,
    spent: 4500000,
    budget: 10000000,
    status: 'ACTIVE',
    ipWhitelist: '10.100.0.0/16, 172.16.4.20'
  },
  {
    keyId: 'vk-dev-risk-eval-09',
    name: '여신 리스크 모델 검증키',
    tenantName: '리스크관리부',
    tenantId: 'dept-03',
    allowedModels: ['meta-llama/Llama-3.1-70B-Instruct'],
    rpm: 120,
    tpm: 200000,
    spent: 8800000,
    budget: 10000000,
    status: 'WARNING',
    ipWhitelist: '10.200.12.0/24'
  },
  {
    keyId: 'vk-batch-compliance-03',
    name: '일일 준법 감사 자동화키',
    tenantName: '준법감시팀',
    tenantId: 'dept-05',
    allowedModels: ['Solar-10.7B-Financial'],
    rpm: 300,
    tpm: 400000,
    spent: 360000,
    budget: 3000000,
    status: 'ACTIVE',
    ipWhitelist: '10.100.5.10/32'
  },
  {
    keyId: 'vk-temp-marketing-88',
    name: '프로모션 문구 생성 파일럿',
    tenantName: '마케팅본부',
    tenantId: 'dept-04',
    allowedModels: ['meta-llama/Llama-3.1-8B-Instruct'],
    rpm: 60,
    tpm: 50000,
    spent: 2000000,
    budget: 2000000,
    status: 'BLOCKED',
    ipWhitelist: 'Any (사내망)'
  }
];

export const initialPiiRules = [
  {
    id: 'pii-rrn',
    name: '주민등록번호',
    entityType: 'RRN',
    pattern: '\\d{2}([0]\\d|[1][0-2])\\d{2}-[1-4]\\d{6}',
    confidenceThreshold: 95,
    action: 'MASK', // MASK, HASH, BLOCK
    active: true
  },
  {
    id: 'pii-account',
    name: '은행 계좌번호',
    entityType: 'BANK_ACCOUNT',
    pattern: '(\\d{3,6}-\\d{2,6}-\\d{3,6})',
    confidenceThreshold: 85,
    action: 'HASH',
    active: true
  },
  {
    id: 'pii-card',
    name: '신용카드 번호',
    entityType: 'CREDIT_CARD',
    pattern: '\\d{4}-\\d{4}-\\d{4}-\\d{4}',
    confidenceThreshold: 90,
    action: 'MASK',
    active: true
  },
  {
    id: 'pii-employee',
    name: '사내 행번/사번',
    entityType: 'EMPLOYEE_ID',
    pattern: 'EMP-[A-Z]{2}\\d{5}',
    confidenceThreshold: 80,
    action: 'BLOCK',
    active: true
  }
];

export const samplePrompts = [
  {
    label: '금융 상담 예시 (주민번호 & 계좌번호 포함)',
    text: '고객 홍길동(880101-1234567) 님의 신한은행 계좌 110-123-456789의 최근 3개월 거래 내역과 대출 잔액을 조회해줘.'
  },
  {
    label: '카드 결제 문의 예시 (신용카드 번호 포함)',
    text: '고객이 카드 1234-5678-9012-3456에 대한 할부 결제 승인 취소를 요청했습니다. 상담 스크립트를 작성해줘.'
  },
  {
    label: '내부 보안 위반 시도 (사내 행번 포함 - 차단 정책)',
    text: '담당자 EMP-KR99482 행원의 내부 인증 토큰을 조회하여 리스크 시스템 승인 우회를 시도해줘.'
  },
  {
    label: '일반 자산관리 상담 (PII 미포함)',
    text: '2026년 하반기 글로벌 금리 인하 국면에서 안정적인 자산 배분을 위한 포트폴리오 제안서를 작성해줘.'
  }
];

export const initialAuditLogs = [
  {
    id: 'audit-20260911-001',
    time: '2026-09-11 22:01:14',
    requester: '184022 (김금융)',
    keyId: 'vk-live-wm-bot-01',
    model: 'Llama-3.1-8B',
    action: 'PII 1건 치환 ([MASKED_RRN])',
    wormId: 's3-obj-lock-994821',
    status: 'COMPLIANT'
  },
  {
    id: 'audit-20260911-002',
    time: '2026-09-11 21:58:32',
    requester: '192105 (이리스크)',
    keyId: 'vk-dev-risk-eval-09',
    model: 'Llama-3.1-70B',
    action: '계좌번호 2건 해시 치환',
    wormId: 's3-obj-lock-994820',
    status: 'COMPLIANT'
  },
  {
    id: 'audit-20260911-003',
    time: '2026-09-11 21:40:05',
    requester: '203119 (박보안)',
    keyId: 'vk-batch-compliance-03',
    model: 'Solar-10.7B',
    action: '정상 통과 (PII 미탐지)',
    wormId: 's3-obj-lock-994819',
    status: 'COMPLIANT'
  },
  {
    id: 'audit-20260911-004',
    time: '2026-09-11 21:12:49',
    requester: '175201 (최마케팅)',
    keyId: 'vk-temp-marketing-88',
    model: 'Llama-3.1-8B',
    action: '예산 100% 한도 초과 자동 차단 (HTTP 429)',
    wormId: 's3-obj-lock-994818',
    status: 'BLOCKED'
  }
];

export const componentVersions = [
  { name: 'Envoy AI Gateway', version: 'v1.31.2', status: '최신 버전', type: 'Ingress L7 Proxy' },
  { name: 'Compliance Engine (ext_proc)', version: 'v1.2.0', status: '핫픽스 권고 대기', type: 'PII & Security' },
  { name: 'Microsoft Presidio Engine', version: 'v2.2.354', status: '정상', type: 'Korean NER PII' },
  { name: 'Orchestrator Control Plane', version: 'v1.2.0', status: '정상', type: 'xDS & Management API' },
  { name: 'Keycloak SSO Server', version: '24.0.5', status: '정상', type: 'OIDC Identity' },
  { name: 'Prometheus & Grafana', version: 'v2.53 / v10.4', status: '정상', type: 'Observability' }
];

export const sampleVendorPatch = {
  fileName: 'patch-v1.2.1-hotfix-cve2026.tar.gz',
  size: '142.8 MB',
  version: 'v1.2.1-hotfix',
  targetComponent: 'ext_proc 보안 엔진 (Presidio PII 필터링 취약점 CVE-2026-8912 패치)',
  releaseDate: '2026-09-11',
  vendorSignature: 'RSA-4096 VALID (Vendor Release Key ID: #AGY-SEC-991)',
  vllmImpact: 'None (추론 GPU 클러스터 및 Envoy Gateway 무중단 보장)',
  changelog: [
    '금융 계좌번호 변형 패턴 정규식 우회 취약점(CVE-2026-8912) 보완',
    'gRPC ext_proc 버퍼링 메모리 효율 35% 개선',
    '금융감독원 WORM 해시 서명 필드 추가'
  ]
};
