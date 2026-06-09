"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { EnginePart } from "./EnginePart";
import { engineParts } from "@/lib/engine/engineConfig";
import type { AnimationId, ComponentId } from "@/lib/engine/lessonTypes";

type JetEngineModelProps = {
  selectedComponentId: ComponentId | null;
  focusedComponents: ComponentId[];
  exploded: boolean;
  currentAnimation: AnimationId | null;
  onSelect: (id: ComponentId) => void;
};

function mat(color: string, selected: boolean, dimmed: boolean, emissive = "#000000") {
  return (
    <meshStandardMaterial
      color={color}
      emissive={selected ? color : emissive}
      emissiveIntensity={selected ? 0.45 : 0.12}
      transparent
      opacity={dimmed ? 0.22 : 0.92}
      roughness={0.42}
      metalness={0.28}
    />
  );
}

function Blades({ count, radius, color, selected, dimmed }: { count: number; radius: number; color: string; selected: boolean; dimmed: boolean }) {
  const blades = useMemo(() => Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2), [count]);
  return (
    <>
      {blades.map((angle) => (
        <mesh key={angle} rotation={[0, 0, angle]} position={[0, 0, 0]}>
          <boxGeometry args={[0.12, radius, 0.08]} />
          {mat(color, selected, dimmed)}
        </mesh>
      ))}
    </>
  );
}

export function JetEngineModel({ selectedComponentId, focusedComponents, exploded, currentAnimation, onSelect }: JetEngineModelProps) {
  const fanRef = useRef<THREE.Group>(null);
  const compressorRef = useRef<THREE.Group>(null);
  const turbineRef = useRef<THREE.Group>(null);
  const shaftRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const replay = currentAnimation === "turbine_shaft_compressor_replay";
    if (fanRef.current) fanRef.current.rotation.x += delta * 2.8;
    if (compressorRef.current) compressorRef.current.rotation.x += delta * (replay ? 5.8 : 3.7);
    if (turbineRef.current) turbineRef.current.rotation.x += delta * (replay ? 6.4 : 4.1);
    if (shaftRef.current) shaftRef.current.rotation.x += delta * (replay ? 7.2 : 2.5);
  });

  const isDimmed = (id: ComponentId) => focusedComponents.length > 0 && !focusedComponents.includes(id);
  const isSelected = (id: ComponentId) => selectedComponentId === id;
  const combustorGlow = currentAnimation === "combustion_glow";

  return (
    <group rotation={[0, 0, 0]}>
      <EnginePart id="casing" selected={isSelected("casing")} dimmed={isDimmed("casing")} exploded={exploded} onSelect={onSelect}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.22, 1.05, 8.5, 56, 1, true, Math.PI * 0.1, Math.PI * 1.55]} />
          {mat(engineParts.casing.color, isSelected("casing"), isDimmed("casing"))}
        </mesh>
      </EnginePart>

      <EnginePart id="shaft" selected={isSelected("shaft")} dimmed={isDimmed("shaft")} exploded={exploded} onSelect={onSelect}>
        <group ref={shaftRef} rotation={[0, 0, Math.PI / 2]}>
          <mesh>
            <cylinderGeometry args={[0.12, 0.12, 6.7, 28]} />
            {mat(engineParts.shaft.color, isSelected("shaft"), isDimmed("shaft"))}
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.09, 0.12, 6.7]} />
            {mat("#9fb5bd", isSelected("shaft"), isDimmed("shaft"))}
          </mesh>
        </group>
      </EnginePart>

      <EnginePart id="fan" selected={isSelected("fan")} dimmed={isDimmed("fan")} exploded={exploded} onSelect={onSelect}>
        <group ref={fanRef} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <torusGeometry args={[0.72, 0.055, 12, 48]} />
            {mat(engineParts.fan.color, isSelected("fan"), isDimmed("fan"))}
          </mesh>
          <Blades count={18} radius={0.72} color="#8de8ff" selected={isSelected("fan")} dimmed={isDimmed("fan")} />
          <mesh>
            <sphereGeometry args={[0.18, 24, 16]} />
            {mat("#d7f8ff", isSelected("fan"), isDimmed("fan"))}
          </mesh>
        </group>
      </EnginePart>

      <EnginePart id="compressor" selected={isSelected("compressor")} dimmed={isDimmed("compressor")} exploded={exploded} onSelect={onSelect}>
        <group ref={compressorRef} rotation={[0, Math.PI / 2, 0]}>
          {[-0.55, -0.25, 0.05, 0.35, 0.65].map((z, index) => (
            <group key={z} position={[0, 0, z]} rotation={[0, 0, index * 0.18]}>
              <mesh>
                <torusGeometry args={[0.54 - index * 0.035, 0.028, 10, 40]} />
                {mat("#74ead4", isSelected("compressor"), isDimmed("compressor"))}
              </mesh>
              <Blades count={12} radius={0.5 - index * 0.035} color={engineParts.compressor.color} selected={isSelected("compressor")} dimmed={isDimmed("compressor")} />
            </group>
          ))}
        </group>
      </EnginePart>

      <EnginePart id="combustor" selected={isSelected("combustor")} dimmed={isDimmed("combustor")} exploded={exploded} onSelect={onSelect}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.74, 0.56, 1.42, 42]} />
          {mat(engineParts.combustor.color, isSelected("combustor"), isDimmed("combustor"), combustorGlow ? "#ff7a1a" : "#2d1400")}
        </mesh>
        <pointLight color="#ff9a35" intensity={combustorGlow ? 8 : 2.1} distance={4} />
      </EnginePart>

      <EnginePart id="turbine" selected={isSelected("turbine")} dimmed={isDimmed("turbine")} exploded={exploded} onSelect={onSelect}>
        <group ref={turbineRef} rotation={[0, Math.PI / 2, 0]}>
          {[-0.35, 0.0, 0.35].map((z, index) => (
            <group key={z} position={[0, 0, z]} rotation={[0, 0, index * 0.32]}>
              <mesh>
                <torusGeometry args={[0.55 + index * 0.025, 0.034, 10, 40]} />
                {mat("#ffb06e", isSelected("turbine"), isDimmed("turbine"))}
              </mesh>
              <Blades count={14} radius={0.55 + index * 0.025} color={engineParts.turbine.color} selected={isSelected("turbine")} dimmed={isDimmed("turbine")} />
            </group>
          ))}
        </group>
      </EnginePart>

      <EnginePart id="nozzle" selected={isSelected("nozzle")} dimmed={isDimmed("nozzle")} exploded={exploded} onSelect={onSelect}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.88, 1.45, 48, 1, true]} />
          {mat(engineParts.nozzle.color, isSelected("nozzle"), isDimmed("nozzle"))}
        </mesh>
      </EnginePart>
    </group>
  );
}
