import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import OverviewTab from './components/OverviewTab';
import RoutingTab from './components/RoutingTab';
import VirtualKeysTab from './components/VirtualKeysTab';
import FinOpsTab from './components/FinOpsTab';
import ComplianceTab from './components/ComplianceTab';
import LifecycleTab from './components/LifecycleTab';
import PromptStudioTab from './components/PromptStudioTab';
import SystemPromptsTab from './components/SystemPromptsTab';
import UsersTab from './components/UsersTab';
import LoginPage from './components/LoginPage';
import DevInspector from './components/DevInspector';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CheckCircle2, AlertTriangle, Info, X, Loader2 } from 'lucide-react';

function Dashboard() {
  const { isAuthenticated, isLoading, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [routingSubTab, setRoutingSubTab] = useState('routing');
  const [unreadPatchCount, setUnreadPatchCount] = useState(1);
  const [toasts, setToasts] = useState([]);
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('aiorche_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aiorche_theme', theme);
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
          폐쇄망 어플라이언스 보안 세션 초기화 중...
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
        unreadPatchCount={unreadPatchCount} 
      />

      {/* Main Wrapper */}
      <div className="main-wrapper" data-screen-id="SCR-COM-00">
        <Header 
          onOpenPatchTab={() => setActiveTab('lifecycle')}
          unreadPatchCount={unreadPatchCount}
          theme={theme}
          onToggleTheme={toggleTheme}
          isInspectorActive={isInspectorActive}
          onToggleInspector={() => setIsInspectorActive((prev) => !prev)}
        />

        <main className="page-content" data-testid="main-page-content">
          {activeTab === 'overview' && (
            <OverviewTab 
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'routing' && (
            <RoutingTab 
              activeSubTab={routingSubTab}
              setActiveSubTab={setRoutingSubTab}
              onNotify={addToast} 
            />
          )}

          {activeTab === 'virtual-keys' && (
            <VirtualKeysTab onNotify={addToast} />
          )}

          {activeTab === 'system-prompts' && (
            <SystemPromptsTab onNotify={addToast} />
          )}

          {activeTab === 'finops' && (
            <FinOpsTab onNotify={addToast} />
          )}

          {activeTab === 'compliance' && (
            <ComplianceTab onNotify={addToast} />
          )}

          {activeTab === 'lifecycle' && (
            <LifecycleTab 
              onNotify={addToast} 
              onPatchApplied={() => setUnreadPatchCount(0)}
            />
          )}

          {activeTab === 'prompt-studio' && (
            <PromptStudioTab onNotify={addToast} />
          )}

          {activeTab === 'users' && isSuperAdmin && (
            <UsersTab onNotify={addToast} />
          )}
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
      <Dashboard />
    </AuthProvider>
  );
}
