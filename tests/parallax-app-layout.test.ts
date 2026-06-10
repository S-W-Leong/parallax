import { describe, expect, it } from "vitest";
import { getAppShellClassName } from "@/components/app/ParallaxArtifactApp";

describe("ParallaxArtifactApp layout", () => {
  it("uses the expanded sidebar grid when the sidebar is hover-expanded", () => {
    expect(getAppShellClassName({ sidebarExpanded: true, learning: false })).toBe("app-shell sidebar-pinned");
  });

  it("preserves learning room layout while the sidebar is expanded", () => {
    expect(getAppShellClassName({ sidebarExpanded: true, learning: true })).toBe("app-shell sidebar-pinned is-learning");
  });

  it("does not export a local tutor routing helper", async () => {
    const appModule = await import("@/components/app/ParallaxArtifactApp");

    expect("shouldUseLocalDemoTutor" in appModule).toBe(false);
  });
});
