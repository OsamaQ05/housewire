import { createContext, useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { StoryRoomId } from './types';

export const ROOM_PRESENTATIONS = {
  'line-13': { background: '#17383D', panel: '#274B4E', border: '#759589', muted: '#D5DBCA', label: 'THE TOY-MAKER’S WORKSHOP', icon: 'construct-outline', serif: false },
  'night-glass': { background: '#1C303A', panel: '#29464A', border: '#728E7D', muted: '#CDD5C1', label: 'THE COURTYARD ACROSS TIME', icon: 'sunny-outline', serif: true },
  'long-table': { background: '#30221D', panel: '#4C372D', border: '#82654C', muted: '#DCC8B5', label: 'MINA’S DINNER TABLE', icon: 'restaurant-outline', serif: false },
} as const;

const RoomContext = createContext<StoryRoomId | undefined>(undefined);
export function StoryRoomSkin({ roomId, children }: { roomId: StoryRoomId; children: ReactNode }) {
  return <RoomContext.Provider value={roomId}>{children}</RoomContext.Provider>;
}
export function useRoomPresentation() {
  const id = useContext(RoomContext);
  return id ? ROOM_PRESENTATIONS[id] : undefined;
}

export function RoomMark({ roomId, accent }: { roomId: StoryRoomId; accent: string }) {
  const look = ROOM_PRESENTATIONS[roomId];
  return <View accessible={false} style={{ width: 38, height: 38, borderWidth: 1, borderColor: look.border, backgroundColor: look.panel, borderRadius: roomId === 'night-glass' ? 19 : roomId === 'long-table' ? 12 : 5, alignItems: 'center', justifyContent: 'center' }}>
    {roomId === 'night-glass' ? <Svg width={26} height={26} viewBox="0 0 32 32"><Path d="M8 28V6H24V28M5 7H27M10 2V5M22 2V5M16 7V22M8 16H24" fill="none" stroke={accent} strokeWidth={2} /><Path d="M5 28H27M12 28V23H20V28" fill="none" stroke={accent} strokeWidth={2} /></Svg> : roomId === 'line-13' ? <Svg width={27} height={27} viewBox="0 0 32 32"><Rect x={4} y={15} width={14} height={13} rx={2} fill={accent} /><Path d="M18 28H29L23 13Z" fill="#E58B73" /><Circle cx={11} cy={9} r={5} fill="#F0DFC0" /><Path d="M7 22H15M11 18V26" stroke="#294B4C" strokeWidth={1.5} /></Svg> : <Ionicons name={look.icon} size={21} color={accent} />}
  </View>;
}
