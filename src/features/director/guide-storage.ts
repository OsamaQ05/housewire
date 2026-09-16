import { parseGuideHistory, type GuideMessage } from './guide-domain';

interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> }
interface Thread { key: string; messages: GuideMessage[] }
const KEY = 'housewire-guide-conversations-v1';

/** Bounded, serialized local history. Never sent to the model. */
export function createGuideHistoryRepository(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Thread[]> => {
    const serialized = await storage.getItem(KEY);
    try {
      const parsed: unknown = JSON.parse(serialized ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is Thread => Boolean(item && typeof item.key === 'string' && item.key.length < 600 && Array.isArray(item.messages)))
        .slice(-32).map(item => ({ key: item.key, messages: parseGuideHistory(JSON.stringify(item.messages)) }));
    } catch { return []; }
  };
  return {
    async get(key: string) { await queue.catch(() => undefined); return (await read()).find(item => item.key === key)?.messages ?? []; },
    set(key: string, messages: GuideMessage[]) {
      const next = queue.catch(() => undefined).then(async () => {
        const existing = await read();
        const threads = existing.filter(item => item.key !== key);
        if (messages.length) threads.push({ key, messages: parseGuideHistory(JSON.stringify(messages.slice(-24))) });
        await storage.setItem(KEY, JSON.stringify(threads.slice(-32)));
      });
      queue = next;
      return next;
    },
  };
}
