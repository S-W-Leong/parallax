import Exa from "exa-js";
import type { LessonSource } from "@/lib/engine/lessonTypes";

const defaultSources: LessonSource[] = [
  {
    title: "NASA Glenn Research Center: Jet Engine",
    url: "https://www.grc.nasa.gov/www/k-12/airplane/turbine.html",
    summary: "NASA explains compression, combustion, turbine work extraction, and exhaust acceleration in turbine engines.",
  },
  {
    title: "FAA Pilot's Handbook: Turbine Engines",
    url: "https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak",
    summary: "FAA training material describes turbine engine compressor, combustion, turbine, and exhaust sections.",
  },
];

export async function searchJetEngineSources(): Promise<LessonSource[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error("EXA_API_KEY is not configured");
  }

  const exa = new Exa(apiKey);
  const result = await exa.searchAndContents(
    "authoritative turbofan jet engine compressor turbine shaft thrust generation",
    {
      numResults: 4,
      text: true,
      type: "auto",
    },
  );

  const sources = result.results
    .filter((item) => item.url && item.title)
    .map((item) => {
      const maybeText = item as typeof item & { text?: string };
      return {
        title: item.title ?? "Jet engine source",
        url: item.url,
        summary: (maybeText.text ?? "Authoritative source about turbine engine mechanisms.").slice(0, 260),
      };
    });

  return sources.length ? sources : defaultSources;
}

export function fallbackJetEngineSources(): LessonSource[] {
  return defaultSources;
}
