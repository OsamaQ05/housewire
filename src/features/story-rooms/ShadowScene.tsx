import { Platform, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { SHADOW_NAMES, SHADOW_TARGETS, shadowAlignment, type ShadowPlayState } from './activities/shadow-play';
import { CUTOUT_PATHS, cutoutMatrix, projectedCutoutMatrix } from './shadow-scene-geometry';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

const INK = '#573E32', CREAM = '#FFF0D1', COLORS = ['#BD6A56', '#5F8D80', '#8C749C'];
function Cutout({ index, fill, stroke = 'none', dashed = false }: { index: number; fill: string; stroke?: string; dashed?: boolean }) {
  return <Path d={CUTOUT_PATHS[index]} fill={fill} stroke={stroke} strokeWidth={stroke === 'none' ? 0 : 1.3} strokeDasharray={dashed ? [2, 3] : []} strokeLinejoin="round" />;
}

/** Keep role switches from tearing down native drawing surfaces during layout.
 * Only numeric properties change; neither perspective is mounted/unmounted on
 * a tab press. This avoids a native lifecycle risk, without assuming a device
 * crash signature we have not captured. */
export function ShadowScene({ activity, active, wall }: { activity: ShadowPlayState; active: number; wall: boolean }) {
  const matches = shadowAlignment(activity), lampX = 60 + activity.lamp * 40;
  const label = wall
    ? `Wall projection: ${matches.filter(Boolean).length} of three silhouettes aligned. Roof, house and plant form a rooftop garden.`
    : `Tabletop view. You control ${SHADOW_NAMES[active]}. The lamp is on rail position ${activity.lamp + 1}. Your teammate sees the projected result.`;
  return <View accessible accessibilityLabel={label} {...(Platform.OS === 'web' ? {} : { collapsable: false })}>
    <Svg width="100%" height={292} viewBox="0 0 336 292" pointerEvents="none" {...decorativeAccessibilityProps} {...(Platform.OS === 'web' ? { 'aria-hidden': true } : {})}>
      <G opacity={wall ? 1 : 0}>
        <Rect width={336} height={292} rx={14} fill="#EBD0A0" />
        <Rect y={220} width={336} height={72} fill="#CCA77E" />
        <Path d="M 0 221 H 336 M 0 225 H 336" stroke="#8E7158" strokeWidth={2} />
        <SvgText x={168} y={28} textAnchor="middle" fontSize={10} fill={INK} letterSpacing={1}>LAMP KEEPER’S WALL</SvgText>
        <Circle cx={263} cy={62} r={18} fill="#E8C36B" opacity={0.4} />
        {SHADOW_TARGETS.map((target, i) => <G key={`outline-${i}`} transform={cutoutMatrix(target.x, target.y, target.scale, 0)}>
          <Cutout index={i} fill={matches[i] ? '#DABB7B' : 'none'} stroke="#9A732D" dashed={!matches[i]} />
        </G>)}
        {activity.pieces.map((piece, i) => <G key={`projection-${i}`} transform={projectedCutoutMatrix(activity.lamp, piece, SHADOW_TARGETS[i].y)}>
          <Cutout index={i} fill={matches[i] ? '#634731' : '#75604E'} />
        </G>)}
        <G opacity={activity.complete ? 1 : 0}>
          <Path d="M 80 205 Q 169 171 259 205" fill="none" stroke="#CE995C" strokeWidth={2} />
          {[92, 120, 148, 176, 204, 232, 256].map((x, i) => <Circle key={x} cx={x} cy={198 - Math.sin(i / 6 * Math.PI) * 13} r={4} fill="#FFEAB6" />)}
          <SvgText x={168} y={258} textAnchor="middle" fontSize={16} fontWeight="700" fill={INK}>DESSERT ON THE ROOF</SvgText>
        </G>
        <G opacity={activity.complete ? 0 : 1}>
          <SvgText x={168} y={252} textAnchor="middle" fontSize={11} fill={INK}>Gold outlines are the picture you’re making.</SvgText>
          <SvgText x={168} y={271} textAnchor="middle" fontSize={10} fill={INK}>Describe position, size and which way is up.</SvgText>
        </G>
      </G>
      <G opacity={wall ? 0 : 1}>
        <Rect width={336} height={292} rx={14} fill="#D5AD80" />
        {[58, 108, 158, 208, 258].map(y => <Path key={y} d={`M 0 ${y} Q 145 ${y - 6} 336 ${y + 3}`} stroke="#B58B61" fill="none" opacity={0.5} />)}
        <Rect x={16} y={14} width={304} height={38} rx={5} fill="#8E7865" />
        <SvgText x={168} y={38} textAnchor="middle" fill="#F4DFC0" fontSize={10} letterSpacing={1}>THE WALL · YOUR PARTNER’S VIEW</SvgText>
        <Path d={`M ${lampX} 263 L 10 53 H 326 Z`} fill="#FFEAB6" opacity={0.24} />
        {activity.pieces.map((piece, i) => {
          const x = 80 + piece.x * 20, y = 110 + i * 44 + piece.depth * 8;
          return <G key={`table-piece-${i}`}>
            <Line x1={30} y1={110 + i * 44} x2={306} y2={110 + i * 44} stroke="#936C4F" strokeWidth={2} strokeDasharray={[2, 5]} />
            <G transform={cutoutMatrix(x, y, 1, piece.turn)}><Cutout index={i} fill={COLORS[i]} stroke={active === i + 1 ? CREAM : '#76563F'} /></G>
            <Circle cx={x} cy={y + 20} r={3} fill="#654A36" />
          </G>;
        })}
        <Line x1={50} y1={266} x2={235} y2={266} stroke="#9C774E" strokeWidth={6} strokeLinecap="round" />
        <G transform={cutoutMatrix(lampX, 260, 1, 0)}><Circle r={14} fill="#D7A044" stroke="#855D2A" strokeWidth={2} /><Circle cy={-3} r={8} fill="#FFF0C8" /></G>
        <SvgText x={168} y={78} textAnchor="middle" fill={INK} fontSize={10}>SLIDE · MOVE CLOSER · TURN</SvgText>
      </G>
    </Svg>
  </View>;
}
