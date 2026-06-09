import cachedLesson from "../data/cached-jet-engine-lesson.json";
import { describe, expect, it } from "vitest";
import { parseLesson } from "../lib/engine/lessonTypes";

describe("lesson schema", () => {
  it("parses the cached jet engine lesson", () => {
    expect(parseLesson(cachedLesson).title).toBe("How a Jet Engine Turns Air Into Thrust");
  });

  it("rejects unknown component ids", () => {
    const invalid = structuredClone(cachedLesson);
    invalid.steps[0].componentIds = ["mystery_part"];
    expect(() => parseLesson(invalid)).toThrow();
  });
});
