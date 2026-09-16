import { addDefusalPlayer, applyDefusalAction, projectDefusal, tickDefusal, type DefusalState, type DefusalView } from '../../domain/defusal';
import { defusalMessageSchema, type DefusalMessage } from './protocol';

export interface DefusalDelivery { recipientId: string; message: DefusalMessage }
export function defusalDeliveries(state: DefusalState, now: number): DefusalDelivery[] {
  return state.players.filter((player) => player.id !== state.hostId).map((player) => ({
    recipientId: player.id,
    message: { channel: 'last-light-v1', type: 'snapshot', recipientId: player.id, hostNow: now, view: projectDefusal(state, player.id)! },
  }));
}
/** senderId is supplied by the authenticated relay frame, NEVER by a claimed payload field. */
export function handleDefusalMessage(state: DefusalState, senderId: string, raw: unknown, now: number): { state: DefusalState; deliveries: DefusalDelivery[] } {
  const parsed = defusalMessageSchema.safeParse(raw);
  if (!parsed.success || senderId === state.hostId) return { state, deliveries: [] };
  const message = parsed.data;
  let next = tickDefusal(state, now);
  const notice = (text: string) => ({ state: next, deliveries: [{ recipientId: senderId, message: { channel: 'last-light-v1', type: 'notice', text } as DefusalMessage }] });
  if (message.type === 'join') {
    next = addDefusalPlayer(next, { id: senderId, name: message.name });
    if (!next.players.some((player) => player.id === senderId)) return notice(next.status === 'waiting' ? 'This device already has four players.' : 'This run has started. Ask the host to create the next device.');
    return { state: next, deliveries: defusalDeliveries(next, now) };
  }
  if (!next.players.some((player) => player.id === senderId)) return notice('Join this device before sending a move.');
  if (message.type === 'request') return { state: next, deliveries: defusalDeliveries(next, now).filter((delivery) => delivery.recipientId === senderId) };
  if (message.type === 'action') {
    const result = applyDefusalAction(next, senderId, message.action, now);
    next = result.state;
    if (!result.accepted) return notice(result.reason ?? 'That move could not be accepted.');
    return { state: next, deliveries: defusalDeliveries(next, now) };
  }
  // A guest-supplied snapshot/notice has no authority over the host.
  return { state, deliveries: [] };
}
export function acceptDefusalSnapshot(options: { senderId: string; localNodeId: string; hostId: string; raw: unknown; current?: DefusalView }): { view: DefusalView; hostNow: number } | undefined {
  if (options.senderId !== options.hostId) return undefined;
  const parsed = defusalMessageSchema.safeParse(options.raw);
  if (!parsed.success || parsed.data.type !== 'snapshot' || parsed.data.recipientId !== options.localNodeId) return undefined;
  const view = parsed.data.view;
  const player = view.players.find((entry) => entry.id === options.localNodeId);
  if (!player || player.role !== view.role || view.players[0].id !== options.hostId) return undefined;
  if (options.current?.id === view.id && options.current.revision > view.revision) return undefined;
  return { view, hostNow: parsed.data.hostNow };
}
