import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Server, 
  Bell, 
  Download, 
  RefreshCw, 
  ExternalLink, 
  Sun, 
  Moon, 
  Crosshair,
  Clock,
  LogOut,
  User
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Header({ 
  onOpenPatchTab, 
  unreadPatchCount = 1, 
  theme = 'dark', 
  onToggleTheme,
  isInspectorActive = false,
  onToggleInspector
}) {
  const { user, sessionRemaining, resetActivityTimer, logout } = useAuth();
  const [datacenterName, setDatacenterName] = useState(
    import.meta.env.VITE_DATACENTER_NAME || '온프레미스 주전산센터'
  );
  const [clusterRegion, setClusterRegion] = useState(
    import.meta.env.VITE_CLUSTER_REGION || 'DC-1 서울'
  );

  useEffect(() => {
    async function loadSystemInfo() {
      const info = await apiClient.getSystemInfo();
      if (info && info.datacenter_name) {
        setDatacenterName(info.datacenter_name);
      }
      if (info && info.cluster_region) {
        setClusterRegion(info.cluster_region);
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

  // Get user avatar abbreviation
  const getAvatarInitials = () => {
    if (!user) return 'ADM';
    if (user.role === 'SUPER_ADMIN') return 'SA';
    if (user.role === 'TENANT_ADMIN') return 'TA';
    return 'VW';
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
          <span className="status-dot"></span>
          <span>오케스트레이터 데이터 플레인 정상 가동 중</span>
        </div>

        {/* 통신 상태 컬러 범례 배지 */}
        <div 
          data-testid="com-header-badge-comm-legend"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '16px', padding: '4px 10px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '0.72rem' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>UI 통신 진단:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#F54927', fontWeight: 600 }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#F54927' }}></span>
            #F54927 (백엔드 미통신)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#5EF527', fontWeight: 600 }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#5EF527' }}></span>
            #5EF527 (백엔드 Mock/시뮬레이션)
          </span>
        </div>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* 30분 금융 보안 세션 타이머 배지 */}
        <div 
          data-testid="header-session-timer"
          title="금융 보안 기준 30분 미활동 자동 로그아웃 (클릭 시 세션 연장)"
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
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>연장</span>
        </div>

        {/* UI 식별자 인스펙터 토글 버튼 (Ctrl+Shift+D) */}
        <button
          className="theme-toggle-btn"
          data-testid="com-header-btn-inspector"
          data-function-id="FNC-COM-INSPECTOR"
          onClick={onToggleInspector}
          title={isInspectorActive ? 'UI 인스펙터 끄기 (Ctrl+Shift+D)' : 'UI 식별자 인스펙터 켜기 (Ctrl+Shift+D)'}
          aria-label="UI 식별자 인스펙터 토글"
          style={{
            borderColor: isInspectorActive ? '#a855f7' : 'var(--border-subtle)',
            background: isInspectorActive ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
            color: isInspectorActive ? '#c084fc' : 'var(--text-secondary)'
          }}
        >
          <Crosshair size={15} color={isInspectorActive ? '#c084fc' : '#94a3b8'} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {isInspectorActive ? '인스펙터 ON' : 'UI Inspector'}
          </span>
        </button>

        {/* 테마 토글 버튼 (Dark / Light) */}
        <button 
          className="theme-toggle-btn"
          data-testid="com-header-btn-theme"
          data-function-id="FNC-COM-THEME"
          onClick={onToggleTheme}
          title={theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}
          aria-label="컬러 테마 토글"
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

        {unreadPatchCount > 0 && (
          <button 
            className="header-action-btn"
            data-testid="com-header-btn-patch-alert"
            data-function-id="FNC-COM-OPEN-PATCH"
            style={{ borderColor: 'rgba(244, 63, 94, 0.4)', background: 'rgba(244, 63, 94, 0.1)', color: '#F54927' }}
            onClick={onOpenPatchTab}
          >
            <Bell size={14} color="#F54927" />
            <span style={{ color: '#F54927' }}>긴급 패치</span>
            <span style={{ background: '#f43f5e', color: 'white', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '999px', fontWeight: 700 }}>
              1
            </span>
          </button>
        )}

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
              {user?.full_name || '로그인 사용자'}
            </span>
            <span className="user-role" style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              {user?.tenant_name || (user?.role === 'SUPER_ADMIN' ? '전사 최고관리자' : user?.role || '사용자')}
            </span>
          </div>

          {/* Logout Button */}
          <button
            onClick={() => logout()}
            title="보안 로그아웃"
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

