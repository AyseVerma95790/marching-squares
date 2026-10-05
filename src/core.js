/**
 * Single-file implementation of the Marching Squares isoline tracer.
 *
 * Conventions are stated as module-level JSDoc so every exported function can
 * rely on the same geometric definitions without restating them.
 */

/**
 * Edge index convention (identical to the classic Marching Squares sketch).
 *
 *   0  --- top    --- 1
 *   |                |
 *   left (3)     right (1)
 *   |                |
 *   2  --- bot    --- 3
 *
 * Top and bottom run along increasing X; left and right run along increasing Y.
 * This choice keeps every segment orientation consistent, so callers can rely
 * on the (x0,y0) -> (x1,y1) ordering for winding checks downstream.
 */

/**
 * The five-segment map. Each cell case yields either no segments or a list of
 * [edgeA, edgeB] pairs. We intentionally always emit one segment per line of
 * the isoline passing through the cell; higher-level glue is left to callers.
 *
 * Cases 5 and 10 are the famous ambiguous saddle configurations. A linear
 * interpolation of the threshold is symmetric in the sense that the two
 * diagonal endpoints average to the same value, so the midpoint is well-defined
 * and identical for both segments. We can therefore leave the saddle
 * un-resolved and simply return both segments, which keeps the tracer fully
 * deterministic. The segments touch at the cell centre (corner-corner).
 */
export const DEFAULT_INTERVAL = 0.5;

const CASE_SEGMENTS = [
  [],                         // 0
  [[3, 2]],                    // 1
  [[2, 1]],                    // 2
  [[3, 1]],                    // 3
  [[1, 0]],                    // 4
  [[3, 0], [1, 2]],            // 5  ambiguous
  [[2, 0]],                    // 6
  [[3, 0]],                    // 7
  [[0, 3]],                    // 8
  [[2, 3]],                    // 9
  [[0, 1], [2, 3]],            // 10 ambiguous
  [[1, 3]],                    // 11
  [[0, 2]],                    // 12
  [[0, 3]],                    // 13
  [[1, 2]],                    // 14
  [],                          // 15
];

/**
 * Compute the 4-bit case index for a single cell given the four corner values.
 * Bit 0 is bottom-left, 1 is bottom-right, 2 top-right, 3 top-left — in cell
 * coordinates. We match this numbering with the CASE_SEGMENTS table and the
 * shared edge numbering. If any corner value is NaN or Infinity the function
 * throws immediately; that is a data error, not a geometric one.
 *
 * @param {number} v00 bottom-left
 * @param {number} v10 bottom-right
 * @param {number} v11 top-right
 * @param {number} v01 top-left
 * @param {number} threshold
 * @returns {number} 0..15
 */
export function indexForCell(v00, v10, v11, v01, threshold) {
  if (!Number.isFinite(v00) || !Number.isFinite(v10) ||
      !Number.isFinite(v11) || !Number.isFinite(v01)) {
    throw new Error('corner values must be finite');
  }
  if (!Number.isFinite(threshold)) {
    throw new Error('threshold must be finite');
  }
  // >= gives cells exactly on the threshold to count as "above". The classic
  // algorithm uses >=; any <=-based variant would mirror the bit pattern and
  // therefore produce the same set of contours with every >= flipped.
  const b0 = v00 >= threshold ? 1 : 0;
  const b1 = v10 >= threshold ? 1 : 0;
  const b2 = v11 >= threshold ? 1 : 0;
  const b3 = v01 >= threshold ? 1 : 0;
  return (b3 << 3) | (b2 << 2) | (b1 << 1) | b0;
}

/**
 * Return the list of [edgeA, edgeB] pairs for a 0..15 cell case. Exposed so a
 * caller can do per-cell reasoning without re-implementing the lookup.
 *
 * @param {number} idx 0..15
 * @returns {number[][]} array of [a, b] pairs
 */
export function squareEdges(idx) {
  if (idx < 0 || idx > 15 || !Number.isInteger(idx)) {
    throw new Error('index must be an integer in [0, 15]');
  }
  return CASE_SEGMENTS[idx];
}

/**
 * Linearly interpolate the crossing point of the threshold on an edge. Always
 * clamps t to [0, 1] so a corner sitting exactly on the threshold does not
 * yield a coordinate outside the cell. This matters when v0 == v1 == threshold
 * (which happens in flat regions): the unclamped formula would produce NaN.
 *
 * Edge corner pairs (matching the edge index convention above):
 *   0 top:    v00 (left)  -> v10 (right)
 *   1 right:  v10 (bottom) -> v11 (top)
 *   2 bottom: v01 (left)  -> v11 (right)
 *   3 left:   v00 (bottom) -> v01 (top)
 */
