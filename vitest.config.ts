import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  test: {
    globals: true,
    // Default environment stays `node` so the existing server/DB suites are
    // unaffected. Component tests under tests/component/** opt into jsdom via
    // `environmentMatchGlobs` below (least-disruptive: no per-file docblocks,
    // no separate workspace).
    environment: "node",
    environmentMatchGlobs: [["tests/component/**", "jsdom"]],
    // jest-dom matchers are only loaded for the jsdom (component) suite so the
    // node suites don't pull in a DOM-dependent setup file.
    setupFiles: ["tests/component/setup.ts"],
    include: [
      "tests/unit/**/*.{test,spec}.ts",
      "tests/integration/**/*.{test,spec}.ts",
      "tests/migration/**/*.{test,spec}.ts",
      "tests/component/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    // Booting embedded-postgres (initdb + start) is slow; allow ample time for
    // the DB-backed migration/integration suites.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Use the React 19 automatic JSX runtime so component tests (.tsx) don't need
  // an explicit `import React`. Harmless for the node suites (all .ts).
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
