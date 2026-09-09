// Artwork-only curve fitting. No morphology, offsets, polygon cleanup or
// island filtering: an unsafe network is returned exactly as supplied.
export const CONTOUR_LIMITS_MM = Object.freeze({
  displacement: 0.06,
  thinDetail: 0.03,
  localFraction: 0.25,
  chordError: 0.01,
  curvedSegmentLength: 0.10,
  // How far the "this is still the same wall" walk (below) may extend:
  // a hard distance backstop, and a net-turning backstop that lets a
  // gently curving run extend much further than a flat distance ever
  // could while still stopping promptly at a genuine reversal.
  localWalkMaxMM: 3,
  localTurnLimitRad: (150 * Math.PI) / 180,
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
  const turns = [0.30, 0.60, 1.20].map((length) => {
    const left = sampleDirection(v, a, length), right = sampleDirection(v, b, length);
    const ux = v.p.x - left.x, uy = v.p.y - left.y;
    const vx = right.x - v.p.x, vy = right.y - v.p.y;
    return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  });
  return turns.every((turn) => Math.abs(turn) >= Math.PI / 4 && Math.sign(turn) === Math.sign(turns[0]))
    && Math.abs(turns[0]) >= .8 * Math.abs(turns[1])
    && Math.abs(turns[1]) >= .8 * Math.abs(turns[2]);
}

function unit(a, b) {
  const length = distance(a, b);
  return length ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 1, y: 0 };
}

function pathDistance(p, path) {
  let result = Infinity;
  for (let i = 1; i < path.length; i++) result = Math.min(result, pointDistance(p, path[i - 1], path[i]));
  return result;
}

// Remove redundant samples on straight sections of an unlocked run. This
// changes no boundary location and avoids feeding collinear cap vertices to
// the existing extruder. Junctions and protected endpoints delimit runs.
function withoutCollinearSamples(path) {
  const result = [];
  for (const point of path) {
    while (result.length > 1 && pointDistance(result.at(-1), result.at(-2), point) < 1e-5) result.pop();
    result.push(point);
  }
  return result;
}

// Distance to a closed set is 1-Lipschitz. Adaptive bounds certify the entire
// segment, not just its endpoints; shortcuts across channels cannot pass by
// having a few convenient samples near the source.
function withinTube(path, reference, budget) {
  function segment(a, b, da, db, depth) {
    if (Math.max(da, db) > budget) return false;
    if ((da + db + distance(a, b)) / 2 <= budget) return true;
    if (depth === 14) return false;
    const middle = lerp(a, b, 0.5), dm = pathDistance(middle, reference);
    return segment(a, middle, da, dm, depth + 1) && segment(middle, b, dm, db, depth + 1);
  }
  let previous = pathDistance(path[0], reference);
  for (let i = 1; i < path.length; i++) {
    const next = pathDistance(path[i], reference);
    if (!segment(path[i - 1], path[i], previous, next, 0)) return false;
    previous = next;
  }
  return true;
}

// Union of locally budgeted source-edge tubes. Its signed clearance is
// 1-Lipschitz, so the same adaptive certificate covers entire segments.
function withinLocalTube(path, source, budgets) {
  const clearance = p => Math.max(...source.slice(1).map((b,i) => budgets[i] - pointDistance(p,source[i],b)));
  function segment(a,b,ca,cb,depth) {
    if (Math.min(ca,cb) < 0) return false;
    if (ca+cb >= distance(a,b)) return true;
    if (depth === 14) return false;
    const mid=lerp(a,b,.5), cm=clearance(mid);
    return segment(a,mid,ca,cm,depth+1) && segment(mid,b,cm,cb,depth+1);
  }
  for(let i=1;i<path.length;i++) if(!segment(path[i-1],path[i],clearance(path[i-1]),clearance(path[i]),0)) return false;
  return source.slice(1).every((b,i)=>withinTube([source[i],b],path,budgets[i]));
}

function tessellateCubic(control, chordError, maxLength) {
  const points = [control[0]];
  function split(a, b, c, d, depth) {
    if (Math.max(pointDistance(b, a, d), pointDistance(c, a, d)) <= chordError
      && distance(a, b) + distance(b, c) + distance(c, d) <= maxLength) {
      points.push(d); return;
    }
    if (depth > 18) throw new Error("Contour tessellation did not converge");
    const ab = lerp(a, b, .5), bc = lerp(b, c, .5), cd = lerp(c, d, .5);
    const abc = lerp(ab, bc, .5), bcd = lerp(bc, cd, .5), mid = lerp(abc, bcd, .5);
    split(a, ab, abc, mid, depth + 1); split(mid, bcd, cd, d, depth + 1);
  }
  split(...control, 0);
  return points;
}

