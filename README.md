# Marching Squares

Extracts isoline segments from a 2-D scalar grid. Given a flat array of scalar values laid out row-major, the library returns line segments crossing each requested threshold. Coordinates are in cell units (column = x, row = y); mapping to pixels or geographic coordinates is left to the caller.

```js
import { traceContours } from './src/index.js';

const values = [
  0.0, 0.5, 1.0,
  0.5, 1.0, 0.5,
  1.0, 0.5, 0.0,
];
const contours = traceContours(values, 3, 3, [0.5]);
// -> [{ level: 0.5, segments: [ { x0, y0, x1, y1 }, ... ] }]
```

If `levels` is omitted, the library picks thresholds between `min(values)` and `max(values)` spaced `0.5` apart. Callers who want specific contours should pass `levels` explicitly.

## Why

Most Marching Squares implementations bundle a renderer, a marching-cubes fallback, or a dependency on a numeric library. This one does one thing: walk a scalar grid and return segments. It is small enough to read in a sitting and easy to drop into a renderer that already knows how to draw line segments.

The trade-off is that the library returns *segments*, not connected polylines. Stitching segments into continuous paths is a separate concern and is intentionally out of scope.

## Edge cases

Saddle configurations (cell cases 5 and 10) are returned unresolved, as two segments that meet at the cell centre. This is deterministic but means the caller's stitcher may need to decide which pair to join. A grid whose values are all equal returns no contours; a grid with no finite values throws. A corner value exactly equal to a threshold is treated as "above" (the `>=` convention), which is the classic Marching Squares choice and keeps the bit pattern and its mirror image consistent.
