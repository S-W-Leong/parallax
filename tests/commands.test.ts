import { describe, expect, it } from "vitest";
import { initialRendererState, rendererReducer } from "../lib/engine/commands";

describe("rendererReducer", () => {
  it("starts the turbine, shaft, compressor re-teach replay", () => {
    const state = rendererReducer(initialRendererState, {
      type: "startReteach",
      focusComponents: ["compressor", "shaft", "turbine"],
      animation: "turbine_shaft_compressor_replay",
    });

    expect(state.focusedComponents).toEqual(["compressor", "shaft", "turbine"]);
    expect(state.currentAnimation).toBe("turbine_shaft_compressor_replay");
    expect(state.activityLog.at(-1)).toContain("Re-teach replay");
  });
});
