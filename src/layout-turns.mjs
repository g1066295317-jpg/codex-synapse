export const TURN_CARD_SIZE = Object.freeze({width: 370, height: 400});
const COLUMN = 440, ROW = 520;

// Bounded, fixed-card layout for a native conversation DAG. Shared-history
// nodes can have several parents; every layer explicitly reserves card slots.
export const layoutTurns = (records, edges) => {
  const keys = [...records.keys()], order = new Map(keys.map((key, index) => [key, index]));
  const parents = new Map(keys.map(key => [key, []])), children = new Map(keys.map(key => [key, []]));
  for (const {source, target} of edges) {
    if (!parents.has(source) || !parents.has(target) || source === target) continue;
    children.get(source).push(target); parents.get(target).push(source);
  }
  const remaining = new Map(keys.map(key => [key, parents.get(key).length]));
  const roots = keys.filter(key => !remaining.get(key)), queue = [...roots];
  const depth = new Map(roots.map(key => [key, 0]));
  const visited = new Set(); let index = 0;
  while (visited.size < keys.length) {
    // If malformed input contains a cycle, continue from one stable record and
    // retain the downstream order instead of flattening every blocked node.
    if (index >= queue.length) {
      const key = keys.find(key => !visited.has(key));
      const known = parents.get(key).filter(parent => visited.has(parent));
      depth.set(key, known.length ? Math.max(...known.map(parent => depth.get(parent))) + 1 : 0);
      queue.push(key);
    }
    const key = queue[index++]; if (visited.has(key)) continue; visited.add(key);
    for (const child of children.get(key)) {
      if (visited.has(child)) continue;
      depth.set(child, Math.max(depth.get(child) || 0, depth.get(key) + 1));
      remaining.set(child, remaining.get(child) - 1);
      if (!remaining.get(child)) queue.push(child);
    }
  }
  const layers = new Map();
  for (const key of keys) {
    const row = depth.get(key) || 0;
    if (!layers.has(row)) layers.set(row, []);
    layers.get(row).push(key);
  }
  const positions = new Map(), rootSlots = new Map(roots.map((key, index) => [key, index * COLUMN]));
  for (const [row, layer] of [...layers].sort(([a], [b]) => a - b)) {
    const wanted = key => {
      const ancestors = parents.get(key).filter(parent => positions.has(parent));
      return ancestors.length ? ancestors.reduce((sum, parent) => sum + positions.get(parent).x, 0) / ancestors.length : rootSlots.get(key) || 0;
    };
    const targets = new Map(layer.map(key => [key, wanted(key)]));
    layer.sort((a, b) => targets.get(a) - targets.get(b) || order.get(a) - order.get(b));
    let next = 0;
    for (const key of layer) {
      const x = Math.max(next, targets.get(key));
      positions.set(key, {x, y: row * ROW}); next = x + COLUMN;
    }
  }
  return positions;
};
