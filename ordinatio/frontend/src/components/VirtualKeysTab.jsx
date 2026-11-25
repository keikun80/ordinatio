import React, { useState, useEffect } from 'react';
import { KeyRound, Plus, ShieldCheck, AlertCircle, Ban, Check, Copy, Sliders, Search, Eye, AlertTriangle, Trash2, Building } from 'lucide-react';
import { apiClient } from '../api/client';
import { strings } from '../constants/strings';
import { useAuth } from '../context/AuthContext';
import { copyToClipboard } from '../utils/clipboard';

export default function VirtualKeysTab({ onNotify, onNavigateTab, activeSubTab = 'keys', setActiveSubTab }) {
  const auth = useAuth?.() || {};
  const isSuperAdmin = auth.isSuperAdmin || auth.user?.role === 'SUPER_ADMIN';
  const hasPermission = auth.hasPermission || (() => true);
  const canWriteGovernance = isSuperAdmin || hasPermission('governance:write');

  const [currentSubTab, setCurrentSubTab] = useState(activeSubTab);

  useEffect(() => {
    if (activeSubTab) {
      setCurrentSubTab(activeSubTab);
    }
  }, [activeSubTab]);

  const handleSubTabChange = (tabId) => {
    setCurrentSubTab(tabId);
    if (setActiveSubTab) {
      setActiveSubTab(tabId);
    }
  };

  const [keys, setKeys] = useState([]);
  const [tenants, setTenants] = useState([]);

  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [createdSecret, setCreatedSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState(null); // { keyId, name, status }

  // New Tenant (Department) Modal State
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantCode, setNewTenantCode] = useState('');
  const [newTenantBudget, setNewTenantBudget] = useState(15000000);
  const [newTenantHardCap, setNewTenantHardCap] = useState(true);

  // Edit Tenant (Department) Modal State
  const [showEditTenantModal, setShowEditTenantModal] = useState(false);
  const [editTenantName, setEditTenantName] = useState('');
  const [editTenantCode, setEditTenantCode] = useState('');
  const [editTenantBudget, setEditTenantBudget] = useState(15000000);
  const [editTenantHardCap, setEditTenantHardCap] = useState(true);

  // Edit Key Modal State
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRpm, setEditRpm] = useState(300);
  const [editTpm, setEditTpm] = useState(300000);
  const [editIp, setEditIp] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editModels, setEditModels] = useState([]);
  const [registeredModels, setRegisteredModels] = useState([]);

  // New Key Form State
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDept, setNewKeyDept] = useState('');
  const [newKeyRpm, setNewKeyRpm] = useState(300);
  const [newKeyTpm, setNewKeyTpm] = useState(300000);
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState('');
  const [newKeyIp, setNewKeyIp] = useState('');
  const [newKeyModels, setNewKeyModels] = useState([]);

  const parseIpCidrs = (raw) =>
    String(raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  // Load live data from Backend API (Single Source of Truth: PostgreSQL)
  useEffect(() => {
    async function loadData() {
      try {
        let mappedTenants = [];
        const liveTenants = await apiClient.getTenants();
        if (Array.isArray(liveTenants)) {
          mappedTenants = liveTenants.map((t) => ({
            id: t.tenant_id,
            name: t.name,
            code: t.department_code,
            budget: Number(t.monthly_budget_krw || 0),
            spent: Number(t.spent_budget_krw || 0),
            hardCap: t.is_hard_cap_enabled
          }));
          setTenants(mappedTenants);
          if (mappedTenants.length > 0) {
            setNewKeyDept(mappedTenants[0].id);
            setNewTenantBudget(mappedTenants[0].budget || 10000000);
          }
        }

        const liveKeys = await apiClient.getVirtualKeys();
        if (Array.isArray(liveKeys)) {
          const mappedKeys = liveKeys.map((k) => {
            const matchedTenant = mappedTenants.find((t) => t.id === k.tenant_id);
            const keySpent = Number(k.spent_krw ?? 0);
            const tenantSpent = Number(matchedTenant?.spent ?? 0);
            const tenantBudget = Number(k.tenant_budget_krw ?? matchedTenant?.budget ?? 0);
            const tenantBurnPct = tenantBudget > 0 ? Math.round((tenantSpent / tenantBudget) * 100) : 0;
            const isHardCapExceeded = Boolean(matchedTenant?.isHardCap && tenantBudget > 0 && tenantSpent >= tenantBudget);
            const isExpired = k.expires_at && new Date(k.expires_at) < new Date();

            let keyStatus = 'ACTIVE';
            if (!k.is_active) keyStatus = 'BLOCKED';
            else if (isExpired) keyStatus = 'EXPIRED';
            else if (isHardCapExceeded) keyStatus = 'BLOCKED';
            else if (tenantBurnPct >= 80) keyStatus = 'WARNING';

            return {
              keyId: k.key_id,
              name: k.name,
              tenantName: k.tenant_name || matchedTenant?.name || k.tenant_id,
              tenantId: k.tenant_id,
              allowedModels: k.allowed_models && k.allowed_models.length > 0 ? k.allowed_models : [],
              rpm: k.rpm_limit,
              tpm: k.tpm_limit,
              spent: keySpent,
              tenantSpent: tenantSpent,
              tenantBudget: tenantBudget,
              tenantBurnPct: tenantBurnPct,
              isHardCapExceeded: isHardCapExceeded,
              totalTokens: Number(k.total_tokens || 0),
              status: keyStatus,
              ipWhitelist: k.allowed_ip_cidrs && k.allowed_ip_cidrs.length > 0 ? k.allowed_ip_cidrs.join(', ') : '',
              keyPrefix: k.key_prefix,
              expiresAt: k.expires_at ? String(k.expires_at).slice(0, 10) : ''
            };
          });
          setKeys(mappedKeys);
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
        console.error('Failed to load governance data from backend:', err);
        if (onNotify) onNotify('ERROR', `데이터 로드 실패: ${err.message || '서버 응답 없음'}`);
      }
    }
    loadData();
  }, []);

  // Open Create Key Modal with live model catalog refresh
  const handleOpenCreateModal = async () => {
    if (!canWriteGovernance) return;
    setShowCreateModal(true);
    try {
      const liveModels = await apiClient.getModels();
      if (Array.isArray(liveModels)) {
        const mapped = liveModels.map((m) => ({
          id: m.model_id,
          name: m.alias || m.name || m.model_id,
          alias: m.alias
        }));
        setRegisteredModels(mapped);
        setNewKeyModels(mapped.map((m) => m.id));
      }
    } catch (e) {
      console.warn('Failed to fetch live models on modal open:', e);
    }
  };

  // Open Edit Key Modal
  const handleOpenEdit = (keyItem) => {
    setEditingKey(keyItem);
    setEditName(keyItem.name);
    setEditRpm(keyItem.rpm);
    setEditTpm(keyItem.tpm);
    setEditIp(keyItem.ipWhitelist || '');
    setEditExpiresAt(keyItem.expiresAt || '');
    setEditStatus(keyItem.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE');
    setEditModels(keyItem.allowedModels || (registeredModels.length > 0 ? [registeredModels[0].id] : []));
  };

  // Save Edited Key
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!canWriteGovernance) {
      onNotify('ERROR', strings.virtualKeys.noWritePermissionTooltip);
      return;
    }
    if (!editingKey) return;

    setIsLoading(true);
    const parsedEditCidrs = parseIpCidrs(editIp);
    const updatedKeyItem = {
      ...editingKey,
      name: editName,
      rpm: Number(editRpm),
      tpm: Number(editTpm),
      ipWhitelist: parsedEditCidrs.join(', '),
      expiresAt: editExpiresAt,
      status: editStatus,
      allowedModels: editModels
    };

    try {
      // Call Backend API
      await apiClient.updateVirtualKey(editingKey.keyId, {
        name: editName,
        rpm_limit: Number(editRpm),
        tpm_limit: Number(editTpm),
        allowed_ip_cidrs: parsedEditCidrs,
        allowed_models: editModels,
        is_active: editStatus === 'ACTIVE',
        expires_at: editExpiresAt ? new Date(`${editExpiresAt}T23:59:59Z`).toISOString() : null
      });

      const updatedKeys = keys.map((k) => (k.keyId === editingKey.keyId ? updatedKeyItem : k));
      setKeys(updatedKeys);
      setEditingKey(null);
      onNotify('SUCCESS', strings.virtualKeys.alerts.keySaved(editingKey.keyId));
    } catch (err) {
      console.error('Backend update failed:', err);
      onNotify('ERROR', `가상키 수정 실패: ${err.message || '서버 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Key Status (Revoke / Activate)
  const toggleKeyStatus = async (keyId) => {
    if (!canWriteGovernance) {
      onNotify('ERROR', strings.virtualKeys.noWritePermissionTooltip);
      return;
    }
    const targetKey = keys.find((k) => k.keyId === keyId);
    if (!targetKey) return;

    // P0 FIX: Any key not BLOCKED (ACTIVE, WARNING, EXPIRED) should transition to BLOCKED on Revoke.
    const isCurrentlyBlocked = targetKey.status === 'BLOCKED';
    const nextStatus = isCurrentlyBlocked ? 'ACTIVE' : 'BLOCKED';

    try {
      if (nextStatus === 'BLOCKED') {
        await apiClient.revokeVirtualKey(keyId, strings.virtualKeys.alerts.revokeReasonAdmin);
      } else {
        await apiClient.updateVirtualKey(keyId, { is_active: true });
      }

      const updatedKeys = keys.map((k) => (k.keyId === keyId ? { ...k, status: nextStatus } : k));
      setKeys(updatedKeys);

      if (nextStatus === 'BLOCKED') {
        onNotify('INFO', strings.virtualKeys.alerts.keyRevoked(targetKey.name, keyId));
      } else {
        onNotify('SUCCESS', strings.virtualKeys.alerts.keyReactivated(targetKey.name, keyId));
      }
    } catch (err) {
      console.error('Backend status update failed:', err);
      onNotify('ERROR', `가상키 상태 변경 실패: ${err.message || '서버 응답 없음'}`);
    }
  };

  // Open Delete Confirmation Modal (Supports both Active with force and Revoked keys)
  const handleDeleteKey = (targetKey) => {
    if (!canWriteGovernance) {
      onNotify('ERROR', strings.virtualKeys.noWritePermissionTooltip);
      return;
    }
    if (!targetKey) return;
    setKeyToDelete({
      keyId: targetKey.keyId,
      name: targetKey.name,
      status: targetKey.status
    });
  };

  // Execute Key Deletion
  const confirmDeleteKey = async () => {
    if (!canWriteGovernance) {
      onNotify('ERROR', strings.virtualKeys.noWritePermissionTooltip);
      return;
    }
    if (!keyToDelete) return;
    const { keyId, name, status } = keyToDelete;
    const isForce = status === 'ACTIVE';

    setIsLoading(true);
    try {
      await apiClient.deleteVirtualKey(keyId, isForce);
      const updatedKeys = keys.filter((k) => k.keyId !== keyId);
      setKeys(updatedKeys);
      onNotify('SUCCESS', strings.virtualKeys.alerts.keyDeletedSuccess(name));
    } catch (err) {
      console.error('Backend delete error:', err);
      onNotify('ERROR', `가상키 삭제 실패: ${err.message || '서버 오류'}`);
    } finally {
      setIsLoading(false);
      setKeyToDelete(null);
    }
  };

  // Create Tenant (Department)
  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!canWriteGovernance) {
      onNotify('ERROR', strings.virtualKeys.noWritePermissionTooltip);
      return;
    }
    if (!newTenantName.trim() || !newTenantCode.trim()) {
      onNotify('ERROR', strings.virtualKeys.alerts.tenantInputsRequired);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.createTenant({
        name: newTenantName.trim(),
        department_code: newTenantCode.trim().toUpperCase(),
        monthly_budget_krw: Number(newTenantBudget),
        is_hard_cap_enabled: newTenantHardCap
      });
      const createdTenant = {
        id: res.tenant_id,
        name: res.name,
        code: res.department_code,
        budget: Number(res.monthly_budget_krw),
        spent: 0,
        hardCap: res.is_hard_cap_enabled
      };
      const updatedTenants = [...tenants, createdTenant];
      setTenants(updatedTenants);
      setShowCreateTenantModal(false);
      setNewTenantName('');
      setNewTenantCode('');
      setNewTenantBudget(15000000);
      setNewTenantHardCap(true);
      onNotify('SUCCESS', strings.virtualKeys.alerts.tenantRegisteredSuccess(res.name));
    } catch (err) {
      console.error('Backend create tenant error:', err);
      onNotify('ERROR', `테넌트 등록 실패: ${err.message || '서버 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Open Edit Tenant (Department) Modal
  const handleOpenEditTenant = () => {
    if (!canWriteGovernance || !selectedDept || selectedDept === 'ALL') return;
    const targetTenant = tenants.find((t) => t.id === selectedDept);
    if (!targetTenant) return;
    setEditTenantName(targetTenant.name);
    setEditTenantCode(targetTenant.code);
    setEditTenantBudget(targetTenant.budget);
    setEditTenantHardCap(targetTenant.hardCap);
    setShowEditTenantModal(true);
  };

  // Save Edit Tenant (Department)
  const handleSaveEditTenant = async (e) => {
    e.preventDefault();
    if (!canWriteGovernance || !selectedDept || selectedDept === 'ALL') return;
    if (!editTenantName.trim()) {
      onNotify('ERROR', '부서명을 입력해주세요.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.updateTenant(selectedDept, {
        name: editTenantName.trim(),
        monthly_budget_krw: Number(editTenantBudget),
        is_hard_cap_enabled: editTenantHardCap
      });
      const updatedTenants = tenants.map((t) =>
        t.id === selectedDept
          ? {
              ...t,
              name: res.name,
              budget: Number(res.monthly_budget_krw),
              hardCap: res.is_hard_cap_enabled
            }
          : t
      );
      setTenants(updatedTenants);
      setKeys((prevKeys) =>
        prevKeys.map((k) =>
          k.tenantId === selectedDept
            ? { ...k, tenantName: res.name, budget: Number(res.monthly_budget_krw) }
            : k
        )
      );
      setShowEditTenantModal(false);
      onNotify('SUCCESS', strings.virtualKeys.alerts.tenantUpdatedSuccess(res.name));
    } catch (err) {
      console.error('Failed to update tenant:', err);
      onNotify('ERROR', `부서 수정 실패: ${err.message || '서버 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset Tenant Spent Budget
  const handleResetTenantSpent = async () => {
    if (!canWriteGovernance || !selectedDept || selectedDept === 'ALL') return;
    const targetTenant = tenants.find((t) => t.id === selectedDept);
    if (!window.confirm(`[${targetTenant?.name || selectedDept}] 부서의 누적 소진액을 0원으로 초기화하시겠습니까? (월간 예산 갱신)`)) return;
    setIsLoading(true);
    try {
      const res = await apiClient.resetTenantSpent(selectedDept);
      setTenants((prev) =>
        prev.map((t) =>
          t.id === selectedDept
            ? { ...t, spent: 0 }
            : t
        )
      );
      setKeys((prevKeys) =>
        prevKeys.map((k) =>
          k.tenantId === selectedDept
            ? { ...k, tenantSpent: 0, tenantBurnPct: 0, isHardCapExceeded: false, status: k.status === 'BLOCKED' && k.isHardCapExceeded ? 'ACTIVE' : k.status }
            : k
        )
      );
      setShowEditTenantModal(false);
      onNotify('SUCCESS', `부서 [${res.name}]의 누적 소진액이 ₩0원으로 초기화되었습니다.`);
    } catch (err) {
      console.error('Reset tenant spent failed:', err);
      onNotify('ERROR', `소진액 초기화 실패: ${err.message || '서버 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Tenant (Department)
  const handleDeleteTenant = async (tenantId) => {
    if (!canWriteGovernance || !tenantId || tenantId === 'ALL') return;
    const targetTenant = tenants.find((t) => t.id === tenantId);
    setIsLoading(true);
    try {
      await apiClient.deleteTenant(tenantId);
      const updated = tenants.filter((t) => t.id !== tenantId);
      setTenants(updated);
      setSelectedDept('ALL');
      onNotify('SUCCESS', strings.virtualKeys.alerts.tenantDeletedSuccess(targetTenant?.name || tenantId));
    } catch (err) {
      onNotify('ERROR', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Create Key
  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!canWriteGovernance) {
      onNotify('ERROR', strings.virtualKeys.noWritePermissionTooltip);
      return;
    }
    if (!newKeyName.trim()) return;

    setIsLoading(true);
    const deptObj = tenants.find((d) => d.id === newKeyDept) || tenants[0];
    const targetAllowedModels = newKeyModels.length > 0
      ? newKeyModels
      : registeredModels.map((m) => m.id);

    const parsedNewCidrs = parseIpCidrs(newKeyIp);

    try {
      // Call Backend API
      const result = await apiClient.createVirtualKey({
        name: newKeyName,
        tenant_id: deptObj.id,
        allowed_models: targetAllowedModels,
        allowed_ip_cidrs: parsedNewCidrs,
        rpm_limit: Number(newKeyRpm),
        tpm_limit: Number(newKeyTpm),
        expires_at: newKeyExpiresAt ? new Date(`${newKeyExpiresAt}T23:59:59Z`).toISOString() : null
      });

      const newKeyItem = {
        keyId: result.key_id,
        name: result.name,
        tenantName: deptObj.name,
        tenantId: deptObj.id,
        allowedModels: result.allowed_models && result.allowed_models.length > 0 ? result.allowed_models : targetAllowedModels,
        rpm: result.rpm_limit,
        tpm: result.tpm_limit,
        spent: Number(result.spent_krw || 0),
        budget: Number(result.tenant_budget_krw ?? deptObj.budget ?? 0),
        status: 'ACTIVE',
        ipWhitelist: result.allowed_ip_cidrs && result.allowed_ip_cidrs.length > 0 ? result.allowed_ip_cidrs.join(', ') : parsedNewCidrs.join(', '),
        keyPrefix: result.key_prefix,
        expiresAt: newKeyExpiresAt
      };

      const updatedKeys = [newKeyItem, ...keys];
      setKeys(updatedKeys);

      setShowCreateModal(false);
      setNewKeyName('');
      setNewKeyIp('');

      setCreatedSecret({
        keyId: result.key_id,
        name: result.name,
        rawKey: result.raw_key,
        tenantName: deptObj.name,
        notice: result.security_notice
      });
      setShowSecretModal(true);

      onNotify('SUCCESS', strings.virtualKeys.alerts.keyIssuedOnce(result.key_id));
    } catch (err) {
      console.error('Backend create key error:', err);
      onNotify('ERROR', `가상키 발급 실패: ${err.message || '서버 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (createdSecret && createdSecret.rawKey) {
      const text = createdSecret.rawKey;
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        onNotify('INFO', strings.virtualKeys.alerts.keyCopied);
      }
    }
  };

  // Filter keys
  const filteredKeys = keys.filter((k) => {
    const matchesDept = selectedDept === 'ALL' || k.tenantId === selectedDept;
    const matchesStatus = selectedStatus === 'ALL' || k.status === selectedStatus;
    const matchesSearch =
      k.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.keyId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (k.keyPrefix && k.keyPrefix.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDept && matchesStatus && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / pageSize));
  const paginatedKeys = filteredKeys.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="tab-pane" data-testid="vk-page-container" data-screen-id="SCR-VK-01">
      {/* Page Header */}
      <div className="page-header" data-testid="vk-header-section">
        <div className="page-title-wrap">
          <h1>{currentSubTab === 'tenants' ? '부서(테넌트) 관리' : strings.virtualKeys.headerTitle}</h1>
          <p>{currentSubTab === 'tenants' ? '사내 조직별 AI 예산 한도(Hard Cap), 토큰 쿼터 및 활성 가상키 관리' : strings.virtualKeys.headerSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!canWriteGovernance && (
            <span
              className="badge warning"
              data-testid="vk-badge-readonly"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', padding: '6px 10px' }}
            >
              <ShieldCheck size={14} />
              {strings.virtualKeys.readOnlyBadge}
            </span>
          )}
          {currentSubTab === 'tenants' ? (
            <button
              className="btn btn-primary"
              data-testid="vk-btn-open-create-tenant"
              data-function-id="FNC-VK-OPEN-TENANT-MODAL"
              disabled={!canWriteGovernance}
              title={!canWriteGovernance ? strings.virtualKeys.noWritePermissionTooltip : undefined}
              onClick={() => { if (!canWriteGovernance) return; setShowCreateTenantModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', ...(!canWriteGovernance ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
            >
              <Building size={16} />
              <span>{strings.virtualKeys.btnRegisterTenant}</span>
            </button>
          ) : (
            <button
              className="btn btn-primary"
              data-testid="vk-btn-open-create"
              data-function-id="FNC-VK-OPEN-MODAL"
              disabled={!canWriteGovernance}
              title={!canWriteGovernance ? strings.virtualKeys.noWritePermissionTooltip : undefined}
              onClick={handleOpenCreateModal}
              style={!canWriteGovernance ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              <Plus size={16} />
              <span>{strings.virtualKeys.btnIssueKey}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tab Navigation (Keys vs Tenants) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <button
          type="button"
          data-testid="vk-subtab-keys"
          onClick={() => handleSubTabChange('keys')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            border: currentSubTab === 'keys' ? '1px solid #38bdf8' : '1px solid transparent',
            background: currentSubTab === 'keys' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: currentSubTab === 'keys' ? '#38bdf8' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.88rem',
            transition: 'all 0.2s ease'
          }}
        >
          <KeyRound size={16} />
          <span>가상 API Key 관리 ({keys.length})</span>
        </button>

        <button
          type="button"
          data-testid="vk-subtab-tenants"
          onClick={() => handleSubTabChange('tenants')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            border: currentSubTab === 'tenants' ? '1px solid var(--accent-cyan)' : '1px solid transparent',
            background: currentSubTab === 'tenants' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
            color: currentSubTab === 'tenants' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.88rem',
            transition: 'all 0.2s ease'
          }}
        >
          <Building size={16} />
          <span>부서(테넌트) 관리 ({tenants.length})</span>
        </button>
      </div>

      {/* Tab Content: Virtual Keys View */}
      {currentSubTab === 'keys' && (
        <>
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
                    placeholder={strings.virtualKeys.searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>상태:</span>
                <select
                  className="form-select"
                  data-testid="vk-select-status-filter"
                  style={{ width: 'auto' }}
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="ALL">전체 상태</option>
                  <option value="ACTIVE">활성 (ACTIVE)</option>
                  <option value="WARNING">경고 (WARNING)</option>
                  <option value="BLOCKED">차단 (BLOCKED)</option>
                  <option value="EXPIRED">만료 (EXPIRED)</option>
                </select>

                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{strings.virtualKeys.deptFilterLabel}</span>
                <select
                  className="form-select"
                  data-testid="vk-select-tenant-filter"
                  style={{ width: 'auto' }}
                  value={selectedDept}
                  onChange={(e) => {
                    setSelectedDept(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="ALL">{strings.virtualKeys.allDepts}</option>
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
                    <th>{strings.virtualKeys.table.colKey}</th>
                    <th>{strings.virtualKeys.table.colTenant}</th>
                    <th>{strings.virtualKeys.table.colModels}</th>
                    <th>{strings.virtualKeys.table.colRateLimits}</th>
                    <th>{strings.virtualKeys.table.colBurnRate}</th>
                    <th>{strings.virtualKeys.table.colStatus}</th>
                    <th>{strings.virtualKeys.table.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.length === 0 ? (
                    <tr data-testid="vk-row-empty">
                      <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                          <KeyRound size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {strings.virtualKeys.table.emptyTitle}
                          </div>
                          <div style={{ fontSize: '0.8rem' }}>
                            {strings.virtualKeys.table.emptyDesc}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedKeys.map((k) => {
                      const percent = k.tenantBurnPct ?? (k.budget > 0 ? Math.min(100, Math.round((k.spent / k.budget) * 100)) : 0);
                      return (
                        <tr key={k.keyId} data-testid={`vk-row-${k.keyId}`}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{k.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8' }}>
                            {k.keyId}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Prefix: <code style={{ color: '#94a3b8' }}>{k.keyPrefix ? `${k.keyPrefix}...` : 'sk-ord-***'}</code> | IP: {k.ipWhitelist || '0.0.0.0/0'} | 만료: <span style={{ color: k.expiresAt ? '#e2e8f0' : '#64748b' }}>{k.expiresAt || strings.virtualKeys.table.noExpiry}</span>
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
                        <td style={{ minWidth: '170px' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', marginBottom: '2px' }}>
                            ₩{Math.round(k.spent).toLocaleString()}원
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                            <span>부서 소진율: ₩{((k.tenantSpent || 0) / 10000).toLocaleString()}만 / ₩{((k.tenantBudget || 0) / 10000).toLocaleString()}만</span>
                            <span style={{ fontWeight: 700, color: (k.tenantBurnPct || 0) >= 100 ? '#f43f5e' : (k.tenantBurnPct || 0) >= 80 ? '#fbbf24' : '#34d399' }}>
                              {k.tenantBurnPct || 0}%
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(100, k.tenantBurnPct || 0)}%`,
                                height: '100%',
                                background: (k.tenantBurnPct || 0) >= 100 ? '#f43f5e' : (k.tenantBurnPct || 0) >= 80 ? '#f59e0b' : 'linear-gradient(90deg, #3b82f6, #10b981)'
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          {k.status === 'ACTIVE' && <span className="badge active" data-testid={`vk-badge-status-${k.keyId}`}>{strings.virtualKeys.table.statusActive}</span>}
                          {k.status === 'WARNING' && <span className="badge warning" data-testid={`vk-badge-status-${k.keyId}`}>{strings.virtualKeys.table.statusWarningDynamic(percent)}</span>}
                          {k.status === 'BLOCKED' && <span className="badge danger" data-testid={`vk-badge-status-${k.keyId}`}>{strings.virtualKeys.table.statusBlocked}</span>}
                          {k.status === 'EXPIRED' && <span className="badge danger" data-testid={`vk-badge-status-${k.keyId}`}>{strings.virtualKeys.table.statusExpired}</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-sm btn-secondary"
                              data-testid={`vk-btn-edit-${k.keyId}`}
                              disabled={!canWriteGovernance}
                              onClick={() => { if (!canWriteGovernance) return; handleOpenEdit(k); }}
                              title={!canWriteGovernance ? strings.virtualKeys.noWritePermissionTooltip : strings.virtualKeys.table.btnEditTitle}
                              style={!canWriteGovernance ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            >
                              <Sliders size={13} />
                              <span>{strings.virtualKeys.table.btnEdit}</span>
                            </button>
                            <button
                              className={`btn btn-sm ${k.status === 'BLOCKED' ? 'btn-secondary' : 'btn-danger'}`}
                              data-testid={`vk-btn-toggle-${k.keyId}`}
                              data-function-id="FNC-VK-REVOKE"
                              disabled={!canWriteGovernance}
                              onClick={() => { if (!canWriteGovernance) return; toggleKeyStatus(k.keyId); }}
                              title={!canWriteGovernance ? strings.virtualKeys.noWritePermissionTooltip : undefined}
                              style={!canWriteGovernance ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            >
                              {k.status === 'BLOCKED' ? strings.virtualKeys.table.btnActivate : strings.virtualKeys.table.btnRevoke}
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              data-testid={`vk-btn-delete-${k.keyId}`}
                              data-function-id="FNC-VK-DELETE"
                              disabled={!canWriteGovernance}
                              onClick={() => { if (!canWriteGovernance) return; handleDeleteKey(k); }}
                              title={!canWriteGovernance ? strings.virtualKeys.noWritePermissionTooltip : (k.status === 'ACTIVE' ? strings.virtualKeys.table.btnDeleteTitleActive : strings.virtualKeys.table.btnDeleteTitleRevoked)}
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171', ...(!canWriteGovernance ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                            >
                              <Trash2 size={13} />
                              <span>{strings.virtualKeys.table.btnDelete}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            {filteredKeys.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <div>
                  총 <strong style={{ color: '#ffffff' }}>{filteredKeys.length}</strong>개 항목 (페이지 {currentPage} / {totalPages})
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    style={{ padding: '4px 10px' }}
                  >
                    이전
                  </button>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{currentPage}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    style={{ padding: '4px 10px' }}
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab Content: Tenants (Departments) View */}
      {currentSubTab === 'tenants' && (
        <div className="card" data-testid="vk-tenants-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>부서(테넌트) 목록 및 예산 정책</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              각 부서별 월간 예산 한도와 현재 소진액, Hard Cap 정책을 관리하고 누적 소진액을 롤오버/리셋할 수 있습니다.
            </p>
          </div>
          <div className="table-container">
            <table className="data-table" data-testid="vk-table-tenants">
              <thead>
                <tr>
                  <th>부서 코드 / ID</th>
                  <th>부서 명칭</th>
                  <th>월간 예산 한도</th>
                  <th>당월 누적 소진액</th>
                  <th>소진율 및 Hard Cap</th>
                  <th>활성 가상 키</th>
                  <th>관리 작업</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                      <Building size={32} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '8px' }} />
                      <div>등록된 부서가 없습니다. '신규 부서 등록' 버튼을 눌러 부서를 생성하세요.</div>
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => {
                    const budget = t.monthly_budget_krw || t.monthlyBudget || 0;
                    const spent = t.current_month_spent_krw || t.currentMonthSpent || 0;
                    const burnPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                    const isHardCap = t.hard_cap_enabled ?? t.hardCapEnabled ?? true;
                    const deptKeys = keys.filter(k => k.tenantId === t.id);
                    const activeDeptKeys = deptKeys.filter(k => k.status === 'ACTIVE');

                    return (
                      <tr key={t.id} data-testid={`vk-tenant-row-${t.id}`}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent-cyan)' }}>
                            {t.id}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{t.name}</div>
                          {t.description && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {t.description}
                            </div>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          ₩{budget.toLocaleString()}원
                        </td>
                        <td>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: spent > 0 ? '#f8fafc' : 'var(--text-muted)' }}>
                            ₩{Math.round(spent).toLocaleString()}원
                          </div>
                        </td>
                        <td style={{ minWidth: '180px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                            <span style={{ color: burnPct >= 100 ? '#f43f5e' : burnPct >= 80 ? '#fbbf24' : '#34d399', fontWeight: 700 }}>
                              {burnPct}%
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {isHardCap ? 'Hard Cap 적용' : '소프트 한도'}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${burnPct}%`,
                                height: '100%',
                                background: burnPct >= 100 ? '#f43f5e' : burnPct >= 80 ? '#f59e0b' : 'linear-gradient(90deg, #3b82f6, #10b981)'
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <span className="badge info" style={{ fontFamily: 'var(--font-mono)' }}>
                            {activeDeptKeys.length} / {deptKeys.length}개
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              data-testid={`vk-btn-edit-tenant-row-${t.id}`}
                              disabled={!canWriteGovernance}
                              onClick={() => {
                                setSelectedDept(t.id);
                                handleOpenEditTenant();
                              }}
                              title="부서 예산 및 정책 수정"
                            >
                              <Sliders size={13} />
                              <span>설정 수정</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              data-testid={`vk-btn-delete-tenant-row-${t.id}`}
                              disabled={!canWriteGovernance || deptKeys.length > 0}
                              onClick={() => handleDeleteTenant(t.id)}
                              title={deptKeys.length > 0 ? '소속 가상 키가 있어 삭제할 수 없습니다' : '부서 삭제'}
                              style={deptKeys.length > 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            >
                              <Trash2 size={13} />
                              <span>삭제</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Key Modal (설정 변경 모달) */}
      {editingKey && (
        <div className="modal-overlay" onClick={() => setEditingKey(null)}>
          <div className="modal-content" data-testid="vk-modal-edit" data-screen-id="SCR-VK-M03" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-header">
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={18} style={{ color: '#38bdf8' }} />
                  <span>{strings.virtualKeys.editModal.title(editingKey.keyId)}</span>
                </div>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.editModal.keyNameLabel}</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-edit-input-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.editModal.tenantLabel}</label>
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
                    <label className="form-label">{strings.virtualKeys.editModal.rpmLabel}</label>
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
                    <label className="form-label">{strings.virtualKeys.editModal.tpmLabel}</label>
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
                  <label className="form-label">{strings.virtualKeys.editModal.ipWhitelistLabel}</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-edit-input-cidr"
                    placeholder={strings.virtualKeys.createKeyModal.ipWhitelistPlaceholder}
                    value={editIp}
                    onChange={(e) => setEditIp(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.editModal.statusLabel}</label>
                  <select
                    className="form-select"
                    data-testid="vk-modal-edit-select-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="ACTIVE">{strings.virtualKeys.editModal.statusActive}</option>
                    <option value="BLOCKED">{strings.virtualKeys.editModal.statusBlocked}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.editModal.expiresAtLabel}</label>
                  <input
                    type="date"
                    className="form-input"
                    data-testid="vk-modal-edit-input-expires"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                    style={{ colorScheme: 'dark' }}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    * 미입력 시 유효기간 없이 무기한 유지됩니다.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{strings.virtualKeys.editModal.allowedModelsLabel(registeredModels.length)}</span>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>{strings.virtualKeys.editModal.modelsCountAllowed(editModels.length)}</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {registeredModels.length === 0 ? (
                      <div style={{ width: '100%', padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <div style={{ marginBottom: '6px', color: '#94a3b8' }}>{strings.virtualKeys.editModal.noModelsEmpty}</div>
                        {onNavigateTab && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditingKey(null);
                              onNavigateTab('routing');
                            }}
                            style={{ fontSize: '0.75rem', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
                          >
                            {strings.virtualKeys.editModal.goToCatalogAction} &rarr;
                          </button>
                        )}
                      </div>
                    ) : (
                      registeredModels.map(m => {
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
                      })
                    )}
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
                  <span>{strings.virtualKeys.editModal.btnDeleteKey}</span>
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    data-testid="vk-modal-edit-btn-cancel"
                    onClick={() => setEditingKey(null)}
                  >
                    {strings.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    data-testid="vk-modal-edit-btn-submit"
                    data-function-id="FNC-VK-UPDATE"
                    disabled={isLoading}
                  >
                    {isLoading ? strings.virtualKeys.editModal.btnSaving : strings.virtualKeys.editModal.btnSave}
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
                  {strings.virtualKeys.createKeyModal.title}
                </div>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createKeyModal.keyNameLabel}</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-input-name"
                    placeholder={strings.virtualKeys.createKeyModal.keyNamePlaceholder}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createKeyModal.tenantLabel}</label>
                  <select
                    className="form-select"
                    data-testid="vk-modal-select-tenant"
                    value={newKeyDept}
                    onChange={(e) => setNewKeyDept(e.target.value)}
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{strings.virtualKeys.createKeyModal.tenantOption(t.name, (t.budget / 10000).toLocaleString())}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">{strings.virtualKeys.createKeyModal.rpmLabel}</label>
                    <input
                      type="number"
                      className="form-input"
                      data-testid="vk-modal-input-rpm"
                      value={newKeyRpm}
                      onChange={(e) => setNewKeyRpm(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{strings.virtualKeys.createKeyModal.tpmLabel}</label>
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
                  <label className="form-label">{strings.virtualKeys.createKeyModal.ipWhitelistLabel}</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-input-cidr"
                    placeholder={strings.virtualKeys.createKeyModal.ipWhitelistPlaceholder}
                    value={newKeyIp}
                    onChange={(e) => setNewKeyIp(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{strings.virtualKeys.createKeyModal.allowedModelsLabel(registeredModels.length)}</span>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>{strings.virtualKeys.createKeyModal.modelsCountSelected(newKeyModels.length)}</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {registeredModels.length === 0 ? (
                      <div style={{ width: '100%', padding: '14px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <div style={{ marginBottom: '6px', color: '#f59e0b', fontWeight: 500 }}>
                          <AlertTriangle size={15} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '5px' }} />
                          {strings.virtualKeys.createKeyModal.noModelsEmpty}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                          {strings.virtualKeys.createKeyModal.noModelsNotice}
                        </div>
                        {onNavigateTab && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setShowCreateModal(false);
                              onNavigateTab('routing');
                            }}
                            style={{ fontSize: '0.75rem', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
                          >
                            {strings.virtualKeys.createKeyModal.goToCatalogAction} &rarr;
                          </button>
                        )}
                      </div>
                    ) : (
                      registeredModels.map(m => {
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
                      })
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createKeyModal.expiresAtLabel}</label>
                  <input
                    type="date"
                    className="form-input"
                    data-testid="vk-modal-input-expires"
                    value={newKeyExpiresAt}
                    onChange={(e) => setNewKeyExpiresAt(e.target.value)}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                    style={{ colorScheme: 'dark' }}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    * 미입력 시 유효기간 없이 무기한 유지됩니다.
                  </div>
                </div>

                {(() => {
                  const selectedTenantObj = tenants.find((t) => t.id === newKeyDept) || tenants[0];
                  const isHardCap = selectedTenantObj?.hardCap;
                  return (
                    <div style={{ background: isHardCap ? 'rgba(244, 63, 94, 0.08)' : 'rgba(56, 189, 248, 0.08)', padding: '12px', borderRadius: '6px', border: `1px solid ${isHardCap ? 'rgba(244, 63, 94, 0.25)' : 'rgba(56, 189, 248, 0.25)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', color: isHardCap ? '#fda4af' : '#7dd3fc' }}>
                        <ShieldCheck size={18} style={{ color: isHardCap ? '#f43f5e' : '#38bdf8', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong>{isHardCap ? strings.virtualKeys.createKeyModal.tenantHardCapActive : strings.virtualKeys.createKeyModal.tenantHardCapInactive}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {strings.virtualKeys.createKeyModal.tenantHardCapHint}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-testid="vk-modal-btn-cancel"
                  onClick={() => setShowCreateModal(false)}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="vk-modal-btn-submit"
                  data-function-id="FNC-VK-ISSUE"
                  disabled={isLoading}
                >
                  {isLoading ? strings.virtualKeys.createKeyModal.btnCreating : strings.virtualKeys.createKeyModal.btnSubmit}
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
                <span>{strings.virtualKeys.secretModal.title}</span>
              </div>
            </div>

            <div className="modal-body">
              <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={20} style={{ color: '#fbbf24', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.84rem', color: '#fef3c7', lineHeight: 1.5 }}>
                    <strong>{strings.virtualKeys.secretModal.warningStrong}</strong><br />
                    {strings.virtualKeys.secretModal.warningP1}<strong>{strings.virtualKeys.secretModal.warningP2}</strong>{strings.virtualKeys.secretModal.warningP3}<strong>{strings.virtualKeys.secretModal.warningP4}</strong>{strings.virtualKeys.secretModal.warningP5}<strong>{strings.virtualKeys.secretModal.warningP6}</strong>{strings.virtualKeys.secretModal.warningP7}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {strings.virtualKeys.secretModal.keyNamePrefix} <strong style={{ color: '#ffffff' }}>{createdSecret.name}</strong> ({createdSecret.tenantName})
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Key ID: <code style={{ color: '#38bdf8' }}>{createdSecret.keyId}</code>
                </div>

                <label className="form-label" style={{ fontWeight: 600, color: '#e2e8f0' }}>{strings.virtualKeys.secretModal.generatedKeyLabel}</label>
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
                        <span style={{ color: '#F54927' }}>{strings.virtualKeys.secretModal.btnCopied}</span>
                      </>
                    ) : (
                      <>
                        <Copy size={16} color="#F54927" />
                        <span style={{ color: '#F54927' }}>{strings.virtualKeys.secretModal.btnCopy}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                {strings.virtualKeys.secretModal.authGuide}
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
                {strings.virtualKeys.secretModal.btnClose}
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
                <span>{strings.virtualKeys.deleteModal.title}</span>
              </div>
            </div>

            <div className="modal-body">
              {keyToDelete.status === 'ACTIVE' ? (
                <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.84rem', color: '#fca5a5', lineHeight: 1.5 }}>
                      <strong>{strings.virtualKeys.deleteModal.activeWarningStrong}</strong><br />
                      {strings.virtualKeys.deleteModal.activeWarningDesc1}<br />
                      {strings.virtualKeys.deleteModal.activeWarningDesc2}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.84rem', color: '#fde68a', lineHeight: 1.5 }}>
                      {strings.virtualKeys.deleteModal.revokedWarningDesc}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--bg-panel)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {strings.virtualKeys.deleteModal.keyNamePrefix} <strong style={{ color: '#ffffff' }}>{keyToDelete.name}</strong>
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
                {strings.common.cancel}
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
                <span>{isLoading ? strings.virtualKeys.deleteModal.btnDeleting : (keyToDelete.status === 'ACTIVE' ? strings.virtualKeys.deleteModal.btnRevokeAndDelete : strings.virtualKeys.deleteModal.btnConfirmDelete)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Tenant (Department) Modal */}
      {showCreateTenantModal && (
        <div className="modal-overlay" onClick={() => setShowCreateTenantModal(false)}>
          <div className="modal-content" data-testid="vk-modal-create-tenant" data-screen-id="SCR-VK-M05" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateTenant}>
              <div className="modal-header">
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={20} color="var(--accent-cyan)" />
                  <span>{strings.virtualKeys.createTenantModal.title}</span>
                </div>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createTenantModal.nameLabel} <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-tenant-input-name"
                    placeholder={strings.virtualKeys.createTenantModal.namePlaceholder}
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createTenantModal.codeLabel} <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-tenant-input-code"
                    placeholder={strings.virtualKeys.createTenantModal.codePlaceholder}
                    value={newTenantCode}
                    onChange={(e) => setNewTenantCode(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)' }}
                    required
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {strings.virtualKeys.createTenantModal.codeHint}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createTenantModal.budgetLabel}</label>
                  <input
                    type="number"
                    className="form-input"
                    data-testid="vk-modal-tenant-input-budget"
                    value={newTenantBudget}
                    onChange={(e) => setNewTenantBudget(e.target.value)}
                    min="0"
                    step="1000000"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    required
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                    {strings.virtualKeys.createTenantModal.budgetDisplay(Number(newTenantBudget || 0).toLocaleString())}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      data-testid="vk-modal-tenant-toggle-hardcap"
                      checked={newTenantHardCap}
                      onChange={(e) => setNewTenantHardCap(e.target.checked)}
                    />
                    <span><strong>{strings.virtualKeys.createTenantModal.hardCapNoticeStrong}</strong> {strings.virtualKeys.createTenantModal.hardCapNoticeDesc}</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-testid="vk-modal-tenant-btn-cancel"
                  onClick={() => setShowCreateTenantModal(false)}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="vk-modal-tenant-btn-submit"
                  data-function-id="FNC-VK-CREATE-TENANT"
                  disabled={isLoading}
                >
                  {isLoading ? strings.virtualKeys.createTenantModal.btnRegistering : strings.virtualKeys.createTenantModal.btnSubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tenant (Department) Modal */}
      {showEditTenantModal && (
        <div className="modal-overlay" onClick={() => setShowEditTenantModal(false)}>
          <div className="modal-content" data-testid="vk-modal-edit-tenant" data-screen-id="SCR-VK-M06" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEditTenant}>
              <div className="modal-header">
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={20} color="var(--accent-cyan)" />
                  <span>{strings.virtualKeys.createTenantModal.editTitle}</span>
                </div>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createTenantModal.nameLabel} <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-edit-tenant-input-name"
                    value={editTenantName}
                    onChange={(e) => setEditTenantName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createTenantModal.codeLabel}</label>
                  <input
                    className="form-input"
                    data-testid="vk-modal-edit-tenant-input-code"
                    value={editTenantCode}
                    disabled
                    style={{ fontFamily: 'var(--font-mono)', opacity: 0.7, cursor: 'not-allowed' }}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    * 부서 식별 코드는 데이터 정합성을 위해 변경할 수 없습니다.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{strings.virtualKeys.createTenantModal.budgetLabel}</label>
                  <input
                    type="number"
                    className="form-input"
                    data-testid="vk-modal-edit-tenant-input-budget"
                    value={editTenantBudget}
                    onChange={(e) => setEditTenantBudget(e.target.value)}
                    min="0"
                    step="1000000"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    required
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                    {strings.virtualKeys.createTenantModal.budgetDisplay(Number(editTenantBudget || 0).toLocaleString())}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      data-testid="vk-modal-edit-tenant-toggle-hardcap"
                      checked={editTenantHardCap}
                      onChange={(e) => setEditTenantHardCap(e.target.checked)}
                    />
                    <span><strong>{strings.virtualKeys.createTenantModal.hardCapNoticeStrong}</strong> {strings.virtualKeys.createTenantModal.hardCapNoticeDesc}</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-testid="vk-modal-edit-tenant-btn-reset-spent"
                  onClick={handleResetTenantSpent}
                  disabled={isLoading}
                  style={{ color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.4)', background: 'rgba(251, 191, 36, 0.1)' }}
                  title="월간 정산 후 부서의 누적 소비액을 0원으로 리셋합니다."
                >
                  소진액 초기화 (월간 롤오버)
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    data-testid="vk-modal-edit-tenant-btn-cancel"
                    onClick={() => setShowEditTenantModal(false)}
                  >
                    {strings.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    data-testid="vk-modal-edit-tenant-btn-submit"
                    data-function-id="FNC-VK-UPDATE-TENANT"
                    disabled={isLoading}
                  >
                    {isLoading ? strings.virtualKeys.createTenantModal.btnUpdating : strings.virtualKeys.createTenantModal.btnUpdateSubmit}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
