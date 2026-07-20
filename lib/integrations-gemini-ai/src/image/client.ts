import { ai } from "../client";
import { toFile } from "openai";

export type ImageSize =
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "1024x1792"
  | "1792x1024";

type SupportedApiSize = "1024x1024" | "1024x1536" | "1536x1024";

function fallbackSize(size: ImageSize): SupportedApiSize {
  if (size === "1024x1792") return "1024x1536";
  if (size === "1792x1024") return "1536x1024";
  return size as SupportedApiSize;
}

function isSizeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid.*size|size.*invalid|unsupported.*size|size.*not.*supported/i.test(msg);
}

export interface GenerateImageOptions {
  prompt: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  size?: ImageSize;
}

async function callEditApi(
  imageFile: Awaited<ReturnType<typeof toFile>>,
  prompt: string,
  size: string
) {
  return ai.images.edit({
    model: "gpt-image-1",
    image: imageFile,
    prompt,
    size: size as SupportedApiSize,
  });
}

async function callGenerateApi(prompt: string, size: string, n = 1) {
  return ai.images.generate({
    model: "gpt-image-1",
    prompt,
    n,
    size: size as SupportedApiSize,
  });
}

export async function generateImage(
  promptOrOptions: string | GenerateImageOptions
): Promise<{ b64_json: string; mimeType: string }> {
  const options =
    typeof promptOrOptions === "string"
      ? { prompt: promptOrOptions }
      : promptOrOptions;

  const requestedSize: ImageSize = options.size ?? "1024x1536";

  if (options.referenceImageBase64) {
    const mimeType = (options.referenceImageMimeType || "image/png") as string;
    const ext = mimeType.split("/")[1] || "png";
    const refBuf = Buffer.from(options.referenceImageBase64, "base64");
    const imageFile = await toFile(refBuf, `reference.${ext}`, { type: mimeType });

    let response;
    try {
      response = await callEditApi(imageFile, options.prompt, requestedSize);
    } catch (err) {
      if (!isSizeError(err)) throw err;
      const fb = fallbackSize(requestedSize);
      console.warn(`[generateImage] size ${requestedSize} rejected by edit API, retrying with ${fb}`);
      response = await callEditApi(imageFile, options.prompt, fb);
    }

    const b64_json = response.data?.[0]?.b64_json ?? "";
    if (!b64_json) throw new Error("No image data in response");
    return { b64_json, mimeType: "image/png" };
  }

  let response;
  try {
    response = await callGenerateApi(options.prompt, requestedSize);
  } catch (err) {
    if (!isSizeError(err)) throw err;
    const fb = fallbackSize(requestedSize);
    console.warn(`[generateImage] size ${requestedSize} rejected by generate API, retrying with ${fb}`);
    response = await callGenerateApi(options.prompt, fb);
  }

  const b64_json = response.data?.[0]?.b64_json ?? "";
  if (!b64_json) throw new Error("No image data in response");
  return { b64_json, mimeType: "image/png" };
}

export { ai };
