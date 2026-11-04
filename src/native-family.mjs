// A missing parent still identifies a known native family. Cyclic metadata must
// fail open rather than combine unrelated records using a fabricated root.
export const isSettledTurn = turn => ['completed', 'interrupted', 'failed'].includes(turn?.status);

export const nativeFamilyRoot = (id, histories, branches = {}) => {
  const seen = new Set();
  while (id) {
    if (seen.has(id)) return null;
    seen.add(id);
    const parent = histories[id]?.thread?.forkedFromId || branches[id]?.parentId;
    if (!parent) return id;
    id = parent;
  }
  return null;
};
