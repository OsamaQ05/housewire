import { z } from 'zod';

const ticketSchema = z.object({
  version: z.literal(1),
  code: z.string().regex(/^[A-Z0-9]{5}$/),
  relayUrl: z.string().max(240).refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password;
    } catch {
      return false;
    }
  }),
}).strict();

export type CircuitRaceJoinTicket = z.infer<typeof ticketSchema>;
export type CircuitRaceRouteParam = string | string[] | undefined;

export function makeCircuitRaceJoinTicket(code: string, relayUrl: string, baseUrl = 'housewire://race-join'): string {
  const ticket = ticketSchema.parse({ version: 1, code: code.toUpperCase(), relayUrl });
  const url = parseRaceJoinUrl(baseUrl);
  if (!url) throw new Error('Circuit Race invites require a race-join app or web URL.');
  url.searchParams.set('v', String(ticket.version));
  url.searchParams.set('c', ticket.code);
  url.searchParams.set('r', ticket.relayUrl);
  return url.toString();
}

export function parseCircuitRaceJoinTicket(value: string): CircuitRaceJoinTicket | undefined {
  try {
    if (value.length > 1_024) return undefined;
    const url = parseRaceJoinUrl(value);
    if (!url) return undefined;
    const parsed = ticketSchema.safeParse({
      version: Number(url.searchParams.get('v')),
      code: url.searchParams.get('c')?.toUpperCase(),
      relayUrl: url.searchParams.get('r'),
    });
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseCircuitRaceRouteParams(params: {
  c?: CircuitRaceRouteParam;
  r?: CircuitRaceRouteParam;
  v?: CircuitRaceRouteParam;
}): CircuitRaceJoinTicket | undefined {
  const code = first(params.c);
  const relay = first(params.r);
  const version = first(params.v);
  if (!code || !relay || !version) return undefined;
  const parsed = ticketSchema.safeParse({
    version: Number(version),
    code: code.toUpperCase(),
    relayUrl: relay,
  });
  return parsed.success ? parsed.data : undefined;
}

function first(value: CircuitRaceRouteParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseRaceJoinUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    const path = url.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase();
    const allowed = ['housewire:', 'exp:', 'exps:', 'http:', 'https:'].includes(url.protocol);
    if (
      !allowed ||
      url.username ||
      url.password ||
      (url.hostname.toLowerCase() !== 'race-join' && path !== 'race-join')
    ) return undefined;
    return url;
  } catch {
    return undefined;
  }
}
