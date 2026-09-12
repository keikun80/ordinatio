import React, { useState, useEffect } from 'react';
import { ShieldCheck, Server, Bell, Download, RefreshCw, ExternalLink } from 'lucide-react';
import { apiClient } from '../api/client';

export default function Header({ onOpenPatchTab, unreadPatchCount = 1 }) {
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
    <header className="top-header">
      <div className="header-left">
        <div className="env-tag">
          <Server size={14} color="#38bdf8" />
          <span>{datacenterName} ({clusterRegion})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span className="status-dot"></span>
          <span>오케스트레이터 데이터 플레인 정상 가동 중</span>
        </div>

        {/* 통신 상태 컬러 범례 배지 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '16px', padding: '4px 10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem' }}>
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
        {unreadPatchCount > 0 && (
          <button 
            className="header-action-btn"
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

        <div className="user-profile">
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
