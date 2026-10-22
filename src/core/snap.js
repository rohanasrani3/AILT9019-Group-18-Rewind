// Move a result's start back to the nearest preceding topic boundary, but never further than
// maxSnap seconds. maxSnap stays below the 30 s evaluation tolerance so snapping cannot turn a
// hit into a miss by jumping too early.

export function snapStart(start, boundaries, maxSnap = 20) {
  let nearest = -Infinity;
  for (const b of boundaries ?? []) if (b <= start && b > nearest) nearest = b;
  return start - nearest <= maxSnap ? nearest : start;
}
