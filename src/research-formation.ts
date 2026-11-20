/** A seekable formation schedule for the existing research graph.
 *
 * Layout, text and SVG geometry remain owned by ResearchProjection. This file
 * schedules only the time at which light reaches each actual connection and
 * node. Measured SVG arc lengths determine travel time; screen columns do not.
 */
export interface ResearchFormationNode {
  id: string;
  x: number;
  y: number;
  stage?: number;
  lane?: number;
  role?: "spine" | "component" | "branch";
  mainline?: boolean;
}

export interface ResearchFormationEdge {
  from: string;
  to: string;
  /** SVGPathElement.getTotalLength(), in the unchanged map's local units. */
  length: number;
  weight?: "primary" | "secondary";
  kind?: "continuation" | "branch" | "merge" | "correction";
}

export interface ResearchNodeFormationCue {
  id: string;
  /** Last forward dependency has arrived. The core starts at zero here. */
  arrival: number;
  coreEnd: number;
  labelStart: number;
  labelEnd: number;
}

export interface ResearchEdgeFormationCue {
  /** Preserves input/SVG order, including invalid references. */
  index: number;
  from: string;
  to: string;
  length: number;
  start: number;
  end: number;
  primary: boolean;
  /** Only cycle-closing edges; a forward correction remains a dependency. */
  feedback: boolean;
  valid: boolean;
}

export interface ResearchFormationOptions {
  entryNodeId?: string;
  narrativePath?: readonly string[];
  /** Defaults leave an empty opening and a completely settled final 7%. */
  start?: number;
  end?: number;
}

export interface ResearchFormationSchedule {
  nodes: Map<string, ResearchNodeFormationCue>;
  edges: ResearchEdgeFormationCue[];
  roots: string[];
}

const clamp = (v: number) => Number.isNaN(v) ? 0 : Math.max(0, Math.min(1, v));
const finite = (v: number | undefined, fallback = 0) => Number.isFinite(v) ? v! : fallback;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const smooth = (v: number) => { const t = clamp(v); return t * t * t * (10 + t * (-15 + t * 6)); };
const exposure = (p: number, a: number, b: number) => smooth((p - a) / Math.max(1e-9, b - a));

/**
 * Forward dependencies form a DAG after deterministic DFS back edges are
 * marked as feedback. A merge waits for every forward incoming edge. A cycle
 * is drawn in full, but its closing stroke follows the two established cores
 * instead of making their arrival times depend recursively on one another.
 *
 * Each source releases its main continuation before its local side branches;
 * branches overlap the continuing trunk. There is no global "all trunk, then
 * all branches" pass. Spatial order is used only for disconnected roots and
 * deterministic tie breaks, never as a replacement for graph connectivity.
 */
