const unsupported = error => /unsupported|legacy|unknown variant|method not found|does not support/i.test(error.message);

const findTurn = async (rpc, threadId, turnId, itemsView) => {
  const seen = new Set();
  let cursor;
  do {
    const page = await rpc.call('thread/turns/list', {threadId, itemsView, limit: 50, sortDirection: 'desc', ...(cursor ? {cursor} : {})});
    const turn = page.data.find(item => item.id === turnId);
    if (turn) return turn;
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('历史分页游标重复，未继续读取');
    if (cursor) seen.add(cursor);
  } while (cursor);
  throw new Error('该轮问答已不存在，请同步会话后重试');
};

// Read exactly one turn without resuming, subscribing, or changing stored history.
export const readTurn = async (rpc, threadId, turnId) => {
  try {
    const turn = await findTurn(rpc, threadId, turnId, 'notLoaded');
    const items = [], seen = new Set();
    let cursor;
    do {
      const page = await rpc.call('thread/items/list', {threadId, turnId, limit: 100, sortDirection: 'asc', ...(cursor ? {cursor} : {})});
      for (const entry of page.data) {
        if (entry.turnId !== turnId) throw new Error('接口返回了其他轮次的内容，未展示');
        // Internal reasoning is not part of the public question/answer reader.
        if (entry.item.type !== 'reasoning') items.push(entry.item);
      }
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('详情分页游标重复，未继续读取');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return {...turn, items, itemsView: 'full'};
  } catch (error) {
    if (!unsupported(error)) throw error;
    try {
      const turn = await findTurn(rpc, threadId, turnId, 'full');
      return {...turn, items: (turn.items || []).filter(item => item.type !== 'reasoning'), itemsView: 'full'};
    } catch (fallback) {
      if (!unsupported(fallback)) throw fallback;
      const {thread} = await rpc.call('thread/read', {threadId, includeTurns: true});
      const turn = thread.turns?.find(item => item.id === turnId);
      if (!turn) throw new Error('该轮问答已不存在，请同步会话后重试');
      return {...turn, items: (turn.items || []).filter(item => item.type !== 'reasoning'), itemsView: 'full'};
    }
  }
};
