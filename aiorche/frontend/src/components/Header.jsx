import React from 'react';
import { ShieldCheck, Server, Bell, Download, RefreshCw, ExternalLink } from 'lucide-react';

export default function Header({ onOpenGrafana, onOpenPatchTab, unreadPatchCount = 1 }) {
  return (
    <header className="top-header">
      <div className="header-left">
        <div className="env-tag">
          <Server size={14} />
          <span>온프레미스 주전산센터 (DC-1 서울)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span className="status-dot"></span>
          <span>오케스트레이터 데이터 플레인 정상 가동 중</span>
        </div>
      </div>

      <div className="header-right">
        {unreadPatchCount > 0 && (
          <button 
            className="header-action-btn"
            style={{ borderColor: 'rgba(244, 63, 94, 0.4)', background: 'rgba(244, 63, 94, 0.1)', color: '#fda4af' }}
            onClick={onOpenPatchTab}
          >
            <Bell size={14} color="#f43f5e" />
            <span>벤더 긴급 핫픽스 대기 중</span>
            <span style={{ background: '#f43f5e', color: 'white', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '999px', fontWeight: 700 }}>
              1
            </span>
          </button>
        )}

        <button className="header-action-btn" onClick={onOpenGrafana} title="Grafana 전문 대시보드 열기">
          <ExternalLink size={14} color="#38bdf8" />
          <span>Grafana 관제</span>
        </button>

        <div className="user-profile">
          <div className="user-avatar">
            SRE
          </div>
          <div className="user-info">
            <span className="user-name">홍길동 수석</span>
            <span className="user-role">인프라운영팀 (Admin)</span>
          </div>
        </div>
      </div>
    </header>
  );
}
