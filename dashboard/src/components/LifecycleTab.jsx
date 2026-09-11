import React, { useState } from 'react';
import { PackageCheck, Upload, ShieldCheck, RefreshCw, Terminal, CheckCircle2, RotateCcw, Activity, Download, AlertCircle } from 'lucide-react';
import { componentVersions, sampleVendorPatch } from '../data/mockData';

export default function LifecycleTab({ onNotify, onPatchApplied }) {
  const [components, setComponents] = useState(componentVersions);
  const [loadedPatch, setLoadedPatch] = useState(null);
  const [patchLogs, setPatchLogs] = useState([]);
  const [isPatching, setIsPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState(0);
  const [isDryRunSuccess, setIsDryRunSuccess] = useState(false);

  // Diagnostics State
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [diagResults, setDiagResults] = useState(null);

  // Load sample vendor patch bundle
  const handleLoadSampleBundle = () => {
    setLoadedPatch(sampleVendorPatch);
    setPatchLogs([
      `[${new Date().toLocaleTimeString()}] 📦 오프라인 패치 번들 인식 완료: ${sampleVendorPatch.fileName}`,
      `[${new Date().toLocaleTimeString()}] 🔑 벤더 RSA-4096 전자서명 무결성 검증: 🟢 정상 (공식 릴리즈 키 확인됨)`,
      `[${new Date().toLocaleTimeString()}] 🎯 대상 컴포넌트: ${sampleVendorPatch.targetComponent}`
    ]);
    onNotify('INFO', '벤더 긴급 보안 핫픽스 번들이 로드되었습니다. 서명 검증 성공.');
  };

  // Run Dry-run
  const handleDryRun = () => {
    setPatchLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🧪 드라이런(Dry-Run) 시작: K8s 매니페스트 및 DB 마이그레이션 호환성 검사...`,
      `[${new Date().toLocaleTimeString()}] 🧪 PodDisruptionBudget (minAvailable: 2) 충족 여부 확인... 정상`,
      `[${new Date().toLocaleTimeString()}] 🧪 gRPC :9002 readinessProbe 스키마 검사... 정상`,
      `[${new Date().toLocaleTimeString()}] ✅ 드라이런 완료: 서비스 중단 없이 안전하게 롤링 배포 가능.`
    ]);
    setIsDryRunSuccess(true);
    onNotify('SUCCESS', '드라이런 검증이 완료되었습니다. 무중단 롤링 패치를 실행할 수 있습니다.');
  };

  // Apply zero-downtime rolling hotfix
  const handleApplyHotfix = () => {
    if (!loadedPatch) return;
    setIsPatching(true);
    setPatchProgress(10);

    setPatchLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🚀 무중단 롤링 핫픽스 배포 시작 (Deployment: orchestrator-ext-proc)...`
    ]);

    setTimeout(() => {
      setPatchProgress(35);
      setPatchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🔄 내부 Harbor 레지스트리에서 신규 이미지 로드 (ext-proc:${loadedPatch.version})...`,
        `[${new Date().toLocaleTimeString()}] 🟢 신규 파드 1대 Surge 생성 시작 (ext-proc-7f89d-2)...`
      ]);
    }, 1000);

    setTimeout(() => {
      setPatchProgress(70);
      setPatchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🩺 신규 파드 readinessProbe gRPC 헬스체크 통과 (소요시간 1.8s)`,
        `[${new Date().toLocaleTimeString()}] 🔄 Envoy AI Gateway 신규 파드로 트래픽 전환 완료`,
        `[${new Date().toLocaleTimeString()}] 🧹 구버전 파드 Graceful Drain 및 종료 중...`
      ]);
    }, 2200);

    setTimeout(() => {
      setPatchProgress(100);
      setIsPatching(false);
      setPatchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🎉 롤링 핫픽스 배포 완료! (버전: ${loadedPatch.version})`,
        `[${new Date().toLocaleTimeString()}] 🔒 vLLM GPU 추론 클러스터 및 Envoy 게이트웨이 무중단(Zero-Downtime) 유지됨.`
      ]);

      // Update component table
      setComponents((prev) =>
        prev.map((c) =>
          c.name.includes('ext_proc')
            ? { ...c, version: loadedPatch.version, status: '최신 패치 완료' }
            : c
        )
      );

      onNotify('SUCCESS', `긴급 보안 핫픽스가 무중단으로 적용되었습니다. ext_proc 버전이 ${loadedPatch.version}로 갱신되었습니다.`);
      if (onPatchApplied) onPatchApplied();
    }, 3500);
  };

  // Rollback
  const handleRollback = () => {
    setComponents((prev) =>
      prev.map((c) =>
        c.name.includes('ext_proc')
          ? { ...c, version: 'v1.2.0', status: '핫픽스 권고 대기' }
          : c
      )
    );
    setPatchLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ⏪ 원클릭 롤백 실행: 이전 안정 버전(v1.2.0)으로 즉시 복원되었습니다.`
    ]);
    onNotify('INFO', '이전 안정 버전(v1.2.0)으로 즉각 롤백되었습니다.');
  };

  // Run Pre-flight System Diagnostics
  const handleRunDiagnostics = () => {
    setIsRunningDiag(true);
    setTimeout(() => {
      setDiagResults({
        postgres: { status: 'OK', latency: '0.8 ms', msg: '메타데이터 DB 연결성 정상' },
        redis: { status: 'OK', latency: '0.3 ms', msg: 'Rate Limit 카운터 응답성 양호' },
        kafka: { status: 'OK', latency: '1.2 ms', msg: '이벤트 버스 지연 0 ms (Lag: 0)' },
        vllmEks: { status: 'OK', latency: '24 ms', msg: 'EKS vLLM Pod 12대 응답 정상' },
        dcgm: { status: 'OK', latency: '4 ms', msg: 'NVIDIA GPU 드라이버 통신 정상' }
      });
      setIsRunningDiag(false);
      onNotify('SUCCESS', '시스템 사전 점검 완료: 5개 핵심 의존성 컴포넌트 100% 정상 가동 확인.');
    }, 1200);
  };

  // Generate Zero-PII Support Bundle
  const handleDownloadSupportBundle = () => {
    const bundleData = {
      bundleId: `support-bundle-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      clusterInfo: {
        environment: 'On-Premise Private VPC',
        kubernetesVersion: 'v1.30.2',
        orchestratorVersion: 'v1.2.1-hotfix'
      },
      sanitizationReport: {
        promptsStripped: 1840,
        piiMaskedCount: 94,
        promptsIncluded: false,
        userPIIIncluded: false
      },
      diagnostics: diagResults || { status: 'All systems healthy' }
    };

    const blob = new Blob([JSON.stringify(bundleData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zero-pii-support-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onNotify('SUCCESS', 'Zero-PII 암호화 기술지원 번들이 다운로드되었습니다. 벤더 기술 지원팀에 안전하게 전달할 수 있습니다.');
  };

  return (
    <div className="tab-pane">
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>방금 전 검사 완료</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '0.8rem' }}>
            <div>PostgreSQL DB: <strong style={{ color: '#34d399' }}>정상 ({diagResults.postgres.latency})</strong></div>
            <div>Redis 쿼터: <strong style={{ color: '#34d399' }}>정상 ({diagResults.redis.latency})</strong></div>
            <div>Kafka 버스: <strong style={{ color: '#34d399' }}>정상 ({diagResults.kafka.latency})</strong></div>
            <div>EKS vLLM Pods: <strong style={{ color: '#34d399' }}>정상 ({diagResults.vllmEks.latency})</strong></div>
            <div>NVIDIA DCGM: <strong style={{ color: '#34d399' }}>정상 ({diagResults.dcgm.latency})</strong></div>
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
            onClick={handleLoadSampleBundle}
          >
            <Upload size={32} color="#38bdf8" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#ffffff', marginBottom: '4px' }}>
              벤더 긴급 패치 아카이브 파일 (.tar.gz)을 선택하거나 드래그하세요
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              폐쇄망 망연계 솔루션을 통해 반입된 서명된 OCI 패키지 파일
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
                대상: {loadedPatch.targetComponent}
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
                LIVE DEPLOYMENT STREAM (Kubernetes Client & xDS Controller)
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
