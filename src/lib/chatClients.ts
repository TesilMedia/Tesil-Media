type SendFn = (data: string) => void;

// Survive Next.js hot-reload by pinning to globalThis (same pattern as prisma.ts).
const g = globalThis as typeof globalThis & {
  _chatClients?: Map<string, Set<SendFn>>;
  _chatRateLimit?: Map<string, number>;
};

if (!g._chatClients) g._chatClients = new Map();
if (!g._chatRateLimit) g._chatRateLimit = new Map();

const clients = g._chatClients;
const rateLimitMap = g._chatRateLimit;

export function addChatClient(streamId: string, send: SendFn): void {
  if (!clients.has(streamId)) clients.set(streamId, new Set());
  clients.get(streamId)!.add(send);
}

export function removeChatClient(streamId: string, send: SendFn): void {
  clients.get(streamId)?.delete(send);
}

export function broadcastChat(streamId: string, payload: object): void {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  const set = clients.get(streamId);
  if (!set) return;
  for (const send of set) {
    try {
      send(line);
    } catch {
      set.delete(send);
    }
  }
}

// 1 message per second per user.
export function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(userId) ?? 0;
  if (now - last < 1_000) return true;
  rateLimitMap.set(userId, now);
  return false;
}
