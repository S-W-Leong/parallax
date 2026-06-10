import { describe, expect, it } from "vitest";
import { renderArtifactHtml } from "@/lib/artifacts/artifactTemplate";
import type { ArtifactControl } from "@/lib/artifacts/artifactTypes";

type FakeElement = {
  appendChild: (child: FakeElement) => void;
  children: FakeElement[];
  className: string;
  dataset: Record<string, string>;
  id: string;
  textContent: string;
  type: string;
  min: string;
  max: string;
  step: string;
  value: string;
  checked: boolean;
  htmlFor: string;
  addEventListener: (event: string, handler: () => void) => void;
  dispatch: (event: string) => void;
};

function makeElement(): FakeElement {
  const listeners = new Map<string, Array<() => void>>();
  return {
    children: [],
    className: "",
    dataset: {},
    id: "",
    textContent: "",
    type: "",
    min: "",
    max: "",
    step: "",
    value: "",
    checked: false,
    htmlFor: "",
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(event, handler) {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    },
    dispatch(event) {
      for (const handler of listeners.get(event) ?? []) handler();
    },
  };
}

function installControlRuntime(controls: ArtifactControl[]) {
  const html = renderArtifactHtml({
    id: "artifact-runtime-test",
    title: "Runtime Test",
    topic: "controls",
    summary: "Checks control runtime behavior.",
    lessonMode: "playground",
    controls,
    sceneSource: `
const marker = new THREE.Group();
root.add(marker);
registerComponent("a", "A", marker, {});
registerComponent("b", "B", marker, {});
registerComponent("c", "C", marker, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }, () => {});
setWalkthroughSteps([]);
`,
    components: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    walkthroughSteps: [],
  });
  const start = html.indexOf("const declaredControls = new Map();");
  const end = html.indexOf("      function centerOf", start);
  if (start < 0 || end < 0) throw new Error("Control runtime block not found");

  const block = html.slice(start, end);
  const playgroundControls = makeElement();
  const windowObject = {} as { registerControl?: (descriptor: ArtifactControl, callback: (value: number | boolean) => void) => unknown };
  const documentObject = { createElement: () => makeElement() };
  const camera = { lookAt: () => undefined };
  const THREE = { Vector3: class Vector3 {} };
  const scene = {};
  const renderer = {};
  const root = {};
  const setStatus = () => undefined;
  const install = new Function(
    "artifactPayload",
    "playgroundControls",
    "window",
    "document",
    "THREE",
    "camera",
    "scene",
    "renderer",
    "root",
    "setStatus",
    block,
  );
  install({ lessonMode: "playground", controls }, playgroundControls, windowObject, documentObject, THREE, camera, scene, renderer, root, setStatus);

  if (!windowObject.registerControl) throw new Error("registerControl was not installed");
  return { registerControl: windowObject.registerControl, playgroundControls };
}

