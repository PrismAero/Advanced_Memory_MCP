import { promises as fs } from "fs";
import path from "path";
import { logger } from "../logger.js";

export const USE_LITE_MODEL_ID = "universal-sentence-encoder";
export const USE_LITE_EMBEDDING_DIM = 512;
export const DEFAULT_USE_MODEL_URL =
  "https://tfhub.dev/tensorflow/tfjs-model/universal-sentence-encoder-lite/1/default/1/model.json?tfjs-format=file";
export const DEFAULT_USE_VOCAB_URL =
  "https://storage.googleapis.com/tfjs-models/savedmodel/universal_sentence_encoder/vocab.json";

export interface UseModelArtifactConfig {
  cacheDir: string;
  allowDownload: boolean;
  downloadTimeoutMs: number;
  modelUrl: string;
  vocabUrl: string;
}

export interface PreparedUseModelArtifacts {
  modelId: string;
  modelDir: string;
  modelJsonPath: string;
  vocabPath: string;
  modelUrl: string;
  vocabUrl: string;
  downloaded: boolean;
}

export function getDefaultUseModelArtifactConfig(
  cacheDir?: string,
): UseModelArtifactConfig {
  return {
    cacheDir:
      cacheDir ||
      process.env.ADVANCED_MEMORY_MODEL_CACHE_DIR ||
      process.env.MODEL_CACHE_DIR ||
      path.join(process.env.MEMORY_PATH || process.cwd(), ".memory", "models"),
    allowDownload: readBooleanEnv("ADVANCED_MEMORY_ALLOW_MODEL_DOWNLOAD", true),
    downloadTimeoutMs: readPositiveIntEnv(
      "ADVANCED_MEMORY_MODEL_DOWNLOAD_TIMEOUT_MS",
      readPositiveIntEnv("MODEL_DOWNLOAD_TIMEOUT", 30_000),
    ),
    modelUrl:
      process.env.ADVANCED_MEMORY_USE_MODEL_URL || DEFAULT_USE_MODEL_URL,
    vocabUrl:
      process.env.ADVANCED_MEMORY_USE_VOCAB_URL || DEFAULT_USE_VOCAB_URL,
  };
}

export async function prepareUseModelArtifacts(
  config: UseModelArtifactConfig,
): Promise<PreparedUseModelArtifacts> {
  const modelDir = path.resolve(config.cacheDir, USE_LITE_MODEL_ID);
  const modelJsonPath = path.join(modelDir, "model.json");
  const vocabPath = path.join(modelDir, "vocab.json");

  if (await validateUseModelArtifacts(modelDir)) {
    return toPreparedArtifacts(modelDir, false);
  }

  if (!config.allowDownload) {
    throw new Error(
      `TensorFlow model artifacts are missing or invalid at ${modelDir}. ` +
        "Set ADVANCED_MEMORY_ALLOW_MODEL_DOWNLOAD=1 or run with model download enabled to prepare the local cache.",
    );
  }

  logger.info(`[TENSORFLOW] Preparing model cache at ${modelDir}`);
  await fs.mkdir(modelDir, { recursive: true });
  await downloadUseLiteModel(config, modelDir);

  if (!(await validateUseModelArtifacts(modelDir))) {
    throw new Error(
      `Downloaded TensorFlow model artifacts failed validation at ${modelDir}`,
    );
  }

  return {
    modelId: USE_LITE_MODEL_ID,
    modelDir,
    modelJsonPath,
    vocabPath,
    modelUrl: toTfjsNodeFileUrl(modelJsonPath),
    vocabUrl: toTfjsNodeFileUrl(vocabPath),
    downloaded: true,
  };
}

export async function validateUseModelArtifacts(
  modelDir: string,
): Promise<boolean> {
  try {
    const modelJsonPath = path.join(modelDir, "model.json");
    const vocabPath = path.join(modelDir, "vocab.json");
    const modelJson = JSON.parse(await fs.readFile(modelJsonPath, "utf-8"));
    if (!Array.isArray(modelJson.weightsManifest)) return false;
    await fs.access(vocabPath);

    for (const group of modelJson.weightsManifest) {
      if (!Array.isArray(group.paths) || group.paths.length === 0) return false;
      for (const weightPath of group.paths) {
        await fs.access(
          path.join(modelDir, sanitizeArtifactFileName(weightPath)),
        );
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadUseLiteModel(
  config: UseModelArtifactConfig,
  modelDir: string,
): Promise<void> {
  const modelJson = await fetchJson(config.modelUrl, config.downloadTimeoutMs);
  if (!Array.isArray(modelJson.weightsManifest)) {
    throw new Error("Downloaded model.json does not contain weightsManifest");
  }

  for (const group of modelJson.weightsManifest) {
    if (!Array.isArray(group.paths)) {
      throw new Error(
        "Downloaded model.json has invalid weightsManifest paths",
      );
    }

    const rewrittenPaths: string[] = [];
    for (const weightPath of group.paths) {
      const sourceUrl = resolveArtifactUrl(config.modelUrl, weightPath);
      const fileName = sanitizeArtifactFileName(weightPath);
      const targetPath = path.join(modelDir, fileName);
      await fetchBinaryToFile(sourceUrl, targetPath, config.downloadTimeoutMs);
      rewrittenPaths.push(fileName);
    }
    group.paths = rewrittenPaths;
  }

  await fs.writeFile(
    path.join(modelDir, "model.json"),
    JSON.stringify(modelJson, null, 2),
  );
  await fetchBinaryToFile(
    config.vocabUrl,
    path.join(modelDir, "vocab.json"),
    config.downloadTimeoutMs,
  );
  await fs.writeFile(
    path.join(modelDir, "advanced-memory-model.json"),
    JSON.stringify(
      {
        modelId: USE_LITE_MODEL_ID,
        embeddingDim: USE_LITE_EMBEDDING_DIM,
        sourceModelUrl: config.modelUrl,
        sourceVocabUrl: config.vocabUrl,
        downloadedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function toPreparedArtifacts(
  modelDir: string,
  downloaded: boolean,
): PreparedUseModelArtifacts {
  const absoluteModelDir = path.resolve(modelDir);
  const modelJsonPath = path.join(absoluteModelDir, "model.json");
  const vocabPath = path.join(absoluteModelDir, "vocab.json");
  return {
    modelId: USE_LITE_MODEL_ID,
    modelDir: absoluteModelDir,
    modelJsonPath,
    vocabPath,
    modelUrl: toTfjsNodeFileUrl(modelJsonPath),
    vocabUrl: toTfjsNodeFileUrl(vocabPath),
    downloaded,
  };
}

export function toTfjsNodeFileUrl(filePath: string): string {
  const absolutePath = path.resolve(filePath).replace(/\\/g, "/");
  return `file://${absolutePath}`;
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchBinaryToFile(
  url: string,
  filePath: string,
  timeoutMs: number,
): Promise<void> {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw new Error(
      `Failed to download TensorFlow artifact ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function resolveArtifactUrl(
  modelJsonUrl: string,
  artifactPath: string,
): string {
  if (/^https?:\/\//i.test(artifactPath)) return artifactPath;
  const base = new URL(modelJsonUrl);
  const query = base.search;
  base.pathname = base.pathname.replace(/\/[^/]*$/, `/${artifactPath}`);
  if (!new URL(base.toString()).search && query) base.search = query;
  return base.toString();
}

export function sanitizeArtifactFileName(artifactPath: string): string {
  const withoutQuery = artifactPath.split("?")[0];
  return path.basename(withoutQuery);
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}
