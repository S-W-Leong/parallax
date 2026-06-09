"use client";

import type { Lesson } from "@/lib/engine/lessonTypes";

type QuizCardProps = {
  quiz: Lesson["quiz"];
  visible: boolean;
  disabled?: boolean;
  onAnswer: (answerIndex: number) => void;
  result: string | null;
};

export function QuizCard({ quiz, visible, disabled, onAnswer, result }: QuizCardProps) {
  if (!visible) {
    return <p className="small">Quiz unlocks after the final lesson step.</p>;
  }

  return (
    <div className="quiz-card">
      <strong>{quiz.question}</strong>
      <div className="answers">
        {quiz.answers.map((answer, index) => (
          <button className="answer-button" key={answer} disabled={disabled} onClick={() => onAnswer(index)}>
            {answer}
          </button>
        ))}
      </div>
      {result ? <p className="small status-warn">{result}</p> : null}
    </div>
  );
}
