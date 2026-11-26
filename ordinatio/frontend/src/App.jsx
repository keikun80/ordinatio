import React, { useState, useEffect, lazy, Suspense } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './components/LoginPage';
import DevInspector from './components/DevInspector';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EntityProvider } from './context/EntityContext';
import { CheckCircle2, AlertTriangle, Info, X, Loader2 } from 'lucide-react';
import { strings } from './constants/strings';

const OverviewTab = lazy(() => import('./components/OverviewTab'));
const RoutingTab = lazy(() => import('./components/RoutingTab'));
const VirtualKeysTab = lazy(() => import('./components/VirtualKeysTab'));
const FinOpsTab = lazy(() => import('./components/FinOpsTab'));
const ComplianceTab = lazy(() => import('./components/ComplianceTab'));
const PromptStudioTab = lazy(() => import('./components/PromptStudioTab'));
const SystemPromptsTab = lazy(() => import('./components/SystemPromptsTab'));
const UsersTab = lazy(() => import('./components/UsersTab'));
const SystemSettingsTab = lazy(() => import('./components/SystemSettingsTab'));

function Dashboard() {
  const { user, isAuthenticated, isLoading, isSuperAdmin, hasPermission } = useAuth();
  const canAccessOverview = isSuperAdmin || hasPermission('overview:read');
  const canAccessRouting = isSuperAdmin || hasPermission('routing:read');
  const canAccessGovernance = isSuperAdmin || hasPermission('governance:read');
  const canAccessPrompts = isSuperAdmin || hasPermission('prompts:read');
  const canAccessFinops = isSuperAdmin || hasPermission('finops:read');
  const canAccessCompliance = isSuperAdmin || hasPermission('compliance:read');
  const canAccessStudio = isSuperAdmin || hasPermission('prompt_studio:execute');
  const canAccessUsers = isSuperAdmin || hasPermission('users:read') || hasPermission('users:write');
  const canAccessRoles = isSuperAdmin || hasPermission('roles:manage');
  const canAccessSettings = isSuperAdmin || hasPermission('system:read') || hasPermission('system:write');
  const [activeTab, setActiveTab] = useState('overview');
  const [routingSubTab, setRoutingSubTab] = useState('routing');
  const [govSubTab, setGovSubTab] = useState('keys');
  const [toasts, setToasts] = useState([]);
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('ordinatio_theme') || 'dark';
  });

  // Automatically fallback to the first permitted tab if current activeTab is not permitted for the logged-in user
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const tabPermMap = [
      { id: 'overview', ok: canAccessOverview },
      { id: 'routing', ok: canAccessRouting },
      { id: 'virtual-keys', ok: canAccessGovernance },
      { id: 'system-prompts', ok: canAccessPrompts },
      { id: 'finops', ok: canAccessFinops },
      { id: 'compliance', ok: canAccessCompliance },
      { id: 'prompt-studio', ok: canAccessStudio },
      { id: 'users', ok: canAccessUsers },
      { id: 'roles', ok: canAccessRoles },
      { id: 'settings', ok: canAccessSettings }
    ];
    const currentEntry = tabPermMap.find((t) => t.id === activeTab);
    if (!currentEntry || !currentEntry.ok) {
      const firstAllowed = tabPermMap.find((t) => t.ok);
      if (firstAllowed) {
        setActiveTab(firstAllowed.id);
      }
    }
  }, [isAuthenticated, user, activeTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ordinatio_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Trigger Toast Notification
  const addToast = (type, message) => {
    const id = Date.now();
    const normalizedType = type.toUpperCase();
    setToasts((prev) => [...prev, { id, type: normalizedType, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. Loading splash screen while session token is verified
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          gap: '16px'
        }}
      >
        <Loader2 size={36} color="#38bdf8" className="spin" />
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
          {strings.auth.sessionInitializing}
        </span>
      </div>
    );
  }

  // 2. Unauthenticated state -> render LoginPage
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // 3. Authenticated dashboard view
  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        routingSubTab={routingSubTab}
        setRoutingSubTab={setRoutingSubTab}
        govSubTab={govSubTab}
        setGovSubTab={setGovSubTab}
      />

      {/* Main Wrapper */}
      <div className="main-wrapper" data-screen-id="SCR-COM-00">
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          isInspectorActive={isInspectorActive}
          onToggleInspector={() => setIsInspectorActive((prev) => !prev)}
        />

        <main className="page-content" data-testid="main-page-content">
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '10px', color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="spin" color="var(--accent-cyan)" />
              <span>{strings.common.loading}</span>
            </div>
          }>
            {activeTab === 'overview' && canAccessOverview && (
              <OverviewTab
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'routing' && canAccessRouting && (
              <RoutingTab
                activeSubTab={routingSubTab}
                setActiveSubTab={setRoutingSubTab}
                onNotify={addToast}
              />
            )}

            {activeTab === 'virtual-keys' && canAccessGovernance && (
              <VirtualKeysTab
                activeSubTab={govSubTab}
                setActiveSubTab={setGovSubTab}
                onNotify={addToast}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'system-prompts' && canAccessPrompts && (
              <SystemPromptsTab
                onNotify={addToast}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'finops' && canAccessFinops && (
              <FinOpsTab onNotify={addToast} />
            )}

            {activeTab === 'compliance' && canAccessCompliance && (
              <ComplianceTab onNotify={addToast} />
            )}

            {activeTab === 'prompt-studio' && canAccessStudio && (
              <PromptStudioTab onNotify={addToast} />
            )}

            {((activeTab === 'users' && canAccessUsers) || (activeTab === 'roles' && canAccessRoles)) && (
              <UsersTab
                defaultSubTab={activeTab === 'roles' ? 'roles' : 'users'}
                onNotify={addToast}
              />
            )}

            {activeTab === 'settings' && canAccessSettings && (
              <SystemSettingsTab onNotify={addToast} />
            )}
          </Suspense>
        </main>
      </div>

      {/* Dev UI Inspector Overlay */}
      <DevInspector
        isActive={isInspectorActive}
        onToggle={() => setIsInspectorActive((prev) => !prev)}
      />

      {/* Global Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.type === 'SUCCESS' && <CheckCircle2 size={18} color="#34d399" />}
            {toast.type === 'ERROR' && <AlertTriangle size={18} color="#f43f5e" />}
            {toast.type === 'INFO' && <Info size={18} color="#38bdf8" />}
            {toast.type === 'WARNING' && <AlertTriangle size={18} color="#fbbf24" />}
            <span style={{ fontSize: '0.85rem', flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <EntityProvider>
        <Dashboard />
      </EntityProvider>
    </AuthProvider>
  );
}
