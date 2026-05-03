type TextPart = { text: string };
type InlineDataPart = { inlineData: { data: string; mimeType: string } };
type GeminiPart = TextPart | InlineDataPart;

export function isTextPart(p: GeminiPart): p is TextPart {
  return typeof (p as TextPart).text === "string";
}

export function isInlineDataPart(p: GeminiPart): p is InlineDataPart {
  return (p as InlineDataPart).inlineData !== undefined;
}

export function firstText(parts: readonly GeminiPart[] | undefined | null): string {
  if (!parts) return "";
  for (const p of parts) {
    if (isTextPart(p)) return p.text;
  }
  return "";
}

export function firstInlineData(
  parts: readonly GeminiPart[] | undefined | null
): InlineDataPart["inlineData"] | undefined {
  if (!parts) return undefined;
  for (const p of parts) {
    if (isInlineDataPart(p)) return p.inlineData;
  }
  return undefined;
}
