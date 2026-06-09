"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Airflow } from "./Airflow";
import { JetEngineModel } from "./JetEngineModel";
import { Labels } from "./Labels";
import { cameraPresetsConfig } from "@/lib/engine/engineConfig";
import type { RendererCommand, RendererState } from "@/lib/engine/commands";
import type { ComponentId } from "@/lib/engine/lessonTypes";

type JetEngineSceneProps = {
  state: RendererState;
  dispatch: (command: RendererCommand) => void;
  handSelection?: ComponentId | null;
};

function CameraController({ preset }: { preset: string }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const desired = useMemo(() => cameraPresetsConfig[preset as keyof typeof cameraPresetsConfig] ?? cameraPresetsConfig.wide_cutaway, [preset]);

  useEffect(() => {
    target.current.set(...desired.target);
  }, [desired]);

  useFrame((_, delta) => {
    const goal = new THREE.Vector3(...desired.position);
    camera.position.lerp(goal, Math.min(1, delta * 2.6));
    camera.lookAt(target.current);
  });

  return null;
}

export function JetEngineScene({ state, dispatch, handSelection }: JetEngineSceneProps) {
  useEffect(() => {
    if (handSelection) {
      dispatch({ type: "selectComponent", componentId: handSelection, source: "hand" });
    }
  }, [dispatch, handSelection]);

  return (
    <div className="canvas-wrap">
      <Canvas camera={{ position: [0, 3.1, 8.3], fov: 45 }} dpr={[1, 1.75]}>
        <color attach="background" args={["#071014"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 5]} intensity={2.2} />
        <pointLight position={[-4, 2, 3]} intensity={2} color="#60d8ff" />
        <Stars radius={20} depth={8} count={400} factor={2} saturation={0} fade speed={0.25} />
        <CameraController preset={state.cameraPreset} />
        <Airflow currentAnimation={state.currentAnimation} />
        <JetEngineModel
          selectedComponentId={state.selectedComponentId}
          focusedComponents={state.focusedComponents}
          exploded={state.exploded}
          currentAnimation={state.currentAnimation}
          onSelect={(componentId) => dispatch({ type: "selectComponent", componentId, source: "mouse" })}
        />
        <Labels focusedComponents={state.focusedComponents} selectedComponentId={state.selectedComponentId} exploded={state.exploded} />
        <OrbitControls enablePan={false} minDistance={4.2} maxDistance={11} />
      </Canvas>
    </div>
  );
}
