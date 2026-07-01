/**
 * Vitest setup for component (jsdom) tests.
 *
 * This file is listed in `setupFiles` globally, but it must be a no-op for the
 * node-environment server/DB suites (they have no `document`). We therefore only
 * load the jsdom-dependent bits — `@testing-library/jest-dom` matchers and
 * Testing Library auto-cleanup — when a DOM is present. That keeps a single
 * setup file working for both environments without breaking the node suites.
 */
export {};

if (typeof document !== "undefined") {
  // jest-dom custom matchers (toBeInTheDocument, etc.) + per-test cleanup.
  await import("@testing-library/jest-dom/vitest");
  const { afterEach } = await import("vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}
