import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  GitFork, 
  KeyRound, 
  Coins, 
  ShieldAlert, 
  PackageCheck, 
  Sparkles,
  Layers,
  ChevronDown,
  Cpu,
  Compass,
  ScrollText
} from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  routingSubTab = 'routing', 
  setRoutingSubTab, 
  unreadPatchCount = 1 
}) {
  const [isRoutingExpanded, setIsRoutingExpanded] = useState(true);

  // Automatically expand accordion when routing tab is activated
  useEffect(() => {
    if (activeTab === 'routing') {
      setIsRoutingExpanded(true);
    }
  }, [activeTab]);

  const routingSubItems = [
    { id: 'routing', label: '라우팅 스튜디오', icon: GitFork },
    { id: 'catalog', label: '서빙 모델 풀', icon: Cpu },
    { id: 'dispatch', label: 'AgentRouter & 테스트', icon: Compass }
  ];

  const handleRoutingHeaderClick = () => {
    if (activeTab !== 'routing') {
      setActiveTab('routing');
      setIsRoutingExpanded(true);
    } else {
      setIsRoutingExpanded(!isRoutingExpanded);
    }
  };

  const handleSubItemClick = (subId, e) => {
    e.stopPropagation();
    setActiveTab('routing');
    if (setRoutingSubTab) {
      setRoutingSubTab(subId);
    }
  };

  const navItems = [
    { id: 'overview', label: '글로벌 관제 홈', icon: LayoutDashboard },
    { 
      id: 'routing', 
      label: '모델 & 라우팅', 
      icon: GitFork, 
      badge: 'Envoy L7',
      isAccordion: true,
      subItems: routingSubItems
    },
    { id: 'virtual-keys', label: '가상 API Key 거버넌스', icon: KeyRound },
    { id: 'system-prompts', label: '시스템 프롬프트 거버넌스', icon: ScrollText, badge: 'L7 주입' },
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
    <aside className="sidebar" data-testid="com-sidebar-nav" data-screen-id="SCR-COM-01">
      <div className="sidebar-header" data-testid="com-sidebar-brand">
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

          if (item.isAccordion) {
            return (
              <div key={item.id} className="nav-accordion-group" data-testid={`com-tab-group-${item.id}`}>
                <div
                  className={`nav-accordion-header ${isActive ? 'active' : ''}`}
                  onClick={handleRoutingHeaderClick}
                  data-testid={`com-tab-${item.id}`}
                  data-screen-id="SCR-RT-00"
                  title="클릭하여 모델 & 라우팅 하위 메뉴 펼치기/접기"
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="nav-badge info" style={{ marginRight: '6px' }}>
                      {item.badge}
                    </span>
                  )}
                  <div className={`nav-accordion-arrow ${isRoutingExpanded ? 'open' : ''}`}>
                    <ChevronDown size={15} />
                  </div>
                </div>

                {isRoutingExpanded && (
                  <div className="nav-sub-menu" data-testid="com-sidebar-routing-submenu">
                    {item.subItems.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = isActive && routingSubTab === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className={`nav-sub-item ${isSubActive ? 'active' : ''}`}
                          onClick={(e) => handleSubItemClick(sub.id, e)}
                          data-testid={`com-subtab-routing-${sub.id}`}
                        >
                          <SubIcon size={14} color={isSubActive ? 'var(--accent-cyan)' : 'currentColor'} />
                          <span>{sub.label}</span>
                          <span className="nav-sub-dot" style={{ marginLeft: 'auto' }}></span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              data-testid={`com-tab-${item.id}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge && (
                <span className={`nav-badge ${item.isAlertBadge ? '' : 'info'}`}>
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer" data-testid="com-sidebar-footer">
        <div className="sidebar-status-pill" data-testid="com-sidebar-status-pill">
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
