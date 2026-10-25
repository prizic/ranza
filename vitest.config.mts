import { defineConfig } from "vitest/config";

export default defineConfig({
  // The catalogue tests are plain TypeScript; a component test is not. The
  // repository's tsconfig says `jsx: preserve`, because Next compiles it — so
  // the transform has to be named here or a .tsx test file fails to parse.
  // `jsx: automatic` alone is not enough: esbuild reads the nearest
  // tsconfig.json per file, and every one of ours says `preserve` because Next
  // compiles the JSX. `tsconfigRaw` is what outranks it.
  oxc: {
    jsx: { runtime: "automatic" },
    tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/unit/setup.ts"],
  },
});