describe("artifact template", () => {
  it("wraps scene code in the fixed Parallax runtime", () => {
    const html = renderArtifactHtml({
      id: "artifact-1",
      title: "Magnetic Field Lab",
      topic: "magnetism",
      summary: "Explore field lines around a bar magnet.",
      sceneSource: `
const magnet = new THREE.Mesh(new THREE.BoxGeometry(3, .5, .5), new THREE.MeshStandardMaterial());
root.add(magnet);
registerComponent("magnet", "Bar magnet", magnet, {});
registerComponent("north-pole", "North pole", magnet, {});
registerComponent("south-pole", "South pole", magnet, {});
setWalkthroughSteps([{ id: "intro", title: "Field shape", narration: "Field lines loop between poles.", targetComponentIds: ["magnet"] }]);
`,
      components: [
        { id: "magnet", label: "Bar magnet" },
        { id: "north-pole", label: "North pole" },
        { id: "south-pole", label: "South pole" },
      ],
      walkthroughSteps: [{ id: "intro", title: "Field shape", narration: "Field lines loop between poles.", targetComponentIds: ["magnet"] }],
    });

    expect(html).toContain("/three/three.module.min.js");
    expect(html).toContain("cdn.jsdelivr.net/npm/three");
    expect(html).toContain("registerComponent");
    expect(html).toContain("artifact_ready");
  });

  it("escapes user strings and script-closing scene content", () => {
    const html = renderArtifactHtml({
      id: "artifact-2",
      title: `Bad </script><img src=x onerror=alert(1)>`,
      topic: "escaping",
      summary: "Checks escaping.",
      sceneSource: `setStatus("</script><img src=x>"); registerComponent("a","A",root,{}); registerComponent("b","B",root,{}); registerComponent("c","C",root,{}); setWalkthroughSteps([{id:"s",title:"S",narration:"N",targetComponentIds:["a"]}]);`,
      components: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      walkthroughSteps: [{ id: "s", title: "S", narration: "N", targetComponentIds: ["a"] }],
    });

    expect(html).not.toContain("</script><img");
    expect(html).toMatch(/<\\+\/script>/);
    expect(html).toContain("&lt;/script&gt;&lt;img");
  });

  it("starts rendering before generated scene code can throw", () => {
    const html = renderArtifactHtml({
      id: "artifact-3",
      title: "Fragile Scene",
      topic: "debugging",
      summary: "Checks runtime resilience.",
      sceneSource: `throw new Error("Generated scene failed"); registerComponent("a","A",root,{}); registerComponent("b","B",root,{}); registerComponent("c","C",root,{}); setWalkthroughSteps([{id:"s",title:"S",narration:"N",targetComponentIds:["a"]}]);`,
      components: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      walkthroughSteps: [{ id: "s", title: "S", narration: "N", targetComponentIds: ["a"] }],
    });

    expect(html.indexOf("animate();")).toBeLessThan(html.indexOf("runScene("));
    expect(html).toContain("error.stack");
  });

  it("exposes an OrbitControls-compatible target for generated scene code", () => {
    const html = renderArtifactHtml({
      id: "artifact-4",
      title: "Camera Controls Lab",
      topic: "controls",
      summary: "Checks the runtime controls contract.",
      sceneSource: `
controls.target.set(1, 2, 3);
const marker = new THREE.Group();
root.add(marker);
registerComponent("a", "A", marker, {});
registerComponent("b", "B", marker, {});
registerComponent("c", "C", marker, {});
setWalkthroughSteps([{id:"s",title:"S",narration:"N",targetComponentIds:["a"]}]);
`,
      components: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      walkthroughSteps: [{ id: "s", title: "S", narration: "N", targetComponentIds: ["a"] }],
    });

    expect(html).toContain("target: new THREE.Vector3()");
    expect(html).toContain("fitCameraToRegisteredComponents()");
    expect(html).toContain("controls.target.copy(target)");
  });

  it("fits the camera using object bounds instead of a fixed offset", () => {
    const html = renderArtifactHtml({
      id: "artifact-5",
      title: "Large Object Lab",
      topic: "camera fit",
      summary: "Checks large object framing.",
      sceneSource: `
const large = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 8), new THREE.MeshStandardMaterial());
root.add(large);
registerComponent("large", "Large model", large, {});
registerComponent("left", "Left", large, {});
registerComponent("right", "Right", large, {});
setWalkthroughSteps([{id:"s",title:"S",narration:"N",targetComponentIds:["large"]}]);
`,
      components: [
        { id: "large", label: "Large model" },
        { id: "left", label: "Left" },
        { id: "right", label: "Right" },
      ],
      walkthroughSteps: [{ id: "s", title: "S", narration: "N", targetComponentIds: ["large"] }],
    });

    expect(html).toContain("box.getSize(new THREE.Vector3())");
    expect(html).toContain("camera.fov");
    expect(html).toContain("camera.updateProjectionMatrix()");
    expect(html).toContain("fitCameraToRegisteredComponents");
    expect(html).toContain("Array.from(registered.values())");
  });

  it("renders playground chrome without walkthrough buttons and exposes runtime controls", () => {
    const html = renderArtifactHtml({
      id: "artifact-6",
      title: "Elastic Energy Playground",
      topic: "elastic potential energy",
      summary: "Adjust displacement and compare stored energy.",
      lessonMode: "playground",
      interactionGoal: "Change displacement and connect spring stretch to stored energy.",
      sources: [
        {
          title: "Hooke's Law Basics",
          url: "https://example.com/hookes-law",
          summary: "Introductory reference for spring force and displacement.",
        },
      ],
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 },
      ],
      sceneSource: `
const mass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
root.add(mass);
registerComponent("mass", "Mass", mass, {});
registerComponent("spring", "Spring", mass, {});
registerComponent("energy-bar", "Energy Bar", mass, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }, (value) => {
  mass.position.x = value;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "mass", label: "Mass" },
        { id: "spring", label: "Spring" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      walkthroughSteps: [],
    });

    expect(html).toContain('data-mode="playground"');
    expect(html).toContain("playground-controls");
    expect(html).toContain("registerControl");
    expect(html).not.toContain('id="prev-step"');
    expect(html).not.toContain('id="next-step"');
    expect(html).not.toContain('id="start-walkthrough"');
  });

  it("keeps guided walkthrough buttons for guided artifacts", () => {
    const html = renderArtifactHtml({
      id: "artifact-7",
      title: "Jet Engine Walkthrough",
      topic: "jet engines",
      summary: "Trace the airflow through each engine stage.",
      lessonMode: "guided_walkthrough",
      interactionGoal: "Follow the airflow through the engine in order.",
      sources: [],
      controls: [],
      sceneSource: `
const turbine = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
root.add(turbine);
registerComponent("fan", "Fan", turbine, {});
registerComponent("compressor", "Compressor", turbine, {});
registerComponent("turbine", "Turbine", turbine, {});
setWalkthroughSteps([{ id: "fan", title: "Fan", narration: "Air enters through the fan.", targetComponentIds: ["fan"] }]);
`,
      components: [
        { id: "fan", label: "Fan" },
        { id: "compressor", label: "Compressor" },
        { id: "turbine", label: "Turbine" },
      ],
      walkthroughSteps: [{ id: "fan", title: "Fan", narration: "Air enters through the fan.", targetComponentIds: ["fan"] }],
    });

    expect(html).toContain('data-mode="guided_walkthrough"');
    expect(html).toContain('id="prev-step"');
    expect(html).toContain('id="next-step"');
    expect(html).toContain('id="start-walkthrough"');
  });

  it("executes playground control guardrails from the generated runtime", () => {
    expect(() =>
      installControlRuntime([
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 },
        { id: "displacement", type: "range", label: "Duplicate", min: -2, max: 2, step: 0.1, value: 1 },
      ]),
    ).toThrow("Duplicate declared control id");

    const descriptor = { id: "displacement", type: "range" as const, label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 };
    const { registerControl, playgroundControls } = installControlRuntime([descriptor]);

    expect(() => registerControl({ ...descriptor, label: "Drifted label" }, () => {})).toThrow("label does not match artifact metadata");
    expect(() => registerControl({ ...descriptor, max: 3 }, () => {})).toThrow("range settings do not match artifact metadata");

    const values: Array<number | boolean> = [];
    registerControl(descriptor, (value) => values.push(value));
    expect(values).toEqual([1]);

    expect(() => registerControl(descriptor, () => {})).toThrow("was already registered");

    const wrapper = playgroundControls.children[0];
    const input = wrapper.children[1].children[0];

    input.value = "1";
    input.dispatch("input");
    input.dispatch("change");
    expect(values).toEqual([1]);

    input.value = "1.5";
    input.dispatch("input");
    input.dispatch("change");
    expect(values).toEqual([1, 1.5]);
  });
});
