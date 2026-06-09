"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AnimationId } from "@/lib/engine/lessonTypes";

type AirflowProps = {
  currentAnimation: AnimationId | null;
};

export function Airflow({ currentAnimation }: AirflowProps) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const particles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        x: -5.2 + (i / 33) * 10.4,
        y: Math.sin(i * 1.7) * 0.34,
        z: Math.cos(i * 1.1) * 0.18,
        speed: 0.55 + (i % 5) * 0.11,
      })),
    [],
  );

  useFrame((_, delta) => {
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      mesh.position.x += delta * particles[index].speed * (currentAnimation === "exhaust_thrust" ? 2.2 : 1.3);
      if (mesh.position.x > 5.35) mesh.position.x = -5.35;
    });
  });

  return (
    <group>
      {particles.map((particle, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            refs.current[index] = mesh;
          }}
          position={[particle.x, particle.y, particle.z]}
        >
          <sphereGeometry args={[index % 3 === 0 ? 0.055 : 0.038, 10, 8]} />
          <meshBasicMaterial color={particle.x > 2.9 ? "#ffbd6a" : "#93e9ff"} transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}
