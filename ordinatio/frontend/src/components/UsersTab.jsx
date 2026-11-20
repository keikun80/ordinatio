import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  KeyRound, 
  Trash2, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Lock, 
  Unlock, 
  RefreshCw,
  Building2,
  X,
  AlertTriangle,
  Pencil,
  Shield,
  Plus,
  CheckSquare,
  Square
} from 'lucide-react';
import { strings } from '../constants/strings';

export default function UsersTab({ onNotify, defaultSubTab = 'users' }) {
  const { user: currentUser, isSuperAdmin, hasPermission } = useAuth();
  const canWriteUsers = isSuperAdmin || hasPermission('users:write');
  const canManageRoles = isSuperAdmin || hasPermission('roles:manage');
  const [subTab, setSubTab] = useState(defaultSubTab); // 'users' | 'roles'

  useEffect(() => {
    if (defaultSubTab) {
      setSubTab(defaultSubTab);
    }
  }, [defaultSubTab]);
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [roles, setRoles] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals state (Users)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState(null);

  // Form states for Create User
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('TENANT_ADMIN');
  const [newTenantId, setNewTenantId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [modalError, setModalError] = useState('');

  // Form states for Edit User & Role
  const [editUserId, setEditUserId] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('TENANT_ADMIN');
  const [editTenantId, setEditTenantId] = useState('');

  // Form state for Reset Password
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  // Role Management State
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [isEditRoleModalOpen, setIsEditRoleModalOpen] = useState(false);
  const [roleFormName, setRoleFormName] = useState('');
  const [roleFormDisplayName, setRoleFormDisplayName] = useState('');
  const [roleFormDesc, setRoleFormDesc] = useState('');
  const [roleFormPermissions, setRoleFormPermissions] = useState([]);
  const [roleModalError, setRoleModalError] = useState('');
  const [editRoleId, setEditRoleId] = useState('');
  const [isSystemRole, setIsSystemRole] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [userResult, tenantResult, roleResult, permResult] = await Promise.allSettled([
        apiClient.getUsers(),
        apiClient.getTenants(),
        apiClient.getRoles(),
        apiClient.getRolePermissions()
      ]);

      const userList = userResult.status === 'fulfilled' ? userResult.value : [];
      const tenantList = tenantResult.status === 'fulfilled' ? tenantResult.value : [];
      const roleList = roleResult.status === 'fulfilled' ? roleResult.value : [];
      const permList = permResult.status === 'fulfilled' ? permResult.value : [];

      setUsers(userList || []);
      setTenants(tenantList || []);
      setRoles(roleList || []);
      setAvailablePermissions(permList || []);

      if (tenantList && tenantList.length > 0 && !newTenantId) {
        setNewTenantId(tenantList[0].tenant_id);
      }
      if (roleList && roleList.length > 0 && !newRole) {
        setNewRole(roleList[0].name);
      }

      // 비정상 실패가 발생한 경우에만 경고 알림 표시 (개별 실패 격리)
      const failures = [];
      if (userResult.status === 'rejected') failures.push(userResult.reason?.message || '사용자 목록');
      if (roleResult.status === 'rejected') failures.push(roleResult.reason?.message || '역할 목록');
      if (failures.length > 0 && onNotify) {
        onNotify('warning', strings.users.alerts.loadFailed(failures.join(', ')));
      }
    } catch (err) {
      if (onNotify) onNotify('error', strings.users.alerts.loadFailed(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!newUsername.trim() || !newFullName.trim() || !newEmail.trim() || !newPassword) {
      setModalError(strings.users.modal.errRequiredFields);
      return;
    }
    if (newPassword.length < 8) {
      setModalError(strings.users.modal.errPasswordMinLength);
      return;
    }
    if (newPassword !== confirmPassword) {
      setModalError(strings.users.modal.errPasswordMismatch);
      return;
    }

    try {
      await apiClient.createUser({
        username: newUsername.trim(),
        full_name: newFullName.trim(),
        email: newEmail.trim(),
        role: newRole,
        tenant_id: newRole === 'SUPER_ADMIN' ? null : newTenantId,
        password: newPassword
      });

      if (onNotify) onNotify('success', strings.users.alerts.created(newUsername));
      setIsCreateModalOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewEmail('');
      setNewPassword('');
      setConfirmPassword('');
      loadData();
    } catch (err) {
      setModalError(strings.users.alerts.createFailed(err.message));
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!resetNewPassword || resetNewPassword.length < 8) {
      setModalError(strings.users.modal.errNewPasswordMinLength);
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setModalError(strings.users.modal.errPasswordMismatch);
      return;
    }

    try {
      await apiClient.resetUserPassword(targetUser.id, resetNewPassword);
      if (onNotify) onNotify('success', strings.users.alerts.pwResetSuccess(targetUser.username));
      setIsResetPasswordModalOpen(false);
      setTargetUser(null);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err) {
      setModalError(strings.users.alerts.pwResetFailed(err.message));
    }
  };

  const openEditModal = (u) => {
    setTargetUser(u);
    setEditUserId(u.id);
    setEditUsername(u.username);
    setEditFullName(u.full_name || '');
    setEditEmail(u.email || '');
    setEditRole(u.role || 'TENANT_ADMIN');
    setEditTenantId(u.tenant_id || (tenants[0]?.tenant_id || ''));
    setModalError('');
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!editFullName.trim() || !editEmail.trim()) {
      setModalError(strings.users.modal.errRequiredFields);
      return;
    }

    // Safety guard: prevent demoting current super admin self
    if (currentUser?.id === editUserId && currentUser?.role === 'SUPER_ADMIN' && editRole !== 'SUPER_ADMIN') {
      setModalError(strings.users.alerts.cannotDemoteSelf);
      return;
    }

    try {
      await apiClient.updateUser(editUserId, {
        full_name: editFullName.trim(),
        email: editEmail.trim(),
        role: editRole,
        tenant_id: editRole === 'SUPER_ADMIN' ? '' : editTenantId
      });

      if (onNotify) onNotify('success', strings.users.alerts.updatedSuccess(editUsername));
      setIsEditModalOpen(false);
      setTargetUser(null);
      loadData();
    } catch (err) {
      setModalError(strings.users.alerts.updateFailed(err.message));
    }
  };

  const handleUnlockAccount = async (u) => {
    try {
      await apiClient.updateUser(u.id, {
        is_active: true,
        unlock_account: true
      });
      if (onNotify) onNotify('success', strings.users.alerts.unlockedSuccess(u.username));
      loadData();
    } catch (err) {
      if (onNotify) onNotify('error', strings.users.alerts.unlockedFailed(err.message));
    }
  };

  const handleToggleActive = async (u) => {
    try {
      const nextActive = !u.is_active;
      await apiClient.updateUser(u.id, { is_active: nextActive });
      if (onNotify) onNotify('success', strings.users.alerts.statusChanged(u.username, nextActive));
      loadData();
    } catch (err) {
      if (onNotify) onNotify('error', strings.users.alerts.statusChangeFailed(err.message));
    }
  };

  const handleDeleteUser = async (u) => {
    if (u.id === currentUser?.id) {
      if (onNotify) onNotify('warning', strings.users.alerts.cannotDeleteSelf);
      return;
    }
    if (!window.confirm(strings.users.alerts.deleteConfirm(u.username, u.full_name))) {
      return;
    }

    try {
      await apiClient.deleteUser(u.id);
      if (onNotify) onNotify('success', strings.users.alerts.deletedSuccess(u.username));
      loadData();
    } catch (err) {
      if (onNotify) onNotify('error', strings.users.alerts.deleteFailed(err.message));
    }
  };

  // --- Role Management Handlers ---
  const openCreateRoleModal = () => {
    setRoleFormName('');
    setRoleFormDisplayName('');
    setRoleFormDesc('');
    setRoleFormPermissions([]);
    setRoleModalError('');
    setIsCreateRoleModalOpen(true);
  };

  const openEditRoleModal = (r) => {
    setEditRoleId(r.id || r.name);
    setRoleFormName(r.name);
    setRoleFormDisplayName(r.display_name || '');
    setRoleFormDesc(r.description || '');
    setRoleFormPermissions(r.permissions || []);
    setIsSystemRole(r.is_system || false);
    setRoleModalError('');
    setIsEditRoleModalOpen(true);
  };

  const togglePermission = (code) => {
    setRoleFormPermissions((prev) => 
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const selectAllPermissions = () => {
    setRoleFormPermissions(availablePermissions.map((p) => p.code));
  };

  const deselectAllPermissions = () => {
    setRoleFormPermissions([]);
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setRoleModalError('');

    const normName = roleFormName.trim().toUpperCase();
    if (!normName) {
      setRoleModalError(strings.roles.modal.errNameRequired);
      return;
    }
    if (!/^[A-Z0-9_]{2,64}$/.test(normName)) {
      setRoleModalError(strings.roles.modal.errNameFormat);
      return;
    }
    if (!roleFormDisplayName.trim()) {
      setRoleModalError(strings.roles.modal.errDisplayNameRequired);
      return;
    }
    if (roleFormPermissions.length === 0) {
      setRoleModalError(strings.roles.modal.errPermRequired);
      return;
    }

    try {
      await apiClient.createRole({
        name: normName,
        display_name: roleFormDisplayName.trim(),
        description: roleFormDesc.trim() || null,
        permissions: roleFormPermissions
      });
      if (onNotify) onNotify('success', strings.roles.alerts.created(normName));
      setIsCreateRoleModalOpen(false);
      loadData();
    } catch (err) {
      setRoleModalError(strings.roles.alerts.createFailed(err.message));
    }
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    setRoleModalError('');

    if (!roleFormDisplayName.trim()) {
      setRoleModalError(strings.roles.modal.errDisplayNameRequired);
      return;
    }

    try {
      await apiClient.updateRole(editRoleId, {
        display_name: roleFormDisplayName.trim(),
        description: roleFormDesc.trim() || null,
        permissions: roleFormPermissions
      });
      if (onNotify) onNotify('success', strings.roles.alerts.updated(roleFormName));
      setIsEditRoleModalOpen(false);
      loadData();
    } catch (err) {
      setRoleModalError(strings.roles.alerts.updateFailed(err.message));
    }
  };

  const handleDeleteRole = async (r) => {
    if (r.is_system) {
      if (onNotify) onNotify('warning', strings.roles.table.systemRoleNoDelete);
      return;
    }
    if ((r.user_count || 0) > 0) {
      if (onNotify) onNotify('warning', strings.roles.table.inUseNoDelete(r.user_count));
      return;
    }
    if (!window.confirm(strings.roles.alerts.deleteConfirm(r.name, r.display_name))) {
      return;
    }

    try {
      await apiClient.deleteRole(r.id || r.name);
      if (onNotify) onNotify('success', strings.roles.alerts.deleted(r.name));
      loadData();
    } catch (err) {
      if (onNotify) onNotify('error', strings.roles.alerts.deleteFailed(err.message));
    }
  };

  const permissionsByCategory = availablePermissions.reduce((acc, p) => {
    const cat = p.category || strings.roles.table.categoryEtc;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  // Filter users
  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const superAdminCount = users.filter((u) => u.role === 'SUPER_ADMIN').length;
  const tenantAdminCount = users.filter((u) => u.role === 'TENANT_ADMIN').length;
  const viewerCount = users.filter((u) => u.role === 'VIEWER').length;
  const customRoleCount = users.filter((u) => !['SUPER_ADMIN', 'TENANT_ADMIN', 'VIEWER'].includes(u.role)).length;
  const lockedCount = users.filter((u) => u.is_locked).length;

  return (
    <div className="tab-pane active" data-screen-id="SCR-ADM-01">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {subTab === 'users' ? <Users size={24} color="#38bdf8" /> : <ShieldCheck size={24} color="#c084fc" />}
            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--heading-color)' }}>
              {subTab === 'users' ? strings.users.headerTitle : strings.roles.headerTitle}
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {subTab === 'users' ? strings.users.headerSubtitle : strings.roles.headerSubtitle}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {((subTab === 'users' && !canWriteUsers) || (subTab === 'roles' && !canManageRoles)) && (
            <span className="badge warning" style={{ fontSize: '0.78rem' }}>
              {strings.virtualKeys.readOnlyBadge}
            </span>
          )}
          <button 
            className="btn-secondary"
            onClick={loadData}
            title={strings.common.refresh}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>{strings.common.refresh}</span>
          </button>
          {subTab === 'users' ? (
            <button
              className="btn-primary"
              data-testid="users-btn-create-modal"
              disabled={!canWriteUsers}
              onClick={() => {
                if (!canWriteUsers) return;
                setModalError('');
                setIsCreateModalOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: canWriteUsers ? 1 : 0.45, cursor: canWriteUsers ? 'pointer' : 'not-allowed' }}
            >
              <UserPlus size={16} />
              <span>{strings.users.btnCreateUser}</span>
            </button>
          ) : (
            <button
              className="btn-primary"
              data-testid="roles-btn-create-modal"
              disabled={!canManageRoles}
              onClick={() => canManageRoles && openCreateRoleModal()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-purple)', borderColor: 'var(--accent-purple)', opacity: canManageRoles ? 1 : 0.45, cursor: canManageRoles ? 'pointer' : 'not-allowed' }}
            >
              <Plus size={16} />
              <span>{strings.roles.btnAddRole}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tab Navigation (Users vs Roles) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '22px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <button
          type="button"
          data-testid="users-subtab-users"
          onClick={() => setSubTab('users')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            border: subTab === 'users' ? '1px solid #38bdf8' : '1px solid transparent',
            background: subTab === 'users' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: subTab === 'users' ? '#38bdf8' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Users size={16} />
          <span>{strings.roles.subTabUsers}</span>
          <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
            {users.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="users-subtab-roles"
          onClick={() => setSubTab('roles')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            border: subTab === 'roles' ? '1px solid #c084fc' : '1px solid transparent',
            background: subTab === 'roles' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
            color: subTab === 'roles' ? '#c084fc' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <ShieldCheck size={16} />
          <span>{strings.roles.subTabRoles}</span>
          <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
            {roles.length}
          </span>
        </button>
      </div>

      {subTab === 'users' ? (
        <>
          {/* KPI Stats Row */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.users.kpi.totalAccounts}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--heading-color)', marginTop: '4px' }}>
            {users.length}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#c084fc' }}>{strings.users.kpi.superAdmin}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c084fc', marginTop: '4px' }}>
            {superAdminCount}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{strings.users.kpi.tenantAdmin}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
            {tenantAdminCount}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{strings.users.kpi.viewer}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>
            {viewerCount}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#34d399' }}>{strings.users.kpi.customRoles}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
            {customRoleCount}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: lockedCount > 0 ? '#f43f5e' : '#10b981' }}>
            {strings.users.kpi.lockout}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: lockedCount > 0 ? '#f43f5e' : '#10b981', marginTop: '4px' }}>
            {lockedCount}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={strings.users.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Filter size={15} color="var(--text-muted)" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            >
              <option value="ALL">{strings.users.filterAllRoles}</option>
              {roles.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.display_name} ({r.name})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Users Table Card */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '14px 18px' }}>{strings.users.table.colUsername}</th>
                <th style={{ padding: '14px 18px' }}>{strings.users.table.colEmail}</th>
                <th style={{ padding: '14px 18px' }}>{strings.users.table.colRole}</th>
                <th style={{ padding: '14px 18px' }}>{strings.users.table.colTenant}</th>
                <th style={{ padding: '14px 18px' }}>{strings.users.table.colStatus}</th>
                <th style={{ padding: '14px 18px' }}>{strings.users.table.colLocked}</th>
                <th style={{ padding: '14px 18px' }}>{strings.users.table.colLastLogin}</th>
                <th style={{ padding: '14px 18px', textAlign: 'right' }}>{strings.users.table.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {strings.users.table.loading}
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {strings.users.table.empty}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <tr 
                      key={u.id}
                      style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s ease' }}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{u.username}</span>
                          {isCurrent && (
                            <span style={{ fontSize: '0.65rem', padding: '1px 6px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '4px' }}>
                              {strings.users.table.currentUserBadge}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {u.full_name}
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {u.email}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {(() => {
                          const roleMeta = roles.find((r) => r.name === u.role);
                          const isSuper = u.role === 'SUPER_ADMIN';
                          const isTenant = u.role === 'TENANT_ADMIN';
                          const isViewer = u.role === 'VIEWER';
                          const bg = isSuper
                            ? 'rgba(168, 85, 247, 0.18)'
                            : isTenant
                            ? 'rgba(56, 189, 248, 0.18)'
                            : isViewer
                            ? 'rgba(148, 163, 184, 0.15)'
                            : 'rgba(16, 185, 129, 0.16)';
                          const color = isSuper
                            ? '#c084fc'
                            : isTenant
                            ? '#38bdf8'
                            : isViewer
                            ? '#94a3b8'
                            : '#34d399';
                          const border = isSuper
                            ? '1px solid rgba(168, 85, 247, 0.3)'
                            : isTenant
                            ? '1px solid rgba(56, 189, 248, 0.3)'
                            : isViewer
                            ? '1px solid rgba(148, 163, 184, 0.25)'
                            : '1px solid rgba(16, 185, 129, 0.3)';
                          return (
                            <span
                              title={roleMeta?.display_name || u.role}
                              style={{ padding: '3px 8px', borderRadius: '4px', background: bg, color, border, fontWeight: 600, fontSize: '0.75rem' }}
                            >
                              {roleMeta ? `${roleMeta.display_name} (${u.role})` : u.role}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {u.tenant_name ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Building2 size={13} color="var(--text-muted)" />
                            <span>{u.tenant_name}</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{strings.users.table.globalTenant}</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {u.is_active ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '0.78rem' }}>
                            <CheckCircle2 size={13} />
                            <span>{strings.users.table.statusActive}</span>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontSize: '0.78rem' }}>
                            <XCircle size={13} />
                            <span>{strings.users.table.statusInactive}</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {u.is_locked ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f43f5e', fontWeight: 600, fontSize: '0.78rem' }}>
                            <Lock size={13} />
                            <span>{strings.users.table.lockedNotice(u.failed_login_attempts)}</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {strings.users.table.normalAttempts(u.failed_login_attempts || 0)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : strings.users.table.neverLoggedIn}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {u.is_locked && (
                            <button
                              disabled={!canWriteUsers}
                              onClick={() => canWriteUsers && handleUnlockAccount(u)}
                              title={strings.users.table.btnUnlockTitle}
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(244, 63, 94, 0.15)',
                                border: '1px solid rgba(244, 63, 94, 0.3)',
                                borderRadius: 'var(--radius-sm)',
                                color: '#f43f5e',
                                cursor: canWriteUsers ? 'pointer' : 'not-allowed',
                                opacity: canWriteUsers ? 1 : 0.4,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem'
                              }}
                            >
                              <Unlock size={13} />
                              <span>{strings.users.table.btnUnlock}</span>
                            </button>
                          )}

                          <button
                            disabled={!canWriteUsers}
                            onClick={() => canWriteUsers && openEditModal(u)}
                            data-testid={`users-btn-edit-${u.id}`}
                            title={strings.users.table.btnEditTitle}
                            style={{
                              padding: '6px 8px',
                              background: 'rgba(168, 85, 247, 0.12)',
                              border: '1px solid rgba(168, 85, 247, 0.25)',
                              borderRadius: 'var(--radius-sm)',
                              color: '#c084fc',
                              cursor: canWriteUsers ? 'pointer' : 'not-allowed',
                              opacity: canWriteUsers ? 1 : 0.4
                            }}
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            disabled={!canWriteUsers}
                            onClick={() => {
                              if (!canWriteUsers) return;
                              setModalError('');
                              setTargetUser(u);
                              setIsResetPasswordModalOpen(true);
                            }}
                            title={strings.users.table.btnResetPwTitle}
                            style={{
                              padding: '6px 8px',
                              background: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              borderRadius: 'var(--radius-sm)',
                              color: '#38bdf8',
                              cursor: canWriteUsers ? 'pointer' : 'not-allowed',
                              opacity: canWriteUsers ? 1 : 0.4
                            }}
                          >
                            <KeyRound size={14} />
                          </button>

                          {!isCurrent && (
                            <>
                              <button
                                disabled={!canWriteUsers}
                                onClick={() => canWriteUsers && handleToggleActive(u)}
                                title={u.is_active ? strings.users.table.btnDeactivateTitle : strings.users.table.btnActivateTitle}
                                style={{
                                  padding: '6px 8px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: u.is_active ? '#fbbf24' : '#10b981',
                                  cursor: canWriteUsers ? 'pointer' : 'not-allowed',
                                  opacity: canWriteUsers ? 1 : 0.4
                                }}
                              >
                                {u.is_active ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                              </button>

                              <button
                                disabled={!canWriteUsers}
                                onClick={() => canWriteUsers && handleDeleteUser(u)}
                                title={strings.users.table.btnDeleteTitle}
                                style={{
                                  padding: '6px 8px',
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: '#f87171',
                                  cursor: canWriteUsers ? 'pointer' : 'not-allowed',
                                  opacity: canWriteUsers ? 1 : 0.4
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
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
    </>
  ) : (
    <>
      {/* KPI Stats Row for Roles */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.roles.stats.totalRoles}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--heading-color)', marginTop: '4px' }}>
            {roles.length}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#c084fc' }}>{strings.roles.stats.systemRoles}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c084fc', marginTop: '4px' }}>
            {roles.filter((r) => r.is_system).length}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{strings.roles.stats.customRoles}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
            {roles.filter((r) => !r.is_system).length}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#10b981' }}>{strings.roles.stats.totalPerms}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
            {availablePermissions.length}
          </div>
        </div>
      </div>

      {/* Roles Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="#c084fc" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--heading-color)' }}>
              {strings.roles.headerTitle}
            </h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {strings.roles.headerSubtitle}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" data-testid="roles-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(15, 23, 42, 0.4)', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 18px' }}>{strings.roles.table.colName}</th>
                <th style={{ padding: '12px 18px' }}>{strings.roles.table.colDisplayName}</th>
                <th style={{ padding: '12px 18px' }}>{strings.roles.table.colDesc}</th>
                <th style={{ padding: '12px 18px' }}>{strings.roles.table.colType}</th>
                <th style={{ padding: '12px 18px' }}>{strings.roles.table.colPermCount}</th>
                <th style={{ padding: '12px 18px' }}>{strings.roles.table.colUserCount}</th>
                <th style={{ padding: '12px 18px' }}>{strings.roles.table.colCreatedAt}</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>{strings.roles.table.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {strings.common.noData}
                  </td>
                </tr>
              ) : (
                roles.map((r) => (
                  <tr 
                    key={r.id || r.name} 
                    data-testid={`role-row-${r.name}`}
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--heading-color)' }}>
                      <code>{r.name}</code>
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {r.display_name}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '300px' }}>
                      {r.description || '-'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {r.is_system ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', fontWeight: 600 }}>
                          <Shield size={11} />
                          {strings.roles.table.typeSystem}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: 600 }}>
                          {strings.roles.table.typeCustom}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', fontWeight: 600 }}>
                        {r.permissions?.includes('*') ? strings.roles.modal.selectAll : strings.roles.table.permCountUnit(r.permissions?.length || 0)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', borderRadius: '10px', background: (r.user_count || 0) > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.05)', color: (r.user_count || 0) > 0 ? '#38bdf8' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                        <Users size={12} />
                        {strings.roles.table.userCountUnit(r.user_count || 0)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn-icon"
                          data-testid={`role-btn-edit-${r.name}`}
                          disabled={!canManageRoles}
                          title={strings.roles.table.btnEdit}
                          onClick={() => canManageRoles && openEditRoleModal(r)}
                          style={{ color: '#38bdf8', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', cursor: canManageRoles ? 'pointer' : 'not-allowed', opacity: canManageRoles ? 1 : 0.35 }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-icon"
                          data-testid={`role-btn-delete-${r.name}`}
                          title={r.is_system ? strings.roles.table.systemRoleNoDelete : (r.user_count || 0) > 0 ? strings.roles.table.inUseNoDelete(r.user_count) : strings.roles.table.btnDelete}
                          disabled={!canManageRoles || r.is_system || (r.user_count || 0) > 0}
                          onClick={() => canManageRoles && handleDeleteRole(r)}
                          style={{
                            color: !canManageRoles || r.is_system || (r.user_count || 0) > 0 ? 'var(--text-muted)' : '#f43f5e',
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: !canManageRoles || r.is_system || (r.user_count || 0) > 0 ? 'transparent' : 'rgba(244, 63, 94, 0.1)',
                            border: !canManageRoles || r.is_system || (r.user_count || 0) > 0 ? '1px solid transparent' : '1px solid rgba(244, 63, 94, 0.25)',
                            cursor: !canManageRoles || r.is_system || (r.user_count || 0) > 0 ? 'not-allowed' : 'pointer',
                            opacity: !canManageRoles || r.is_system || (r.user_count || 0) > 0 ? 0.35 : 1
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )}

      {/* Modal 1: Create New User */}
      {isCreateModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="card"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '28px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)' }}>
                  {strings.users.modal.createTitle}
                </h3>
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.8rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={15} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.usernameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={strings.users.modal.usernamePlaceholder}
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.fullNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={strings.users.modal.fullNamePlaceholder}
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {strings.users.modal.emailLabel}
                </label>
                <input
                  type="email"
                  required
                  placeholder={strings.users.modal.emailPlaceholder}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.roleLabel}
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    {roles.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.display_name} ({r.name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.tenantLabel}
                  </label>
                  <select
                    disabled={newRole === 'SUPER_ADMIN'}
                    value={newTenantId}
                    onChange={(e) => setNewTenantId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem', opacity: newRole === 'SUPER_ADMIN' ? 0.5 : 1 }}
                  >
                    {tenants.map((t) => (
                      <option key={t.tenant_id} value={t.tenant_id}>
                        {t.name} ({t.department_code || t.tenant_id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.initPasswordLabel}
                  </label>
                  <input
                    type="password"
                    required
                    placeholder={strings.users.modal.initPasswordPlaceholder}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.confirmPasswordLabel}
                  </label>
                  <input
                    type="password"
                    required
                    placeholder={strings.users.modal.confirmPasswordPlaceholder}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {strings.users.modal.btnSubmitCreate}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Reset User Password */}
      {isResetPasswordModalOpen && targetUser && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '28px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--heading-color)' }}>
                  {strings.users.modal.resetPwTitle}
                </h3>
              </div>
              <button 
                onClick={() => setIsResetPasswordModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              {strings.users.modal.targetUserLabel(targetUser.username, targetUser.full_name)}
            </p>

            {modalError && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.8rem', marginBottom: '16px' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {strings.users.modal.newTempPasswordLabel}
                </label>
                <input
                  type="password"
                  required
                  placeholder={strings.users.modal.newTempPasswordPlaceholder}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {strings.users.modal.confirmPasswordLabel}
                </label>
                <input
                  type="password"
                  required
                  placeholder={strings.users.modal.confirmPasswordPlaceholder}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsResetPasswordModalOpen(false)}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {strings.users.modal.btnSubmitReset}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Edit User & Role / Tenant */}
      {isEditModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="card"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '28px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={20} color="#c084fc" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)' }}>
                  {strings.users.modal.editTitle}
                </h3>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.8rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={15} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateUser}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {strings.users.modal.usernameLabel}
                </label>
                <input
                  type="text"
                  disabled
                  value={editUsername}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'not-allowed' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  {strings.users.modal.readOnlyUsernameDesc}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.fullNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.emailLabel}
                  </label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.roleLabel}
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    disabled={currentUser?.id === editUserId && currentUser?.role === 'SUPER_ADMIN'}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    {roles.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.display_name} ({r.name})
                      </option>
                    ))}
                  </select>
                  {currentUser?.id === editUserId && currentUser?.role === 'SUPER_ADMIN' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', marginTop: '4px', display: 'block' }}>
                      {strings.users.modal.selfRoleNotice}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.users.modal.tenantLabel}
                  </label>
                  <select
                    disabled={editRole === 'SUPER_ADMIN'}
                    value={editTenantId}
                    onChange={(e) => setEditTenantId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem', opacity: editRole === 'SUPER_ADMIN' ? 0.5 : 1 }}
                  >
                    {tenants.map((t) => (
                      <option key={t.tenant_id} value={t.tenant_id}>
                        {t.name} ({t.department_code || t.tenant_id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  data-testid="users-btn-submit-edit"
                  style={{ background: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}
                >
                  {strings.users.modal.btnSubmitEdit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Create New Role */}
      {isCreateRoleModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="#c084fc" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--heading-color)' }}>
                  {strings.roles.modal.createTitle}
                </h3>
              </div>
              <button 
                className="btn-icon"
                onClick={() => setIsCreateRoleModalOpen(false)}
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {roleModalError && (
              <div 
                style={{
                  padding: '10px 14px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#f43f5e',
                  fontSize: '0.82rem',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertTriangle size={15} />
                <span>{roleModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRole}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.roles.modal.nameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="role-input-name"
                    placeholder={strings.roles.modal.namePlaceholder}
                    value={roleFormName}
                    onChange={(e) => setRoleFormName(e.target.value.toUpperCase())}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {strings.roles.modal.nameDesc}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.roles.modal.displayNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="role-input-display-name"
                    placeholder={strings.roles.modal.displayNamePlaceholder}
                    value={roleFormDisplayName}
                    onChange={(e) => setRoleFormDisplayName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {strings.roles.modal.descLabel}
                </label>
                <textarea
                  rows="2"
                  placeholder={strings.roles.modal.descPlaceholder}
                  value={roleFormDesc}
                  onChange={(e) => setRoleFormDesc(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Permissions Matrix */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--heading-color)' }}>
                    {strings.roles.modal.permissionsLabel} ({roleFormPermissions.length}/{availablePermissions.length})
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={selectAllPermissions}
                      style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 'var(--radius-sm)', color: '#38bdf8', cursor: 'pointer' }}
                    >
                      {strings.roles.modal.selectAll}
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllPermissions}
                      style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {strings.roles.modal.deselectAll}
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '12px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    {Object.entries(permissionsByCategory).map(([category, perms]) => (
                      <div key={category} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Shield size={12} />
                          <span>{category}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {perms.map((p) => {
                            const isChecked = roleFormPermissions.includes(p.code) || roleFormPermissions.includes('*');
                            return (
                              <label key={p.code} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.78rem' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(p.code)}
                                  style={{ marginTop: '2px' }}
                                />
                                <div>
                                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.name}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{p.description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateRoleModalOpen(false)}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  data-testid="roles-btn-submit-create"
                  style={{ background: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}
                >
                  {strings.roles.modal.btnSubmitCreate}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Edit Role & Permissions */}
      {isEditRoleModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--heading-color)' }}>
                  {strings.roles.modal.editTitle}
                </h3>
              </div>
              <button 
                className="btn-icon"
                onClick={() => setIsEditRoleModalOpen(false)}
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {roleModalError && (
              <div 
                style={{
                  padding: '10px 14px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#f43f5e',
                  fontSize: '0.82rem',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertTriangle size={15} />
                <span>{roleModalError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateRole}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.roles.modal.nameLabel}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={roleFormName}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: '0.85rem', fontFamily: 'monospace', cursor: 'not-allowed' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {strings.roles.modal.nameDesc}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {strings.roles.modal.displayNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="role-input-edit-display-name"
                    placeholder={strings.roles.modal.displayNamePlaceholder}
                    value={roleFormDisplayName}
                    onChange={(e) => setRoleFormDisplayName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {strings.roles.modal.descLabel}
                </label>
                <textarea
                  rows="2"
                  placeholder={strings.roles.modal.descPlaceholder}
                  value={roleFormDesc}
                  onChange={(e) => setRoleFormDesc(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Permissions Matrix */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--heading-color)' }}>
                    {strings.roles.modal.permissionsLabel} ({roleFormPermissions.length}/{availablePermissions.length})
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={selectAllPermissions}
                      style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 'var(--radius-sm)', color: '#38bdf8', cursor: 'pointer' }}
                    >
                      {strings.roles.modal.selectAll}
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllPermissions}
                      style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {strings.roles.modal.deselectAll}
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '12px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    {Object.entries(permissionsByCategory).map(([category, perms]) => (
                      <div key={category} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Shield size={12} />
                          <span>{category}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {perms.map((p) => {
                            const isChecked = roleFormPermissions.includes(p.code) || roleFormPermissions.includes('*');
                            return (
                              <label key={p.code} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.78rem' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(p.code)}
                                  style={{ marginTop: '2px' }}
                                />
                                <div>
                                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.name}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{p.description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsEditRoleModalOpen(false)}
                >
                  {strings.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  data-testid="roles-btn-submit-edit"
                  style={{ background: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}
                >
                  {strings.roles.modal.btnSubmitEdit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
