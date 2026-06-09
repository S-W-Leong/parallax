"use client";

import { X } from "lucide-react";

type CodeInspectorProps = {
  title: string;
  html: string;
  open: boolean;
  onClose: () => void;
};

export function CodeInspector({ title, html, open, onClose }: CodeInspectorProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${title} artifact source`}>
      <section className="code-modal">
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close source inspector">
            <X size={18} />
          </button>
        </header>
        <pre>
          <code>{html}</code>
        </pre>
      </section>
    </div>
  );
}
