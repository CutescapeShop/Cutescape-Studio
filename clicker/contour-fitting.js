// Artwork-only curve fitting. No morphology, offsets, polygon cleanup or
// island filtering: an unsafe network is returned exactly as supplied.
export const CONTOUR_LIMITS_MM = Object.freeze({
  displacement: 0.04,
  thinDetail: 0.02,
  localFraction: 0.25,
  chordError: 0.01,
  curvedSegmentLength: 0.10,
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const key = (p) => `${p.x},${p.y}`;
const area = (loop) => loop.reduce((sum, p, i) => {
  const q = loop[(i + 1) % loop.length];
  return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;

function pointDistance(p, a, b) {
  const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length2 ? Math.max(0, Math.min(1,
    ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length2)) : 0;
  return distance(p, lerp(a, b, t));
}

function onSegment(p, a, b) { return pointDistance(p, a, b) < 1e-9; }
function intersects(a, b, c, d) {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
    || onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}
function segmentDistance(a, b, c, d) {
  return intersects(a, b, c, d) ? 0 : Math.min(
    pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b));
}

function inside(p, loop) {
  let result = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

// Small physical cells avoid quadratic work on pixel-dense color boundaries.
function spatialIndex(segments) {
  const cells = new Map(), cellSize = 0.4;
  function visit(a, b, margin, callback) {
    for (let x = Math.floor((Math.min(a.x, b.x) - margin) / cellSize); x <= Math.floor((Math.max(a.x, b.x) + margin) / cellSize); x++)
      for (let y = Math.floor((Math.min(a.y, b.y) - margin) / cellSize); y <= Math.floor((Math.max(a.y, b.y) + margin) / cellSize); y++) callback(`${x}:${y}`);
  }
  segments.forEach((s, i) => visit(s.a, s.b, 0, (cell) => {
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(i);
  }));
  return (a, b, margin = 0) => {
    const found = new Set();
    visit(a, b, margin, (cell) => { for (const i of cells.get(cell) || []) found.add(i); });
    return [...found].map((i) => segments[i]);
  };
}

// Shared endpoints are legal only when they are the SAME network node.
// Coincident new endpoints or overlapping unrelated segments are rejected.
function validEmbedding(segments) {
  const query = spatialIndex(segments);
  for (let i = 0; i < segments.length; i++) segments[i].index = i;
  for (const s of segments) for (const t of query(s.a, s.b)) {
    if (t.index <= s.index) continue;
    const shared = [s.a, s.b].find((p) => p === t.a || p === t.b);
    if (shared) {
      const a = s.a === shared ? s.b : s.a, b = t.a === shared ? t.b : t.a;
      if (onSegment(a, shared, b) || onSegment(b, shared, a)) return false;
    } else if (intersects(s.a, s.b, t.a, t.b)) return false;
  }
  return true;
}

function sampleDirection(vertex, neighbor, length) {
  let previous = vertex, current = neighbor, traveled = distance(vertex.p, neighbor.p);
  const visited = new Set([vertex]);
  while (traveled < length && current.neighbors.size === 2 && !visited.has(current)) {
    visited.add(current);
    const next = [...current.neighbors].find((v) => v !== previous);
    if (visited.has(next)) break;
    previous = current; current = next;
    traveled += distance(previous.p, current.p);
  }
  const edgeLength = distance(previous.p, current.p);
  return lerp(previous.p, current.p, Math.min(1, Math.max(0, (length - traveled + edgeLength) / edgeLength)));
}

function persistentCorner(v, a, b) {
  const turns = [0.15, 0.30, 0.60].map((length) => {
    const left = sampleDirection(v, a, length), right = sampleDirection(v, b, length);
    const ux = v.p.x - left.x, uy = v.p.y - left.y;
    const vx = right.x - v.p.x, vy = right.y - v.p.y;
    return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  });
  return turns.every((turn) => Math.abs(turn) >= Math.PI / 4 && Math.sign(turn) === Math.sign(turns[0]));
}

function quadratic(a, control, b, limits) {
  const points = [a];
  function split(p, c, q, depth) {
    if (depth >= 2 && pointDistance(c, p, q) <= limits.chordError
      && distance(p, c) + distance(c, q) <= limits.curvedSegmentLength) {
      points.push(q); return;
    }
    const left = lerp(p, c, 0.5), right = lerp(c, q, 0.5), middle = lerp(left, right, 0.5);
    split(p, left, middle, depth + 1); split(middle, right, q, depth + 1);
  }
  split(a, control, b, 0);
  return points;
}

/**
 * Fit closed pixel contours as one planar network. Groups carry stable region
 * identities; locked groups pin mechanical/exterior boundaries. Shared edges
 * must have identical input segmentation (as produced by traceContours).
 * Coordinates are converted to mm before every geometric decision.
 */
export function fitContourNetwork(groups, mmPerPixel) {
  if (!Number.isFinite(mmPerPixel) || mmPerPixel <= 0) throw new Error("Contour fitting requires a positive physical scale");
  const limits = CONTOUR_LIMITS_MM;
  const vertices = new Map(), edges = new Map(), loops = [];
  const diagnostics = { fittedCorners: 0, protectedVertices: 0, accepted: false, reason: null, limits };
  const fallback = (reason) => ({ groups, diagnostics: { ...diagnostics, fittedCorners: 0, reason } });
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    for (const source of group.loops) {
      if (source.length < 3 || !source.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return fallback("invalid-input");
      const xs = source.map((p) => p.x), ys = source.map((p) => p.y);
      const bounds = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const width = Math.min(bounds[1] - bounds[0], bounds[3] - bounds[2]) * mmPerPixel;
      const nodes = source.map((p) => {
        const id = key(p);
        if (!vertices.has(id)) vertices.set(id, { id, p: { x: p.x * mmPerPixel, y: p.y * mmPerPixel }, neighbors: new Set(), edges: [], locked: false, width: Infinity });
        const v = vertices.get(id);
        // Preserve extrema, including mouth endpoints and whisker tips.
        v.locked ||= !!group.locked || p.x === bounds[0] || p.x === bounds[1] || p.y === bounds[2] || p.y === bounds[3];
        v.width = Math.min(v.width, width);
        return v;
      });
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], b = nodes[(i + 1) % nodes.length];
        if (a === b) return fallback("duplicate-vertex");
        a.neighbors.add(b); b.neighbors.add(a);
        const id = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (!edges.has(id)) {
          const edge = { a: a.p, b: b.p, from: a, to: b, owners: new Set() };
          edges.set(id, edge); a.edges.push(edge); b.edges.push(edge);
        }
        edges.get(id).owners.add(groupIndex);
      }
      loops.push({ source, nodes, groupIndex });
    }
  }
  const originalEdges = [...edges.values()];
  if (!validEmbedding(originalEdges)) return fallback("source-intersection");
  const query = spatialIndex(originalEdges);
  const curves = [];
  for (const v of vertices.values()) {
    v.path = [v.p];
    const neighbors = [...v.neighbors].sort((a, b) => a.id.localeCompare(b.id));
    v.orderedNeighbors = neighbors;
    if (v.locked || neighbors.length !== 2
      || [...v.edges[0].owners].join() !== [...v.edges[1].owners].join()
      || persistentCorner(v, neighbors[0], neighbors[1])) {
      diagnostics.protectedVertices++; continue;
    }
    const [a, b] = neighbors;
    if (Math.abs(cross(a.p, v.p, b.p)) < 1e-12) continue;
    // Ignore the local run along this same boundary, but measure other sides
    // of narrow features and exterior channels. Small closed details also
    // have a conservative loop-width bound even if the whole run is local.
    const local = new Set(v.edges);
    for (const start of neighbors) {
      let previous = v, current = start, length = distance(v.p, start.p);
      const visited = new Set([v]);
      while (length < 0.4 && current.neighbors.size === 2 && !visited.has(current)) {
        visited.add(current);
        for (const edge of current.edges) local.add(edge);
        const next = [...current.neighbors].find((node) => node !== previous);
        length += distance(current.p, next.p); previous = current; current = next;
      }
    }
    let gap = Infinity;
    for (const edge of v.edges) for (const other of query(edge.a, edge.b, 0.4)) {
      if (!local.has(other)) gap = Math.min(gap, segmentDistance(edge.a, edge.b, other.a, other.b));
    }
    const featureWidth = Math.min(gap, v.width);
    const thin = featureWidth <= 0.4;
    // Every point on the quadratic and on the replaced source corner lies
    // within this budget of the other path (convex-hull certificate).
    const budget = Math.min(limits.displacement, thin ? limits.thinDetail : Infinity,
      limits.localFraction * featureWidth, distance(a.p, v.p) * 0.45, distance(b.p, v.p) * 0.45);
    if (budget <= 1e-8) continue;
    const entry = lerp(v.p, a.p, budget / distance(v.p, a.p));
    const exit = lerp(v.p, b.p, budget / distance(v.p, b.p));
    v.path = quadratic(entry, v.p, exit, limits);
    curves.push({ source: v.p, entry, exit, points: v.path, budget, featureWidth, thin });
    diagnostics.fittedCorners++;
  }
  const endpoint = (v, neighbor) => v.path[v.orderedNeighbors[0] === neighbor ? 0 : v.path.length - 1];
  const fittedEdges = originalEdges.map((e) => ({ a: endpoint(e.from, e.to), b: endpoint(e.to, e.from) }));
  for (const v of vertices.values()) for (let i = 1; i < v.path.length; i++) fittedEdges.push({ a: v.path[i - 1], b: v.path[i] });
  if (!validEmbedding(fittedEdges)) return fallback("fitted-intersection");
  const fitted = loops.map(({ nodes }) => nodes.flatMap((v, i) => {
    const previous = nodes[(i + nodes.length - 1) % nodes.length];
    return v.orderedNeighbors[0] === previous ? v.path : [...v.path].reverse();
  }));
  for (let i = 0; i < loops.length; i++) {
    if (Math.sign(area(fitted[i])) !== Math.sign(area(loops[i].source)) || Math.abs(area(fitted[i])) < 1e-12) return fallback("changed-winding");
    for (let j = 0; j < loops.length; j++) {
      if (i === j) continue;
      const otherNodes = new Set(loops[j].nodes);
      if (loops[i].nodes.some((v) => otherNodes.has(v))) continue;
      if (inside(loops[i].nodes[0].p, loops[j].nodes.map((v) => v.p)) !== inside(fitted[i][0], fitted[j])) return fallback("changed-nesting");
    }
  }
  const result = groups.map((group) => ({ ...group, loops: [] }));
  fitted.forEach((loop, i) => result[loops[i].groupIndex].loops.push(loop.map((p) => ({ x: p.x / mmPerPixel, y: p.y / mmPerPixel }))));
  return { groups: result, diagnostics: { ...diagnostics, accepted: true }, curves };
}