function lerp(v00, v10, v11, v01, threshold, edge) {
  let v0, v1;
  switch (edge) {
    case 0: v0 = v00; v1 = v10; break; // top edge, x from 0..1, y=0
    case 1: v0 = v10; v1 = v11; break; // right edge, x=1, y from 0..1
    case 2: v0 = v01; v1 = v11; break; // bottom edge, x from 0..1, y=1
    case 3: v0 = v00; v1 = v01; break; // left edge, x=0, y from 0..1
    default: throw new Error(`unknown edge ${edge}`);
  }
  const denom = v1 - v0;
  let k;
  if (denom === 0) {
    k = 0.5; // both corners equal the threshold; cross at the midpoint
  } else {
    k = (threshold - v0) / denom;
    if (k < 0) k = 0;
    else if (k > 1) k = 1;
  }
  switch (edge) {
    case 0: return [k, 0];
    case 1: return [1, k];
    case 2: return [k, 1];
    case 3: return [0, k];
    default: throw new Error(`unknown edge ${edge}`);
  }
}

/**
 * Collect segments crossing a single threshold across the whole grid.
 * Coordinates are in cell units (col=x, row=y); callers can scale.
 */
function traceThreshold(values, cols, rows, threshold) {
  const segments = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v00 = values[r * cols + c];
      const v10 = values[r * cols + (c + 1)];
      const v11 = values[(r + 1) * cols + (c + 1)];
      const v01 = values[(r + 1) * cols + c];
      const idx = indexForCell(v00, v10, v11, v01, threshold);
      const edges = CASE_SEGMENTS[idx];
      for (let s = 0; s < edges.length; s += 1) {
        const [a, b] = edges[s];
        const [ax, ay] = lerp(v00, v10, v11, v01, threshold, a);
        const [bx, by] = lerp(v00, v10, v11, v01, threshold, b);
        segments.push({
          x0: c + ax,
          y0: r + ay,
          x1: c + bx,
          y1: r + by,
        });
      }
    }
  }
  return segments;
}

/**
 * Main entry point. Given a flat array of scalar values laid out row-major
 * over a grid of `cols` columns and `rows` rows, emit isoline segments for the
 * supplied thresholds. If `levels` is omitted, thresholds are generated from
 * the min/max of the data using `DEFAULT_INTERVAL`; if the grid is constant
 * (min === max) or empty, no segments are produced and `levels` is empty.
 *
 * Each segment is an object { x0, y0, x1, y1 }. Coordinates are in cell units;
 * pixel mapping is left to the caller.
 *
 * @param {number[]} values row-major scalar field
 * @param {number} cols
 * @param {number} rows
 * @param {number[]} [levels] explicit thresholds; if omitted, derived
 * @returns {{ level: number, segments: Array<{x0:number,y0:number,x1:number,y1:number}> }[]}
 */
export function traceContours(values, cols, rows, levels) {
  if (!Array.isArray(values)) {
    throw new Error('values must be an array');
  }
  if (!Number.isInteger(cols) || cols < 2) {
    throw new Error('cols must be an integer >= 2');
  }
  if (!Number.isInteger(rows) || rows < 2) {
    throw new Error('rows must be an integer >= 2');
  }
  const expected = cols * rows;
  if (values.length !== expected) {
    throw new Error(`values length ${values.length} does not match cols*rows (${expected})`);
  }

  // Surface NaN / Infinity early: every corner feeds indexForCell, which would
  // otherwise throw in the middle of a loop. Reject the whole grid up-front so
  // the error surfaces the real problem, not an unrelated cell coordinate.
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`non-finite value at index ${i}`);
    }
  }

  let resolved = levels;
  if (resolved === undefined) {
    let lo = values[0];
    let hi = values[0];
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] < lo) lo = values[i];
      if (values[i] > hi) hi = values[i];
    }
    if (lo === hi) {
      return [];
    }
    const list = [];
    // Start one DEFAULT_INTERVAL above the minimum so the very lowest strip of
    // cells does not generate a degenerate contour glued to the data boundary.
    for (let t = lo + DEFAULT_INTERVAL; t < hi; t += DEFAULT_INTERVAL) {
      list.push(t);
    }
    resolved = list;
  }

  const out = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const t = resolved[i];
    if (!Number.isFinite(t)) {
      throw new Error(`level at index ${i} is not finite`);
    }
    const segments = traceThreshold(values, cols, rows, t);
    out.push({ level: t, segments });
  }
  return out;
}
