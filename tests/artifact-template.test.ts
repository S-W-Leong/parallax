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
});
