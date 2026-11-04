export const DETAIL_CACHE_LIMITS = Object.freeze({entries: 16, bytes: 8 * 1024 * 1024});

// Small domain-specific LRU: values are complete native turns, never drafts or
// authoritative history. The byte budget estimates UTF-16 JSON payload, not RAM.
export class TurnDetailCache {
  entries = new Map(); bytes = 0;
  constructor(limits = DETAIL_CACHE_LIMITS) {this.limits = limits;}
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.turn;
  }
  set(key, turn) {
    const old = this.entries.get(key);
    if (old) {this.bytes -= old.bytes; this.entries.delete(key);}
    if (['inProgress', 'in_progress', 'running'].includes(turn.status)) return;
    const bytes = JSON.stringify(turn).length * 2 + key.length * 2;
    // Oversized content can still be read in the active pane, but is not cached.
    if (bytes > this.limits.bytes) return;
    this.entries.set(key, {turn, bytes}); this.bytes += bytes;
    while (this.entries.size > this.limits.entries || this.bytes > this.limits.bytes) {
      const oldest = this.entries.keys().next().value;
      this.bytes -= this.entries.get(oldest).bytes; this.entries.delete(oldest);
    }
  }
  clear() {this.entries.clear(); this.bytes = 0;}
}

export const loadTurnDetail = async (call, id, turnId) => {
  try {
    const result = await call('read_turn', {id, turnId});
    if (result?.threadId !== id || result?.turn?.id !== turnId) throw new Error('详情与所选问答不一致，请重试');
    return result.turn;
  } catch (error) {
    // Compatibility with an already-running older controller; no chat mutation.
    if (!/不支持.*操作|unsupported|unknown.*read_turn|Unexpected.*read_turn/i.test(error.message)) throw error;
    const seen = new Set(); let cursor;
    do {
      const page = await call('read_session', {id, ...(cursor ? {cursor} : {})});
      const turn = page.turns?.find(turn => turn.id === turnId);
      if (turn) return turn;
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('历史分页游标重复，未继续读取');
      if (cursor) seen.add(cursor);
    } while (cursor);
    throw new Error('该轮问答已不存在，请同步会话后重试');
  }
};
