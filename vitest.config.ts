import { defineConfig } from "vitest/config";

// Run in a non-UTC timezone so UTC-vs-local date mistakes fail here too, not
// just on a user's machine. New York also has DST, which UTC can't exercise.
process.env.TZ = "America/New_York";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    mockReset: true,
    coverage: {
      provider: "v8",
      // List every source file, so code no test imports counts as uncovered.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      reporter: ["text", "json-summary", "html"],
    },
  },
});
