import React, { useState, useEffect } from 'react';
import { ShieldCheck, Server, Bell, Download, RefreshCw, ExternalLink, Sun, Moon, Crosshair } from 'lucide-react';
import { apiClient } from '../api/client';

export default function Header({ 
  onOpenPatchTab, 
  unreadPatchCount = 1, 
  theme = 'dark', 
  onToggleTheme,
  isInspectorActive = false,
  onToggleInspector
}) {
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

      <div className="header-right">
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
            <span style={{ color: '#F54927' }}>벤더 긴급 핫픽스 대기 중</span>
            <span style={{ background: '#f43f5e', color: 'white', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '999px', fontWeight: 700 }}>
              1
            </span>
          </button>
        )}

        <div className="user-profile" data-testid="com-header-user-profile">
          <div className="user-avatar" style={{ color: '#F54927' }}>
            SRE
          </div>
          <div className="user-info">
            <span className="user-name" style={{ color: '#F54927' }}>홍길동 수석</span>
            <span className="user-role" style={{ color: '#F54927' }}>인프라운영팀 (Admin)</span>
          </div>
        </div>
      </div>
    </header>
  );
}
