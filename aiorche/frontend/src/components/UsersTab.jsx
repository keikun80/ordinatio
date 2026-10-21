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
  AlertTriangle
} from 'lucide-react';

export default function UsersTab({ onNotify }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
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

  // Form state for Reset Password
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [userList, tenantList] = await Promise.all([
        apiClient.getUsers(),
        apiClient.getTenants()
      ]);
      setUsers(userList || []);
      setTenants(tenantList || []);
      if (tenantList && tenantList.length > 0 && !newTenantId) {
        setNewTenantId(tenantList[0].tenant_id);
      }
    } catch (err) {
      if (onNotify) onNotify('error', err.message || '사용자 목록 로드 실패');
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
      setModalError('모든 필수 항목을 입력해 주십시오.');
      return;
    }
    if (newPassword.length < 8) {
      setModalError('비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setModalError('비밀번호가 일치하지 않습니다.');
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

      if (onNotify) onNotify('success', `신규 사용자 '${newUsername}' 계정이 생성되었습니다.`);
      setIsCreateModalOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewEmail('');
      setNewPassword('');
      setConfirmPassword('');
      loadData();
    } catch (err) {
      setModalError(err.message || '사용자 생성에 실패했습니다.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!resetNewPassword || resetNewPassword.length < 8) {
      setModalError('신규 비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setModalError('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      await apiClient.resetUserPassword(targetUser.id, resetNewPassword);
      if (onNotify) onNotify('success', `'${targetUser.username}' 계정 비밀번호가 성공적으로 초기화되었습니다.`);
      setIsResetPasswordModalOpen(false);
      setTargetUser(null);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err) {
      setModalError(err.message || '비밀번호 초기화 실패');
    }
  };

  const handleUnlockAccount = async (u) => {
    try {
      await apiClient.updateUser(u.id, {
        is_active: true,
        unlock_account: true
      });
      if (onNotify) onNotify('success', `'${u.username}' 계정 잠금이 성공적으로 해제되었습니다.`);
      loadData();
    } catch (err) {
      if (onNotify) onNotify('error', err.message || '계정 잠금 해제 실패');
    }
  };

  const handleToggleActive = async (u) => {
    try {
      const nextActive = !u.is_active;
      await apiClient.updateUser(u.id, { is_active: nextActive });
      if (onNotify) onNotify('success', `'${u.username}' 계정 상태가 ${nextActive ? '활성화' : '비활성화'}되었습니다.`);
      loadData();
    } catch (err) {
      if (onNotify) onNotify('error', err.message || '계정 상태 변경 실패');
    }
  };

  const handleDeleteUser = async (u) => {
    if (u.id === currentUser?.id) {
      if (onNotify) onNotify('warning', '현재 로그인 중인 본인 계정은 삭제할 수 없습니다.');
      return;
    }
    if (!window.confirm(`정말로 사용자 '${u.username}' (${u.full_name}) 계정을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await apiClient.deleteUser(u.id);
      if (onNotify) onNotify('success', `'${u.username}' 계정이 삭제되었습니다.`);
      loadData();
    } catch (err) {
      if (onNotify) onNotify('error', err.message || '사용자 삭제 실패');
    }
  };

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
  const lockedCount = users.filter((u) => u.is_locked).length;

  return (
    <div className="tab-pane active" data-screen-id="SCR-ADM-01">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={24} color="#38bdf8" />
            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--heading-color)' }}>
              사용자 및 권한 관리 (RBAC)
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            폐쇄망 제어 평면 역할 기반 접근 통제(SUPER_ADMIN, TENANT_ADMIN, VIEWER) 및 세션 보안 관리
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn-secondary"
            onClick={loadData}
            title="새로고침"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>새로고침</span>
          </button>
          <button
            className="btn-primary"
            data-testid="users-btn-create-modal"
            onClick={() => {
              setModalError('');
              setIsCreateModalOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UserPlus size={16} />
            <span>신규 사용자 등록</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>총 등록 계정</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--heading-color)', marginTop: '4px' }}>
            {users.length}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#c084fc' }}>전사 최고 관리자 (Super)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c084fc', marginTop: '4px' }}>
            {superAdminCount}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>테넌트 관리자 (Tenant Admin)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
            {tenantAdminCount}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>일반 뷰어 (Viewer)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>
            {viewerCount}
          </div>
        </div>
        <div className="kpi-card card">
          <div style={{ fontSize: '0.75rem', color: lockedCount > 0 ? '#f43f5e' : '#10b981' }}>
            보안 잠금 계정 (Lockout)
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
              placeholder="사용자명, 성명, 이메일 검색..."
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
              <option value="ALL">모든 권한 역할</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN (전사 최고관리자)</option>
              <option value="TENANT_ADMIN">TENANT_ADMIN (부서 관리자)</option>
              <option value="VIEWER">VIEWER (조회 전용)</option>
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
                <th style={{ padding: '14px 18px' }}>사용자명 / 성명</th>
                <th style={{ padding: '14px 18px' }}>이메일</th>
                <th style={{ padding: '14px 18px' }}>권한 역할</th>
                <th style={{ padding: '14px 18px' }}>소속 테넌트</th>
                <th style={{ padding: '14px 18px' }}>계정 상태</th>
                <th style={{ padding: '14px 18px' }}>보안 잠금</th>
                <th style={{ padding: '14px 18px' }}>최종 로그인</th>
                <th style={{ padding: '14px 18px', textAlign: 'right' }}>관리 액션</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    사용자 계정 목록을 불러오는 중...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    조건에 일치하는 사용자가 없습니다.
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
                              본인
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
                        {u.role === 'SUPER_ADMIN' && (
                          <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.18)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', fontWeight: 600, fontSize: '0.75rem' }}>
                            SUPER_ADMIN
                          </span>
                        )}
                        {u.role === 'TENANT_ADMIN' && (
                          <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: 600, fontSize: '0.75rem' }}>
                            TENANT_ADMIN
                          </span>
                        )}
                        {u.role === 'VIEWER' && (
                          <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.25)', fontSize: '0.75rem' }}>
                            VIEWER
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {u.tenant_name ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Building2 size={13} color="var(--text-muted)" />
                            <span>{u.tenant_name}</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>전사 공통 (Global)</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {u.is_active ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '0.78rem' }}>
                            <CheckCircle2 size={13} />
                            <span>정상 활성</span>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontSize: '0.78rem' }}>
                            <XCircle size={13} />
                            <span>비활성</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {u.is_locked ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f43f5e', fontWeight: 600, fontSize: '0.78rem' }}>
                            <Lock size={13} />
                            <span>15분 잠금 ({u.failed_login_attempts}회 오류)</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            정상 ({u.failed_login_attempts || 0}/5)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '미접속'}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {u.is_locked && (
                            <button
                              onClick={() => handleUnlockAccount(u)}
                              title="계정 잠금 해제"
                              style={{
                                padding: '6px 10px',
                                background: 'rgba(244, 63, 94, 0.15)',
                                border: '1px solid rgba(244, 63, 94, 0.3)',
                                borderRadius: 'var(--radius-sm)',
                                color: '#f43f5e',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem'
                              }}
                            >
                              <Unlock size={13} />
                              <span>잠금 해제</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setModalError('');
                              setTargetUser(u);
                              setIsResetPasswordModalOpen(true);
                            }}
                            title="비밀번호 초기화"
                            style={{
                              padding: '6px 8px',
                              background: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              borderRadius: 'var(--radius-sm)',
                              color: '#38bdf8',
                              cursor: 'pointer'
                            }}
                          >
                            <KeyRound size={14} />
                          </button>

                          {!isCurrent && (
                            <>
                              <button
                                onClick={() => handleToggleActive(u)}
                                title={u.is_active ? '계정 비활성화' : '계정 활성화'}
                                style={{
                                  padding: '6px 8px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: u.is_active ? '#fbbf24' : '#10b981',
                                  cursor: 'pointer'
                                }}
                              >
                                {u.is_active ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u)}
                                title="사용자 삭제"
                                style={{
                                  padding: '6px 8px',
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: '#f87171',
                                  cursor: 'pointer'
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
                  신규 사용자 등록
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
                    사용자 ID (Username)*
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: kim-pb"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    성명 (Full Name)*
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 김철수 수석"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  사내 이메일 (Email)*
                </label>
                <input
                  type="email"
                  required
                  placeholder="예: chulsoo.kim@bank.corp"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    권한 역할 (Role)*
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="TENANT_ADMIN">TENANT_ADMIN (부서 관리자)</option>
                    <option value="VIEWER">VIEWER (조회 전용)</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN (전사 최고관리자)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    소속 테넌트 (부서)*
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
                    초기 비밀번호 (최소 8자)*
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="비밀번호 입력"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    비밀번호 확인*
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="비밀번호 재입력"
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
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  사용자 등록 완료
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
                  비밀번호 초기화
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
              대상 사용자: <strong>{targetUser.username}</strong> ({targetUser.full_name})
            </p>

            {modalError && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.8rem', marginBottom: '16px' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  신규 임시 비밀번호 (최소 8자)*
                </label>
                <input
                  type="password"
                  required
                  placeholder="새로운 비밀번호"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  비밀번호 확인*
                </label>
                <input
                  type="password"
                  required
                  placeholder="비밀번호 재입력"
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
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  비밀번호 변경
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
