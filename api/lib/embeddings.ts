import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

let embedder: FeatureExtractionPipeline | null = null;
let embedderLoading: Promise<FeatureExtractionPipeline> | null = null;

// Stronger model for better semantic matching (downloads ~420MB on first run)
const MODEL_ID = "Xenova/all-mpnet-base-v2";

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

export async function embedText(text: string): Promise<number[]> {
  const pipe = await getEmbedder();
  const truncated = text.slice(0, 8000);
  const output = await pipe(truncated, { pooling: "mean", normalize: true });
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

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((text) => embedText(text)));
}
