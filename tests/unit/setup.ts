import "@testing-library/jest-dom/vitest";

// jsdom has no layout and so no media queries; a component that asks one — the
// date range field chooses between one month and two — would throw. Every
// query answers as a wide screen: a `min-width` one holds, a `max-width` one
// (the sidebar folding for a tablet) does not, and nor does a finger
// (`pointer: coarse`): the desk's computer has a mouse.
window.matchMedia = (query: string) =>
  ({
    matches: !/max-width|pointer: coarse/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

// Nor does jsdom measure anything, so a ResizeObserver never has a size to
// report. One that never fires is the honest stand-in: a component that
// watches its own width starts from what it read on mount.
class NoResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver ??= NoResizeObserver;
