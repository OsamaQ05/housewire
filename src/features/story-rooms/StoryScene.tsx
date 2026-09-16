import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { StoryClue, StoryRoomId } from './types';
import { StoryText } from './story-ui';
import { useRoomPresentation } from './room-presentation';

/** The labels and relation are private evidence, not decoration or a solved board. */
export function EvidenceDiagram({ diagram, accent }: { diagram: NonNullable<StoryClue['diagram']>; accent: string }) {
  const presentation = useRoomPresentation();
  return <View style={{ backgroundColor: presentation?.panel ?? '#172831', borderRadius: 10, padding: 16, gap: 16 }}>
    <StoryText size={10} color={accent} strong style={{ letterSpacing: 1.5 }}>RECOVERED FRAGMENT</StoryText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {diagram.nodes.map((label, index) => <View key={index} style={{ flexGrow: 1, flexBasis: '42%', borderWidth: 1, borderColor: accent + '90', padding: 13, minHeight: 64, justifyContent: 'center' }}>
        <StoryText size={14} strong style={{ textAlign: 'center' }}>{label}</StoryText>
      </View>)}
    </View>
    <StoryText size={13} color="#CEDADC">{diagram.caption}</StoryText>
  </View>;
}

/** Drawn archive props. These are fictional evidence illustrations, never image recognition. */
export function StoryScene({ roomId, accent, illustration, active = false }: { roomId: StoryRoomId; accent: string; illustration?: StoryClue['illustration']; active?: boolean }) {
  const ink = roomId === 'line-13' ? '#204449' : roomId === 'night-glass' ? '#29434A' : '#172831';
  const lit = active ? accent : '#78949E';
  const kind = illustration ?? (roomId === 'long-table' ? 'table' : roomId === 'night-glass' ? 'light' : 'station');
  return <View accessibilityLabel={`Illustrated ${kind} evidence, not a photograph of your surroundings`} accessible style={{ height: 150, overflow: 'hidden' }}>
    <Svg width="100%" height="100%" viewBox="0 0 320 160">
      <Rect x="0" y="0" width="320" height="160" rx="12" fill={ink} />
      {kind === 'light' ? <BarjeelPlate active={active} /> : kind === 'station' && roomId === 'line-13' ? <WorkshopPlate active={active} /> : kind === 'station' ? <G>
        <Path d="M35 120 L35 53 L160 20 L285 53 L285 120 Z" fill="#233A45" stroke={lit} strokeWidth="2" />
        {[66, 130, 194].map((x, i) => <G key={x}><Rect x={x} y={56} width="45" height="48" rx="5" fill={i === 1 && active ? accent : '#172831'} stroke={lit} /><Line x1={x + 22} x2={x + 22} y1="56" y2="104" stroke={lit} /><Line x1={x} x2={x + 45} y1="80" y2="80" stroke={lit} /></G>)}
        <Path d="M45 137 H106 V117 H167 V137 H275" fill="none" stroke={lit} strokeWidth="3" strokeDasharray={active ? undefined : '5 5'} />
        <Circle cx="167" cy="117" r="5" fill={accent} />
      </G> : kind === 'floorplan' ? <G>
        <Path d="M52 30 H270 V132 H52 Z M155 30 V64 M155 93 V132 M52 82 H104 M127 82 H209 M239 82 H270" stroke={lit} strokeWidth="4" fill="#223741" />
        <Path d="M155 64 A29 29 0 0 1 184 93 L155 93 M104 82 A23 23 0 0 1 127 59 L127 82" stroke={accent} fill="none" strokeWidth="2" />
        <Rect x="65" y="130" width="190" height="5" fill={accent} /><Circle cx="224" cy="110" r="10" fill="none" stroke={accent} strokeDasharray="3 3" />
        <SvgText x="88" y="56" fill="#BFCCD0" fontSize="9">{roomId === 'line-13' ? 'WORKBENCH' : 'WEST WING'}</SvgText><SvgText x="174" y="118" fill="#BFCCD0" fontSize="9">{roomId === 'line-13' ? 'STORAGE' : 'ARCHIVE'}</SvgText>
      </G> : kind === 'table' ? <G>
        <Rect x="24" y="40" width="273" height="66" rx="5" fill="#3A3731" stroke={lit} strokeWidth="2" />
        {[64, 128, 192, 256].map((x, i) => <G key={i}><Circle cx={x} cy="70" r="17" fill="#DED5C1" opacity={i === 3 ? .25 : 1} /><Circle cx={x} cy="70" r="12" fill="none" stroke={ink} /><Rect x={x - 19} y="116" width="38" height="9" rx="2" fill={lit} /></G>)}
        <Path d="M33 121 H288" stroke={accent} strokeWidth="3" />
        <SvgText x="33" y="30" fill="#BFCCD0" fontSize="9">ONE LONG BENCH</SvgText>
      </G> : <G>
        <Path d="M30 80 H103 V39 H217 V80 H289 M103 80 V123 H217 V80" fill="none" stroke="#3A5661" strokeWidth="19" strokeLinejoin="round" />
        <Path d="M30 80 H103 V39 H217 V80 H289" fill="none" stroke={lit} strokeWidth="2" strokeDasharray="4 6" />
        {[55, 159, 263].map((x, i) => <G key={x}><Circle cx={x} cy={i === 1 ? 39 : 80} r="14" fill={ink} stroke={accent} strokeWidth="2" /><Path d={`M${x - 5} ${i === 1 ? 39 : 80} l4 -6 l4 12 l4 -6`} stroke={accent} strokeWidth="2" fill="none" /></G>)}
        <Path d="M143 110 L174 136 M174 110 L143 136" stroke={accent} strokeWidth="3" />
      </G>}
      <SvgText x="12" y="151" fill="#BCCBBB" fontSize="8" letterSpacing="2">{roomId === 'night-glass' ? `BARJEEL / ${active ? 'THE GARDEN OPENS' : 'TWO TIMES, ONE HOUSE'}` : roomId === 'line-13' ? `AFTER HOURS / ${active ? 'MADE TOGETHER' : 'THE TOY-MAKER’S WORKSHOP'}` : `HOUSEWIRE / ${active ? 'RECOVERED RECORD' : 'ARCHIVE PLATE'}`}</SvgText>
    </Svg>
  </View>;
}

