import { describe, expect, it } from "vitest";
import { makeCreateExperienceToolSink } from "@/lib/agent/tools/createExperienceTool";
import { makeSendArtifactCommandSink } from "@/lib/agent/tools/sendArtifactCommandTool";

const sceneSource = `
const membrane = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0x62e6d2 }));
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0xf6c76a }));
const ribosome = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
root.add(membrane, nucleus, ribosome);
registerComponent("membrane", "Cell membrane", membrane, {});
registerComponent("nucleus", "Nucleus", nucleus, {});
registerComponent("ribosome", "Ribosome", ribosome, {});
setWalkthroughSteps([{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"] }]);
`;

describe("agent tools", () => {
  it("stores a validated artifact when create_experience succeeds", async () => {
    const sink = makeCreateExperienceToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      topic: "cell biology",
      title: "Inside a Cell",
      summary: "A guided tour of organelles.",
      sceneSource,
      components: [
        { id: "membrane", label: "Cell membrane", description: null, metadata: null },
        { id: "nucleus", label: "Nucleus", description: null, metadata: null },
        { id: "ribosome", label: "Ribosome", description: null, metadata: null },
      ],
      walkthroughSteps: [{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"], camera: null }],
    }));

    expect(output).toMatchObject({ ok: true });
    expect(sink.getResult()).toMatchObject({ ok: true, artifact: { title: "Inside a Cell" } });
  });

  it("keeps the raw validation error when create_experience fails", async () => {
    const sink = makeCreateExperienceToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      topic: "bad",
      title: "Bad",
      summary: "Bad artifact.",
      sceneSource: `${sceneSource}\nfetch("https://example.com")`,
      components: [
        { id: "membrane", label: "Cell membrane", description: null, metadata: null },
        { id: "nucleus", label: "Nucleus", description: null, metadata: null },
        { id: "ribosome", label: "Ribosome", description: null, metadata: null },
      ],
      walkthroughSteps: [{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"], camera: null }],
    }));

    expect(output).toMatchObject({ ok: false });
    expect(sink.getResult()).toMatchObject({ ok: false });
  });

  it("records tutor artifact commands", async () => {
    const sink = makeSendArtifactCommandSink();
    await sink.tool.invoke(undefined as never, JSON.stringify({ type: "focus_component", componentId: "nucleus", stepId: null }));
    await sink.tool.invoke(undefined as never, JSON.stringify({ type: "explode", componentId: null, stepId: null }));

    expect(sink.getCommands()).toEqual([
      { type: "focus_component", componentId: "nucleus" },
      { type: "explode" },
    ]);
  });
});
