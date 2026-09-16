export type DefusalRole = 'operator' | 'archivist' | 'witness';
export type DefusalStatus = 'waiting' | 'playing' | 'defused' | 'failed';
export type DefusalMode = 'practice' | 'live';
export type DefusalModuleKind = 'sockets' | 'leads' | 'route' | 'phrase';
export interface DefusalPlayer { id: string; name: string; role: DefusalRole }
export interface DefusalOption { id: string; label: string; detail?: string; x?: number; y?: number }
export interface DefusalDevice {
  instruction: string;
  options: DefusalOption[];
  selectionCount: number;
  ordered: boolean;
  /** Text is accepted only for the final phrase. */
  textEntry?: boolean;
  indicator?: string;
  edges?: [string, string][];
  start?: string;
  end?: string;
}
export interface DefusalPaper { heading: string; lines: string[] }
export interface DefusalModule {
  id: string;
  kind: DefusalModuleKind;
  title: string;
  objective: string;
  device: DefusalDevice;
  manual: DefusalPaper;
  witness: DefusalPaper;
  seal: string;
  /** Authority-only. Never send a compiled module or the seed to a guest. */
  solution: string[];
}
export interface DefusalGame {
  version: 1;
  seed: number;
  tutorial: boolean;
  modules: DefusalModule[];
  durationMs: number;
  maxStrikes: number;
}
export interface DefusalState {
  id: string;
  hostId: string;
  mode: DefusalMode;
  game: DefusalGame;
  players: DefusalPlayer[];
  status: DefusalStatus;
  stageIndex: number;
  revision: number;
  strikes: number;
  startedAt?: number;
  deadline?: number;
  finishedAt?: number;
  cooldownUntil: number;
  readyNodeIds: string[];
  seenActionIds: string[];
  feedback?: string;
}
/** Deliberate allowlist: current role's material, never another role's payload or answer. */
export interface DefusalView {
  id: string;
  mode: DefusalMode;
  tutorial: boolean;
  status: DefusalStatus;
  role: DefusalRole;
  players: DefusalPlayer[];
  stageIndex: number;
  moduleCount: number;
  revision: number;
  strikes: number;
  maxStrikes: number;
  startedAt?: number;
  deadline?: number;
  finishedAt?: number;
  cooldownUntil: number;
  readyNodeIds: string[];
  seals: { title: string; text: string }[];
  feedback?: string;
  module?: {
    id: string;
    kind: DefusalModuleKind;
    title: string;
    objective: string;
    device?: DefusalDevice;
    manual?: DefusalPaper;
    witness?: DefusalPaper;
  };
  /** Only projected once the entire cooperative run failed. */
  review?: { title: string; answer: string; explanation: string }[];
}
export type DefusalAction =
  | { type: 'ready'; actionId: string; operationId: string; stageIndex: number }
  | { type: 'commit'; actionId: string; operationId: string; stageIndex: number; answer: string[] };
export interface DefusalTransition { state: DefusalState; accepted: boolean; reason?: string }
