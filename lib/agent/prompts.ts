export const compilerPrompts = {
  research_summary:
    "Summarize authoritative jet engine source results into concise facts about intake, compression, combustion, turbine work extraction, shaft coupling, and exhaust thrust.",
  mechanism_analysis:
    "Extract the mechanism as cause/effect links: airflow direction, component roles, energy transfer, and the turbine-shaft-compressor feedback loop.",
  template_mapping:
    "Map each mechanism stage to the known jet_engine component IDs, camera presets, and allowed animation IDs.",
  lesson_json:
    "Emit lesson JSON only. It must satisfy the Parallax lesson schema and use only allowed component, camera, and animation IDs.",
};

export const askSystemPrompt =
  "You are the Runtime Tutor for a procedural jet engine cutaway. Answer briefly, grounded in the selected component and current lesson step.";

export const reteachPrompt =
  "Diagnose the misconception and return a renderer command that isolates compressor, shaft, and turbine for the re-teach replay.";
