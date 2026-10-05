/**
 * Marching Squares library.
 *
 * Walks a 2-D scalar field and returns isoline segments.
 *
 * Exports:
 *   - DEFAULT_INTERVAL  (number)  the threshold spacing used when no levels given
 *   - traceContours     (function) main entry point, see JSDoc below
 *   - squareEdges       (function) the five-segment decode for a 16-cell case
 *   - indexForCell      (function) 4-bit bit-packed lookup of a single cell
 */

export { DEFAULT_INTERVAL, squareEdges, indexForCell } from './core.js';
export { traceContours } from './core.js';