export function buildResearchFormation(
  nodes: readonly ResearchFormationNode[],
  edges: readonly ResearchFormationEdge[],
  options: ResearchFormationOptions = {},
): ResearchFormationSchedule {
  const last = Math.max(.001, clamp(finite(options.end, .93)));
  const first = Math.min(last - .001, clamp(finite(options.start, .03)));
  // Reserving these proportions keeps the default core exposure at 207–253ms
  // in a 2300ms formation interval, independent of the number of graph nodes.
  const window = last - first;
  const coreSpan = window * .10;
  const labelSpan = window * (17 / 90);
  const graphEnd = last - labelSpan;
  const byId = new Map<string, ResearchFormationNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`Duplicate research formation node: ${node.id}`);
    byId.set(node.id, node);
  }
  const route = new Map((options.narrativePath ?? []).map((id, i) => [id, i]));
  const main = (node: ResearchFormationNode) => node.mainline === true || node.role === "spine" || route.has(node.id);
  const order = (a: ResearchFormationNode, b: ResearchFormationNode) =>
    finite(a.stage, finite(a.x)) - finite(b.stage, finite(b.x)) ||
    finite(a.x) - finite(b.x) || Number(main(b)) - Number(main(a)) ||
    finite(a.lane, finite(a.y)) - finite(b.lane, finite(b.y)) ||
    finite(a.y) - finite(b.y) || compareText(a.id, b.id);
  const ordered = [...nodes].sort(order);
  const rank = new Map(ordered.map((node, i) => [node.id, i]));
  const outgoing = new Map(ordered.map(node => [node.id, [] as ResearchEdgeFormationCue[]]));
  const incoming = new Map(ordered.map(node => [node.id, [] as ResearchEdgeFormationCue[]]));
  const resultEdges = edges.map((edge, index): ResearchEdgeFormationCue => {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    const routeFrom = route.get(edge.from), routeTo = route.get(edge.to);
    const primary = edge.weight === "primary" ||
      (routeFrom !== undefined && routeTo === routeFrom + 1) ||
      (edge.weight === undefined && edge.kind !== "branch" && !!from && !!to && main(from) && main(to));
    const cue = {
      index, from: edge.from, to: edge.to,
      length: Math.max(0, finite(edge.length, from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0)),
      start: last, end: last, primary, feedback: false, valid: !!from && !!to,
    };
    if (cue.valid) { outgoing.get(cue.from)!.push(cue); incoming.get(cue.to)!.push(cue); }
    return cue;
  });
  const edgeOrder = (a: ResearchEdgeFormationCue, b: ResearchEdgeFormationCue) =>
    Number(b.primary) - Number(a.primary) ||
    order(byId.get(a.to)!, byId.get(b.to)!) ||
    compareText(edges[a.index].kind ?? "", edges[b.index].kind ?? "") ||
    a.length - b.length || a.index - b.index;
  for (const list of outgoing.values()) list.sort(edgeOrder);

  // Iterative DFS also handles long imported histories without call-stack
  // dependence. Begin at real roots; an entry in the middle never cuts history.
  const colour = new Map<string, number>();
  const entryFirst = (a: ResearchFormationNode, b: ResearchFormationNode) =>
    Number(b.id === options.entryNodeId) - Number(a.id === options.entryNodeId) || order(a, b);
  const trueRoots = ordered.filter(node => incoming.get(node.id)!.length === 0).sort(entryFirst);
  const starts = [...trueRoots, ...ordered.filter(node => !trueRoots.includes(node)).sort(entryFirst)];
  for (const initial of starts) {
    if (colour.has(initial.id)) continue;
    colour.set(initial.id, 1);
    const stack = [{ id: initial.id, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1], list = outgoing.get(frame.id)!;
      if (frame.next >= list.length) { colour.set(frame.id, 2); stack.pop(); continue; }
      const edge = list[frame.next++], state = colour.get(edge.to) ?? 0;
      if (state === 1) edge.feedback = true;
      else if (state === 0) { colour.set(edge.to, 1); stack.push({ id: edge.to, next: 0 }); }
    }
  }

  const lengths = resultEdges.filter(edge => edge.valid && !edge.feedback && edge.length > 0).map(edge => edge.length).sort((a, b) => a - b);
  const medianLength = Math.max(1, lengths[Math.floor(lengths.length / 2)] ?? 1);
  const indegree = new Map(ordered.map(node => [node.id, incoming.get(node.id)!.filter(edge => !edge.feedback).length]));
  const roots = ordered.filter(node => indegree.get(node.id) === 0).sort(entryFirst);
  const rootRank = new Map(roots.map((node, i) => [node.id, i]));
  const ready = [...roots];
  const arrivals = new Map<string, number>();
  const raw = new Map<number, { start: number; end: number }>();
  while (ready.length) {
    const node = ready.shift()!;
    const dependencies = incoming.get(node.id)!.filter(edge => !edge.feedback);
    const arrival = dependencies.length
      ? Math.max(...dependencies.map(edge => raw.get(edge.index)!.end)) + .035 + (rank.get(node.id) ?? 0) * .003
      : (rootRank.get(node.id) ?? 0) * .27;
    arrivals.set(node.id, arrival);
    let primaryIndex = 0, branchIndex = 0;
    for (const edge of outgoing.get(node.id)!.filter(edge => !edge.feedback)) {
      const offset = edge.primary ? .12 + primaryIndex++ * .16 : .48 + branchIndex++ * .18;
      const start = arrival + offset;
      // Length affects both travel duration and the final arc distance. Short
      // or zero-length links still have finite time to release their child.
      const end = start + Math.max(.30, edge.length / medianLength);
      raw.set(edge.index, { start, end });
      const left = indegree.get(edge.to)! - 1;
      indegree.set(edge.to, left);
      if (left === 0) { ready.push(byId.get(edge.to)!); ready.sort(order); }
    }
  }
  const maxArrival = Math.max(1, ...arrivals.values());
  const normalise = (value: number) => first + value / maxArrival * (graphEnd - first);
  const resultNodes = new Map<string, ResearchNodeFormationCue>();
  for (const node of ordered) {
    const arrival = normalise(arrivals.get(node.id) ?? 0);
    resultNodes.set(node.id, {
      id: node.id, arrival,
      coreEnd: Math.min(last, arrival + coreSpan * (rootRank.has(node.id) ? 1.22 : node.role === "branch" ? 1.11 : 1)),
      labelStart: Math.min(last, arrival + window * .05),
      labelEnd: Math.min(last, arrival + labelSpan),
    });
  }
  for (const edge of resultEdges) {
    if (!edge.valid || edge.feedback) continue;
    const timing = raw.get(edge.index)!;
    edge.start = normalise(timing.start); edge.end = normalise(timing.end);
  }
  const feedback = resultEdges.filter(edge => edge.valid && edge.feedback).sort((a, b) =>
    order(byId.get(a.from)!, byId.get(b.from)!) || edgeOrder(a, b));
  const feedbackCounts = new Map<string, number>();
  for (const edge of feedback) {
    const after = Math.max(resultNodes.get(edge.from)!.arrival, resultNodes.get(edge.to)!.arrival);
    const index = feedbackCounts.get(edge.from) ?? 0;
    feedbackCounts.set(edge.from, index + 1);
    edge.start = Math.min(last - window * .07, after + window * (.04 + index * .01));
    const duration = window * (.075 + .035 * Math.min(2, edge.length / medianLength));
    edge.end = Math.min(last - window * .025, edge.start + duration);
  }
  return { nodes: resultNodes, edges: resultEdges, roots: roots.map(node => node.id) };
}

/** Pure node channels. A caller may keep text on its separate reading clock. */
export function sampleResearchNode(cue: ResearchNodeFormationCue, progress: number) {
  const p = clamp(progress);
  if (p === 0) return { core: 0, label: 0 };
  if (p === 1) return { core: 1, label: 1 };
  return { core: exposure(p, cue.arrival, cue.coreEnd), label: exposure(p, cue.labelStart, cue.labelEnd) };
}

/** Linear arc-length advance; only the short-lived head's light is eased. */
export function sampleResearchEdge(cue: ResearchEdgeFormationCue, progress: number) {
  if (!cue.valid) return { growth: 0, distance: 0, head: 0 };
  const p = clamp(progress);
  const growth = p === 0 ? 0 : p === 1 ? 1 : clamp((p - cue.start) / Math.max(1e-9, cue.end - cue.start));
  return { growth, distance: cue.length * growth, head: clamp(16 * growth * growth * (1 - growth) * (1 - growth)) };
}
