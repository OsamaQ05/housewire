import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { useFrequencyAvatarStore } from '../../store/use-frequency-avatar-store';
import { getFrequencyAvatar, type FrequencyAvatarId } from './frequency-avatar-model';

export { FREQUENCY_AVATARS, type FrequencyAvatarId } from './frequency-avatar-model';

const INK = '#38313B';
const CREAM = '#FFF3DC';
const outline = { stroke: INK, strokeWidth: 2.3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

type Mood = 'idle' | 'happy';
export interface FrequencyAvatarProps {
  name: string;
  avatarId?: FrequencyAvatarId;
  size?: number;
  mood?: Mood;
}

function Eyes({ left = 39, right = 61, y = 53, mood }: { left?: number; right?: number; y?: number; mood: Mood }) {
  return mood === 'happy' ? (
    <G fill="none" stroke={INK} strokeLinecap="round" strokeWidth={3}>
      <Path d={`M${left - 3.5} ${y + 1}Q${left} ${y - 5} ${left + 3.5} ${y + 1}`} />
      <Path d={`M${right - 3.5} ${y + 1}Q${right} ${y - 5} ${right + 3.5} ${y + 1}`} />
    </G>
  ) : (
    <G>
      <Ellipse cx={left} cy={y} fill={INK} rx={3.1} ry={4.1} />
      <Ellipse cx={right} cy={y} fill={INK} rx={3.1} ry={4.1} />
      <Circle cx={left + 0.9} cy={y - 1.4} fill={CREAM} r={1} />
      <Circle cx={right + 0.9} cy={y - 1.4} fill={CREAM} r={1} />
    </G>
  );
}

function Fox({ mood }: { mood: Mood }) {
  return (
    <G>
      <Path d="M25 90C26 75 35 69 50 69S74 75 75 90" fill="#E77C48" {...outline} />
      <Path d="M22 44L20 14Q20 10 25 13L42 30M59 30L76 13Q80 10 80 15L78 44" fill="#E77C48" {...outline} />
      <Path d="M26 33L25 21L36 33M65 33L75 21L73 34" fill={INK} />
      <Path d="M22 39Q29 29 41 32L49 28L53 32Q69 29 78 40L76 49L87 53L79 63L81 65Q66 76 50 79Q34 76 19 65L21 62L13 53L24 49Z" fill="#F39456" {...outline} />
      <Path d="M22 53Q29 46 39 52L50 64L61 52Q71 46 78 53L75 63Q64 74 50 77Q36 74 25 63Z" fill={CREAM} />
      <Path d="M33 44L40 42M59 42L66 44" fill="none" {...outline} />
      <Eyes y={51} mood={mood} />
      <Path d="M45 61Q50 58 55 61L50 66Z" fill={INK} />
      <Path d={mood === 'happy' ? 'M42 67Q50 79 58 67Z' : 'M43 68Q50 73 57 68'} fill={mood === 'happy' ? INK : 'none'} stroke={INK} strokeLinecap="round" strokeWidth={2} />
      <Ellipse cx={29} cy={59} fill="#F0AC8F" rx={4} ry={2.2} />
      <Ellipse cx={71} cy={59} fill="#F0AC8F" rx={4} ry={2.2} />
      <Path d="M30 77Q48 87 69 77L68 84Q49 92 31 84Z" fill="#75BAAD" {...outline} />
      <Path d="M64 82L73 78L80 87L70 90Z" fill="#75BAAD" {...outline} />
    </G>
  );
}

function Frog({ mood }: { mood: Mood }) {
  return (
    <G>
      <Path d="M25 88Q23 68 39 66H62Q77 68 76 88" fill="#8CB78A" {...outline} />
      <Ellipse cx={50} cy={82} fill="#DCE4B9" rx={17} ry={10} />
      <Path d="M20 49C11 34 22 23 33 26Q43 26 46 37H54Q58 26 67 26C81 25 88 38 80 49Q88 57 82 68C77 78 25 78 18 68Q12 59 20 49Z" fill="#A9CB91" {...outline} />
      <Ellipse cx={33} cy={40} fill="#EAF0CD" rx={10} ry={11} />
      <Ellipse cx={67} cy={40} fill="#EAF0CD" rx={10} ry={11} />
      <Eyes left={33} right={67} y={40} mood={mood} />
      <Ellipse cx={25} cy={59} fill="#E4A78D" rx={6} ry={3.5} />
      <Ellipse cx={75} cy={59} fill="#E4A78D" rx={6} ry={3.5} />
      <Circle cx={45} cy={52} fill="#688D64" r={1.5} />
      <Circle cx={55} cy={52} fill="#688D64" r={1.5} />
      <Path d={mood === 'happy' ? 'M33 60Q50 63 67 60Q64 73 50 73Q37 73 33 60Z' : 'M32 61Q50 73 68 61'} fill={mood === 'happy' ? INK : 'none'} stroke={INK} strokeLinecap="round" strokeWidth={2.4} />
      {mood === 'happy' && <Path d="M42 70Q50 65 58 70Q50 74 42 70" fill="#E9A392" />}
      <Path d="M48 79L38 75V87L48 83M52 79L62 75V87L52 83" fill="#EAC46A" {...outline} />
      <Circle cx={50} cy={81} fill="#F5D986" r={3} stroke={INK} strokeWidth={2} />
      <Path d="M23 88L18 90M77 88L82 90" fill="none" {...outline} />
    </G>
  );
}

function Owl({ mood }: { mood: Mood }) {
  return (
    <G>
      <Path d="M26 34L23 19L40 27Q50 23 60 27L77 19L74 36Q85 47 80 73Q77 89 50 89Q23 89 20 73Q15 48 26 34Z" fill="#A397BB" {...outline} />
      <Path d="M21 53Q17 74 29 81Q38 67 29 51M79 53Q84 74 71 81Q63 67 71 51" fill="#82759E" {...outline} />
      <Path d="M26 44Q27 31 40 32Q47 32 50 37Q53 32 61 32Q74 32 75 44Q77 61 65 67L50 75L35 67Q23 61 26 44Z" fill={CREAM} />
      <Circle cx={38} cy={48} fill="#E6D8D6" r={11} />
      <Circle cx={62} cy={48} fill="#E6D8D6" r={11} />
      <Eyes left={38} right={62} y={48} mood={mood} />
      <Path d="M45 58L50 54L55 58L50 66Z" fill="#E4AF54" stroke={INK} strokeLinejoin="round" strokeWidth={1.8} />
      <Path d="M33 31L39 34M61 34L68 31" fill="none" {...outline} />
      <Ellipse cx={31} cy={60} fill="#EAB2AD" rx={4.2} ry={2.5} />
      <Ellipse cx={69} cy={60} fill="#EAB2AD" rx={4.2} ry={2.5} />
      <Path d="M36 74L40 78L44 74M47 80L50 83L53 80M56 74L60 78L64 74" fill="none" stroke="#EDE2D6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.7} />
      <Path d="M35 87L34 92M40 88V93M45 89V92M55 89V92M60 88V93M65 87L66 92" fill="none" stroke={INK} strokeLinecap="round" strokeWidth={2.6} />
    </G>
  );
}

function Bear({ mood }: { mood: Mood }) {
  return (
    <G>
      <Path d="M25 90Q26 69 50 69Q74 69 75 90" fill="#B48665" {...outline} />
      <Circle cx={27} cy={30} fill="#BA8C66" r={13} {...outline} />
      <Circle cx={73} cy={30} fill="#BA8C66" r={13} {...outline} />
      <Circle cx={27} cy={30} fill="#E9B49A" r={6.8} />
      <Circle cx={73} cy={30} fill="#E9B49A" r={6.8} />
      <Path d="M20 48Q20 28 50 28Q80 28 80 48V60Q80 80 50 80Q20 80 20 60Z" fill="#CCA078" {...outline} />
      <Path d="M40 30L46 26L47 31L54 27" fill="#CCA078" {...outline} />
      <Eyes left={36} right={64} y={50} mood={mood} />
      <Ellipse cx={50} cy={65} fill="#F2D7B3" rx={15} ry={12} />
      <Path d="M44 58Q50 54 56 58Q56 64 50 65Q44 64 44 58Z" fill={INK} />
      <Path d={mood === 'happy' ? 'M42 67Q50 80 58 67Z' : 'M50 65V68M44 69Q50 74 56 69'} fill={mood === 'happy' ? INK : 'none'} stroke={INK} strokeLinecap="round" strokeWidth={2} />
      <Ellipse cx={28} cy={61} fill="#D78979" rx={4.5} ry={2.8} />
      <Ellipse cx={72} cy={61} fill="#D78979" rx={4.5} ry={2.8} />
      <Path d="M31 78Q50 85 69 78L63 87L50 95L37 87Z" fill="#D78270" {...outline} />
      <Path d="M45 85L50 88L55 85" fill="none" stroke="#FFE3C4" strokeLinecap="round" strokeWidth={2} />
    </G>
  );
}

function Rabbit({ mood }: { mood: Mood }) {
  return (
    <G>
      <Path d="M27 90Q26 72 50 72Q74 72 73 90" fill="#F2DDCA" {...outline} />
      <Path d="M29 44Q18 19 25 9Q31 1 37 13L46 41M55 40Q59 6 68 7Q79 8 72 29L67 46" fill="#F6E4CF" {...outline} />
      <Path d="M30 16Q27 24 36 40M67 16Q64 22 62 40" fill="none" stroke="#D99EA0" strokeLinecap="round" strokeWidth={6} />
      <Path d="M25 53Q23 36 42 36L47 32L51 36Q74 33 76 52L79 60Q81 77 50 80Q18 78 21 61Z" fill="#F6E4CF" {...outline} />
      <Path d="M32 77Q50 84 68 77L69 84Q49 92 31 84Z" fill="#98BDC8" {...outline} />
      <Eyes left={38} right={62} y={52} mood={mood} />
      <Ellipse cx={29} cy={63} fill="#DDA5A8" rx={5} ry={3} />
      <Ellipse cx={71} cy={63} fill="#DDA5A8" rx={5} ry={3} />
      <Path d="M45 59Q50 56 55 59L50 64Z" fill="#B9727D" />
      <Path d={mood === 'happy' ? 'M42 65Q50 80 58 65Z' : 'M50 64V66M42 66Q46 72 50 66Q54 72 58 66'} fill={mood === 'happy' ? INK : 'none'} stroke={INK} strokeLinecap="round" strokeWidth={2} />
      <Path d="M46 67H54V72Q50 74 46 72Z" fill="#FFFDF3" stroke={INK} strokeLinejoin="round" strokeWidth={1.4} />
      <Path d="M50 68V72" stroke={INK} strokeWidth={1.2} />
      <Circle cx={50} cy={85} fill="#E6B768" r={3} stroke={INK} strokeWidth={1.7} />
    </G>
  );
}

function Cat({ mood }: { mood: Mood }) {
  return (
    <G>
      <Path d="M27 90Q27 73 48 72Q71 70 76 89" fill="#8FAEBB" {...outline} />
      <Path d="M73 86Q89 87 84 76Q81 71 86 68" fill="none" stroke={INK} strokeLinecap="round" strokeWidth={7} />
      <Path d="M73 86Q89 87 84 76Q81 71 86 68" fill="none" stroke="#8FAEBB" strokeLinecap="round" strokeWidth={3} />
      <Path d="M23 48L23 19Q24 14 28 18L43 32Q50 29 58 32L73 18Q78 14 78 21L77 49Q87 72 65 78Q50 84 34 78Q13 72 23 48Z" fill="#A6C0C9" {...outline} />
      <Path d="M29 34V25L37 34M65 34L72 25V35" fill="#DB9C9B" />
      <Path d="M60 33Q76 32 76 50L72 60Q61 63 56 52Q52 39 60 33Z" fill="#E8BD91" />
      <Path d="M44 33L47 40M51 32L53 39" fill="none" stroke="#6E919F" strokeLinecap="round" strokeWidth={3} />
      <Eyes left={37} right={63} y={51} mood={mood} />
      <Path d="M36 61Q40 55 50 59Q59 55 64 61Q70 73 50 76Q31 73 36 61Z" fill={CREAM} />
      <Path d="M45 59Q50 56 55 59L50 64Z" fill="#A16670" />
      <Path d={mood === 'happy' ? 'M42 66Q50 79 58 66Z' : 'M50 64V66M42 66Q46 72 50 66Q54 72 58 66'} fill={mood === 'happy' ? INK : 'none'} stroke={INK} strokeLinecap="round" strokeWidth={2} />
      <Path d="M21 59L32 61M20 66L31 65M69 61L80 59M70 65L82 66" fill="none" stroke={INK} strokeLinecap="round" strokeWidth={1.8} />
      <Path d="M33 78Q50 84 67 78L65 85Q50 89 35 85Z" fill="#BA8B9B" {...outline} />
      <Circle cx={50} cy={86} fill="#EBC569" r={5.5} {...outline} />
      <Path d="M50 85V88" stroke={INK} strokeLinecap="round" strokeWidth={1.6} />
    </G>
  );
}

const CHARACTERS = { fox: Fox, frog: Frog, owl: Owl, bear: Bear, rabbit: Rabbit, cat: Cat };
const BACKGROUNDS: Record<FrequencyAvatarId, string> = {
  fox: '#F7E5CF', frog: '#E7ECD4', owl: '#EAE2EF', bear: '#F3E3C9', rabbit: '#E8E3E8', cat: '#DFEAF0',
};

/** Original SVG tabletop companions. Motion belongs to the surrounding game UI. */
export function FrequencyAvatar({ name, avatarId, size = 52, mood = 'idle' }: FrequencyAvatarProps) {
  const savedId = useFrequencyAvatarStore((state) => getFrequencyAvatar(name, state.choices));
  const id = avatarId ?? savedId;
  const Character = CHARACTERS[id];
  return (
    <Svg accessible={false} height={size} viewBox="0 0 100 100" width={size}>
      <Circle cx={50} cy={52} fill={BACKGROUNDS[id]} r={46} />
      <Ellipse cx={50} cy={91} fill={INK} opacity={0.1} rx={27} ry={4} />
      <Character mood={mood} />
    </Svg>
  );
}
