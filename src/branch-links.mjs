// Native sequential history is authoritative. An optional fork anchor may not
// point back into inherited history or close a cycle through another path.
export const appendBranchLinks = (records, edges, links) => {
  const outgoing = new Map([...records.keys()].map(id => [id, []]));
  const ids = new Set(edges.map(edge => edge.id));
  for (const edge of edges) outgoing.get(edge.source)?.push(edge.target);
  const reaches = (start, target) => {
    const stack = [start], seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (id === target) return true;
      if (seen.has(id)) continue;
      seen.add(id); stack.push(...(outgoing.get(id) || []));
    }
    return false;
  };
  for (const {source, target} of links) {
    const id = source + '>' + target;
    if (!records.has(source) || !records.has(target) || ids.has(id) || reaches(target, source)) continue;
    ids.add(id); outgoing.get(source).push(target);
    edges.push({id, source, target, type:'smoothstep', data:{branch:true}, style:{stroke:'#b4865a',strokeWidth:1.6}});
  }
};