// Approximate an entire shared run with a uniform cubic B-spline. Interior
// knots are sampled by arc length, not pinned to raster corners. Adjacent
// Beziers share position, tangent and curvature; subdivision never inserts
// a mandatory pixel corner. Clamped endpoints preserve network anchors.
function splineControls(source, radius, budgets) {
  const spacing = .02;
  const lengths = [0];
  for (let i = 1; i < source.length; i++) lengths.push(lengths[i - 1] + distance(source[i - 1], source[i]));
  const count = Math.max(2, Math.ceil(lengths.at(-1) / spacing));
  const closed = source[0] === source.at(-1);
  const samples = closed ? [source[0]] : [source[0], source[0], source[0]], sampleBudgets=closed?[budgets[0]]:[0,0,0];
  let edge = 1;
  for (let i = 1; i < count; i++) {
    const length = lengths.at(-1) * i / count;
    while (lengths[edge] < length) edge++;
    samples.push(lerp(source[edge - 1], source[edge], (length - lengths[edge - 1]) / (lengths[edge] - lengths[edge - 1])));
    sampleBudgets.push(budgets[edge-1]);
  }
  if (!closed) samples.push(source.at(-1), source.at(-1), source.at(-1));
  // Filter the arc-length signal, using odd reflection at fixed endpoints.
  // Reflection preserves the endpoint without flattening the nearby curve.
  const raw = samples.slice(), step = lengths.at(-1) / count, last = closed ? raw.length : raw.length - 3;
  for (let i = closed ? 0 : 3; i < last; i++) {
    function filtered(sigma) {
      const reach=Math.min(count,Math.ceil(3*sigma/step));
      let x=0,y=0,weight=0;
      for(let j=-reach;j<=reach;j++) {
        const w=Math.exp(-.5*(j*step/sigma)**2),index=i+j;
        const q=closed?raw[(index%raw.length+raw.length)%raw.length]:index<2?lerp(raw[4-index],raw[2],2):index>last?lerp(raw[2*last-index],raw[last],2):raw[index];
        x+=q.x*w;y+=q.y*w;weight+=w;
      }
      return {x:x/weight,y:y/weight};
    }
    let low=0,high=radius,q=filtered(radius);
    if(pathDistance(q,source)>sampleBudgets[i]*.65) {
      for(let j=0;j<10;j++) {const mid=(low+high)/2, candidate=filtered(mid);
        if(pathDistance(candidate,source)<=sampleBudgets[i]*.65) low=mid;else high=mid;}
      q=low?filtered(low):raw[i];
    }
    samples[i]=q;
  }
  function convert() {
    const controls = [], average = (a, b, c) => ({ x: (a.x + 4 * b.x + c.x) / 6, y: (a.y + 4 * b.y + c.y) / 6 });
  for (let i = 0; i < (closed ? samples.length : samples.length - 3); i++) {
    const [a,b,c,d] = [0,1,2,3].map(j=>samples[(i+j)%samples.length]);
    controls.push([i ? controls.at(-1)[3] : closed ? average(a,b,c) : source[0], lerp(b,c,1/3), lerp(b,c,2/3), average(b,c,d)]);
  }
  controls.at(-1)[3] = closed ? controls[0][0] : source.at(-1);
    return controls;
  }
  const filtered=samples.slice(), weights=samples.map(()=>1);
  // Correct only support neighborhoods that violate a local detail bound.
  // Uniform knots retain C2 continuity; one tip no longer forces every
  // ordinary curve in the run back to a pixel-sized bandwidth.
  for(let iteration=0;iteration<12;iteration++) {
    const controls=convert(), points=controls.flatMap((c,i)=>{const p=tessellateCubic(c,.002,.05);return i?p.slice(1):p;});
    const affected=new Set();
    function mark(index) {for(let k=-4;k<=4;k++) {
      let j=index+k;if(closed) j=(j%samples.length+samples.length)%samples.length;
      if(j>=(closed?0:3)&&j<(closed?samples.length:samples.length-3))affected.add(j);
    }}
    for(let i=0;i<source.length-1;i++) {
      const allowance=budgets[i]*.96;
      for(const t of [0,.5,1]) if(pathDistance(lerp(source[i],source[i+1],t),points)>allowance) {
        mark(Math.round((lengths[i]+t*(lengths[i+1]-lengths[i]))/lengths.at(-1)*count)+(closed?0:2));break;
      }
    }
    controls.forEach((c,i)=>{
      for(const p of [c[0],c[3]]) if(!source.slice(1).some((b,j)=>pointDistance(p,source[j],b)<=budgets[j]*.96)) {mark(i+1);break;}
    });
    if(!affected.size)return controls;
    for(const i of affected){weights[i]*=.5;samples[i]=lerp(raw[i],filtered[i],weights[i]);}
  }
  return convert();
}

