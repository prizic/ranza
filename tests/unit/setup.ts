import "@testing-library/jest-dom/vitest";

// jsdom has no layout and so no media queries; a component that asks one — the
// date range field chooses between one month and two — would throw. Every
// query answers as a wide screen.
window.matchMedia = (query: string) =>
  ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;
