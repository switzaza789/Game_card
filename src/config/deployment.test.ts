import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config";

describe("deployment configuration", () => {
  it("uses the GitHub Pages repository base path for production builds", () => {
    const config = typeof viteConfig === "function"
      ? viteConfig({ command: "build", mode: "production", isSsrBuild: false, isPreview: false })
      : viteConfig;

    expect(config.base).toBe("/Game_card/");
  });

  it("uses root base path during local development", () => {
    const config = typeof viteConfig === "function"
      ? viteConfig({ command: "serve", mode: "development", isSsrBuild: false, isPreview: false })
      : viteConfig;

    expect(config.base).toBe("/");
  });
});
