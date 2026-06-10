import { describe, expect, it } from "vitest";
import { composeSpeechValue, getSpeechRecognitionConstructor } from "@/lib/speech/pushToTalk";

describe("push-to-talk helpers", () => {
  it("uses the standard SpeechRecognition constructor when available", () => {
    class StandardRecognition {}

    expect(getSpeechRecognitionConstructor({ SpeechRecognition: StandardRecognition })).toBe(StandardRecognition);
  });

  it("falls back to the webkit-prefixed SpeechRecognition constructor", () => {
    class WebkitRecognition {}

    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: WebkitRecognition })).toBe(WebkitRecognition);
  });

  it("appends normalized dictated text to existing composer text", () => {
    expect(composeSpeechValue("Explain", "  the   coriolis effect  ")).toBe("Explain the coriolis effect");
    expect(composeSpeechValue("", "  build a neuron  ")).toBe("build a neuron");
  });
});
