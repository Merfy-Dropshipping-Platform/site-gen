import type { Viewport } from './types.js';

/**
 * Detect the target viewport from:
 *  (1) name patterns ("1920", "Desktop", "Mobile", "375 Phone")
 *  (2) bbox width (if name-based fails)
 * Parent chain can contain viewport hints too ("1920" page section wrapping Hero frame).
 */
export function detectViewport(
  name: string,
  bboxWidth: number | undefined,
  parentChain: readonly string[] = [],
): Viewport | null {
  const candidates = [name, ...parentChain].map((s) => s.toLowerCase());

  for (const c of candidates) {
    if (/\b1920\b|\bdesktop\b|\bdeckstop\b/i.test(c)) return '1920';
    if (/\b1280\b|\btablet\b|\blaptop\b|\bmedium\b/i.test(c)) return '1280';
    if (/\b375\b|\bmobile\b|\bphone\b|\bsmall\b/i.test(c)) return '375';
  }

  if (typeof bboxWidth === 'number') {
    if (bboxWidth >= 1600) return '1920';
    if (bboxWidth >= 1000 && bboxWidth < 1500) return '1280';
    if (bboxWidth <= 500) return '375';
  }

  return null;
}

/** Human-readable name for logs. */
export function viewportLabel(v: Viewport): string {
  return `${v}px`;
}
