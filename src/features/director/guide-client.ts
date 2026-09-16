import { classifyGuideQuestion, guideReply, guideResponseSchema, makeGuideRequest, type GuideContext, type GuideIntent, type GuideMechanic, type GuideResponse } from './guide-domain';

export function guideServiceUrl(relayUrl: string, explicit?: string): string {
  const url = new URL(explicit?.trim() || relayUrl);
  if (!explicit?.trim()) { url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'; url.port = '8788'; url.pathname = ''; }
  const octets = url.hostname.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && octets.every(part => Number.isInteger(part) && part >= 0 && part <= 255);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) || (ipv4 && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)));
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) throw new Error('Invalid guide URL.');
  return url.toString().replace(/\/$/, '');
}

export async function askGuide(options: {
  question: string; mechanic: GuideMechanic; previousIntents?: readonly GuideIntent[];
  context?: GuideContext; history?: { question: string; reply: string }[];
  baseUrl?: string; fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number;
}): Promise<GuideResponse & { offlineReason?: 'unavailable' | 'busy' }> {
  const request = makeGuideRequest(options.question, options.mechanic, options.previousIntents, options.context, options.history);
  const local = (): GuideResponse => { const intent = classifyGuideQuestion(request); return { protocolVersion: 1, source: 'local', intent, reply: guideReply(intent, request.mechanic, request.previousIntents) }; };
  if (!options.baseUrl) return { ...local(), offlineReason: 'unavailable' };
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, options.timeoutMs ?? 35_000);
  try {
    if (options.signal?.aborted) throw new Error('aborted');
    const response = await (options.fetchImpl ?? fetch)(`${options.baseUrl}/guide/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request), signal: controller.signal,
    });
    if (!response.ok) return { ...local(), offlineReason: response.status === 429 ? 'busy' : 'unavailable' };
    const text = await response.text();
    if (text.length > 10000) throw new Error('Oversized guide response.');
    const result = guideResponseSchema.parse(JSON.parse(text));
    if (result.source === 'ai' && !result.reply) throw new Error('Outdated guide server.');
    return { ...result, ...(result.fallbackReason && result.fallbackReason !== 'safety' ? { offlineReason: result.fallbackReason === 'busy' ? 'busy' as const : 'unavailable' as const } : {}) };
  } catch {
    return { ...local(), offlineReason: 'unavailable' };
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener('abort', abort);
  }
}
