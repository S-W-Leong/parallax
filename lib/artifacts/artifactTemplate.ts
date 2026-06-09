import type { CreateExperienceInput } from "./artifactTypes";

export type ArtifactTemplateInput = CreateExperienceInput & {
  id: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function safeSceneSource(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

export function renderArtifactHtml(input: ArtifactTemplateInput): string {
  const payload = {
    id: input.id,
    title: input.title,
    topic: input.topic,
    summary: input.summary,
    components: input.components,
    walkthroughSteps: input.walkthroughSteps,
  };
  const sceneSource = JSON.stringify(safeSceneSource(input.sceneSource));
  const payloadJson = safeJson(payload);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #05070b;
      --panel: rgba(8, 15, 26, .82);
      --line: rgba(148, 163, 184, .22);
      --text: #edf7ff;
      --muted: #91a7b7;
      --cyan: #62e6d2;
      --amber: #f6c76a;
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      background:
        radial-gradient(circle at 25% 20%, rgba(98, 230, 210, .16), transparent 30%),
        radial-gradient(circle at 75% 25%, rgba(246, 199, 106, .10), transparent 24%),
        linear-gradient(145deg, #05070b 0%, #08111f 48%, #07131a 100%);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button {
      height: 32px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(14, 25, 39, .9);
      color: var(--text);
      cursor: pointer;
    }
    button:hover { border-color: var(--cyan); }
    #stage { position: fixed; inset: 0; }
    #stage canvas { display: block; width: 100%; height: 100%; }
    #hud {
      position: fixed;
      left: 14px;
      right: 14px;
      bottom: 14px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
      pointer-events: none;
    }
    #caption, #controls, #status {
      border: 1px solid var(--line);
      background: var(--panel);
      backdrop-filter: blur(18px);
      box-shadow: 0 18px 50px rgba(0, 0, 0, .34);
    }
    #caption {
      min-height: 86px;
      border-radius: 8px;
      padding: 12px 14px;
      pointer-events: auto;
    }
    #caption p { margin: 0; color: var(--muted); line-height: 1.42; }
    #caption h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: 0; }
    #controls {
      border-radius: 8px;
      padding: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      justify-content: flex-end;
      pointer-events: auto;
      max-width: 420px;
    }
    #status {
      position: fixed;
      top: 14px;
      left: 14px;
      max-width: min(420px, calc(100vw - 28px));
      border-radius: 8px;
      padding: 9px 11px;
      color: var(--muted);
      font-size: 13px;
    }
    #labels { position: fixed; inset: 0; pointer-events: none; }
    .label {
      position: absolute;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(98, 230, 210, .5);
      border-radius: 999px;
      background: rgba(5, 10, 18, .72);
      color: var(--text);
      padding: 4px 8px;
      font-size: 12px;
      white-space: nowrap;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .28);
    }
    @media (max-width: 720px) {
      #hud { grid-template-columns: 1fr; }
      #controls { justify-content: flex-start; max-width: none; }
    }
  </style>
