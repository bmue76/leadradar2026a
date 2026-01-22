import { recognizeText } from "@infinitered/react-native-mlkit-text-recognition";
import type { RecognizeTextInput, RecognizeTextResult, OcrText, TextBlock } from "./types";

type Json = Record<string, unknown>;

function asOcrText(v: unknown): OcrText | null {
  if (!v || typeof v !== "object") return null;

  const obj = v as Json;
  const text = typeof obj.text === "string" ? obj.text : "";

  const blocksUnknown = obj.blocks;
  const blocks = Array.isArray(blocksUnknown) ? (blocksUnknown as unknown as TextBlock[]) : [];

  return { text, blocks };
}

export async function recognizeTextFromBusinessCard(input: RecognizeTextInput): Promise<RecognizeTextResult> {
  const imagePath = (input.imagePath || "").trim();
  if (!imagePath) return { rawText: "", blocks: [] };

  const res = await recognizeText(imagePath);
  const parsed = asOcrText(res);

  if (!parsed) return { rawText: "", blocks: [] };
  return { rawText: parsed.text || "", blocks: parsed.blocks || [] };
}
