import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

let codex;
let temporaryDirectory;

test.before(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "presenton-codex-models-"));
  const entryFile = path.join(temporaryDirectory, "entry.ts");
  const outputFile = path.join(temporaryDirectory, "bundle.mjs");
  await writeFile(entryFile, `
    export * from ${JSON.stringify(path.resolve("utils/codexModels.ts"))};
    export { normalizeLLMConfig, getLLMConfigValidationError } from
      ${JSON.stringify(path.resolve("utils/storeHelpers.ts"))};
  `);
  await build({
    entryPoints: [entryFile],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    tsconfig: path.resolve("tsconfig.json"),
    logLevel: "silent",
  });
  codex = await import(pathToFileURL(outputFile).href);
});

test.after(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

const expectedModels = [
  ["gpt-6.1-sol", "GPT-6.1 Sol"],
  ["gpt-6-astra", "GPT-6 Astra"],
  ["gpt-6-sol", "GPT-6 Sol"],
  ["gpt-6-luna", "GPT-6 Luna"],
  ["gpt-5.6-sol", "GPT-5.6 Sol"],
  ["gpt-5.6-terra", "GPT-5.6 Terra"],
  ["gpt-5.6-luna", "GPT-5.6 Luna"],
  ["gpt-5.5", "GPT-5.5"],
  ["gpt-5.4", "GPT-5.4"],
  ["gpt-5.4-mini", "GPT-5.4 mini"],
  ["gpt-5.3-codex-spark", "GPT-5.3 Codex Spark (Pro preview)"],
];

test("picker catalog includes GPT-6 and preserves existing models and default", () => {
  assert.deepEqual(codex.CODEX_MODELS.map(({ id, name }) => [id, name]), expectedModels);
  assert.equal(codex.DEFAULT_CODEX_MODEL, "gpt-5.6-luna");
});

for (const [model] of expectedModels) {
  test(`${model} survives saved config normalization and provider validation`, () => {
    assert.equal(codex.isSupportedCodexModel(model), true);
    for (const provider of ["codex", "chatgpt"]) {
      const savedConfig = JSON.parse(JSON.stringify({
        LLM: provider, CODEX_MODEL: model, DISABLE_IMAGE_GENERATION: true,
      }));
      assert.equal(codex.normalizeLLMConfig(savedConfig).CODEX_MODEL, model);
      assert.equal(codex.getLLMConfigValidationError(savedConfig), null);
    }
  });
}

test("missing and unsupported Codex models fail validation", () => {
  for (const model of [undefined, "", "gpt-6", "gpt-5.6", "unknown-model"]) {
    assert.equal(codex.isSupportedCodexModel(model), false);
    assert.equal(codex.getLLMConfigValidationError({
      LLM: "codex", CODEX_MODEL: model, DISABLE_IMAGE_GENERATION: true,
    }), model ? "Select a supported Codex model." : "Select a Codex model.");
  }
});

test("OpenAI API validation uses its own model setting", () => {
  assert.equal(codex.getLLMConfigValidationError({
    LLM: "openai", OPENAI_MODEL: "custom-api-model", OPENAI_API_KEY: "test-key",
    CODEX_MODEL: "unknown-model", DISABLE_IMAGE_GENERATION: true,
  }), null);
});
