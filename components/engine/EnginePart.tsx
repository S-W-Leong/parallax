"use client";

import type { ReactNode } from "react";
import type { ComponentId } from "@/lib/engine/lessonTypes";
import { engineParts } from "@/lib/engine/engineConfig";

type EnginePartProps = {
  id: ComponentId;
  selected: boolean;
  dimmed: boolean;
  exploded: boolean;
  onSelect: (id: ComponentId) => void;
  children: ReactNode;
  position?: [number, number, number];
};

export function EnginePart({ id, selected, dimmed, exploded, onSelect, children, position }: EnginePartProps) {
  const part = engineParts[id];
  const base = position ?? part.position;
  const actualPosition = [
    Number(base[0]) + (exploded ? part.explode[0] : 0),
    Number(base[1]) + (exploded ? part.explode[1] : 0),
    Number(base[2]) + (exploded ? part.explode[2] : 0),
  ] as [number, number, number];

  return (
    <group
      position={actualPosition}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
      userData={{ componentId: id, selected, dimmed }}
    >
      <group scale={selected ? 1.06 : 1}>{children}</group>
    </group>
  );
}
