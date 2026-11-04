import {previewHistory} from '../shared/turn-preview.mjs';
import {mergeHistory} from './native-state.mjs';
import {nativeFamilyRoot, isSettledTurn} from './native-family.mjs';

export const PREVIEW_THREAD_LIMIT = 24;
export const PREVIEW_TURN_LIMIT = 120;
const same = (a, b) => a === b || !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

// Intern only equal, completed native turns in a verified ancestor chain. Text
// similarity alone must never create a link or combine independent questions.
export const mergePreviewHistories = (previous, incoming, branches = {}, {olderId, resetId} = {}) => {
  const histories = {};
  for (const [id, history] of Object.entries(incoming).slice(0, PREVIEW_THREAD_LIMIT)) {
    if (!history?.thread) {histories[id] = history; continue;}
    let preview = previewHistory(history);
    // Background refresh must not pull an explicitly opened old-history window
    // back to the newest page when its bounded window has evicted newer turns.
    if (previous[id]?.windowed && previous[id].olderLoaded && id !== olderId && id !== resetId) {
      const visible = new Set(previous[id].turns.map(turn => turn.id));
      preview = {...preview, turns: preview.turns.filter(turn => visible.has(turn.id))};
    }
    const merged = mergeHistory(id === resetId ? null : previous[id], preview, id === olderId);
    if (id === olderId && previous[id]?.latestTurnId) merged.latestTurnId = previous[id].latestTurnId;
    const windowed = merged.turns.length > PREVIEW_TURN_LIMIT;
    const turns = windowed ? id === olderId ? merged.turns.slice(0, PREVIEW_TURN_LIMIT) : merged.turns.slice(-PREVIEW_TURN_LIMIT) : merged.turns;
    const old = new Map((previous[id]?.turns || []).map(turn => [turn.id, turn]));
    histories[id] = {...merged, windowed: windowed || merged.windowed, turns: turns.map(turn => same(old.get(turn.id), turn) ? old.get(turn.id) : turn)};
  }
  const done = new Set(), visiting = new Set();
  const validChain = id => {
    const seen = new Set();
    while (histories[id]?.thread) {
      if (seen.has(id)) return false;
      seen.add(id); id = histories[id].thread.forkedFromId || branches[id]?.parentId;
    }
    return true;
  };
  const intern = id => {
    if (done.has(id) || visiting.has(id) || !histories[id]?.thread) return;
    visiting.add(id);
    const ancestor = histories[id].thread.forkedFromId || branches[id]?.parentId;
    if (ancestor && ancestor !== id && !visiting.has(ancestor) && histories[ancestor]?.thread && validChain(id)) {
      intern(ancestor);
      const candidates = new Map(histories[ancestor].turns.map(turn => [turn.id, turn]));
      histories[id].turns = histories[id].turns.map(turn => {
        const original = candidates.get(turn.id);
        return isSettledTurn(turn) && same(original, turn) ? original : turn;
      });
    }
    visiting.delete(id); done.add(id);
  };
  for (const id of Object.keys(histories)) intern(id);
  // Siblings may share old native turns even when the parent's current page no
  // longer includes them. Reuse within that verified family, never by prose.
  const families = new Map();
  for (const [id, history] of Object.entries(histories)) {
    if (!history?.thread) continue;
    const root = nativeFamilyRoot(id, histories, branches);
    if (!root) continue;
    if (!families.has(root)) families.set(root, new Map());
    const pool = families.get(root);
    history.turns = history.turns.map(turn => {
      if (!isSettledTurn(turn)) return turn;
      const candidates = pool.get(turn.id) || [], original = candidates.find(candidate => same(candidate, turn));
      if (original) return original;
      pool.set(turn.id, [...candidates, turn]); return turn;
    });
  }
  return histories;
};
