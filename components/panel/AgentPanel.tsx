"use client";

import { Mic, MicOff, Play, RefreshCw, Send, Video, VideoOff } from "lucide-react";
import type { Lesson } from "@/lib/engine/lessonTypes";
import type { RendererState } from "@/lib/engine/commands";
import { engineParts } from "@/lib/engine/engineConfig";
import { QuizCard } from "./QuizCard";
import { useVoiceInput } from "@/components/input/useVoiceInput";

export type TranscriptMessage = {
  role: "user" | "agent";
  text: string;
};

type AgentPanelProps = {
  lesson: Lesson;
  state: RendererState;
  currentStepIndex: number;
  transcript: TranscriptMessage[];
  inputText: string;
  quizResult: string | null;
  compiling: boolean;
  asking: boolean;
  handEnabled: boolean;
  handStatus: string | null;
  onInputChange: (value: string) => void;
  onAsk: (question: string) => void;
  onCompile: () => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  onQuizAnswer: (answerIndex: number) => void;
  onDemoRun: () => void;
  onToggleHands: () => void;
};

export function AgentPanel({
  lesson,
  state,
  currentStepIndex,
  transcript,
  inputText,
  quizResult,
  compiling,
  asking,
  handEnabled,
  handStatus,
  onInputChange,
  onAsk,
  onCompile,
  onNextStep,
  onPrevStep,
  onQuizAnswer,
  onDemoRun,
  onToggleHands,
}: AgentPanelProps) {
  const voice = useVoiceInput();
  const currentStep = lesson.steps[currentStepIndex];
  const selectedLabel = state.selectedComponentId ? engineParts[state.selectedComponentId].label : "None";
  const question = voice.transcript || inputText;

  function submit() {
    const trimmed = question.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    onInputChange("");
    voice.setTranscript("");
  }

  return (
    <aside className="panel">
      <section className="panel-section">
        <p className="section-title">Lesson Compiler</p>
        <h1 className="lesson-title">{lesson.title}</h1>
        <p className="small">
          Step {currentStepIndex + 1} of {lesson.steps.length}: {currentStep.title}
        </p>
        <p className="step-copy">{currentStep.narration}</p>
        <div className="toolbar">
          <button onClick={onPrevStep} disabled={currentStepIndex === 0}>
            Back
          </button>
          <button className="primary" onClick={onNextStep}>
            <Play size={15} /> Next
          </button>
          <button onClick={onCompile} disabled={compiling}>
            <RefreshCw size={15} /> {compiling ? "Compiling" : "Compile with Exa"}
          </button>
          <button className="warning" onClick={onDemoRun}>
            Demo Run
          </button>
        </div>
      </section>

      <section className="panel-section">
        <p className="section-title">Selected Component</p>
        <strong>{selectedLabel}</strong>
        <p className="small">Focus: {state.focusedComponents.length ? state.focusedComponents.join(", ") : "wide cutaway"}</p>
      </section>

      <section className="panel-section">
        <p className="section-title">Tutor Q&A</p>
        <div className="row">
          <input
            value={voice.transcript || inputText}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={state.selectedComponentId ? `Ask about the ${selectedLabel.toLowerCase()}` : "Ask a component-aware question"}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <button aria-label="Send question" onClick={submit} disabled={asking}>
            <Send size={16} />
          </button>
        </div>
        <div className="toolbar">
          <button onClick={voice.listening ? voice.stop : voice.start} disabled={!voice.supported}>
            {voice.listening ? <MicOff size={15} /> : <Mic size={15} />} {voice.supported ? "Push to Talk" : "Text Only"}
          </button>
          <button onClick={onToggleHands}>
            {handEnabled ? <VideoOff size={15} /> : <Video size={15} />} Hand Input
          </button>
        </div>
        {voice.error ? <p className="small status-warn">{voice.error}</p> : null}
        {handStatus ? <p className="small status-warn">{handStatus}</p> : null}
      </section>

      <section className="panel-section">
        <p className="section-title">Transcript</p>
        <div className="transcript">
          {transcript.map((message, index) => (
            <div className={`message message-${message.role}`} key={`${message.role}-${index}`}>
              <p className="small">{message.role === "agent" ? "Runtime Tutor" : "You"}</p>
              <div>{message.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <p className="section-title">Quiz</p>
        <QuizCard quiz={lesson.quiz} visible={currentStepIndex === lesson.steps.length - 1} disabled={false} onAnswer={onQuizAnswer} result={quizResult} />
      </section>

      <section className="panel-section">
        <p className="section-title">Activity Log</p>
        <div className="log">
          {state.activityLog.map((line, index) => (
            <div className="log-line small" key={`${line}-${index}`}>
              {line}
            </div>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <p className="section-title">Sources</p>
        <div className="sources">
          {lesson.sources.map((source) => (
            <div className="source" key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              <p className="small">{source.summary}</p>
            </div>
          ))}
        </div>
        <p className={lesson.cacheStatus === "compiled_live" ? "small status-good" : "small status-warn"}>Cache status: {lesson.cacheStatus}</p>
      </section>
    </aside>
  );
}
