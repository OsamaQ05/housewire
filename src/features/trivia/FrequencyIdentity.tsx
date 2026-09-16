import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

/** A tabletop-game palette, deliberately separate from the escape-room UI. */
export const FREQUENCY_COLORS = {
  paper: '#FFF5DF',
  ink: '#202E42',
  tangerine: '#F5844E',
  teal: '#65C7B7',
  sun: '#F4C64E',
  sky: '#8BC9E8',
  muted: '#606777',
  line: '#DED1B7',
  white: '#FFFFFF',
} as const;

/** An original, code-native mark: a little radio finding a shared wavelength. */
export function FrequencyMark({ size = 104 }: { size?: number }) {
  const color = FREQUENCY_COLORS;
  return (
    <Svg accessible={false} height={size} viewBox="0 0 120 120" width={size}>
      <Path d="M29 39V30C29 24 34 19 40 19H78C84 19 89 24 89 30V39" fill="none" stroke={color.ink} strokeLinecap="round" strokeWidth={5} />
      <Line stroke={color.ink} strokeLinecap="round" strokeWidth={4} x1={88} x2={100} y1={39} y2={13} />
      <Circle cx={101} cy={11} fill={color.sun} r={5} stroke={color.ink} strokeWidth={3} />
      <Rect fill={color.ink} height={62} rx={19} width={99} x={12} y={43} />
      <Rect fill={color.tangerine} height={62} rx={19} stroke={color.ink} strokeWidth={3} width={99} x={8} y={38} />
      <Rect fill={color.paper} height={33} rx={11} stroke={color.ink} strokeWidth={3} width={52} x={19} y={49} />
      <Path d="M28 65H33L37 57L43 73L49 58L54 65H62" fill="none" stroke={color.ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
      <Circle cx={87} cy={63} fill={color.sun} r={12} stroke={color.ink} strokeWidth={3} />
      <Line stroke={color.ink} strokeLinecap="round" strokeWidth={3} x1={87} x2={92} y1={63} y2={58} />
      <Path d="M79 84Q87 91 95 84" fill="none" stroke={color.ink} strokeLinecap="round" strokeWidth={3} />
      <Circle cx={27} cy={89} fill={color.ink} r={2} />
      <Circle cx={35} cy={89} fill={color.ink} r={2} />
      <Circle cx={43} cy={89} fill={color.ink} r={2} />
      <Line stroke={color.ink} strokeLinecap="round" strokeWidth={5} x1={28} x2={28} y1={101} y2={107} />
      <Line stroke={color.ink} strokeLinecap="round" strokeWidth={5} x1={87} x2={87} y1={101} y2={107} />
      <Path d="M9 24L14 27M8 14L15 20M22 8L24 16" fill="none" stroke={color.teal} strokeLinecap="round" strokeWidth={4} />
    </Svg>
  );
}
