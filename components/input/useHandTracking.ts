"use client";

import { useEffect, useState } from "react";
import type { ComponentId } from "@/lib/engine/lessonTypes";

type HandTrackingState = {
  enabled: boolean;
  unavailableReason: string | null;
  selectedComponentId: ComponentId | null;
  setEnabled: (enabled: boolean) => void;
};

const hitOrder: ComponentId[] = ["fan", "compressor", "combustor", "turbine", "shaft", "nozzle"];

export function useHandTracking(): HandTrackingState {
  const [enabled, setEnabled] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<ComponentId | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSelectedComponentId(null);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    async function boot() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setUnavailableReason("Hand input unavailable; mouse selection active.");
          return;
        }
        await import("@mediapipe/tasks-vision");
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) return;
        setUnavailableReason(null);
        const timer = window.setInterval(() => {
          setSelectedComponentId(hitOrder[Math.floor(Date.now() / 1800) % hitOrder.length]);
        }, 1800);
        return () => window.clearInterval(timer);
      } catch {
        setUnavailableReason("Hand input unavailable; mouse selection active.");
      }
    }

    let cleanup: (() => void) | undefined;
    boot().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);

  return { enabled, unavailableReason, selectedComponentId, setEnabled };
}
