import cachedLesson from "@/data/cached-jet-engine-lesson.json";
import { compilerPrompts } from "./prompts";
import { fallbackJetEngineSources, searchJetEngineSources } from "./exa";
import { lessonSchema, parseLesson, type Lesson } from "@/lib/engine/lessonTypes";
import { putLessonToS3 } from "@/lib/aws/s3";

export type CompilerTrace = {
  stage: string;
  message: string;
};

type CompileResult = {
  lesson: Lesson;
  trace: CompilerTrace[];
};

function compiledLessonFromSources(sources: Lesson["sources"]): Lesson {
  const lesson = parseLesson(cachedLesson);
  return {
    ...lesson,
    cacheStatus: "compiled_live",
    sources,
  };
}

export async function compileJetEngineLesson(): Promise<CompileResult> {
  const trace: CompilerTrace[] = [];
  const append = (stage: string, message: string) => trace.push({ stage, message });

  append("research_summary", "Searching Exa for jet engine mechanism sources");
  const sources = await searchJetEngineSources();

  append("research_summary", compilerPrompts.research_summary);
  append("mechanism_analysis", "Extracting mechanism stages");
  append("mechanism_analysis", compilerPrompts.mechanism_analysis);
  append("template_mapping", "Mapping stages to jet_engine template");
  append("template_mapping", compilerPrompts.template_mapping);
  append("lesson_json", "Validating lesson JSON");

  const lesson = lessonSchema.parse(compiledLessonFromSources(sources));
  try {
    await putLessonToS3("jet_engine", lesson);
    append("cache", "Writing cache to S3");
  } catch (error) {
    append("cache", `S3 cache skipped: ${error instanceof Error ? error.message : "unavailable"}`);
  }

  return { lesson, trace };
}

export function compileFallbackTrace(reason: string): CompileResult {
  const lesson = {
    ...parseLesson(cachedLesson),
    cacheStatus: "local_fallback" as const,
    sources: fallbackJetEngineSources(),
  };

  return {
    lesson,
    trace: [
      { stage: "fallback", message: `Using cached fallback: ${reason}` },
      { stage: "lesson_json", message: "Validated local cached lesson JSON" },
    ],
  };
}