function BarjeelPlate({ active }: { active: boolean }) {
  return <G>
    <Rect x={20} y={80} width={281} height={56} fill="#CDBE9D" />
    <Path d="M32 82V38H91V82M25 39H98M40 25V35M82 25V35" fill="#E7D8B8" stroke="#D5C199" strokeWidth={4} />
    <Path d="M46 46V73M62 44V74M78 46V73M35 60H87" stroke="#5E7771" strokeWidth={4} />
    <Path d="M183 134V78Q183 46 219 46Q255 46 255 78V134Z" fill={active ? '#EFCC83' : '#654C3B'} stroke="#E2CBA0" strokeWidth={4} />
    {active ? <><Path d="M220 132V80M218 100Q196 72 190 95Q198 110 218 106M220 94Q246 72 246 96Q240 110 220 108" stroke="#6A8B59" fill="#759660" strokeWidth={2} /><Path d="M183 132L131 139H276L255 132Z" fill="#EED9A3" /></> : <><Path d="M219 51V134" stroke="#B49A73" strokeWidth={2} /><Rect x={211} y={102} width={17} height={5} fill="#CEB170" /></>}
    <Rect x={114} y={88} width={38} height={35} fill="#3F6F70" stroke="#B59C73" strokeWidth={3} />
    <Path d="M115 105H150M133 88V123" stroke="#D6BC80" strokeWidth={2} />
    <Circle cx={278} cy={37} r={16} fill="#ECD49A" />
    <Path d="M274 64Q297 76 283 93Q273 107 293 117" fill="none" stroke="#B4CAB8" strokeWidth={2} opacity={.6} />
  </G>;
}

function WorkshopPlate({ active }: { active: boolean }) {
  return <G>
    <Rect x={22} y={25} width={273} height={105} rx={7} fill="#355C59" />
    <Path d="M36 110H284M49 113V136M266 113V136" stroke="#BD9A72" strokeWidth={9} />
    <Path d="M53 37H270M71 37V48M151 37V53M246 37V49" stroke="#8EAC91" strokeWidth={3} />
    <Path d="M56 98L115 64L168 104" fill="none" stroke="#DCC59A" strokeWidth={8} strokeLinejoin="round" />
    <Circle cx={active ? 156 : 112} cy={active ? 93 : 57} r={8} fill="#E79A78" />
    <Rect x={69} y={97} width={20} height={12} fill="#DBAA5C" /><Rect x={128} y={81} width={19} height={28} fill="#E5A275" />
    <Path d="M193 108V57H246M229 57V81" fill="none" stroke="#E5C68F" strokeWidth={5} /><Path d="M222 82Q229 95 236 82" fill="none" stroke="#CBDBCF" strokeWidth={3} />
    <Rect x={208} y={active ? 91 : 101} width={35} height={17} rx={3} fill="#EBA889" />
    <Circle cx={215} cy={active ? 107 : 116} r={5} fill="#263F45" /><Circle cx={236} cy={active ? 107 : 116} r={5} fill="#263F45" />
    <Circle cx={47} cy={68} r={11} fill="#EFDFB8" /><Path d="M47 44V56" stroke="#E7D4A9" strokeWidth={3} />
    <Path d="M269 103L279 86L289 103Z" fill="#D88A75" />
  </G>;
}
