"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileCode } from "lucide-react";
import type { ArtifactRecord, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import { buildParentArtifactMessage, parseArtifactEvent, type ArtifactCommand } from "@/lib/artifacts/messageBridge";
import { CodeInspector } from "./CodeInspector";

type ArtifactFrameProps = {
  artifact: ArtifactRecord;
  pendingCommands: ArtifactCommand[];
  showToolbar?: boolean;
  onCommandsFlushed: () => void;
  onComponentSelected: (component: SelectedComponent) => void;
  onStepChanged: (stepId: string, title: string) => void;
  onArtifactError: (message: string) => void;
};

export function ArtifactFrame({
  artifact,
  pendingCommands,
  showToolbar = false,
  onCommandsFlushed,
  onComponentSelected,
  onStepChanged,
  onArtifactError,
}: ArtifactFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [artifactReady, setArtifactReady] = useState(false);

  useEffect(() => {
    setArtifactReady(false);
  }, [artifact.id]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      const parsed = parseArtifactEvent(event.data);
      if (!parsed || parsed.artifactId !== artifact.id) return;
      if (parsed.type === "artifact_ready") {
        setArtifactReady(true);
      }
      if (parsed.type === "component_selected") {
        onComponentSelected({
          artifactId: artifact.id,
          id: parsed.componentId,
          label: parsed.label,
          metadata: parsed.metadata,
        });
      }
      if (parsed.type === "walkthrough_step_changed") {
        onStepChanged(parsed.stepId, parsed.title);
      }
      if (parsed.type === "artifact_error") {
        onArtifactError(parsed.message);
      }
    }

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [artifact.id, onArtifactError, onComponentSelected, onStepChanged]);

  useEffect(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target || !artifactReady || pendingCommands.length === 0) return;
    for (const command of pendingCommands) {
      target.postMessage(buildParentArtifactMessage(artifact.id, command), "*");
    }
    onCommandsFlushed();
  }, [artifact.id, artifactReady, onCommandsFlushed, pendingCommands]);

  function downloadHtml() {
    const blob = new Blob([artifact.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="artifact-stage">
      {showToolbar ? (
        <header className="artifact-toolbar">
          <div>
            <p className="eyebrow">Learning room</p>
            <h2>{artifact.title}</h2>
          </div>
          <div className="toolbar-actions">
            <button onClick={() => setInspecting(true)}>
              <FileCode size={16} /> Inspect
            </button>
            <button onClick={downloadHtml}>
              <Download size={16} /> Download
            </button>
          </div>
        </header>
      ) : null}
      <iframe ref={iframeRef} title={artifact.title} srcDoc={artifact.html} sandbox="allow-scripts" />
      {showToolbar ? <CodeInspector title={artifact.title} html={artifact.html} open={inspecting} onClose={() => setInspecting(false)} /> : null}
    </section>
  );
}
