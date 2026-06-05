import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/downloadProgress.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
const { applyDownloadProgress } = await import(moduleUrl);

test("checked missing model clears stale cached progress", () => {
  const state = {
    progress: { tiny: 100 },
    labels: { tiny: "cached" },
    paused: { tiny: true },
  };

  const next = applyDownloadProgress(state, {
    model: "tiny",
    percent: 0,
    checked: true,
    downloaded: false,
    downloaded_label: "not downloaded",
  });

  assert.deepEqual(next.progress, {});
  assert.deepEqual(next.labels, {});
  assert.deepEqual(next.paused, {});
});

test("download progress stores percent, label, and paused state", () => {
  const next = applyDownloadProgress(
    { progress: {}, labels: {}, paused: {} },
    {
      model: "tiny",
      percent: 42,
      bytes_downloaded: 42,
      bytes_total: 100,
      downloaded_label: "42 B",
      total_label: "100 B",
      paused: false,
    },
  );

  assert.deepEqual(next.progress, { tiny: 42 });
  assert.deepEqual(next.labels, { tiny: "42 B / 100 B" });
  assert.deepEqual(next.paused, { tiny: false });
});

