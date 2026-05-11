// components/KitSvg.tsx
// Redesigned realistic football shirt — curved silhouette, V-neck collar, sleeve cuffs

import React from 'react';
import Svg, { Defs, LinearGradient, Path, Stop, Circle, Text as SvgText, Rect } from 'react-native-svg';

interface KitSvgProps {
  primary: string;
  secondary: string;
  textColor: string;
  initials: string;
  size?: number;
  isCaptain?: boolean;
  isVice?: boolean;
  injured?: boolean;
}

export function KitSvg({
  primary,
  secondary,
  textColor,
  initials,
  size = 48,
  isCaptain = false,
  isVice = false,
  injured = false,
}: KitSvgProps) {
  // Fixed viewBox — all paths are authored in this coordinate space
  const VW = 52;
  const VH = 58;

  // ─── Shirt body ──────────────────────────────────────────────────────────────
  // Realistic football shirt silhouette:
  //   - Curved shoulder sweep
  //   - V-neck cutout
  //   - Short sleeves that taper outward
  //   - Slight waist taper then straight hem
  const shirtBody = [
    'M 18 5',           // left collar edge
    'C 14 4 8 7 6 10',  // left shoulder curve (cubic bezier)
    'L 0 18',           // outer left sleeve top
    'L 2 27',           // left sleeve outer bottom
    'L 12 25',          // left sleeve inner bottom (cuff edge)
    'L 12 54',          // left body side down to hem
    'L 40 54',          // hem
    'L 40 25',          // right body up to sleeve
    'L 50 27',          // right sleeve inner bottom
    'L 52 18',          // outer right sleeve top
    'L 46 10',          // right shoulder
    'C 44 7 38 4 34 5', // right shoulder curve
    'L 26 13',          // V-neck bottom point
    'Z',
  ].join(' ');

  // ─── V-neck collar ───────────────────────────────────────────────────────────
  // Sits on top of the shirt — secondary color fills the V area
  const collar = [
    'M 18 5',
    'L 26 13',          // down to V point
    'L 34 5',           // up to right collar edge
    'Q 30 2 26 4',      // right side of inner neck band
    'Q 22 2 18 5',      // left side of inner neck band
    'Z',
  ].join(' ');

  // ─── Sleeve cuff bands ───────────────────────────────────────────────────────
  // Thin accent strip at the end of each sleeve (secondary color)
  const leftCuff = [
    'M 0 18',
    'L 2 27',           // outer edge of sleeve bottom
    'L 12 25',          // inner edge
    'L 11 19',          // inner edge up ~6 units
    'L 1 21',           // outer edge up ~6 units
    'Z',
  ].join(' ');

  const rightCuff = [
    'M 52 18',
    'L 50 27',
    'L 40 25',
    'L 41 19',
    'L 51 21',
    'Z',
  ].join(' ');

  // ─── Chest accent stripe ─────────────────────────────────────────────────────
  // Very subtle horizontal band across chest — secondary at low opacity
  // Sits between y=25 and y=30 on the body
  const chestStripe = [
    'M 12 29',
    'L 40 29',
    'L 40 33',
    'L 12 33',
    'Z',
  ].join(' ');

  const fontSize = size * 0.24;
  const textY = VH * 0.70;
  const gradId = `kg_${initials.replace(/\W/g, '')}_${size}`;

  return (
    <Svg
      width={size}
      height={(size * VH) / VW}
      viewBox={`0 0 ${VW} ${VH}`}
    >
      <Defs>
        {/* Subtle top-lighting gradient for 3-D depth */}
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.18} />
          <Stop offset="55%" stopColor="#ffffff" stopOpacity={0.0} />
          <Stop offset="100%" stopColor="#000000" stopOpacity={0.12} />
        </LinearGradient>
      </Defs>

      {/* ── Drop shadow (offset copy of body path) ─────────────────────── */}
      <Path d={shirtBody} fill="rgba(0,0,0,0.22)" transform="translate(0.5,1.5)" />

      {/* ── Main shirt body ─────────────────────────────────────────────── */}
      <Path d={shirtBody} fill={primary} />

      {/* ── Lighting overlay ────────────────────────────────────────────── */}
      <Path d={shirtBody} fill={`url(#${gradId})`} />

      {/* ── Chest accent stripe ─────────────────────────────────────────── */}
      <Path d={chestStripe} fill={secondary} opacity={0.28} />

      {/* ── Sleeve cuffs ────────────────────────────────────────────────── */}
      <Path d={leftCuff} fill={secondary} opacity={0.82} />
      <Path d={rightCuff} fill={secondary} opacity={0.82} />

      {/* ── V-neck collar ───────────────────────────────────────────────── */}
      <Path d={collar} fill={secondary} />
      {/* Thin collar outline for definition */}
      <Path d={collar} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={0.6} />

      {/* ── Player initials ─────────────────────────────────────────────── */}
      <SvgText
        x={VW / 2}
        y={textY}
        textAnchor="middle"
        fill={textColor}
        fontSize={fontSize}
        fontWeight="900"
      >
        {initials.toUpperCase()}
      </SvgText>

      {/* ── Captain / Vice-captain badge ────────────────────────────────── */}
      {(isCaptain || isVice) && (
        <>
          <Circle
            cx={VW - 7}
            cy={8}
            r={6.5}
            fill={isCaptain ? '#FACC15' : 'transparent'}
            stroke={isVice ? '#FACC15' : 'rgba(0,0,0,0.3)'}
            strokeWidth={1.5}
          />
          <SvgText
            x={VW - 7}
            y={11.5}
            textAnchor="middle"
            fill={isCaptain ? '#1A1A1A' : '#FACC15'}
            fontSize={7.5}
            fontWeight="900"
          >
            {isCaptain ? 'C' : 'V'}
          </SvgText>
        </>
      )}

      {/* ── Injury indicator ────────────────────────────────────────────── */}
      {injured && (
        <Circle cx={6.5} cy={8} r={5} fill="#EF4444" opacity={0.9} />
      )}
    </Svg>
  );
}

export default KitSvg;
