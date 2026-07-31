import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/contextFormatting.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
const { formatForContext, resolveContextProfile } = await import(moduleUrl);

test("selects local formatting profiles from the focused app", () => {
  assert.equal(resolveContextProfile({ name: "gmail.com", kind: "site" }), "email");
  assert.equal(resolveContextProfile({ name: "Cursor", kind: "app" }), "code");
  assert.equal(resolveContextProfile({ name: "Slack", kind: "app" }), "plain");
});

test("uses local browser and editor metadata when process detection is generic", () => {
  assert.equal(
    resolveContextProfile(
      { name: "Chrome", kind: "app" },
      { source: "browser", app: "Chrome", site: "mail.google.com", field: "compose" }
    ),
    "email"
  );
  assert.equal(
    resolveContextProfile(
      { name: "Code", kind: "app" },
      { source: "cursor", app: "Cursor", field: "code", activeFile: "src/main.ts" }
    ),
    "code"
  );
});

test("formats spoken email addresses without changing ordinary prose", () => {
  assert.equal(
    formatForContext("Email wyatt dot aon at gmail dot com new paragraph regards comma Wyatt", "email"),
    "Email wyatt.aon@gmail.com\n\nregards, Wyatt"
  );
  assert.equal(formatForContext("Meet me at five", "email"), "Meet me at five");
});

test("preserves spoken code structure without an additional model", () => {
  assert.equal(
    formatForContext("const user equals get user open paren id close paren new line indent return user semicolon", "code"),
    "const user = get user(id)\n  return user;"
  );
});