/** Reconstruct artwork boundaries once as shared, bounded cubic spans. */
export function fitContourNetwork(groups, mmPerPixel) {
  if (!Number.isFinite(mmPerPixel) || mmPerPixel <= 0) throw new Error("Contour fitting requires a positive physical scale");
  const limits = CONTOUR_LIMITS_MM, vertices = new Map(), edges = new Map(), loops = [], originalPixels = new Map();
  const diagnostics = { fittedSpans: 0, reconstructedEdges: 0, retainedSpans: 0, protectedVertices: 0, accepted: false, reason: null, limits };
  const fallback = (reason) => ({ groups, curves: [], diagnostics: { ...diagnostics, fittedSpans: 0, reconstructedEdges: 0, reason } });
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
        originalPixels.set(v.p, p);
        v.locked ||= !!group.locked || (width <= .4 && (p.x === bounds[0] || p.x === bounds[1] || p.y === bounds[2] || p.y === bounds[3]));
        v.width = Math.min(v.width, width);
        return v;
      });
      const loopEdges = [];
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], b = nodes[(i + 1) % nodes.length];
        if (a === b) return fallback("duplicate-vertex");
        a.neighbors.add(b); b.neighbors.add(a);
        const id = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (!edges.has(id)) {
          const edge = { a: a.p, b: b.p, from: a, to: b, owners: new Set() };
          edges.set(id, edge); a.edges.push(edge); b.edges.push(edge);
        }
        const edge = edges.get(id); edge.owners.add(groupIndex); loopEdges.push(edge);
      }
      loops.push({ source, nodes, edges: loopEdges, groupIndex });
    }
  }
  const originalEdges = [...edges.values()];
  if (!validEmbedding(originalEdges)) return fallback("source-intersection");
  const query = spatialIndex(originalEdges);
  for (const v of vertices.values()) {
    const neighbors = [...v.neighbors];
    v.anchor = v.locked || neighbors.length !== 2
      || [...v.edges[0].owners].join() !== [...v.edges[1].owners].join()
      || persistentCorner(v, neighbors[0], neighbors[1]);
    if (v.anchor) { diagnostics.protectedVertices++; continue; }
    const local = new Set(v.edges);
    for (const start of neighbors) {
      let previous = v, current = start, length = distance(v.p, start.p), netTurn = 0;
      let direction = unit(sampleDirection(v, neighbors.find(n=>n!==start), .3), sampleDirection(v, start, .3));
      const visited = new Set([v]);
      while (length < limits.localWalkMaxMM && Math.abs(netTurn) < limits.localTurnLimitRad
        && current.neighbors.size === 2 && !visited.has(current)) {
        visited.add(current);
        for (const edge of current.edges) local.add(edge);
        const next = [...current.neighbors].find((node) => node !== previous), nextDirection = unit(sampleDirection(current, previous, .3), sampleDirection(current, next, .3));
        netTurn += Math.atan2(direction.x * nextDirection.y - direction.y * nextDirection.x,
          direction.x * nextDirection.x + direction.y * nextDirection.y);
        direction = nextDirection; length += distance(current.p, next.p); previous = current; current = next;
      }
    }
    let gap = Infinity;
    for (const edge of v.edges) for (const other of query(edge.a, edge.b, 0.4))
      if (!local.has(other)) gap = Math.min(gap, segmentDistance(edge.a, edge.b, other.a, other.b));
    v.featureWidth = Math.min(gap, v.width);
    v.thin = v.featureWidth <= .4;
    v.budget = Math.min(limits.displacement, v.thin ? limits.thinDetail : Infinity, limits.localFraction * v.featureWidth);
    if (v.budget < 1e-8) v.anchor = true;
  }
  for (const loop of loops) if (!loop.nodes.some(v=>v.anchor)) loop.nodes[0].anchor = true;
  const spans = [], visited = new Set();
  for (const start of vertices.values()) {
    if (!start.anchor) continue;
    for (const first of start.edges) {
      if (visited.has(first)) continue;
      const nodes = [start], runEdges = [];
      let current = start, edge = first;
      do {
        visited.add(edge); runEdges.push(edge);
        const next = edge.from === current ? edge.to : edge.from;
        nodes.push(next); current = next;
        if (current.anchor) break;
        edge = current.edges.find((item) => item !== edge);
      } while (!visited.has(edge));
      const source = nodes.map((v) => v.p), pieces = [];
      const sourceBudgets = source.slice(1).map((_,i)=>Math.min(nodes[i].anchor?limits.displacement:nodes[i].budget,nodes[i+1].anchor?limits.displacement:nodes[i+1].budget));
      const budget = Math.max(...sourceBudgets);
      const featureWidth = Math.max(...nodes.map(v=>v.featureWidth??limits.displacement/limits.localFraction));
      const straight = source.every((p) => pointDistance(p, source[0], source.at(-1)) < 1e-12);
      if (source.length > 2 && !straight && budget > 1e-6) {
        // Refine the whole control lattice when a narrow feature prevents a
        // broad fit, retaining C2 continuity instead of polygonal splits.
        for (let spacing = .48; spacing >= .0075; spacing /= 2) {
          const controls = splineControls(source, spacing / 2, sourceBudgets);
          const points = controls.flatMap((control, i) => {
            const sampled = tessellateCubic(control, Math.min(limits.chordError, budget / 8), limits.curvedSegmentLength);
            return i ? sampled.slice(1) : sampled;
          });
          if (withinLocalTube(points, source, sourceBudgets)) {
            pieces.push({ source, sourceBudgets, controls, points, budget, featureWidth, thin: nodes.every((v) => v.thin) }); break;
          }
        }
      }
      if (!pieces.length) pieces.push({ source, points: source });
      const joined = pieces.flatMap((piece, i) => i ? piece.points.slice(1) : piece.points);
      const span = { source, pieces, points: pieces.some((piece) => piece.controls) ? withoutCollinearSamples(joined) : source };
      spans.push(span);
      runEdges.forEach((e, i) => { e.span = span; e.forward = nodes[i]; });
    }
  }
  if (visited.size !== originalEdges.length) return fallback("unanchored-network");
  // A collision only reverts the affected runs. Independent safe color
  // boundaries still improve; an unsafe fit can never merge their topology.
  function meshEdges() {
    return spans.flatMap((span) => span.points.slice(1).map((b, i) => ({ a: span.points[i], b, span })));
  }
  let fittedEdges = meshEdges();
  while (!validEmbedding(fittedEdges)) {
    const nearby = spatialIndex(fittedEdges), unsafe = new Set();
    for (const s of fittedEdges) for (const t of nearby(s.a, s.b)) {
      if (s === t) continue;
      const shared = [s.a, s.b].find((p) => p === t.a || p === t.b);
      const invalid = shared
        ? onSegment(s.a === shared ? s.b : s.a, shared, t.a === shared ? t.b : t.a)
          || onSegment(t.a === shared ? t.b : t.a, shared, s.a === shared ? s.b : s.a)
        : intersects(s.a, s.b, t.a, t.b);
      if (invalid) { unsafe.add(s.span); unsafe.add(t.span); }
    }
    let changed = false;
    for (const span of unsafe) if (span.points !== span.source) {
      span.points = span.source; span.pieces = [{ source: span.source, points: span.source }]; changed = true;
    }
    if (!changed) return fallback("fitted-intersection");
    fittedEdges = meshEdges();
  }
  const fitted = loops.map((loop) => {
    const start = loop.edges.findIndex((e, i) => e.span !== loop.edges[(i + loop.edges.length - 1) % loop.edges.length].span);
    if (start < 0) {
      const e=loop.edges[0], path=e.forward===loop.nodes[0]?e.span.points:[...e.span.points].reverse();
      return path.slice(0,-1);
    }
    const points = []; let previous = null;
    for (let j = 0; j < loop.edges.length; j++) {
      const i = (start + j) % loop.edges.length, e = loop.edges[i];
      if (e.span === previous) continue;
      const path = e.forward === loop.nodes[i] ? e.span.points : [...e.span.points].reverse();
      points.push(...path.slice(0, -1)); previous = e.span;
    }
    return points;
  });
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
  fitted.forEach((loop, i) => result[loops[i].groupIndex].loops.push(groups[loops[i].groupIndex].locked
    ? loops[i].source : loop.map((p) => originalPixels.get(p) ?? ({ x: p.x / mmPerPixel, y: p.y / mmPerPixel }))));
  const curves = spans.flatMap((span) => span.pieces.filter((piece) => piece.controls));
  diagnostics.fittedSpans = curves.length;
  diagnostics.reconstructedEdges = curves.reduce((sum, curve) => sum + curve.source.length - 1, 0);
  diagnostics.retainedSpans = spans.reduce((sum, span) => sum + span.pieces.filter((piece) => !piece.controls).length, 0);
  return { groups: result, diagnostics: { ...diagnostics, accepted: true }, curves };
}
