const http = require("http");
const path = require("path");
const vscode = require("vscode");

const BRIDGE_PORT = 38471;

function publishContext() {
  const editor = vscode.window.activeTextEditor;
  const activeFile = editor ? vscode.workspace.asRelativePath(editor.document.uri, false).split(path.sep).join("/") : undefined;
  const body = JSON.stringify({ source: "cursor", app: "Cursor", field: "code", activeFile });
  const request = http.request({ host: "127.0.0.1", port: BRIDGE_PORT, path: "/context", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Origin": "chrome-extension://verba-cursor" } });
  request.on("error", () => {}); // Verba is optional and may not be running.
  request.end(body);
}

function activate(context) {
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(publishContext));
  context.subscriptions.push(vscode.window.onDidChangeWindowState((state) => { if (state.focused) publishContext(); }));
  publishContext();
}

function deactivate() {}

module.exports = { activate, deactivate };
