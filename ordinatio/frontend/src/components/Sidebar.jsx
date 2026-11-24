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
  ScrollText,
  Users,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { strings } from '../constants/strings';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  routingSubTab = 'routing', 
  setRoutingSubTab
}) {
  const { isSuperAdmin, hasPermission } = useAuth();
  const canAccessUsers = isSuperAdmin || hasPermission('users:read') || hasPermission('users:write');
  const canAccessRoles = isSuperAdmin || hasPermission('roles:manage');
  const [isRoutingExpanded, setIsRoutingExpanded] = useState(true);
  const [systemInfo, setSystemInfo] = useState(null);

  useEffect(() => {
    apiClient.getSystemInfo().then((info) => {
      if (info) setSystemInfo(info);
    });
  }, []);

  // Automatically expand accordion when routing tab is activated
  useEffect(() => {
    if (activeTab === 'routing') {
      setIsRoutingExpanded(true);
    }
  }, [activeTab]);

  const routingSubItems = [
    { id: 'routing', label: strings.nav.menus.routingStudio, icon: GitFork },
    { id: 'catalog', label: strings.nav.menus.servingPool, icon: Cpu },
    { id: 'dispatch', label: strings.nav.menus.agentRouterDispatch, icon: Compass }
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
    ...(isSuperAdmin || hasPermission('routing:read') ? [
      { 
        id: 'routing', 
        label: strings.nav.menus.modelRouting, 
        icon: GitFork, 
        isAccordion: true,
        subItems: routingSubItems
      }
    ] : []),
    ...(isSuperAdmin || hasPermission('governance:read') ? [
      { id: 'virtual-keys', label: strings.nav.menus.virtualKeys, icon: KeyRound }
    ] : []),
    ...(isSuperAdmin || hasPermission('prompts:read') ? [
      { id: 'system-prompts', label: strings.nav.menus.systemPrompts, icon: ScrollText }
    ] : []),
    ...(isSuperAdmin || hasPermission('finops:read') ? [
      { id: 'finops', label: strings.nav.menus.finops, icon: Coins }
    ] : []),
    ...(isSuperAdmin || hasPermission('compliance:read') ? [
      { id: 'compliance', label: strings.nav.menus.compliance, icon: ShieldAlert }
    ] : []),
    ...(isSuperAdmin || hasPermission('prompt_studio:execute') ? [
      { id: 'prompt-studio', label: strings.nav.menus.promptStudio, icon: Sparkles }
    ] : []),
    ...(canAccessUsers ? [
      { id: 'users', label: strings.nav.menus.users, icon: Users }
    ] : []),
    ...(canAccessRoles ? [
      { id: 'roles', label: strings.nav.menus.roles, icon: ShieldCheck }
    ] : [])
  ];

  return (
    <aside className="sidebar" data-testid="com-sidebar-nav" data-screen-id="SCR-COM-01">
      <div className="sidebar-header" data-testid="com-sidebar-brand">
        <div className="brand-badge">
          <Layers size={20} />
        </div>
        <div>
          <div className="brand-title">Ordinatio</div>
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
                  title={strings.nav.toggleSubmenuTooltip}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <div className={`nav-accordion-arrow ${isRoutingExpanded ? 'open' : ''}`} style={{ marginLeft: 'auto' }}>
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
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer" data-testid="com-sidebar-footer">
        <div className="sidebar-status-pill" data-testid="com-sidebar-status-pill">
          <span className="status-dot"></span>
          <span>{strings.nav.airgapMode}</span>
        </div>
        <div style={{ marginTop: '8px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          {strings.nav.solutionCoreVersionDynamic(systemInfo?.version, systemInfo?.license)}
        </div>
      </div>
    </aside>
  );
}
