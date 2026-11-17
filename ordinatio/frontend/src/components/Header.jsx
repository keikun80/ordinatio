import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Sun, 
  Moon, 
  Crosshair,
  Clock,
  LogOut
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { strings } from '../constants/strings';

export default function Header({ 
  theme = 'dark', 
  onToggleTheme,
  isInspectorActive = false,
  onToggleInspector
}) {
  const { user, sessionRemaining, resetActivityTimer, logout } = useAuth();
  const [datacenterName, setDatacenterName] = useState(
    import.meta.env.VITE_DATACENTER_NAME || strings.nav.defaultDatacenter
  );
  const [clusterRegion, setClusterRegion] = useState(
    import.meta.env.VITE_CLUSTER_REGION || strings.nav.defaultRegion
  );
  const [dataPlaneHealthy, setDataPlaneHealthy] = useState(true);

  useEffect(() => {
    async function loadSystemInfo() {
      const info = await apiClient.getSystemInfo();
      if (info) {
        if (info.datacenter_name) setDatacenterName(info.datacenter_name);
        if (info.cluster_region) setClusterRegion(info.cluster_region);
        if (typeof info.data_plane_healthy === 'boolean') {
          setDataPlaneHealthy(info.data_plane_healthy);
        }
      }
    }
    loadSystemInfo();
  }, []);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const isLowTime = sessionRemaining <= 300; // Under 5 minutes

  // Dynamically derive user avatar abbreviation for any system or custom role
  const getAvatarInitials = () => {
    if (!user) return 'USR';
    if (user.role === 'SUPER_ADMIN') return 'SA';
    if (user.role === 'TENANT_ADMIN') return 'TA';
    if (user.role === 'VIEWER') return 'VW';
    if (user.role) {
      const parts = user.role.split('_').filter(Boolean);
      if (parts.length >= 2) {
        return parts.map((p) => p[0]).join('').slice(0, 3).toUpperCase();
      }
      return user.role.slice(0, 2).toUpperCase();
    }
    return (user.username || 'US').slice(0, 2).toUpperCase();
  };

  return (
    <header className="top-header" data-testid="com-header-bar" data-screen-id="SCR-COM-02">
      <div className="header-left">
        <div className="env-tag" data-testid="com-header-badge-env">
          <Server size={14} color="#38bdf8" />
          <span>{datacenterName} ({clusterRegion})</span>
        </div>
        <div 
          data-testid="com-header-badge-status"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
        >
          <span className={`status-dot ${dataPlaneHealthy ? '' : 'warning'}`}></span>
          <span>{dataPlaneHealthy ? strings.nav.dataPlaneHealthy : strings.nav.dataPlaneUnhealthy}</span>
        </div>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* 30분 금융 보안 세션 타이머 배지 */}
        <div 
          data-testid="header-session-timer"
          title={strings.auth.sessionTimerTooltip}
          onClick={resetActivityTimer}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: 'var(--radius-md)',
            background: isLowTime ? 'rgba(239, 68, 68, 0.15)' : 'rgba(15, 23, 42, 0.5)',
            border: `1px solid ${isLowTime ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)'}`,
            color: isLowTime ? '#f87171' : 'var(--text-secondary)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <Clock size={13} color={isLowTime ? '#f87171' : '#38bdf8'} />
          <span>⏱ {formatTimer(sessionRemaining)}</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>{strings.common.extend}</span>
        </div>

        {/* UI 식별자 인스펙터 토글 버튼 (Ctrl+Shift+D) */}
        <button
          className="theme-toggle-btn"
          data-testid="com-header-btn-inspector"
          data-function-id="FNC-COM-INSPECTOR"
          onClick={onToggleInspector}
          title={isInspectorActive ? strings.nav.inspectorTooltipOn : strings.nav.inspectorTooltipOff}
          aria-label={strings.nav.inspectorToggle}
          style={{
            borderColor: isInspectorActive ? '#a855f7' : 'var(--border-subtle)',
            background: isInspectorActive ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
            color: isInspectorActive ? '#c084fc' : 'var(--text-secondary)'
          }}
        >
          <Crosshair size={15} color={isInspectorActive ? '#c084fc' : '#94a3b8'} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {isInspectorActive ? strings.nav.inspectorOn : strings.nav.inspectorOff}
          </span>
        </button>

        {/* 테마 토글 버튼 (Dark / Light) */}
        <button 
          className="theme-toggle-btn"
          data-testid="com-header-btn-theme"
          data-function-id="FNC-COM-THEME"
          onClick={onToggleTheme}
          title={theme === 'dark' ? strings.nav.themeLightTooltip : strings.nav.themeDarkTooltip}
          aria-label={strings.nav.themeToggle}
        >
          <span className="theme-toggle-icon">
            {theme === 'dark' ? (
              <Sun size={15} color="#fbbf24" />
            ) : (
              <Moon size={15} color="#6366f1" />
            )}
          </span>
          <span style={{ textTransform: 'capitalize' }}>
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>

        {/* Dynamic Authenticated User Profile */}
        <div className="user-profile" data-testid="com-header-user-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div 
            className="user-avatar" 
            style={{ 
              color: user?.role === 'SUPER_ADMIN' ? '#c084fc' : '#38bdf8',
              background: user?.role === 'SUPER_ADMIN' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(56, 189, 248, 0.15)',
              border: `1px solid ${user?.role === 'SUPER_ADMIN' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`
            }}
          >
            {getAvatarInitials()}
          </div>
          <div className="user-info">
            <span className="user-name" style={{ color: 'var(--heading-color)', fontWeight: 600 }}>
              {user?.full_name || strings.nav.defaultUser}
            </span>
            <span className="user-role" style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              {user?.tenant_name || (user?.role === 'SUPER_ADMIN' ? strings.nav.superAdminRole : user?.role || strings.nav.defaultUser)}
            </span>
          </div>

          {/* Logout Button */}
          <button
            onClick={() => logout()}
            title={strings.auth.logoutTooltip}
            data-testid="header-btn-logout"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              marginLeft: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s ease, background 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'none';
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

