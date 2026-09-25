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
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [routingSubTab, setRoutingSubTab] = useState('routing');
  const [unreadPatchCount, setUnreadPatchCount] = useState(1);
  const [toasts, setToasts] = useState([]);
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
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

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
      <div className="main-wrapper">
        <Header 
          onOpenPatchTab={() => setActiveTab('lifecycle')}
          unreadPatchCount={unreadPatchCount}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="page-content">
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
        </main>
      </div>

      {/* Global Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.type === 'SUCCESS' && <CheckCircle2 size={18} color="#34d399" />}
            {toast.type === 'ERROR' && <AlertTriangle size={18} color="#f43f5e" />}
            {toast.type === 'INFO' && <Info size={18} color="#38bdf8" />}
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
