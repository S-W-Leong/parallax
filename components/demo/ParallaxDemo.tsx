"use client";

import { useEffect, useReducer, useState } from "react";
import cachedLesson from "@/data/cached-jet-engine-lesson.json";
import { AgentPanel, type TranscriptMessage } from "@/components/panel/AgentPanel";
import { JetEngineScene } from "@/components/engine/JetEngineScene";
import { useHandTracking } from "@/components/input/useHandTracking";
import { initialRendererState, isRendererCommand, rendererReducer, type RendererCommand } from "@/lib/engine/commands";
import { parseLesson, type Lesson } from "@/lib/engine/lessonTypes";

const initialLesson = parseLesson(cachedLesson);

function commandForStep(lesson: Lesson, index: number): RendererCommand[] {
  const step = lesson.steps[index];
  const commands: RendererCommand[] = [
    { type: "playAnimation", animation: step.animation, stepId: step.id },
    { type: "setCameraPreset", cameraPreset: step.cameraPreset },
    { type: "focusComponents", componentIds: step.componentIds },
    { type: "appendLog", message: `Playing lesson step: ${step.title}` },
  ];
  return commands;
}

export function ParallaxDemo() {
  const [lesson, setLesson] = useState<Lesson>(initialLesson);
  const [state, dispatch] = useReducer(rendererReducer, initialRendererState);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([
    {
      role: "agent",
      text: "I loaded the cached jet-engine lesson. Compile with Exa to refresh the source-grounded artifact, or start the demo path now.",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [quizResult, setQuizResult] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [asking, setAsking] = useState(false);
  const hands = useHandTracking();

  useEffect(() => {
    async function loadBootLesson() {
      try {
        const response = await fetch("/api/lesson");
        const payload = await response.json();
        setLesson(parseLesson(payload.lesson));
        for (const trace of payload.trace ?? []) {
          dispatch({ type: "appendLog", message: trace.message ?? String(trace) });
        }
      } catch (error) {
        dispatch({ type: "appendLog", message: `Local lesson import active: ${error instanceof Error ? error.message : "route unavailable"}` });
      }
    }
    loadBootLesson();
  }, []);

  useEffect(() => {
    commandForStep(lesson, currentStepIndex).forEach(dispatch);
  }, [lesson, currentStepIndex]);

  function goToStep(index: number) {
    setCurrentStepIndex(Math.max(0, Math.min(lesson.steps.length - 1, index)));
  }

  async function loadCompiledLesson() {
    setCompiling(true);
    dispatch({ type: "appendLog", message: "Compiling with Exa" });
    try {
      const response = await fetch("/api/compile", { method: "POST" });
      const payload = await response.json();
      const nextLesson = parseLesson(payload.lesson);
      setLesson(nextLesson);
      setCurrentStepIndex(0);
      for (const trace of payload.trace ?? []) {
        dispatch({ type: "appendLog", message: trace.message ?? String(trace) });
      }
      setTranscript((messages) => [
        ...messages,
        {
          role: "agent",
          text:
            nextLesson.cacheStatus === "compiled_live"
              ? "I compiled a validated lesson JSON artifact from retrieved sources."
              : "Live compilation fell back to the cached lesson, with the fallback trace shown in the activity log.",
        },
      ]);
    } catch (error) {
      dispatch({ type: "appendLog", message: `Using cached fallback: ${error instanceof Error ? error.message : "compile failed"}` });
    } finally {
      setCompiling(false);
    }
  }

  async function askQuestion(question: string) {
    setAsking(true);
    setTranscript((messages) => [...messages, { role: "user", text: question }]);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          selectedComponentId: state.selectedComponentId,
          currentStepId: lesson.steps[currentStepIndex].id,
          lessonTitle: lesson.title,
        }),
      });
      const payload = await response.json();
      setTranscript((messages) => [...messages, { role: "agent", text: payload.answer }]);
      if (payload.suggestedCommand && isRendererCommand(payload.suggestedCommand)) {
        dispatch(payload.suggestedCommand);
      }
    } catch {
      const fallback = state.selectedComponentId
        ? `The ${state.selectedComponentId} matters because it is part of the energy chain that turns airflow into thrust.`
        : "Select a component and I can answer with more precise context.";
      setTranscript((messages) => [...messages, { role: "agent", text: fallback }]);
    } finally {
      setAsking(false);
    }
  }

  async function answerQuiz(answerIndex: number) {
    if (answerIndex === lesson.quiz.correctAnswerIndex) {
      setQuizResult("Correct. The shaft carries turbine work back to the compressor.");
      dispatch({ type: "appendLog", message: "Quiz answered correctly" });
      return;
    }

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answerIndex,
          correctAnswerIndex: lesson.quiz.correctAnswerIndex,
          question: lesson.quiz.question,
        }),
      });
      const payload = await response.json();
      setQuizResult(payload.diagnosis);
      setTranscript((messages) => [...messages, { role: "agent", text: payload.narration }]);
      if (payload.command && isRendererCommand(payload.command)) {
        dispatch(payload.command);
      } else {
        dispatch({ type: "startReteach" });
      }
    } catch {
      setQuizResult(lesson.quiz.wrongDiagnosis);
      dispatch({ type: "startReteach" });
    }
  }

  function runDemo() {
    dispatch({ type: "appendLog", message: "Demo Run started" });
    setCurrentStepIndex(0);
    const timeline = [1, 2, 3, 4];
    timeline.forEach((index, offset) => {
      window.setTimeout(() => setCurrentStepIndex(index), 900 * (offset + 1));
    });
    window.setTimeout(() => {
      dispatch({ type: "selectComponent", componentId: "compressor", source: "agent" });
      askQuestion("Why is this important?");
    }, 4700);
    window.setTimeout(() => answerQuiz(2), 6700);
  }

  function selectPreset(cameraPreset: string, command?: RendererCommand) {
    dispatch({ type: "setCameraPreset", cameraPreset });
    if (command) dispatch(command);
  }

  return (
    <main className="app-shell">
      <section className="scene-pane">
        <div className="scene-header">
          <div className="brand">Parallax</div>
          <div className="pill">Procedural jet-engine cutaway</div>
          <div className="pill">{state.currentAnimation ?? "idle"}</div>
        </div>
        <JetEngineScene state={state} dispatch={dispatch} handSelection={hands.selectedComponentId} />
        <div className="camera-controls">
          <button onClick={() => selectPreset("wide_cutaway", { type: "focusComponents", componentIds: ["fan", "compressor", "combustor", "turbine", "shaft", "nozzle", "casing"] })}>Wide</button>
          <button onClick={() => selectPreset("compressor_focus", { type: "selectComponent", componentId: "compressor", source: "agent" })}>Compressor</button>
          <button onClick={() => selectPreset("turbine_shaft_focus", { type: "startReteach" })}>Turbine/Shaft</button>
          <button onClick={() => selectPreset("exhaust_focus", { type: "selectComponent", componentId: "nozzle", source: "agent" })}>Exhaust</button>
          <button onClick={() => dispatch({ type: "setExploded", exploded: !state.exploded })}>{state.exploded ? "Collapse" : "Explode"}</button>
          <button onClick={() => dispatch({ type: "resetView" })}>Reset</button>
        </div>
      </section>
      <AgentPanel
        lesson={lesson}
        state={state}
        currentStepIndex={currentStepIndex}
        transcript={transcript}
        inputText={inputText}
        quizResult={quizResult}
        compiling={compiling}
        asking={asking}
        handEnabled={hands.enabled}
        handStatus={hands.unavailableReason}
        onInputChange={setInputText}
        onAsk={askQuestion}
        onCompile={loadCompiledLesson}
        onNextStep={() => goToStep(currentStepIndex + 1)}
        onPrevStep={() => goToStep(currentStepIndex - 1)}
        onQuizAnswer={answerQuiz}
        onDemoRun={runDemo}
        onToggleHands={() => hands.setEnabled(!hands.enabled)}
      />
    </main>
  );
}
