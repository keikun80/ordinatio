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
  ShieldCheck,
  Sliders,
  Building
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { strings } from '../constants/strings';

export default function Sidebar({
  activeTab,
  setActiveTab,
  routingSubTab = 'routing',
  setRoutingSubTab,
  govSubTab = 'keys',
  setGovSubTab
}) {
  const { isSuperAdmin, hasPermission } = useAuth();
  const canAccessUsers = isSuperAdmin || hasPermission('users:read') || hasPermission('users:write');
  const canAccessRoles = isSuperAdmin || hasPermission('roles:manage');
  const canAccessSettings = isSuperAdmin || hasPermission('system:read') || hasPermission('system:write');
  const [isRoutingExpanded, setIsRoutingExpanded] = useState(true);
  const [isGovExpanded, setIsGovExpanded] = useState(true);
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
    } else if (activeTab === 'virtual-keys') {
      setIsGovExpanded(true);
    }
  }, [activeTab]);

  const routingSubItems = [
    { id: 'routing', label: strings.nav.menus.routingStudio, icon: GitFork },
    { id: 'catalog', label: strings.nav.menus.servingPool, icon: Cpu },
    { id: 'dispatch', label: strings.nav.menus.agentRouterDispatch, icon: Compass }
  ];

  const govSubItems = [
    { id: 'keys', label: strings.nav.menus.subKeyManagement || '가상 API Key 관리', icon: KeyRound },
    { id: 'tenants', label: strings.nav.menus.subTenantManagement || '부서(테넌트) 관리', icon: Building }
  ];

  const handleRoutingHeaderClick = () => {
    if (activeTab !== 'routing') {
      setActiveTab('routing');
      setIsRoutingExpanded(true);
    } else {
      setIsRoutingExpanded(!isRoutingExpanded);
    }
  };

  const handleGovHeaderClick = () => {
    if (activeTab !== 'virtual-keys') {
      setActiveTab('virtual-keys');
      setIsGovExpanded(true);
    } else {
      setIsGovExpanded(!isGovExpanded);
    }
  };

  const handleRoutingSubClick = (subId, e) => {
    e.stopPropagation();
    setActiveTab('routing');
    if (setRoutingSubTab) {
      setRoutingSubTab(subId);
    }
  };

  const handleGovSubClick = (subId, e) => {
    e.stopPropagation();
    setActiveTab('virtual-keys');
    if (setGovSubTab) {
      setGovSubTab(subId);
    }
  };

  const navItems = [
    ...(isSuperAdmin || hasPermission('overview:read') ? [
      { id: 'overview', label: strings.nav.menus.overview, icon: LayoutDashboard }
    ] : []),
    ...(isSuperAdmin || hasPermission('routing:read') ? [
      {
        id: 'routing',
        label: strings.nav.menus.modelRouting,
        icon: GitFork,
        isAccordion: true,
        isExpanded: isRoutingExpanded,
        onHeaderClick: handleRoutingHeaderClick,
        subItems: routingSubItems,
        activeSubId: routingSubTab,
        onSubClick: handleRoutingSubClick
      }
    ] : []),
    ...(isSuperAdmin || hasPermission('governance:read') ? [
      {
        id: 'virtual-keys',
        label: strings.nav.menus.virtualKeys,
        icon: KeyRound,
        isAccordion: true,
        isExpanded: isGovExpanded,
        onHeaderClick: handleGovHeaderClick,
        subItems: govSubItems,
        activeSubId: govSubTab,
        onSubClick: handleGovSubClick
      }
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
    ] : []),
    ...(canAccessSettings ? [
      { id: 'settings', label: '시스템 설정', icon: Sliders }
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
                  onClick={item.onHeaderClick || handleRoutingHeaderClick}
                  data-testid={`com-tab-${item.id}`}
                  data-screen-id={item.id === 'routing' ? 'SCR-RT-00' : 'SCR-VK-00'}
                  title={strings.nav.toggleSubmenuTooltip}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <div className={`nav-accordion-arrow ${item.isExpanded ? 'open' : ''}`} style={{ marginLeft: 'auto' }}>
                    <ChevronDown size={15} />
                  </div>
                </div>

                {item.isExpanded && (
                  <div className="nav-sub-menu" data-testid={`com-sidebar-${item.id}-submenu`}>
                    {item.subItems.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = isActive && item.activeSubId === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className={`nav-sub-item ${isSubActive ? 'active' : ''}`}
                          onClick={(e) => (item.onSubClick ? item.onSubClick(sub.id, e) : handleRoutingSubClick(sub.id, e))}
                          data-testid={`com-subtab-${item.id}-${sub.id}`}
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
