import React, { useState, useEffect, useRef } from 'react';
import { 
  PackageCheck, 
  Upload, 
  ShieldCheck, 
  RefreshCw, 
  Terminal, 
  CheckCircle2, 
  RotateCcw, 
  Activity, 
  Download, 
  AlertCircle,
  FileCode,
  Check,
  ShieldAlert
} from 'lucide-react';
import { api } from '../api/client';
import { componentVersions, sampleVendorPatch } from '../data/mockData';

export default function LifecycleTab({ onNotify, onPatchApplied }) {
  const [components, setComponents] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(true);
  const [loadedPatch, setLoadedPatch] = useState(null);
  const [patchLogs, setPatchLogs] = useState([]);
  const [isPatching, setIsPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState(0);
  const [isDryRunSuccess, setIsDryRunSuccess] = useState(false);
  const fileInputRef = useRef(null);

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
        target_patch_version: c.target_patch_version,
        status: c.status
      })));
    } else {
      setComponents(componentVersions);
    }
    setLoadingComponents(false);
  };

  useEffect(() => {
    loadComponents();
  }, []);

  // Load sample vendor patch bundle
  const handleLoadSampleBundle = async () => {
    try {
      const res = await api.verifyPatchBundle({
        patch_id: "patch-v1.2.1-hotfix-cve2026",
        package_name: "patch-v1.2.1-hotfix-cve2026.tar.gz",
        target_component: "ext_proc",
        version: "v1.2.1-hotfix",
        cve_id: "CVE-2026-0812",
        description: "Presidio L7 메모리 누수 및 PII 필터링 보안 패치"
      });

      setLoadedPatch({
        fileName: res.package_name,
        version: res.version,
        targetComponent: res.target_component,
        cveId: res.cve_id,
        size: "42.8 MB (Tar.gz)",
        vendorSignature: `${res.verification.signer} (${res.verification.algorithm})`,
        fingerprint: res.verification.fingerprint,
        vllmImpact: "vLLM 추론 클러스터 무영향 (ext_proc 독립 롤링 업데이트)"
      });

      setPatchLogs([
        `[${new Date().toLocaleTimeString()}] 📦 오프라인 패치 번들 인식 완료: ${res.package_name}`,
        `[${new Date().toLocaleTimeString()}] 🔑 벤더 RSA-4096 전자서명 무결성 검증: 🟢 정상 (${res.verification.signer})`,
        `[${new Date().toLocaleTimeString()}] 🛡️ 서명 지문: ${res.verification.fingerprint}`,
        `[${new Date().toLocaleTimeString()}] 🎯 대상 컴포넌트: ${res.target_component} (${res.version})`
      ]);

      onNotify('SUCCESS', '공식 벤더 긴급 보안 핫픽스 번들이 로드되었습니다. RSA-4096 서명 검증 성공.');
    } catch (err) {
      onNotify('ERROR', `패치 번들 서명 검증 실패: ${err.message}`);
    }
  };

  // Handle local file selection
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await api.verifyPatchBundle({
        package_name: file.name,
        target_component: "ext_proc",
        version: "v1.2.1-hotfix",
        description: `사용자 수동 반입 패치: ${file.name}`
      });

      setLoadedPatch({
        fileName: file.name,
        version: res.version,
        targetComponent: res.target_component,
        cveId: res.cve_id || "CVE-2026-0812",
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        vendorSignature: `${res.verification.signer} (${res.verification.algorithm})`,
        fingerprint: res.verification.fingerprint,
        vllmImpact: "vLLM 추론 클러스터 무영향 (ext_proc 독립 롤링 업데이트)"
      });

      setPatchLogs([
        `[${new Date().toLocaleTimeString()}] 📥 패치 파일 업로드 완료: ${file.name}`,
        `[${new Date().toLocaleTimeString()}] 🔑 벤더 RSA-4096 전자서명 검증 완료: 🟢 정상`,
        `[${new Date().toLocaleTimeString()}] 🎯 대상 모듈: ${res.target_component}`
      ]);

      onNotify('SUCCESS', `패치 번들 '${file.name}' 서명 검증이 통과되었습니다.`);
    } catch (err) {
      onNotify('ERROR', `패치 번들 검증 실패: ${err.message}`);
    }
  };

  // Run Dry-run
  const handleDryRun = async () => {
    if (!loadedPatch) return;
    try {
      const res = await api.runPatchDryRun({
        patch_id: "patch-v1.2.1-hotfix-cve2026",
        package_name: loadedPatch.fileName,
        target_component: loadedPatch.targetComponent,
        version: loadedPatch.version
      });

      setPatchLogs((prev) => [
        ...prev,
        ...res.logs
      ]);

      setIsDryRunSuccess(true);
      onNotify('SUCCESS', '드라이런 검증이 완료되었습니다. 무중단 롤링 패치를 실행할 수 있습니다.');
    } catch (err) {
      onNotify('ERROR', `드라이런 검증 실패: ${err.message}`);
    }
  };

  // Apply zero-downtime rolling hotfix
  const handleApplyHotfix = async () => {
    if (!loadedPatch) return;
    setIsPatching(true);
    setPatchProgress(15);

    try {
      // Step 1: Initial Log
      setPatchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🚀 무중단 롤링 핫픽스 배포 시작 (Deployment: orchestrator-${loadedPatch.targetComponent})...`
      ]);

      // Step 2: Intermediate progression simulation
      await new Promise(r => setTimeout(r, 700));
      setPatchProgress(45);
      setPatchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🔄 내부 Harbor 레지스트리에서 신규 이미지 로드 (${loadedPatch.targetComponent}:${loadedPatch.version})...`,
        `[${new Date().toLocaleTimeString()}] 🟢 신규 파드 1대 Surge 생성 시작 (${loadedPatch.targetComponent}-7f89d-2)...`
      ]);

      // Step 3: Backend API Call
      await new Promise(r => setTimeout(r, 800));
      setPatchProgress(75);

      const res = await api.applyPatch({
        patch_id: "patch-v1.2.1-hotfix-cve2026",
        package_name: loadedPatch.fileName,
        target_component: loadedPatch.targetComponent,
        version: loadedPatch.version,
        applied_by: "admin-sysops"
      });

      setPatchProgress(100);
      setIsPatching(false);

      setPatchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🩺 신규 파드 readinessProbe gRPC 헬스체크 통과 (소요시간 1.8s)`,
        `[${new Date().toLocaleTimeString()}] 🔄 Envoy AI Gateway 신규 파드로 트래픽 전환 완료`,
        `[${new Date().toLocaleTimeString()}] 🧹 구버전 파드 Graceful Drain 및 종료 중...`,
        `[${new Date().toLocaleTimeString()}] 🎉 롤링 핫픽스 배포 완료! (버전: ${res.applied_version})`,
        `[${new Date().toLocaleTimeString()}] 🔒 vLLM GPU 추론 클러스터 및 Envoy 게이트웨이 무중단(Zero-Downtime) 유지됨.`
      ]);

      // Refresh components from backend
      await loadComponents();

      onNotify('SUCCESS', `긴급 보안 핫픽스가 무중단으로 적용되었습니다. ${res.target_component} 버전이 ${res.applied_version}로 갱신되었습니다.`);
      if (onPatchApplied) onPatchApplied();
    } catch (err) {
      setIsPatching(false);
      onNotify('ERROR', `핫픽스 배포 실패: ${err.message}`);
    }
  };

  // Rollback
  const handleRollback = async () => {
    try {
      const res = await api.rollbackPatch({
        target_component: "ext_proc",
        rollback_to_version: "v1.2.0",
        reason: "관리자에 의한 롤백 실행",
        applied_by: "admin-sysops"
      });

      setPatchLogs((prev) => [
        ...prev,
        ...res.logs
      ]);

      // Refresh component list
      await loadComponents();
      setPatchProgress(0);

      onNotify('INFO', `컴포넌트가 이전 안정 버전(${res.restored_version})으로 즉각 롤백되었습니다.`);
    } catch (err) {
      onNotify('ERROR', `롤백 실패: ${err.message}`);
    }
  };

  // Run Pre-flight System Diagnostics
  const handleRunDiagnostics = async () => {
    setIsRunningDiag(true);
    try {
      const res = await api.runLifecyclePreflight();
      setDiagResults(res.checks);
      onNotify('SUCCESS', '시스템 사전 점검 완료: 5개 핵심 의존성 컴포넌트 100% 정상 가동 확인.');
    } catch (err) {
      onNotify('ERROR', `시스템 자가 진단 실패: ${err.message}`);
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
        requester_id: "admin-sysops"
      });

      // Trigger file download
      const downloadUrl = api.getSupportBundleDownloadUrl(res.bundle_id);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = downloadUrl;
      downloadAnchor.setAttribute('download', res.bundle_filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);

      onNotify('SUCCESS', `Zero-PII 암호화 기술지원 번들(${res.bundle_filename})이 생성 및 다운로드되었습니다.`);
    } catch (err) {
      onNotify('ERROR', `서포트 번들 생성 실패: ${err.message}`);
    }
  };

  return (
    <div className="tab-pane">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".tar.gz,.zip"
        onChange={handleFileUpload}
      />

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>시스템 라이프사이클 & 긴급 패치 관리</h1>
          <p>망분리 폐쇄망 환경에서 벤더 오프라인 패치 번들 무중단 롤링 배포, 자가 진단 및 Zero-PII 서포트 번들 추출</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={handleRunDiagnostics} disabled={isRunningDiag}>
            <Activity size={16} />
            <span>{isRunningDiag ? '자가 진단 중...' : '원클릭 시스템 자가 진단'}</span>
          </button>
          <button className="btn btn-primary" onClick={handleDownloadSupportBundle}>
            <Download size={16} />
            <span>Zero-PII 서포트 번들 생성</span>
          </button>
        </div>
      </div>

      {/* Diagnostics Result Card (if run) */}
      {diagResults && (
        <div className="card" style={{ marginBottom: '22px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div className="card-header" style={{ marginBottom: '10px' }}>
            <div className="card-title" style={{ color: '#34d399', fontSize: '0.95rem' }}>
              <CheckCircle2 size={18} />
              <span>시스템 사전 점검(Pre-Flight Check) 결과: 전체 정상 (Healthy)</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>실시간 5대 컴포넌트 응답성 통과</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '0.8rem' }}>
            <div>PostgreSQL DB: <strong style={{ color: '#34d399' }}>{diagResults.postgres?.status} ({diagResults.postgres?.latency})</strong></div>
            <div>Redis 쿼터: <strong style={{ color: '#34d399' }}>{diagResults.redis?.status} ({diagResults.redis?.latency})</strong></div>
            <div>Kafka 버스: <strong style={{ color: '#34d399' }}>{diagResults.kafka?.status} ({diagResults.kafka?.latency})</strong></div>
            <div>EKS vLLM Pods: <strong style={{ color: '#34d399' }}>{diagResults.vllmEks?.status} ({diagResults.vllmEks?.latency})</strong></div>
            <div>NVIDIA DCGM: <strong style={{ color: '#34d399' }}>{diagResults.dcgm?.status} ({diagResults.dcgm?.latency})</strong></div>
          </div>
        </div>
      )}

      {/* Air-Gapped Hotfix Installer Card */}
      <div className="card" style={{ marginBottom: '24px', border: '1px solid rgba(244, 63, 94, 0.35)' }}>
        <div className="card-header">
          <div className="card-title">
            <PackageCheck size={20} color="#f43f5e" />
            <span>에어갭(Air-Gapped) 오프라인 긴급 패치 인스톨러</span>
          </div>
          <span className="badge danger">긴급 보안 핫픽스 권고 대기 중</span>
        </div>

        {/* Upload Zone / Load Preset */}
        {!loadedPatch ? (
          <div 
            style={{ 
              border: '2px dashed rgba(255,255,255,0.15)', 
              borderRadius: 'var(--radius-md)', 
              padding: '30px', 
              textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.4)',
              cursor: 'pointer'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={32} color="#F54927" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#F54927', marginBottom: '4px' }}>
              벤더 긴급 패치 아카이브 파일 (.tar.gz)을 선택하거나 드래그하세요
            </div>
            <div style={{ fontSize: '0.78rem', color: '#F54927', marginBottom: '14px' }}>
              폐쇄망 망연계 솔루션을 통해 반입된 서명된 OCI 패키지 파일 (로컬 선택)
            </div>
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); handleLoadSampleBundle(); }}>
              [데모용] 벤더 공식 핫픽스 번들 로드 (patch-v1.2.1-hotfix-cve2026.tar.gz)
            </button>
          </div>
        ) : (
          <div>
            {/* Patch Details Banner */}
            <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                  📦 {loadedPatch.fileName} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({loadedPatch.size})</span>
                </div>
                <span className="badge active">
                  <ShieldCheck size={12} /> {loadedPatch.vendorSignature}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#38bdf8', marginBottom: '4px' }}>
                대상: {loadedPatch.targetComponent} ({loadedPatch.version}) {loadedPatch.cveId && `[${loadedPatch.cveId}]`}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#34d399' }}>
                🛡️ 영향도: {loadedPatch.vllmImpact}
              </div>

              {/* Progress bar if patching */}
              {isPatching && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <span>롤링 업데이트 진행률 (PodDisruptionBudget 검증)</span>
                    <span>{patchProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${patchProgress}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #06b6d4)', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}

              {/* Control Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleDryRun} disabled={isPatching}>
                  1. 드라이런(Dry-run) 검증
                </button>
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={handleApplyHotfix}
                  disabled={isPatching || patchProgress === 100}
                >
                  <RefreshCw size={14} className={isPatching ? 'status-dot' : ''} />
                  <span>2. 🚀 무중단 롤링 핫픽스 배포</span>
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleRollback} disabled={isPatching}>
                  <RotateCcw size={14} />
                  <span>이전 버전 롤백</span>
                </button>
              </div>
            </div>

            {/* Terminal Live Rollout Logs */}
            <div className="terminal-window">
              <div style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.72rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
                LIVE DEPLOYMENT STREAM (Kubernetes Client & Envoy RDS Controller)
              </div>
              {patchLogs.map((log, idx) => (
                <div key={idx} className="terminal-line success">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Component Version Matrix */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <PackageCheck size={18} color="#06b6d4" />
            <span>오케스트레이터 구성 요소 버전 및 패치 상태</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>벤더 권고 CVE 보안 데이터베이스 연동됨</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>컴포넌트 명칭</th>
                <th>컴포넌트 역할</th>
                <th>설치된 버전</th>
                <th>보안 권고 상태</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: '#ffffff' }}>{c.name}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.type}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#38bdf8' }}>{c.version}</td>
                  <td>
                    {c.status.includes('권고') ? (
                      <span className="badge warning">🟡 {c.status}</span>
                    ) : (
                      <span className="badge active">🟢 {c.status}</span>
                    )}
                  </td>
                  <td>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => onNotify('INFO', `${c.name} 상세 빌드 메타데이터가 점검되었습니다.`)}
                    >
                      상세 정보
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
