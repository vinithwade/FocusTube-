import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

let embedder: FeatureExtractionPipeline | null = null;
let embedderLoading: Promise<FeatureExtractionPipeline> | null = null;

// BGE-small: best quality/size ratio for search retrieval (~130MB quantized).
const MODEL_ID =
  process.env.EMBEDDING_MODEL ||
  (process.env.NODE_ENV === "production"
    ? "Xenova/bge-small-en-v1.5"
    : "Xenova/bge-small-en-v1.5");

const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

function isBgeModel(): boolean {
  return MODEL_ID.toLowerCase().includes("bge");
}

function prepareText(text: string, role: "query" | "document"): string {
  const trimmed = text.slice(0, 8000);
  if (isBgeModel() && role === "query") {
    return `${BGE_QUERY_PREFIX}${trimmed}`;
  }
  return trimmed;
}

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder;

  if (!embedderLoading) {
    embedderLoading = pipeline("feature-extraction", MODEL_ID).then((pipe) => {
      embedder = pipe as FeatureExtractionPipeline;
      return embedder;
    });
  }

  return embedderLoading;
}

export async function embedText(text: string, role: "query" | "document" = "document"): Promise<number[]> {
  const pipe = await getEmbedder();
  const output = await pipe(prepareText(text, role), { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export async function embedBatch(
  texts: string[],
  role: "query" | "document" = "document"
): Promise<number[][]> {
  const pipe = await getEmbedder();
  const prepared = texts.map((text) => prepareText(text, role));
  const outputs = await Promise.all(
    prepared.map((text) => pipe(text, { pooling: "mean", normalize: true }))
  );
  return outputs.map((output) => Array.from(output.data as Float32Array));
}
