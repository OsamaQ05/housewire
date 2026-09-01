import { memo } from 'react';
import { Circle, Path, Polyline, Svg } from 'react-native-svg';

import type { Line13Glyph } from '@/src/domain/line-13-game';

export interface GlyphMarkProps {
  color?: string;
  glyph: Line13Glyph;
  size?: number;
  strokeWidth?: number;
}

/** A compact, original symbol alphabet used by every LINE 13 clue surface. */
export const GlyphMark = memo(function GlyphMark({
  color = '#F4E8CF',
  glyph,
  size = 72,
  strokeWidth = 2.4,
}: GlyphMarkProps) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  };

  return (
    <Svg
      accessibilityLabel={`${glyph.toLowerCase()} symbol`}
      height={size}
      role="img"
      viewBox="0 0 64 64"
      width={size}
    >
      {glyph === 'CROWN' ? (
        <>
          <Polyline points="10,43 14,20 27,33 32,12 37,33 50,20 54,43" {...common} />
          <Path d="M12 49H52" {...common} />
        </>
      ) : null}
      {glyph === 'FORK' ? (
        <>
          <Path d="M32 52V31M32 31L15 15M32 31L49 15" {...common} />
          <Circle cx="15" cy="15" r="4" {...common} />
          <Circle cx="49" cy="15" r="4" {...common} />
          <Circle cx="32" cy="52" r="4" {...common} />
        </>
      ) : null}
      {glyph === 'EYE' ? (
        <>
          <Path d="M7 32C14 20 23 15 32 15S50 20 57 32C50 44 41 49 32 49S14 44 7 32Z" {...common} />
          <Circle cx="32" cy="32" r="8" {...common} />
          <Circle cx="32" cy="32" fill={color} r="2.5" />
        </>
      ) : null}
      {glyph === 'GATE' ? (
        <>
          <Path d="M13 51V29C13 17 21 10 32 10S51 17 51 29V51" {...common} />
          <Path d="M22 51V31C22 24 26 20 32 20S42 24 42 31V51" {...common} />
          <Path d="M9 51H55" {...common} />
        </>
      ) : null}
      {glyph === 'COIL' ? (
        <Path d="M52 33C52 19 43 10 31 10C18 10 10 19 10 31C10 44 18 53 31 53C42 53 49 46 49 36C49 26 42 20 33 20C24 20 19 25 19 33C19 41 24 46 31 46C38 46 42 42 42 36C42 30 38 27 33 27C28 27 26 30 26 34C26 38 29 40 32 40" {...common} />
      ) : null}
      {glyph === 'KEY' ? (
        <>
          <Circle cx="22" cy="24" r="11" {...common} />
          <Path d="M30 32L52 54M42 44L48 38M47 49L53 43" {...common} />
          <Circle cx="22" cy="24" r="3" {...common} />
        </>
      ) : null}
    </Svg>
  );
});
