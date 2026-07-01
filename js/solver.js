import { parseMove, inverseMove } from "./cube.js";

export { inverseMove };

/**
 * Solve by reversing move history (always valid for cubes reached via legal moves).
 * Compresses redundant moves first for a shorter animation.
 */
export function solveFromHistory(history) {
  const compressed = compressHistory([...history]);
  return compressed.reverse().map(inverseMove);
}

export function compressHistory(history) {
  const stack = [];
  for (const move of history) {
    const p = parseMove(move);
    if (!p) continue;

    if (stack.length) {
      const last = parseMove(stack[stack.length - 1]);
      if (last && last.face === p.face) {
        const combined = (last.turns + p.turns) % 4;
        stack.pop();
        if (combined === 1) stack.push(p.face);
        else if (combined === 2) stack.push(`${p.face}2`);
        else if (combined === 3) stack.push(`${p.face}'`);
        continue;
      }
    }
    stack.push(move);
  }
  return stack;
}
