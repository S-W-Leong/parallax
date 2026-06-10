import { describe, expect, it } from "vitest";
import { getAppShellClassName, shouldUseLocalDemoTutor } from "@/components/app/ParallaxArtifactApp";
import { JET_ENGINE_DEMO_ARTIFACT } from "@/lib/demo/jetEngineDemo";

describe("ParallaxArtifactApp layout", () => {
  it("uses the expanded sidebar grid when the sidebar is hover-expanded", () => {
    expect(getAppShellClassName({ sidebarExpanded: true, learning: false })).toBe("app-shell sidebar-pinned");
  });

  it("preserves learning room layout while the sidebar is expanded", () => {
    expect(getAppShellClassName({ sidebarExpanded: true, learning: true })).toBe("app-shell sidebar-pinned is-learning");
  });

  it("uses the local tutor only for the fixed jet engine demo artifact", () => {
    expect(shouldUseLocalDemoTutor(JET_ENGINE_DEMO_ARTIFACT)).toBe(true);
    expect(shouldUseLocalDemoTutor({ ...JET_ENGINE_DEMO_ARTIFACT, id: "artifact-real-jet-engine" })).toBe(false);
    expect(shouldUseLocalDemoTutor(null)).toBe(false);
  });
});
