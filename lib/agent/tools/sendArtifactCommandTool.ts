import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { artifactCommandSchema, type ArtifactCommand } from "@/lib/artifacts/artifactTypes";

const sendArtifactCommandInputSchema = z.object({
  type: z.enum(["focus_component", "go_to_step", "start_walkthrough", "pause_walkthrough", "reset_camera", "explode", "collapse", "toggle_labels"]),
  componentId: z.string().nullable(),
  stepId: z.string().nullable(),
});

export type SendArtifactCommandSink = {
  tool: Tool;
  getCommands: () => ArtifactCommand[];
};

export function makeSendArtifactCommandSink(): SendArtifactCommandSink {
  const commands: ArtifactCommand[] = [];

  const sendArtifactCommandTool = tool({
    name: "send_artifact_command",
    description:
      "Send a command to the active 3D artifact, such as focusing a component, moving to a step, exploding the view, resetting camera, or toggling labels.",
    parameters: sendArtifactCommandInputSchema,
    async execute(input) {
      const parsed = artifactCommandSchema.safeParse({
        type: input.type,
        componentId: input.componentId ?? undefined,
        stepId: input.stepId ?? undefined,
      });
      if (!parsed.success) {
        const error = parsed.error.issues.map((issue) => issue.message).join("; ");
        return { ok: false, error };
      }

      commands.push(parsed.data);
      return { ok: true, command: parsed.data };
    },
  });

  return {
    tool: sendArtifactCommandTool,
    getCommands: () => [...commands],
  };
}
