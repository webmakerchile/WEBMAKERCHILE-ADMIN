export * from "./generated/api";
export * from "./generated/types";
// Explicit re-exports resolve the ambiguity for names present in both
// generated modules (the zod schemas in ./generated/api take precedence).
export {
  CreateGeminiConversationBody,
  CreateVideoBody,
  GenerateCoverBody,
  GenerateGeminiImageBody,
  GenerateGeminiImageResponse,
  ScheduleVideoBody,
  SendGeminiMessageBody,
  UpdateVideoBody,
} from "./generated/api";
