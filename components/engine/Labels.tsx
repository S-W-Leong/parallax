"use client";

import { Text } from "@react-three/drei";
import { engineOrder, engineParts } from "@/lib/engine/engineConfig";
import type { ComponentId } from "@/lib/engine/lessonTypes";

type LabelsProps = {
  focusedComponents: ComponentId[];
  selectedComponentId: ComponentId | null;
  exploded: boolean;
};

export function Labels({ focusedComponents, selectedComponentId, exploded }: LabelsProps) {
  return (
    <group>
      {engineOrder.map((id) => {
        const part = engineParts[id];
        const dimmed = focusedComponents.length > 0 && !focusedComponents.includes(id);
        const x = part.position[0] + (exploded ? part.explode[0] : 0);
        const y = part.position[1] + (exploded ? part.explode[1] : 0) + 0.95;
        return (
          <Text
            key={id}
            position={[x, y, 0]}
            fontSize={selectedComponentId === id ? 0.18 : 0.14}
            color={dimmed ? "#52636c" : "#e7f0f2"}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.006}
            outlineColor="#071014"
          >
            {part.label}
          </Text>
        );
      })}
    </group>
  );
}
