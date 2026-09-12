import React from 'react';
import { 
  LayoutDashboard, 
  GitFork, 
  KeyRound, 
  Coins, 
  ShieldAlert, 
  PackageCheck, 
  Sparkles,
  Layers
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, unreadPatchCount = 1 }) {
  const navItems = [
    { id: 'overview', label: '글로벌 관제 홈', icon: LayoutDashboard },
    { id: 'routing', label: '모델 & 라우팅 스튜디오', icon: GitFork, badge: 'Envoy L7' },
    { id: 'virtual-keys', label: '가상 API Key 거버넌스', icon: KeyRound },
    { id: 'finops', label: 'FinOps 비용 & 예산', icon: Coins },
    { id: 'compliance', label: 'PII 보안 & 감사 포렌식', icon: ShieldAlert },
    { 
      id: 'lifecycle', 
      label: '긴급 패치 & 자가진단', 
      icon: PackageCheck, 
      badge: unreadPatchCount > 0 ? '패치 권고' : null,
      isAlertBadge: unreadPatchCount > 0 
    },
    { id: 'prompt-studio', label: '프롬프트 스튜디오', icon: Sparkles }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-badge">
          <Layers size={20} />
        </div>
        <div>
          <div className="brand-title">AI Orchestrator</div>
          <div className="brand-subtitle">Enterprise Admin</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} color="#F54927" />
              <span style={{ color: '#F54927' }}>{item.label}</span>
              {item.badge && (
                <span className={`nav-badge ${item.isAlertBadge ? '' : 'info'}`} style={{ color: '#F54927', borderColor: '#F54927' }}>
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status-pill">
          <span className="status-dot"></span>
          <span>에어갭 자체 운영 모드</span>
        </div>
        <div style={{ marginTop: '8px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          솔루션 코어 v1.2.0 | Apache 2.0
        </div>
      </div>
    </aside>
  );
}
