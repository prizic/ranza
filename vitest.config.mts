import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The workspace is the only package that depends on TanStack Query, so a test
// that renders one of its providers has no root copy to import the hooks from.
const workspaceQuery = fileURLToPath(
  new URL(
    "./apps/operator-workspace/node_modules/@tanstack/react-query",
    import.meta.url,
  ),
);

export default defineConfig({
  resolve: { alias: { "@tanstack/react-query": workspaceQuery } },
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
