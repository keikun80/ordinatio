import React, { useState, useEffect, useRef } from 'react';
import { Crosshair, Copy, Check, X, ShieldAlert, Sparkles } from 'lucide-react';
import { strings } from '../constants/strings';

/**
 * DevInspector: 화면 요소 및 기능 식별자(Screen ID, data-testid, Function ID) 실시간 탐색 도구
 * - 단축키: Ctrl + Shift + D (또는 Cmd + Shift + D)
 * - 기능: 마우스 호버 시 엘리먼트 정보 오버레이, 클릭 시 식별자 클립보드 복사
 */
export default function DevInspector({ isActive, onToggle }) {
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // 키보드 단축키 감지 (Ctrl+Shift+D / Cmd+Shift+D)
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        onToggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggle]);

  useEffect(() => {
    if (!isActive) {
      document.body.classList.remove('dev-inspector-active');
      setHoveredInfo(null);
      return;
    }

    document.body.classList.add('dev-inspector-active');

    const handleMouseMove = (e) => {
      // 인스펙터 패널 자체는 무시
      if (e.target.closest('.dev-inspector-panel') || e.target.closest('.dev-inspector-tooltip')) {
        return;
      }

      const target = e.target.closest('[data-testid], [data-screen-id], [data-function-id]');
      if (target) {
        const testId = target.getAttribute('data-testid');
        const screenId = target.getAttribute('data-screen-id');
        const functionId = target.getAttribute('data-function-id');
        const tagName = target.tagName.toLowerCase();
        const role = target.getAttribute('role') || target.getAttribute('type') || '';

        const rect = target.getBoundingClientRect();
        setTooltipPos({
          x: Math.min(window.innerWidth - 320, Math.max(10, rect.left)),
          y: rect.top > 120 ? rect.top - 90 : rect.bottom + 10,
        });

        setHoveredInfo({
          testId,
          screenId,
          functionId,
          tagName,
          role,
        });
      } else {
        setHoveredInfo(null);
      }
    };

    const handleClick = (e) => {
      // Alt 키 또는 단순 클릭 시 testid 복사
      if (e.target.closest('.dev-inspector-panel') || e.target.closest('.dev-inspector-tooltip')) {
        return;
      }

      const target = e.target.closest('[data-testid], [data-screen-id]');
      if (target) {
        const idToCopy = target.getAttribute('data-testid') || target.getAttribute('data-screen-id');
        if (idToCopy) {
          navigator.clipboard.writeText(idToCopy);
          setCopiedId(idToCopy);
          setTimeout(() => setCopiedId(null), 2000);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick, true);

    return () => {
      document.body.classList.remove('dev-inspector-active');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick, true);
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <>
      {/* 화면 우측 상단 플로팅 컨트롤 배너 */}
      <div 
        className="dev-inspector-panel"
        data-testid="dev-inspector-toolbar"
        data-screen-id="SCR-COM-03"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Crosshair size={16} color="#38bdf8" />
          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#38bdf8' }}>{strings.inspector.activeBanner}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{strings.inspector.closeHint}</span>
        </div>
        {copiedId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>
            <Check size={14} />
            <span>{strings.inspector.copiedNotice(copiedId)}</span>
          </div>
        )}
        <button
          onClick={onToggle}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
          title={strings.inspector.closeTooltip}
        >
          <X size={16} />
        </button>
      </div>

      {/* 마우스 호버 대상 실시간 툴팁 */}
      {hoveredInfo && (
        <div 
          className="dev-inspector-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            zIndex: 999999,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.7rem', color: '#a855f7', fontWeight: 700 }}>
              &lt;{hoveredInfo.tagName}{hoveredInfo.role ? `:${hoveredInfo.role}` : ''}&gt;
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{strings.inspector.hoverTooltip}</span>
          </div>

          {hoveredInfo.screenId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', margin: '2px 0' }}>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>Screen:</span>
              <span className="dev-inspector-badge screen">{hoveredInfo.screenId}</span>
            </div>
          )}

          {hoveredInfo.testId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', margin: '2px 0' }}>
              <span style={{ color: '#ec4899', fontWeight: 600 }}>TestID:</span>
              <span className="dev-inspector-badge testid">{hoveredInfo.testId}</span>
            </div>
          )}

          {hoveredInfo.functionId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', margin: '2px 0' }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>Function:</span>
              <span className="dev-inspector-badge fnc">{hoveredInfo.functionId}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
