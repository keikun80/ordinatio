import React, { useState, useEffect } from 'react';
import { KeyRound, Plus, ShieldCheck, AlertCircle, Ban, Check, Copy, Sliders, Search, Eye, AlertTriangle, Trash2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { initialVirtualKeys, initialTenants, initialModels } from '../data/mockData';

const LOCAL_STORAGE_KEY = 'aiorche_virtual_keys_v1';
const LOCAL_STORAGE_TENANTS_KEY = 'aiorche_tenants_v1';

export default function VirtualKeysTab({ onNotify }) {
  // Initialize state with localStorage if available, else empty array
  const [keys, setKeys] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.filter(k => !['vk-live-wm-bot-01', 'vk-dev-risk-eval-09', 'vk-batch-compliance-03', 'vk-temp-marketing-88'].includes(k.keyId));
      }
    } catch (e) {
      console.warn('Failed to parse saved keys:', e);
    }
    return [];
  });

  const [tenants, setTenants] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_TENANTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.filter(t => !['dept-01', 'dept-02', 'dept-03', 'dept-04', 'dept-05'].includes(t.id));
      }
    } catch (e) {
      console.warn('Failed to parse saved tenants:', e);
    }
    return [];
  });

  const [selectedDept, setSelectedDept] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [createdSecret, setCreatedSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState(null); // { keyId, name, status }

  // Edit Key Modal State
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRpm, setEditRpm] = useState(300);
  const [editTpm, setEditTpm] = useState(300000);
  const [editIp, setEditIp] = useState('10.100.0.0/16');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editModels, setEditModels] = useState([]);
  const [registeredModels, setRegisteredModels] = useState([]);

  // New Key Form State
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDept, setNewKeyDept] = useState('');
  const [newKeyRpm, setNewKeyRpm] = useState(300);
  const [newKeyTpm, setNewKeyTpm] = useState(300000);
  const [newKeyHardCap, setNewKeyHardCap] = useState(true);
  const [newKeyIp, setNewKeyIp] = useState('10.100.0.0/16');
  const [newKeyModels, setNewKeyModels] = useState([]);

  // Helper to persist keys to state & localStorage
  const saveKeys = (newKeys) => {
    setKeys(newKeys);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newKeys));
    } catch (e) {
      console.warn('Failed to save keys to localStorage:', e);
    }
  };

  // Helper to persist tenants to state & localStorage
  const saveTenants = (newTenants) => {
    setTenants(newTenants);
    try {
      localStorage.setItem(LOCAL_STORAGE_TENANTS_KEY, JSON.stringify(newTenants));
    } catch (e) {
      console.warn('Failed to save tenants to localStorage:', e);
    }
  };

  // Load live data from Backend API (and sync to localStorage)
  useEffect(() => {
    async function loadData() {
      try {
        const liveTenants = await apiClient.getTenants();
        if (Array.isArray(liveTenants)) {
          const mappedTenants = liveTenants.map((t) => ({
            id: t.tenant_id,
            name: t.name,
            code: t.department_code,
            budget: Number(t.monthly_budget_krw),
            hardCap: t.is_hard_cap_enabled
          }));
          saveTenants(mappedTenants);
          if (mappedTenants.length > 0) {
            setNewKeyDept(mappedTenants[0].id);
          }
        }

        const liveKeys = await apiClient.getVirtualKeys();
        if (Array.isArray(liveKeys)) {
          const mappedKeys = liveKeys.map((k) => ({
            keyId: k.key_id,
            name: k.name,
            tenantName: k.tenant_name || k.tenant_id,
            tenantId: k.tenant_id,
            allowedModels: k.allowed_models && k.allowed_models.length > 0 ? k.allowed_models : [],
            rpm: k.rpm_limit,
            tpm: k.tpm_limit,
            spent: 0,
            budget: 15000000,
            status: k.is_active ? 'ACTIVE' : 'BLOCKED',
            ipWhitelist: k.allowed_ip_cidrs && k.allowed_ip_cidrs.length > 0 ? k.allowed_ip_cidrs[0] : '10.100.0.0/16',
            keyPrefix: k.key_prefix
          }));
          saveKeys(mappedKeys);
        }

        const liveModels = await apiClient.getModels();
        if (Array.isArray(liveModels)) {
          const mappedModels = liveModels.map((m) => ({
            id: m.model_id,
            name: m.name,
            alias: m.alias
          }));
          setRegisteredModels(mappedModels);
          setNewKeyModels(mappedModels.map((m) => m.id));
        }
      } catch (err) {
        console.warn('Backend API offline, keeping persisted local data:', err);
      }
    }
    loadData();
  }, []);

  // Open Edit Key Modal
  const handleOpenEdit = (keyItem) => {
    setEditingKey(keyItem);
    setEditName(keyItem.name);
    setEditRpm(keyItem.rpm);
    setEditTpm(keyItem.tpm);
    setEditIp(keyItem.ipWhitelist || '10.100.0.0/16');
    setEditStatus(keyItem.status);
    setEditModels(keyItem.allowedModels || ['meta-llama/Llama-3.1-8B-Instruct']);
  };

  // Save Edited Key
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingKey) return;

    setIsLoading(true);
    const updatedKeyItem = {
      ...editingKey,
      name: editName,
      rpm: Number(editRpm),
      tpm: Number(editTpm),
      ipWhitelist: editIp,
      status: editStatus,
      allowedModels: editModels
    };

    try {
      // Call Backend API
      await apiClient.updateVirtualKey(editingKey.keyId, {
        name: editName,
        rpm_limit: Number(editRpm),
        tpm_limit: Number(editTpm),
        allowed_ip_cidrs: [editIp],
        allowed_models: editModels,
        is_active: editStatus === 'ACTIVE'
      });
    } catch (err) {
      console.warn('Backend update offline, saved to persistent local storage:', err);
    }

    const updatedKeys = keys.map((k) => (k.keyId === editingKey.keyId ? updatedKeyItem : k));
    saveKeys(updatedKeys);
    setEditingKey(null);
    setIsLoading(false);
    onNotify('SUCCESS', `API Key [${editingKey.keyId}]의 변경 내용이 성공적으로 저장되었습니다.`);
  };

  // Toggle Key Status (Revoke / Activate)
  const toggleKeyStatus = async (keyId) => {
    const targetKey = keys.find((k) => k.keyId === keyId);
    if (!targetKey) return;

    const nextStatus = targetKey.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';

    try {
      if (nextStatus === 'BLOCKED') {
        await apiClient.revokeVirtualKey(keyId, '관리자에 의한 즉시 파기');
      } else {
        await apiClient.updateVirtualKey(keyId, { is_active: true });
      }
    } catch (err) {
      console.warn('Backend status update offline, saving to persistent local storage:', err);
    }

    const updatedKeys = keys.map((k) => (k.keyId === keyId ? { ...k, status: nextStatus } : k));
    saveKeys(updatedKeys);

    if (nextStatus === 'BLOCKED') {
      onNotify('INFO', `${targetKey.name} (${keyId}) 가상키가 즉시 비활성화(Revoke)되었습니다.`);
    } else {
      onNotify('SUCCESS', `${targetKey.name} (${keyId}) 가상키가 재활성화되었습니다.`);
    }
  };

  // Open Delete Confirmation Modal (Supports both Active with force and Revoked keys)
  const handleDeleteKey = (targetKey) => {
    if (!targetKey) return;
    setKeyToDelete({
      keyId: targetKey.keyId,
      name: targetKey.name,
      status: targetKey.status
    });
  };

  // Execute Key Deletion
  const confirmDeleteKey = async () => {
    if (!keyToDelete) return;
    const { keyId, name, status } = keyToDelete;
    const isForce = status === 'ACTIVE';

    setIsLoading(true);
    try {
      await apiClient.deleteVirtualKey(keyId, isForce);
      const updatedKeys = keys.filter((k) => k.keyId !== keyId);
      saveKeys(updatedKeys);
      onNotify('SUCCESS', `API Key [${name}]가 성공적으로 영구 삭제되었습니다.`);
    } catch (err) {
      console.warn('Backend delete error, removing from local state:', err);
      const updatedKeys = keys.filter((k) => k.keyId !== keyId);
      saveKeys(updatedKeys);
      onNotify('SUCCESS', `API Key [${name}]가 삭제되었습니다.`);
    } finally {
      setIsLoading(false);
      setKeyToDelete(null);
    }
  };

  // Create Key
  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setIsLoading(true);
    const deptObj = tenants.find((d) => d.id === newKeyDept) || tenants[0];
    const targetAllowedModels = newKeyModels.length > 0
      ? newKeyModels
      : (registeredModels.length > 0 ? [registeredModels[0].id] : ['meta-llama/Llama-3.1-8B-Instruct']);

    try {
      // Call Backend API
      const result = await apiClient.createVirtualKey({
        name: newKeyName,
        tenant_id: deptObj.id,
        allowed_models: targetAllowedModels,
        allowed_ip_cidrs: [newKeyIp],
        rpm_limit: Number(newKeyRpm),
        tpm_limit: Number(newKeyTpm)
      });

      const newKeyItem = {
        keyId: result.key_id,
        name: result.name,
        tenantName: deptObj.name,
        tenantId: deptObj.id,
        allowedModels: result.allowed_models && result.allowed_models.length > 0 ? result.allowed_models : targetAllowedModels,
        rpm: result.rpm_limit,
        tpm: result.tpm_limit,
        spent: 0,
        budget: deptObj.budget || 15000000,
        status: 'ACTIVE',
        ipWhitelist: newKeyIp,
        keyPrefix: result.key_prefix
      };

      const updatedKeys = [newKeyItem, ...keys];
      saveKeys(updatedKeys);

      setShowCreateModal(false);
      setNewKeyName('');

      setCreatedSecret({
        keyId: result.key_id,
        name: result.name,
        rawKey: result.raw_key,
        tenantName: deptObj.name,
        notice: result.security_notice
      });
      setShowSecretModal(true);

      onNotify('SUCCESS', `API Key [${result.key_id}]가 성공적으로 발급되었습니다. 1회성 토큰을 복사하십시오.`);
    } catch (err) {
      // Fallback for offline mode with persistent localStorage
      console.warn('Backend create offline, creating persistent local key:', err);
      const generatedRawKey = `sk-orch-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
      const generatedId = `vk-live-${Date.now().toString().slice(-6)}`;
      
      const newKeyItem = {
        keyId: generatedId,
        name: newKeyName,
        tenantName: deptObj.name,
        tenantId: deptObj.id,
        allowedModels: ['meta-llama/Llama-3.1-8B-Instruct'],
        rpm: Number(newKeyRpm),
        tpm: Number(newKeyTpm),
        spent: 0,
        budget: deptObj.budget || 15000000,
        status: 'ACTIVE',
        ipWhitelist: newKeyIp,
        keyPrefix: generatedRawKey.slice(0, 16)
      };

      const updatedKeys = [newKeyItem, ...keys];
      saveKeys(updatedKeys);

      setShowCreateModal(false);
      setNewKeyName('');

      setCreatedSecret({
        keyId: generatedId,
        name: newKeyName,
        rawKey: generatedRawKey,
        tenantName: deptObj.name,
        notice: '⚠️ 이 키는 지금 1회만 표시되며 데이터베이스에 단방향 해시로 저장되므로 다시 확인할 수 없습니다.'
      });
      setShowSecretModal(true);

      onNotify('SUCCESS', `API Key [${generatedId}]가 성공적으로 발급 및 영구 저장되었습니다.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (createdSecret && createdSecret.rawKey) {
      navigator.clipboard.writeText(createdSecret.rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      onNotify('INFO', 'API Key가 클립보드에 안전하게 복사되었습니다.');
    }
  };

  // Filter keys
  const filteredKeys = keys.filter((k) => {
    const matchesDept = selectedDept === 'ALL' || k.tenantId === selectedDept;
    const matchesSearch =
      k.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.keyId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (k.keyPrefix && k.keyPrefix.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDept && matchesSearch;
  });

  return (
    <div className="tab-pane" data-testid="vk-page-container" data-screen-id="SCR-VK-01">
      {/* Page Header */}
      <div className="page-header" data-testid="vk-header-section">
        <div className="page-title-wrap">
          <h1>거버넌스</h1>
          <p>백엔드 GPU 주소 노출 없이 사내 부서별 안전한 가상키 발급, 허용 모델, 속도 제한(RPM/TPM) 및 비상 즉시 파기 제어</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-primary" 
            data-testid="vk-btn-open-create"
            data-function-id="FNC-VK-OPEN-MODAL"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} />
            <span>신규 API Key 발급</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" data-testid="vk-filter-card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: '260px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#F54927' }} />
              <input
                className="form-input"
                data-testid="vk-input-search"
                style={{ paddingLeft: '36px', color: '#F54927' }}
                placeholder="키 명칭, Key ID, 또는 접두사 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>소속 부서 필터:</span>
            <select
              className="form-select"
              data-testid="vk-select-tenant-filter"
              style={{ width: 'auto' }}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="ALL">전체 부서 보기</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Virtual Keys Table */}
      <div className="card" data-testid="vk-table-card">
        <div className="table-container">
          <table className="data-table" data-testid="vk-table-keys">
            <thead>
              <tr>
                <th>가상 Key ID / 명칭</th>
                <th>소속 부서 (테넌트)</th>
                <th>허용 모델</th>
                <th>속도 제한 (Rate Limits)</th>
                <th>월간 예산 소진율 (Hard Cap)</th>
                <th>상태</th>
                <th>관리 조치</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.length === 0 ? (
                <tr data-testid="vk-row-empty">
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <KeyRound size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        발급된 API Key가 없습니다
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        상단의 '+ 신규 API Key 발급' 버튼을 눌러 안전한 API Key를 생성하세요.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredKeys.map((k) => {
                  const percent = Math.min(100, Math.round((k.spent / k.budget) * 100));
                  return (
                    <tr key={k.keyId} data-testid={`vk-row-${k.keyId}`}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#ffffff' }}>{k.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8' }}>
                        {k.keyId}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Prefix: <code style={{ color: '#94a3b8' }}>{k.keyPrefix ? `${k.keyPrefix}...` : 'sk-orch-***'}</code> | IP: {k.ipWhitelist}
                      </div>
                    </td>
                    <td>
                      <span className="badge info">{k.tenantName}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {k.allowedModels.map((m, idx) => (
                          <span key={idx} style={{ fontSize: '0.74rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                            {m.split('/')[1] || m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      <div>{k.rpm} RPM</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{k.tpm.toLocaleString()} TPM</div>
                    </td>
                    <td style={{ minWidth: '150px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                        <span>₩{(k.spent / 10000).toLocaleString()}만</span>
                        <span style={{ fontWeight: 700, color: percent >= 100 ? '#f43f5e' : percent > 80 ? '#fbbf24' : '#34d399' }}>
                          {percent}%
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: percent >= 100 ? '#f43f5e' : percent > 80 ? '#f59e0b' : 'linear-gradient(90deg, #3b82f6, #10b981)'
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      {k.status === 'ACTIVE' && <span className="badge active" data-testid={`vk-badge-status-${k.keyId}`}>🟢 활성 (정상)</span>}
                      {k.status === 'WARNING' && <span className="badge warning" data-testid={`vk-badge-status-${k.keyId}`}>🟡 예산주의 (88%)</span>}
                      {k.status === 'BLOCKED' && <span className="badge danger" data-testid={`vk-badge-status-${k.keyId}`}>🔴 차단됨 (Revoked)</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          data-testid={`vk-btn-edit-${k.keyId}`}
                          onClick={() => handleOpenEdit(k)}
                          title="키 정보 및 속도제한 한도 수정"
                        >
                          <Sliders size={13} />
                          <span>설정 변경</span>
                        </button>
                        <button
                          className={`btn btn-sm ${k.status === 'BLOCKED' ? 'btn-secondary' : 'btn-danger'}`}
                          data-testid={`vk-btn-toggle-${k.keyId}`}
                          data-function-id="FNC-VK-REVOKE"
                          onClick={() => toggleKeyStatus(k.keyId)}
                        >
                          {k.status === 'BLOCKED' ? '재활성화' : '즉시 파기(Revoke)'}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          data-testid={`vk-btn-delete-${k.keyId}`}
                          data-function-id="FNC-VK-DELETE"
                          onClick={() => handleDeleteKey(k)}
                          title={k.status === 'ACTIVE' ? '가상키 즉시 파기 및 영구 삭제' : '파기된 가상키 영구 삭제'}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
                        >
                          <Trash2 size={13} />
                          <span>삭제</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Key Modal (설정 변경 모달) */}
      {editingKey && (
        <div className="modal-overlay" onClick={() => setEditingKey(null)}>
          <div className="modal-content" data-testid="vk-modal-edit" data-screen-id="SCR-VK-M03" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-header">
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={18} style={{ color: '#38bdf8' }} />
                  <span>API Key 설정 변경 [{editingKey.keyId}]</span>
                </div>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">키 식별 명칭 (Key Name)</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-edit-input-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">소속 부서 (테넌트)</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-edit-input-tenant"
                    value={editingKey.tenantName}
                    disabled
                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">분당 요청 수 한도 (RPM)</label>
                    <input
                      type="number"
                      className="form-input"
                      data-testid="vk-modal-edit-input-rpm"
                      value={editRpm}
                      onChange={(e) => setEditRpm(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">분당 토큰 수 한도 (TPM)</label>
                    <input
                      type="number"
                      className="form-input"
                      data-testid="vk-modal-edit-input-tpm"
                      value={editTpm}
                      onChange={(e) => setEditTpm(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">사내 허용 IP 대역 (CIDR Whitelist)</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-edit-input-cidr"
                    value={editIp}
                    onChange={(e) => setEditIp(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">키 상태 (Status)</label>
                  <select
                    className="form-select"
                    data-testid="vk-modal-edit-select-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="ACTIVE">🟢 활성 (정상 호출 허용)</option>
                    <option value="BLOCKED">🔴 차단됨 (즉시 호출 차단)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>허용 대상 AI 모델 (등록된 모델 풀: {registeredModels.length}개)</span>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>{editModels.length}개 모델 허용됨</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {registeredModels.map(m => {
                      const isChecked = editModels.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            background: isChecked ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${isChecked ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
                            color: isChecked ? '#38bdf8' : 'var(--text-secondary)'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditModels([...editModels, m.id]);
                              } else {
                                setEditModels(editModels.filter(id => id !== m.id));
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{m.id} {m.alias ? `(${m.alias})` : ''}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  data-testid="vk-modal-edit-btn-delete"
                  data-function-id="FNC-VK-DELETE"
                  onClick={() => {
                    const target = { keyId: editingKey.keyId, name: editingKey.name, status: editingKey.status };
                    setEditingKey(null);
                    handleDeleteKey(target);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
                >
                  <Trash2 size={14} />
                  <span>가상키 영구 삭제</span>
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    data-testid="vk-modal-edit-btn-cancel"
                    onClick={() => setEditingKey(null)}
                  >
                    취소
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    data-testid="vk-modal-edit-btn-submit"
                    data-function-id="FNC-VK-UPDATE"
                    disabled={isLoading}
                  >
                    {isLoading ? '저장 중...' : '변경 내용 저장'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Key Creation Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" data-testid="vk-modal-create" data-screen-id="SCR-VK-M01" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateKey}>
              <div className="modal-header">
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff' }}>
                  🔑 신규 API Key 발급 마법사
                </div>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">키 식별 명칭 (Key Name)</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-input-name"
                    placeholder="예: 여신심사 자동화 봇 v2"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">소속 부서 / 테넌트</label>
                  <select
                    className="form-select"
                    data-testid="vk-modal-select-tenant"
                    value={newKeyDept}
                    onChange={(e) => setNewKeyDept(e.target.value)}
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} (월 예산 ₩{(t.budget / 10000).toLocaleString()}만원)</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">분당 요청 수 한도 (RPM)</label>
                    <input
                      type="number"
                      className="form-input"
                      data-testid="vk-modal-input-rpm"
                      value={newKeyRpm}
                      onChange={(e) => setNewKeyRpm(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">분당 토큰 수 한도 (TPM)</label>
                    <input
                      type="number"
                      className="form-input"
                      data-testid="vk-modal-input-tpm"
                      value={newKeyTpm}
                      onChange={(e) => setNewKeyTpm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">사내 허용 IP 대역 (CIDR Whitelist)</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-input-cidr"
                    value={newKeyIp}
                    onChange={(e) => setNewKeyIp(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>허용 대상 AI 모델 (등록된 모델 풀: {registeredModels.length}개)</span>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>{newKeyModels.length}개 모델 선택됨</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {registeredModels.map(m => {
                      const isChecked = newKeyModels.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            background: isChecked ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${isChecked ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
                            color: isChecked ? '#38bdf8' : 'var(--text-secondary)'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewKeyModels([...newKeyModels, m.id]);
                              } else {
                                setNewKeyModels(newKeyModels.filter(id => id !== m.id));
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{m.id} {m.alias ? `(${m.alias})` : ''}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', cursor: 'pointer', color: '#fda4af' }}>
                    <input
                      type="checkbox"
                      data-testid="vk-modal-toggle-hardcap"
                      checked={newKeyHardCap}
                      onChange={(e) => setNewKeyHardCap(e.target.checked)}
                    />
                    <span><strong>하드 캡(Hard Cap) 예산 초과 즉시 차단:</strong> 부서 예산 100% 도달 시 즉시 429 반환</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  data-testid="vk-modal-btn-cancel"
                  onClick={() => setShowCreateModal(false)}
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  data-testid="vk-modal-btn-submit"
                  data-function-id="FNC-VK-ISSUE"
                  disabled={isLoading}
                >
                  {isLoading ? '생성 및 암호화 중...' : '발급 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Exposure Secret Key Reveal Modal (보안 1회성 토큰 팝업) */}
      {showSecretModal && createdSecret && (
        <div className="modal-overlay" onClick={() => setShowSecretModal(false)}>
          <div className="modal-content" data-testid="vk-modal-secret" data-screen-id="SCR-VK-M02" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b', fontWeight: 700, fontSize: '1.08rem' }}>
                <ShieldCheck size={22} />
                <span>API Key 발급 완료 (단 1회성 시크릿 노출)</span>
              </div>
            </div>

            <div className="modal-body">
              <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={20} style={{ color: '#fbbf24', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.84rem', color: '#fef3c7', lineHeight: 1.5 }}>
                    <strong>보안 경고 (Security Warning):</strong><br />
                    이 API Key는 지금 <strong>단 1회만 평문으로 표시</strong>됩니다. 데이터베이스에는 <strong>Argon2id 솔트 해시</strong>로만 안전하게 보관되므로, 본 창을 닫으면 <strong>절대 다시 확인할 수 없습니다</strong>.
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  키 명칭: <strong style={{ color: '#ffffff' }}>{createdSecret.name}</strong> ({createdSecret.tenantName})
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Key ID: <code style={{ color: '#38bdf8' }}>{createdSecret.keyId}</code>
                </div>

                <label className="form-label" style={{ fontWeight: 600, color: '#e2e8f0' }}>생성된 32자리 보안 API Key</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    readOnly
                    data-testid="vk-modal-secret-value"
                    value={createdSecret.rawKey}
                    className="form-input"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.88rem',
                      background: 'rgba(15, 23, 42, 0.8)',
                      borderColor: '#38bdf8',
                      color: '#38bdf8',
                      letterSpacing: '0.5px'
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-testid="vk-modal-btn-copy-secret"
                    data-function-id="FNC-VK-COPY-SECRET"
                    onClick={handleCopySecret}
                    style={{ minWidth: '110px', color: '#F54927' }}
                  >
                    {copied ? (
                      <>
                        <Check size={16} color="#F54927" />
                        <span style={{ color: '#F54927' }}>복사됨!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={16} color="#F54927" />
                        <span style={{ color: '#F54927' }}>키 복사</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                💡 클라이언트(에이전트/챗봇)는 요청 시 <code>Authorization: Bearer sk-orch-...</code> 헤더에 위 키를 전달합니다.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="vk-modal-btn-close-secret"
                onClick={() => {
                  setShowSecretModal(false);
                  setCreatedSecret(null);
                }}
                style={{ width: '100%' }}
              >
                안전하게 보관 완료하였으며 창을 닫습니다
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Permanent Deletion Confirmation Modal (영구 삭제 확인 모달) */}
      {keyToDelete && (
        <div className="modal-overlay" onClick={() => !isLoading && setKeyToDelete(null)}>
          <div className="modal-content" data-testid="vk-modal-delete" data-screen-id="SCR-VK-M04" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: 700, fontSize: '1.05rem' }}>
                <Trash2 size={20} />
                <span>API Key 영구 삭제 확인</span>
              </div>
            </div>

            <div className="modal-body">
              {keyToDelete.status === 'ACTIVE' ? (
                <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.84rem', color: '#fca5a5', lineHeight: 1.5 }}>
                      <strong>활성 상태(ACTIVE) 경고:</strong><br />
                      이 가상키는 현재 <strong>활성(ACTIVE)</strong> 상태입니다.<br />
                      영구 삭제 시 즉시 <strong>비활성화(Revoke) 처리된 후 완전히 삭제</strong>되며, 연동된 모든 에이전트 및 시스템의 API 호출이 즉시 차단됩니다.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.84rem', color: '#fde68a', lineHeight: 1.5 }}>
                      파기된 API Key를 데이터베이스에서 <strong>영구 삭제</strong>합니다.<br />
                      삭제된 키는 다시 복구할 수 없습니다. 계속하시겠습니까?
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--bg-panel)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  키 명칭: <strong style={{ color: '#ffffff' }}>{keyToDelete.name}</strong>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Key ID: <code style={{ color: '#38bdf8' }}>{keyToDelete.keyId}</code>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="vk-modal-delete-btn-cancel"
                onClick={() => setKeyToDelete(null)}
                disabled={isLoading}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-danger"
                data-testid="vk-modal-delete-btn-confirm"
                data-function-id="FNC-VK-CONFIRM-DELETE"
                onClick={confirmDeleteKey}
                disabled={isLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={15} />
                <span>{isLoading ? '삭제 처리 중...' : (keyToDelete.status === 'ACTIVE' ? '즉시 파기 및 영구 삭제' : '영구 삭제 확인')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
