import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/modelStatus.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
const { modelDownloadStatus } = await import(moduleUrl);

test("downloaded model gets the downloaded status", () => {
  const status = modelDownloadStatus({
    active: false,
    downloaded: true,
    downloading: false,
    paused: false,
    downloadSupported: true,
  });

  assert.equal(status.label, "Downloaded");
  assert.equal(status.icon, "✓");
});

test("active downloaded model keeps active emphasis", () => {
  const status = modelDownloadStatus({
    active: true,
    downloaded: true,
    downloading: false,
    paused: false,
    downloadSupported: true,
  });

  assert.equal(status.label, "Active · downloaded");
  assert.equal(status.icon, "●");
});

test("supported but uncached model is not marked ready", () => {
  const status = modelDownloadStatus({
    active: false,
    downloaded: false,
    downloading: false,
    paused: false,
    downloadSupported: true,
  });

  assert.equal(status.label, "Not downloaded");
  assert.equal(status.icon, "○");
});

test("paused download is shown distinctly", () => {
  const status = modelDownloadStatus({
    active: false,
    downloaded: false,
    downloading: true,
    paused: true,
    downloadSupported: true,
  });

  assert.equal(status.label, "Paused");
  assert.equal(status.icon, "Ⅱ");
});

