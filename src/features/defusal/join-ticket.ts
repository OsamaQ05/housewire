import { z } from 'zod';

const ticketSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{5}$/),
  relayUrl: z.string().max(240).refine((value) => {
    try { const url = new URL(value); return ['ws:', 'wss:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; }
    catch { return false; }
  }),
}).strict();
export type DefusalJoinTicket = z.infer<typeof ticketSchema>;
export function makeDefusalJoinTicket(code: string, relayUrl: string, baseUrl = 'housewire://defusal'): string {
  const ticket = ticketSchema.parse({ code, relayUrl });
  const url = new URL(baseUrl);
  url.searchParams.set('join', '1'); url.searchParams.set('c', ticket.code); url.searchParams.set('r', ticket.relayUrl);
  return url.toString();
}
export function parseDefusalJoinTicket(value: string): DefusalJoinTicket | undefined {
  try {
    if (value.length > 1_024) return undefined;
    const url = new URL(value);
    if (!['housewire:', 'exp:', 'exps:', 'http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    if (url.hostname !== 'defusal' && url.pathname.split('/').filter(Boolean).at(-1) !== 'defusal') return undefined;
    return parseDefusalJoinParams({ c: url.searchParams.get('c') ?? undefined, r: url.searchParams.get('r') ?? undefined });
  } catch { return undefined; }
}
export function parseDefusalJoinParams(params: { c?: string | string[]; r?: string | string[] }): DefusalJoinTicket | undefined {
  const c = Array.isArray(params.c) ? params.c[0] : params.c;
  const r = Array.isArray(params.r) ? params.r[0] : params.r;
  const result = ticketSchema.safeParse({ code: c?.trim().toUpperCase(), relayUrl: r?.trim() });
  return result.success ? result.data : undefined;
}
