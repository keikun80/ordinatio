import React, { useId, useMemo, useState } from 'react';

/**
 * CumulativeSparkline - Zero-dependency, lightweight SVG Area Sparkline
 * 
 * @param {Object} props
 * @param {Array<number|{value: number, timestamp?: number|string}>} props.data - 시계열 데이터
 * @param {string} [props.strokeColor='#3b82f6'] - 라인 색상
 * @param {number} [props.height=42] - 차트 높이(px)
 * @param {string} [props.unit=''] - 단위 표기
 * @param {number} [props.baseline] - 기준선 (예: SLA 500ms)
 * @param {string} [props.baselineLabel] - 기준선 라벨
 * @param {string} [props.testId='ov-sparkline']
 */
export default function CumulativeSparkline({
  data = [],
  strokeColor = '#3b82f6',
  height = 42,
  unit = '',
  baseline,
  baselineLabel,
  testId = 'ov-sparkline'
}) {
  const gradientId = useId().replace(/:/g, '');
  const [hoverIndex, setHoverIndex] = useState(null);

  const points = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((item) => (typeof item === 'number' ? item : (item?.value ?? 0)));
  }, [data]);

  const { pathData, areaPathData, baselineY, normalizedPoints, minVal, maxVal } = useMemo(() => {
    const W = 100;
    const H = 40;
    const padTop = 4;
    const padBottom = 4;
    const usableH = H - padTop - padBottom;

    if (points.length === 0) {
      return { pathData: '', areaPathData: '', baselineY: null, normalizedPoints: [], minVal: 0, maxVal: 0 };
    }

    if (points.length === 1) {
      const midY = H / 2;
      return {
        pathData: `M 0,${midY} L ${W},${midY}`,
        areaPathData: `M 0,${midY} L ${W},${midY} L ${W},${H} L 0,${H} Z`,
        baselineY: null,
        normalizedPoints: [{ x: 0, y: midY, val: points[0] }, { x: W, y: midY, val: points[0] }],
        minVal: points[0],
        maxVal: points[0]
      };
    }

    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max === min ? 1 : max - min;

    // Normalize coordinates
    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * W;
      // Invert Y axis: max value is near top (padTop), min value near bottom
      const y = H - padBottom - ((val - min) / range) * usableH;
      return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), val };
    });

    // Generate smooth Cubic Bezier path
    let d = `M ${coords[0].x},${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 3;
      const cpY1 = curr.y;
      const cpX2 = curr.x + ((next.x - curr.x) * 2) / 3;
      const cpY2 = next.y;
      d += ` C ${cpX1.toFixed(2)},${cpY1.toFixed(2)} ${cpX2.toFixed(2)},${cpY2.toFixed(2)} ${next.x},${next.y}`;
    }

    const areaD = `${d} L ${W},${H} L 0,${H} Z`;

    // Baseline calculation if provided
    let bY = null;
    if (baseline !== undefined) {
      if (baseline >= min && baseline <= max) {
        bY = H - padBottom - ((baseline - min) / range) * usableH;
      }
    }

    return {
      pathData: d,
      areaPathData: areaD,
      baselineY: bY !== null ? Number(bY.toFixed(2)) : null,
      normalizedPoints: coords,
      minVal: min,
      maxVal: max
    };
  }, [points, baseline]);

  if (points.length === 0) {
    return (
      <div 
        data-testid={testId}
        style={{ 
          height: `${height}px`, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'var(--text-muted, #64748b)',
          fontSize: '0.65rem'
        }}
      >
        <span style={{ opacity: 0.6 }}>누적 데이터 수집 중...</span>
      </div>
    );
  }

  const lastPt = normalizedPoints[normalizedPoints.length - 1];
  const activePt = hoverIndex !== null && normalizedPoints[hoverIndex] ? normalizedPoints[hoverIndex] : lastPt;

  return (
    <div 
      data-testid={testId}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: `${height}px`,
        overflow: 'visible',
        marginTop: '6px',
        marginBottom: '6px'
      }}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg 
        viewBox="0 0 100 40" 
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const idx = Math.min(normalizedPoints.length - 1, Math.round(relX * (normalizedPoints.length - 1)));
          setHoverIndex(idx);
        }}
      >
        <defs>
          <linearGradient id={`sparkline-grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Optional SLA / Baseline dashed reference line */}
        {baselineY !== null && (
          <line
            x1="0"
            y1={baselineY}
            x2="100"
            y2={baselineY}
            stroke="#f59e0b"
            strokeDasharray="2,2"
            strokeWidth="0.8"
            opacity="0.6"
          />
        )}

        {/* Area fill */}
        <path
          d={areaPathData}
          fill={`url(#sparkline-grad-${gradientId})`}
        />

        {/* Stroke trend curve */}
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Glowing pulse dot at current/active point */}
        {activePt && (
          <>
            <circle
              cx={activePt.x}
              cy={activePt.y}
              r="3.2"
              fill={strokeColor}
              opacity="0.3"
            />
            <circle
              cx={activePt.x}
              cy={activePt.y}
              r="1.8"
              fill="#ffffff"
            />
          </>
        )}
      </svg>

      {/* Floating tooltip on hover */}
      {hoverIndex !== null && activePt && (
        <div
          style={{
            position: 'absolute',
            top: '-20px',
            left: `${activePt.x}%`,
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.92)',
            border: `1px solid ${strokeColor}`,
            borderRadius: '4px',
            padding: '1px 5px',
            fontSize: '0.65rem',
            fontWeight: 600,
            color: '#f8fafc',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)'
          }}
        >
          {unit === '₩' ? `₩ ${Number(activePt.val).toLocaleString()}` : `${Number(activePt.val).toLocaleString()} ${unit}`}
        </div>
      )}
    </div>
  );
}
