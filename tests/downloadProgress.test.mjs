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
    etaLabels: { tiny: "1s left" },
    samples: { tiny: { bytesDownloaded: 100, atMs: 1000, bytesPerSecond: 50 } },
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
  assert.deepEqual(next.etaLabels, {});
  assert.deepEqual(next.samples, {});
});

test("checked missing model does not clear an active zero-percent download", () => {
  const state = {
    progress: { tiny: 0 },
    labels: { tiny: "resolving / ~75 MB" },
    paused: { tiny: false },
    etaLabels: {},
    samples: {},
  };

  const next = applyDownloadProgress(state, {
    model: "tiny",
    percent: 0,
    checked: true,
    downloaded: false,
    downloaded_label: "not downloaded",
  });

  assert.deepEqual(next.progress, { tiny: 0 });
  assert.deepEqual(next.labels, { tiny: "resolving / ~75 MB" });
  assert.deepEqual(next.paused, { tiny: false });
  assert.deepEqual(next.etaLabels, {});
  assert.deepEqual(next.samples, {});
});

test("failed download clears an active zero-percent download", () => {
  const state = {
    progress: { tiny: 0 },
    labels: { tiny: "resolving / ~75 MB" },
    paused: { tiny: false },
    etaLabels: { tiny: "calculating" },
    samples: { tiny: { bytesDownloaded: 0, atMs: 1000, bytesPerSecond: 0 } },
  };

  const next = applyDownloadProgress(state, {
    model: "tiny",
    percent: 0,
    failed: true,
    downloaded_label: "failed",
  });

  assert.deepEqual(next.progress, {});
  assert.deepEqual(next.labels, {});
  assert.deepEqual(next.paused, {});
  assert.deepEqual(next.etaLabels, {});
  assert.deepEqual(next.samples, {});
});

test("download progress stores percent, byte label, and paused state before ETA is stable", () => {
  const first = applyDownloadProgress(
    { progress: {}, labels: {}, paused: {}, etaLabels: {}, samples: {} },
    {
      model: "tiny",
      percent: 20,
      bytes_downloaded: 20,
      bytes_total: 100,
      downloaded_label: "20 B",
      total_label: "100 B",
      paused: false,
    },
    1000,
  );
  const next = applyDownloadProgress(
    first,
    {
      model: "tiny",
      percent: 42,
      bytes_downloaded: 42,
      bytes_total: 100,
      downloaded_label: "42 B",
      total_label: "100 B",
      paused: false,
    },
    2000,
  );

  assert.deepEqual(next.progress, { tiny: 42 });
  assert.deepEqual(next.labels, { tiny: "42 B / 100 B" });
  assert.deepEqual(next.paused, { tiny: false });
  assert.deepEqual(next.etaLabels, {});
});

test("download progress formats raw GB bytes with detailed downloaded precision", () => {
  const next = applyDownloadProgress(
    { progress: {}, labels: {}, paused: {}, etaLabels: {}, samples: {} },
    {
      model: "voxtral",
      percent: 59,
      bytes_downloaded: 4.9 * 1024 ** 3,
      bytes_total: 8.3 * 1024 ** 3,
      downloaded_label: "4.9 GB",
      total_label: "8.3 GB",
    },
    1000,
  );

  assert.deepEqual(next.labels, { voxtral: "4.900 GB / 8.3 GB" });
});

test("download ETA appears after a stable sample window", () => {
  let state = { progress: {}, labels: {}, paused: {}, etaLabels: {}, samples: {} };
  for (const [bytes, atMs] of [[100, 1000], [200, 3000], [300, 5000], [400, 7000]]) {
    state = applyDownloadProgress(
      state,
      {
        model: "large",
        percent: bytes / 100,
        bytes_downloaded: bytes,
        bytes_total: 10000,
        downloaded_label: `${bytes} B`,
        total_label: "10.0 KB",
      },
      atMs,
    );
  }

  assert.deepEqual(state.etaLabels, { large: "3m 12s left" });
});

test("download ETA does not churn inside the update throttle window", () => {
  let state = { progress: {}, labels: {}, paused: {}, etaLabels: {}, samples: {} };
  for (const [bytes, atMs] of [[100, 1000], [200, 3000], [300, 5000], [400, 7000]]) {
    state = applyDownloadProgress(
      state,
      {
        model: "large",
        percent: bytes / 100,
        bytes_downloaded: bytes,
        bytes_total: 10000,
        downloaded_label: `${bytes} B`,
        total_label: "10.0 KB",
      },
      atMs,
    );
  }

  const next = applyDownloadProgress(
    state,
    {
      model: "large",
      percent: 80,
      bytes_downloaded: 8000,
      bytes_total: 10000,
      downloaded_label: "8.0 KB",
      total_label: "10.0 KB",
    },
    8000,
  );

  assert.deepEqual(next.etaLabels, { large: "3m 12s left" });
});

test("download ETA clears at completion", () => {
  const next = applyDownloadProgress(
    {
      progress: { tiny: 42 },
      labels: { tiny: "42 B / 100 B" },
      paused: { tiny: false },
      etaLabels: { tiny: "3s left" },
      samples: { tiny: { bytesDownloaded: 42, atMs: 2000, bytesPerSecond: 22 } },
    },
    {
      model: "tiny",
      percent: 100,
      bytes_downloaded: 100,
      bytes_total: 100,
      downloaded_label: "cached",
    },
    3000,
  );

  assert.deepEqual(next.etaLabels, {});
  assert.deepEqual(next.samples, {});
});
