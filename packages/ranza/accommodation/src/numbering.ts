/**
 * How a batch of rooms is named: pure, so the form can show the names a press
 * will create from the same function that creates them.
 */

/** The letters beds are named by: A for the first, Z for the twenty-sixth. */
export function bedLetters(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    String.fromCharCode("A".charCodeAt(0) + index),
  );
}

/**
 * Room numbers counted on from the first, keeping its width: `001` and three
 * give `001`, `002`, `003`, because a Property that zero-pads its rooms means
 * to.
 */
export function roomNumbers(first: string, count: number): string[] {
  const start = Number(first);
  return Array.from({ length: count }, (_, index) =>
    String(start + index).padStart(first.length, "0"),
  );
}
