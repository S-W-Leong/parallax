import Exa from "exa-js";

export type StemResearchSource = {
  title: string;
  url: string;
  summary: string;
};

export async function researchStemTopic(query: string): Promise<StemResearchSource[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];

  const exa = new Exa(apiKey);
  const result = await exa.searchAndContents(query, {
    numResults: 4,
    text: true,
    type: "auto",
  });

  return result.results
    .filter((item) => item.url && item.title)
    .map((item) => {
      const maybeText = item as typeof item & { text?: string };
      return {
        title: item.title ?? "STEM source",
        url: item.url,
        summary: (maybeText.text ?? "Reference source for this STEM topic.").slice(0, 360),
      };
    });
}
