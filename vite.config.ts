import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Game_card/" : "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/engine/**/*.ts"],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90
      }
    }
  }
}));