</head>
<body>
  <main id="stage" aria-label="${escapeHtml(input.title)} interactive 3D learning artifact"></main>
  <div id="status">Loading artifact runtime...</div>
  <div id="labels"></div>
  <section id="hud" aria-label="Artifact walkthrough controls">
    <article id="caption">
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.summary)}</p>
    </article>
    <nav id="controls" aria-label="Artifact controls">
      <button id="prev-step" type="button">Prev</button>
      <button id="next-step" type="button">Next</button>
      <button id="start-walkthrough" type="button">Walkthrough</button>
      <button id="explode" type="button">Explode</button>
      <button id="reset-camera" type="button">Reset</button>
      <button id="toggle-labels" type="button">Labels</button>
    </nav>
  </section>
  <script type="module">
    const artifactPayload = ${payloadJson};
    const sceneSource = ${sceneSource};
    const artifactId = artifactPayload.id;
    const localThreeUrl = "/three/three.module.min.js";
    const cdnThreeUrl = "https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.min.js";

    async function loadThree() {
      try {
        return await import(localThreeUrl);
      } catch (localError) {
        return await import(cdnThreeUrl);
      }
    }

    function postArtifactEvent(event) {
      window.parent.postMessage({ source: "parallax-artifact", artifactId, ...event }, "*");
    }

    function setStatus(message) {
      document.getElementById("status").textContent = message;
    }

    function formatError(error) {
      if (!(error instanceof Error)) return String(error);
      return error.stack || error.message;
    }

    loadThree().then((THREE) => {
      window.THREE = THREE;

      const stage = document.getElementById("stage");
      const labelsLayer = document.getElementById("labels");
      const caption = document.getElementById("caption");
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05070b);
      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(5, 3, 7);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      stage.appendChild(renderer.domElement);

      const root = new THREE.Group();
      scene.add(root);
      scene.add(new THREE.HemisphereLight(0xdaf7ff, 0x17202a, 1.8));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(5, 8, 6);
      scene.add(key);
      const fill = new THREE.PointLight(0x62e6d2, 2.5, 12);
      fill.position.set(-4, 2, 4);
      scene.add(fill);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const registered = new Map();
      const objectToComponent = new WeakMap();
      const labels = new Map();
      let walkthroughSteps = artifactPayload.walkthroughSteps || [];
      let currentStepIndex = 0;
      let labelsVisible = true;
      let exploded = false;
      let dragStart = null;
      const controls = {
        enabled: true,
        target: new THREE.Vector3(),
        update() {
          camera.lookAt(this.target);
        }
      };

      window.scene = scene;
      window.camera = camera;
      window.renderer = renderer;
      window.root = root;
      window.controls = controls;

      function ensureObject(object3D) {
        return object3D && typeof object3D.traverse === "function";
      }

      function labelFor(component) {
        let label = labels.get(component.id);
        if (!label) {
          label = document.createElement("span");
          label.className = "label";
          label.textContent = component.label;
          labelsLayer.appendChild(label);
          labels.set(component.id, label);
        }
        return label;
      }

      window.registerComponent = function registerComponent(id, label, object3D, metadata) {
        if (!id || !label || !ensureObject(object3D)) {
          throw new Error("registerComponent requires id, label, and a THREE.Object3D");
        }
        const component = { id, label, object3D, metadata: metadata || {} };
        registered.set(id, component);
        object3D.userData.componentId = id;
        object3D.traverse((child) => {
          child.userData.componentId = id;
          objectToComponent.set(child, component);
        });
        labelFor(component);
        return component;
      };

      window.setWalkthroughSteps = function setWalkthroughSteps(steps) {
        walkthroughSteps = Array.isArray(steps) && steps.length ? steps : artifactPayload.walkthroughSteps;
        currentStepIndex = 0;
        renderStep(false);
      };

      window.setStatus = setStatus;

      function centerOf(object3D) {
        const box = new THREE.Box3().setFromObject(object3D);
        if (box.isEmpty()) return new THREE.Vector3();
        return box.getCenter(new THREE.Vector3());
      }

      function boundsOf(object3D) {
        const box = new THREE.Box3().setFromObject(object3D);
        if (box.isEmpty()) {
          return { center: new THREE.Vector3(), size: new THREE.Vector3(1, 1, 1), radius: 1 };
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        return { center, size, radius: Math.max(size.length() * 0.5, 1) };
      }

      function boundsOfObjects(objects) {
        const box = new THREE.Box3();
        let hasBounds = false;
        for (const object3D of objects) {
          if (!ensureObject(object3D)) continue;
          const nextBox = new THREE.Box3().setFromObject(object3D);
          if (nextBox.isEmpty()) continue;
          box.union(nextBox);
          hasBounds = true;
        }
        if (!hasBounds) return boundsOf(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        return { center, size, radius: Math.max(size.length() * 0.5, 1) };
      }

      function lookAtTarget(target) {
        controls.target.copy(target);
        controls.update();
      }

      function fitCameraToBounds(bounds, position) {
        const target = bounds.center;
        if (Array.isArray(position) && position.length === 3) {
          camera.position.set(position[0], position[1], position[2]);
        } else {
          const direction = new THREE.Vector3(0.72, 0.48, 0.9).normalize();
          const fov = camera.fov * Math.PI / 180;
          const aspect = Math.max(camera.aspect || 1, 0.1);
          const fitHeightDistance = bounds.size.y / 2 / Math.tan(fov / 2);
          const fitWidthDistance = bounds.size.x / 2 / Math.tan(fov / 2) / aspect;
          const distance = Math.max(fitHeightDistance, fitWidthDistance, bounds.size.z * 1.15, 3);
          camera.position.copy(target).add(direction.multiplyScalar(distance * 1.35));
        }
        camera.near = Math.max(0.01, bounds.radius / 120);
        camera.far = Math.max(1000, bounds.radius * 80);
        camera.updateProjectionMatrix();
        lookAtTarget(target);
      }

      window.fitCameraTo = function fitCameraTo(object3D, position) {
        if (!ensureObject(object3D)) return;
        fitCameraToBounds(boundsOf(object3D), position);
      };

      function fitCameraToRegisteredComponents() {
        const componentObjects = Array.from(registered.values()).map((component) => component.object3D);
        fitCameraToBounds(boundsOfObjects(componentObjects));
      };

      function renderStep(emit) {
        const step = walkthroughSteps[currentStepIndex];
        if (!step) return;
        caption.innerHTML = "<h1>" + step.title + "</h1><p>" + step.narration + "</p>";
        const firstTarget = step.targetComponentIds && step.targetComponentIds[0];
        const component = firstTarget ? registered.get(firstTarget) : null;
        if (component) {
          window.fitCameraTo(component.object3D, step.camera && step.camera.position);
        } else if (step.camera && step.camera.position) {
          camera.position.set(step.camera.position[0], step.camera.position[1], step.camera.position[2]);
          if (step.camera.lookAt) lookAtTarget(new THREE.Vector3(step.camera.lookAt[0], step.camera.lookAt[1], step.camera.lookAt[2]));
        }
        setStatus("Step " + (currentStepIndex + 1) + " of " + walkthroughSteps.length + ": " + step.title);
        if (emit) postArtifactEvent({ type: "walkthrough_step_changed", stepId: step.id, title: step.title });
      }

      function goToStep(index, emit) {
        if (!walkthroughSteps.length) return;
        currentStepIndex = Math.max(0, Math.min(walkthroughSteps.length - 1, index));
        renderStep(emit);
      }

      window.startWalkthrough = function startWalkthrough() {
        goToStep(0, true);
      };
      window.pauseWalkthrough = function pauseWalkthrough() {
        setStatus("Walkthrough paused");
      };
      window.resetCamera = function resetCamera() {
        root.rotation.set(0, 0, 0);
        fitCameraToRegisteredComponents();
        setStatus("Camera reset");
      };
      window.setLabelsVisible = function setLabelsVisible(visible) {
        labelsVisible = Boolean(visible);
        labelsLayer.style.display = labelsVisible ? "block" : "none";
      };
      window.setExploded = function setExploded(nextExploded) {
        exploded = Boolean(nextExploded);
        const all = Array.from(registered.values());
        for (const component of all) {
          const base = component.object3D.userData.basePosition || component.object3D.position.clone();
          component.object3D.userData.basePosition = base;
          const direction = base.clone();
          if (direction.length() < 0.01) direction.set(Math.random() - .5, Math.random() - .5, Math.random() - .5);
          direction.normalize().multiplyScalar(exploded ? 0.75 : 0);
          component.object3D.position.copy(base).add(direction);
        }
        setStatus(exploded ? "Exploded view" : "Collapsed view");
      };

      function commandFocusComponent(componentId) {
        const component = registered.get(componentId);
        if (!component) {
          setStatus("Component not found: " + componentId);
          return;
        }
        window.fitCameraTo(component.object3D);
        postArtifactEvent({ type: "component_selected", componentId: component.id, label: component.label, metadata: component.metadata });
      }

      function handleCommand(command) {
        if (command.type === "focus_component") commandFocusComponent(command.componentId);
        if (command.type === "go_to_step") {
          const index = walkthroughSteps.findIndex((step) => step.id === command.stepId);
          if (index >= 0) goToStep(index, true);
        }
        if (command.type === "start_walkthrough") window.startWalkthrough();
        if (command.type === "pause_walkthrough") window.pauseWalkthrough();
        if (command.type === "reset_camera") window.resetCamera();
        if (command.type === "explode") window.setExploded(true);
        if (command.type === "collapse") window.setExploded(false);
        if (command.type === "toggle_labels") window.setLabelsVisible(!labelsVisible);
      }

      window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || data.source !== "parallax-parent" || data.type !== "artifact_command" || data.artifactId !== artifactId) return;
        handleCommand(data.command);
      });

      renderer.domElement.addEventListener("pointerdown", (event) => {
        dragStart = { x: event.clientX, y: event.clientY, moved: false };
        renderer.domElement.setPointerCapture(event.pointerId);
      });
      renderer.domElement.addEventListener("pointermove", (event) => {
        if (!dragStart || !controls.enabled) return;
        const dx = event.clientX - dragStart.x;
        const dy = event.clientY - dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragStart.moved = true;
        root.rotation.y += dx * 0.006;
        root.rotation.x += dy * 0.003;
        root.rotation.x = Math.max(-1.2, Math.min(1.2, root.rotation.x));
        dragStart.x = event.clientX;
        dragStart.y = event.clientY;
      });
      renderer.domElement.addEventListener("pointerup", (event) => {
        const wasClick = dragStart && !dragStart.moved;
        dragStart = null;
        if (!wasClick) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const objects = Array.from(registered.values()).map((component) => component.object3D);
        const hit = raycaster.intersectObjects(objects, true)[0];
        if (!hit) return;
        const component = objectToComponent.get(hit.object);
        if (!component) return;
        postArtifactEvent({ type: "component_selected", componentId: component.id, label: component.label, metadata: component.metadata });
        setStatus("Selected: " + component.label);
      });
      renderer.domElement.addEventListener("wheel", (event) => {
        event.preventDefault();
        camera.position.multiplyScalar(event.deltaY > 0 ? 1.08 : 0.92);
      }, { passive: false });

      document.getElementById("prev-step").onclick = () => goToStep(currentStepIndex - 1, true);
      document.getElementById("next-step").onclick = () => goToStep(currentStepIndex + 1, true);
      document.getElementById("start-walkthrough").onclick = () => window.startWalkthrough();
      document.getElementById("reset-camera").onclick = () => window.resetCamera();
      document.getElementById("toggle-labels").onclick = () => window.setLabelsVisible(!labelsVisible);
      document.getElementById("explode").onclick = () => window.setExploded(!exploded);

      window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      function updateLabels() {
        labels.forEach((label, id) => {
          const component = registered.get(id);
          if (!component || !labelsVisible) return;
          const point = centerOf(component.object3D).project(camera);
          label.style.left = ((point.x + 1) / 2 * window.innerWidth) + "px";
          label.style.top = ((-point.y + 1) / 2 * window.innerHeight) + "px";
          label.style.opacity = point.z > 1 ? "0" : "1";
        });
      }

      function animate() {
        requestAnimationFrame(animate);
        updateLabels();
        renderer.render(scene, camera);
      }

      animate();

      try {
        const runScene = new Function(
          "THREE",
          "scene",
          "camera",
          "renderer",
          "root",
          "controls",
          "registerComponent",
          "setWalkthroughSteps",
          "setStatus",
          "fitCameraTo",
          sceneSource + "\\n//# sourceURL=parallax-generated-scene.js"
        );
        runScene(THREE, scene, camera, renderer, root, controls, window.registerComponent, window.setWalkthroughSteps, window.setStatus, window.fitCameraTo);
        window.setWalkthroughSteps(walkthroughSteps);
        fitCameraToRegisteredComponents();
        setStatus("Artifact ready. Drag to rotate, scroll to zoom, click parts to inspect.");
        postArtifactEvent({ type: "artifact_ready" });
      } catch (error) {
        const message = formatError(error);
        setStatus(message);
        postArtifactEvent({ type: "artifact_error", message });
      }
    }).catch((error) => {
      const message = "Three.js failed to load: " + formatError(error);
      setStatus(message);
      postArtifactEvent({ type: "artifact_error", message });
    });
  </script>
</body>
</html>`;
}
