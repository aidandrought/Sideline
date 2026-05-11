// components/PitchSvg.tsx
// SVG football pitch background — center circle, penalty boxes, halfway line

import React from 'react';
import Svg, { Rect, Circle, Line, Path } from 'react-native-svg';

interface PitchSvgProps {
  width: number;
  height: number;
}

export function PitchSvg({ width: W, height: H }: PitchSvgProps) {
  const lineColor = 'rgba(255,255,255,0.35)';
  const lw = 1.2; // line width

  // Pitch proportions (standard football pitch ~105×68m, portrait for mobile)
  const penBoxW = W * 0.62;
  const penBoxH = H * 0.14;
  const penBoxX = (W - penBoxW) / 2;
  const goalBoxW = W * 0.32;
  const goalBoxH = H * 0.06;
  const goalBoxX = (W - goalBoxW) / 2;
  const penSpot = H * 0.10;
  const centerR = W * 0.15;
  const arcRadius = W * 0.13;

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Pitch green background with alternating stripes */}
      {[0, 1, 2, 3].map((i) => (
        <Rect
          key={i}
          x={0}
          y={(H / 4) * i}
          width={W}
          height={H / 4}
          fill={i % 2 === 0 ? '#1A7A41' : '#1F8A4C'}
        />
      ))}

      {/* Outer border */}
      <Rect x={lw / 2} y={lw / 2} width={W - lw} height={H - lw} fill="none" stroke={lineColor} strokeWidth={lw} />

      {/* Halfway line */}
      <Line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke={lineColor} strokeWidth={lw} />

      {/* Centre circle */}
      <Circle cx={W / 2} cy={H / 2} r={centerR} fill="none" stroke={lineColor} strokeWidth={lw} />

      {/* Centre spot */}
      <Circle cx={W / 2} cy={H / 2} r={2} fill={lineColor} />

      {/* Top penalty box */}
      <Rect x={penBoxX} y={0} width={penBoxW} height={penBoxH} fill="none" stroke={lineColor} strokeWidth={lw} />
      {/* Top goal box */}
      <Rect x={goalBoxX} y={0} width={goalBoxW} height={goalBoxH} fill="none" stroke={lineColor} strokeWidth={lw} />
      {/* Top penalty spot */}
      <Circle cx={W / 2} cy={penSpot} r={2} fill={lineColor} />
      {/* Top penalty arc */}
      <Path
        d={`M ${penBoxX} ${penBoxH} A ${arcRadius} ${arcRadius} 0 0 1 ${penBoxX + penBoxW} ${penBoxH}`}
        fill="none"
        stroke={lineColor}
        strokeWidth={lw}
      />

      {/* Bottom penalty box (mirrored) */}
      <Rect x={penBoxX} y={H - penBoxH} width={penBoxW} height={penBoxH} fill="none" stroke={lineColor} strokeWidth={lw} />
      {/* Bottom goal box */}
      <Rect x={goalBoxX} y={H - goalBoxH} width={goalBoxW} height={goalBoxH} fill="none" stroke={lineColor} strokeWidth={lw} />
      {/* Bottom penalty spot */}
      <Circle cx={W / 2} cy={H - penSpot} r={2} fill={lineColor} />
      {/* Bottom penalty arc */}
      <Path
        d={`M ${penBoxX} ${H - penBoxH} A ${arcRadius} ${arcRadius} 0 0 0 ${penBoxX + penBoxW} ${H - penBoxH}`}
        fill="none"
        stroke={lineColor}
        strokeWidth={lw}
      />
    </Svg>
  );
}

export default PitchSvg;
