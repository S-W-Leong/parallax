import { describe, expect, it } from "vitest";
import { renderArtifactHtml } from "@/lib/artifacts/artifactTemplate";

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

  it("exposes an OrbitControls-compatible target for generated scene code", () => {
    const html = renderArtifactHtml({
      id: "artifact-3",
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
      id: "artifact-4",
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
});
