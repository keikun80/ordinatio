import React, { useState, useEffect } from 'react';
import { 
  PackageCheck, 
  CheckCircle2, 
  Activity, 
  Download
} from 'lucide-react';
import { api } from '../api/client';
import { strings } from '../constants/strings';
import { useAuth } from '../context/AuthContext';

export default function LifecycleTab({ onNotify }) {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const canWriteLifecycle = isSuperAdmin || hasPermission('lifecycle:write');
  const [components, setComponents] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(true);

  // Diagnostics State
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [diagResults, setDiagResults] = useState(null);

  // Load components on mount
  const loadComponents = async () => {
    setLoadingComponents(true);
    const data = await api.getLifecycleComponents();
    if (data && data.components && data.components.length > 0) {
      setComponents(data.components.map(c => ({
        name: c.name,
        type: c.description,
        version: c.version,
        status: c.status
      })));
    } else {
      setComponents([]);
    }
    setLoadingComponents(false);
  };

  useEffect(() => {
    loadComponents();
  }, []);

  // Run Pre-flight System Diagnostics
  const handleRunDiagnostics = async () => {
    setIsRunningDiag(true);
    try {
      const res = await api.runLifecyclePreflight();
      setDiagResults(res.checks);
      onNotify('SUCCESS', strings.lifecycle.alerts.diagSuccess);
    } catch (err) {
      onNotify('ERROR', strings.lifecycle.alerts.diagFailed(err.message));
    } finally {
      setIsRunningDiag(false);
    }
  };

  // Generate and Download Zero-PII Support Bundle
  const handleDownloadSupportBundle = async () => {
    try {
      const res = await api.generateSupportBundle({
        include_diagnostics: true,
        include_system_metrics: true,
        include_routing_dump: true,
        requester_id: user?.username || 'admin'
      });

      const downloadUrl = api.getSupportBundleDownloadUrl(res.bundle_id);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = downloadUrl;
      downloadAnchor.setAttribute('download', res.bundle_filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);

      onNotify('SUCCESS', strings.lifecycle.alerts.bundleSuccess(res.bundle_filename));
    } catch (err) {
      onNotify('ERROR', strings.lifecycle.alerts.bundleFailed(err.message));
    }
  };

  return (
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>{strings.lifecycle.headerTitle}</h1>
          <p>{strings.lifecycle.headerSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {!canWriteLifecycle && (
            <span className="badge warning" style={{ fontSize: '0.78rem' }}>
              {strings.virtualKeys.readOnlyBadge}
            </span>
          )}
          <button className="btn btn-secondary" onClick={handleRunDiagnostics} disabled={isRunningDiag}>
            <Activity size={16} />
            <span>{isRunningDiag ? strings.lifecycle.diagnosticsRunning : strings.lifecycle.btnDiagnostics}</span>
          </button>
          <button
            className="btn btn-primary"
            disabled={!canWriteLifecycle}
            onClick={() => canWriteLifecycle && handleDownloadSupportBundle()}
            style={{ opacity: canWriteLifecycle ? 1 : 0.45, cursor: canWriteLifecycle ? 'pointer' : 'not-allowed' }}
          >
            <Download size={16} />
            <span>{strings.lifecycle.btnSupportBundle}</span>
          </button>
        </div>
      </div>

      {/* Diagnostics Result Card (if run) */}
      {diagResults && (
        <div className="card" style={{ marginBottom: '22px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div className="card-header" style={{ marginBottom: '10px' }}>
            <div className="card-title" style={{ color: '#34d399', fontSize: '0.95rem' }}>
              <CheckCircle2 size={18} />
              <span>{strings.lifecycle.diag.title}</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strings.lifecycle.diag.subtitle}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '0.8rem' }}>
            <div>PostgreSQL DB: <strong style={{ color: '#34d399' }}>{diagResults.postgres?.status} ({diagResults.postgres?.latency})</strong></div>
            <div>{strings.lifecycle.diag.redis} <strong style={{ color: '#34d399' }}>{diagResults.redis?.status} ({diagResults.redis?.latency})</strong></div>
            <div>{strings.lifecycle.diag.kafka} <strong style={{ color: '#34d399' }}>{diagResults.kafka?.status} ({diagResults.kafka?.latency})</strong></div>
            <div>{strings.lifecycle.diag.vllm} <strong style={{ color: '#34d399' }}>{diagResults.vllmEks?.status} ({diagResults.vllmEks?.latency})</strong></div>
            <div>{strings.lifecycle.diag.dcgm} <strong style={{ color: '#34d399' }}>{diagResults.dcgm?.status} ({diagResults.dcgm?.latency})</strong></div>
          </div>
        </div>
      )}

      {/* Component Version Matrix */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <PackageCheck size={18} color="#06b6d4" />
            <span>{strings.lifecycle.matrix.title}</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{strings.lifecycle.matrix.subtitle}</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{strings.lifecycle.matrix.colName}</th>
                <th>{strings.lifecycle.matrix.colRole}</th>
                <th>{strings.lifecycle.matrix.colVersion}</th>
                <th>{strings.lifecycle.matrix.colStatus}</th>
                <th>{strings.lifecycle.matrix.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: '#ffffff' }}>{c.name}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.type}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#38bdf8' }}>{c.version}</td>
                  <td>
                    {c.status.includes(strings.lifecycle.matrix.statusWarningKeyword) ? (
                      <span className="badge warning">🟡 {c.status}</span>
                    ) : (
                      <span className="badge active">🟢 {c.status}</span>
                    )}
                  </td>
                  <td>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => onNotify('INFO', strings.lifecycle.alerts.metaChecked(c.name))}
                    >
                      {strings.lifecycle.matrix.btnDetails}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
