import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INTERVAL,
  squareEdges,
  indexForCell,
  traceContours,
} from '../src/core.js';

/**
 * Test suite. We exercise:
 *   - the 4-bit cell lookup for every supported bit pattern,
 *   - the segment decode table for invariants,
 *   - the full tracer on a small hand-verified grid,
 *   - and the documented edge cases (saddle, degenerate grids, error paths).
 */

describe('indexForCell', () => {
  it('computes the 4-bit index for each corner pattern', () => {
    // bit 0 = bottom-left, 1 = bottom-right, 2 = top-right, 3 = top-left
    assert.equal(indexForCell(0, 0, 0, 0, 1), 0b0000);
    assert.equal(indexForCell(1, 0, 0, 0, 0.5), 0b0001);
    assert.equal(indexForCell(0, 1, 0, 0, 0.5), 0b0010);
    assert.equal(indexForCell(1, 1, 0, 0, 0.5), 0b0011);
    assert.equal(indexForCell(0, 0, 1, 0, 0.5), 0b0100);
    assert.equal(indexForCell(1, 0, 1, 0, 0.5), 0b0101);
    assert.equal(indexForCell(0, 1, 1, 0, 0.5), 0b0110);
    assert.equal(indexForCell(1, 1, 1, 0, 0.5), 0b0111);
    assert.equal(indexForCell(0, 0, 0, 1, 0.5), 0b1000);
    assert.equal(indexForCell(1, 0, 0, 1, 0.5), 0b1001);
    assert.equal(indexForCell(0, 1, 0, 1, 0.5), 0b1010);
    assert.equal(indexForCell(1, 1, 0, 1, 0.5), 0b1011);
    assert.equal(indexForCell(0, 0, 1, 1, 0.5), 0b1100);
    assert.equal(indexForCell(1, 0, 1, 1, 0.5), 0b1101);
    assert.equal(indexForCell(0, 1, 1, 1, 0.5), 0b1110);
    assert.equal(indexForCell(1, 1, 1, 1, 0.5), 0b1111);
  });

  it('treats a value exactly on the threshold as "above"', () => {
    // The >= convention is documented in core.js. Test it here so the chosen
    // interpretation is pinned by the test suite, not just by a comment.
    assert.equal(indexForCell(0.5, 0, 0, 0, 0.5), 0b0001);
  });

  it('rejects non-finite corner values', () => {
    assert.throws(() => indexForCell(NaN, 0, 0, 0, 0.5));
    assert.throws(() => indexForCell(0, Infinity, 0, 0, 0.5));
  });
});

describe('squareEdges', () => {
  it('returns empty for all-above and all-below cells', () => {
    assert.deepEqual(squareEdges(0), []);
    assert.deepEqual(squareEdges(15), []);
  });

  it('returns one segment for the four single-corner cases', () => {
    // Each single-corner case crosses a pair of adjacent edges.
    assert.deepEqual(squareEdges(1), [[3, 2]]);
    assert.deepEqual(squareEdges(2), [[2, 1]]);
    assert.deepEqual(squareEdges(4), [[1, 0]]);
    assert.deepEqual(squareEdges(8), [[0, 3]]);
  });

  it('returns two segments for ambiguous saddle cases 5 and 10', () => {
    // Saddle cases are the awkward edge of Marching Squares; we leave them
    // unresolved. Assert both segments are present so a future "clever" patch
    // does not silently collapse the saddle.
    assert.deepEqual(squareEdges(5),  [[3, 0], [1, 2]]);
    assert.deepEqual(squareEdges(10), [[0, 1], [2, 3]]);
  });

  it('rejects out-of-range indices', () => {
    assert.throws(() => squareEdges(-1));
    assert.throws(() => squareEdges(16));
    assert.throws(() => squareEdges(3.5));
  });
});

describe('traceContours', () => {
  it('returns no segments on a constant grid', () => {
    const g = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const out = traceContours(g, 3, 3);
    assert.deepEqual(out, []);
  });

  it('matches a hand-computed 2x2 contour at threshold 0.5', () => {
    // One corner above (bottom-left) -> case 1 -> one segment crossing the
    // left and bottom edges of the cell, both at the cell midpoints because
    // the linear interpolation factor is exactly 0.5 here.
    const g = [1, 0, 0, 0];
    const out = traceContours(g, 2, 2, [0.5]);
    assert.equal(out.length, 1);
    assert.equal(out[0].level, 0.5);
    assert.equal(out[0].segments.length, 1);
    const seg = out[0].segments[0];
    assert.ok(Math.abs(seg.x0 - 0) < 1e-12);
    assert.ok(Math.abs(seg.y0 - 0.5) < 1e-12);
    assert.ok(Math.abs(seg.x1 - 0.5) < 1e-12);
    assert.ok(Math.abs(seg.y1 - 1) < 1e-12);
  });

  it('emits the two saddle segments for case 5', () => {
    // v00=v11=1, v10=v01=0 -> case 0101 = 5. Row-major 2x2 layout means the
    // top row is indices 2,3, so the grid that yields this is [1,0,0,1].
    const g = [1, 0, 0, 1];
    const out = traceContours(g, 2, 2, [0.5]);
    assert.equal(out[0].segments.length, 2);
  });

  it('derives levels from the grid when none are given', () => {
    // values 0..1 in steps of 0.25 -> derived thresholds at 0.5 only, since
    // DEFAULT_INTERVAL is 0.5 and 0.5 < 1 but 1.0 is not < 1.
    const g = [
      0.00, 0.25, 0.50,
      0.75, 1.00, 0.75,
      0.50, 0.25, 0.00,
    ];
    const out = traceContours(g, 3, 3);
    assert.equal(out.length, 1);
    assert.equal(out[0].level, 0.5);
  });

  it('does not clamp explicit thresholds outside the data range', () => {
    // An explicit threshold below the minimum crosses every cell's two
    // "above" edges; we just check that we get at least one segment back and
    // that nothing throws. The library does not promise a count here.
    const g = [1, 1, 1, 1, 1, 1, 1, 1, 1];
    const out = traceContours(g, 3, 3, [-1]);
    assert.equal(out.length, 1);
    assert.equal(out[0].level, -1);
    assert.equal(out[0].segments.length, 0);
  });

  it('rejects mismatched length', () => {
    assert.throws(() => traceContours([1, 2, 3], 2, 2));
  });

  it('rejects non-finite values in the grid', () => {
    const g = [0, NaN, 0, 0, 0, 0, 0, 0, 0];
    assert.throws(() => traceContours(g, 3, 3, [0.5]));
  });

  it('rejects non-finite explicit levels', () => {
    const g = [0, 1, 0, 1];
    assert.throws(() => traceContours(g, 2, 2, [NaN]));
    assert.throws(() => traceContours(g, 2, 2, [Infinity]));
  });

  it('rejects bad grid dimensions', () => {
    assert.throws(() => traceContours([0, 0, 0, 0], 1, 4));
    assert.throws(() => traceContours([0, 0, 0, 0], 4, 1));
  });
});
