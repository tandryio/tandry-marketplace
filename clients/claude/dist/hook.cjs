"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../packages/bridge/src/local.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
function home() {
  return process.env.TANDRY_HOME ?? import_node_path.default.join(import_node_os.default.homedir(), ".tandry");
}
var safe = (id) => encodeURIComponent(id);
var markerPath = (host, hostConversationId) => import_node_path.default.join(home(), "joined", safe(host), safe(hostConversationId));
var runPath = (hostConversationId) => import_node_path.default.join(home(), "run", safe(hostConversationId));
var byPidPath = (pid) => import_node_path.default.join(home(), "run", "by-pid", String(pid));
function readJson(file) {
  try {
    return JSON.parse(import_node_fs.default.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function writeJson(file, value, mode = 384) {
  import_node_fs.default.mkdirSync(import_node_path.default.dirname(file), { recursive: true, mode: 448 });
  const temporary = `${file}.${process.pid}.tmp`;
  import_node_fs.default.writeFileSync(temporary, JSON.stringify(value), { mode });
  import_node_fs.default.renameSync(temporary, file);
}
function remove(file) {
  import_node_fs.default.rmSync(file, { force: true });
}
var readMarker = (host, id) => readJson(markerPath(host, id));
var readRun = (id) => readJson(runPath(id));

// src/files.ts
var SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
var sessionIdFrom = (value) => typeof value === "string" && SESSION_ID.test(value) ? value : null;
var claudePidOf = (fallback) => Number(process.env.TANDRY_CLAUDE_PID) || fallback;
var readSession = (claudePid) => readJson(byPidPath(claudePid));
var writeSession = (claudePid, session) => writeJson(byPidPath(claudePid), session);
function removeSession(claudePid, sessionId) {
  if (readSession(claudePid)?.sessionId === sessionId) remove(byPidPath(claudePid));
}
var hostPath = (sessionId) => `${runPath(sessionId)}.host`;
var readHost = (sessionId) => readJson(hostPath(sessionId)) ?? { busy: false, injected: null };
var writeHost = (sessionId, state) => writeJson(hostPath(sessionId), state);

// src/hook.ts
var EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"];
function hookOutput(event, notice) {
  if (!notice) return {};
  return event === "Stop" ? { decision: "block", reason: notice } : { hookSpecificOutput: { hookEventName: event, additionalContext: notice } };
}
function handle(event, input, claudePid) {
  const sessionId = sessionIdFrom(input.session_id);
  if (!sessionId) return {};
  const joined = () => !!readMarker("claude", sessionId);
  if (event === "SessionStart") {
    writeSession(claudePid, { sessionId, cwd: typeof input.cwd === "string" ? input.cwd : process.cwd(), at: Date.now() });
    if (input.source !== "compact" && joined()) writeHost(sessionId, { ...readHost(sessionId), busy: false });
    return {};
  }
  if (event === "SessionEnd") {
    removeSession(claudePid, sessionId);
    if (joined()) writeHost(sessionId, { ...readHost(sessionId), busy: false });
    return {};
  }
  if (input.agent_id) return {};
  if (!joined()) return {};
  const host = readHost(sessionId);
  const run = readRun(sessionId);
  const notice = run?.notice && run.key && run.key !== host.injected ? run.notice : null;
  const busy = event !== "Stop" || !!notice;
  if (busy !== host.busy || notice) writeHost(sessionId, { busy, injected: notice ? run.key : host.injected });
  return hookOutput(event, notice);
}
function main() {
  const event = process.argv[2] ?? "";
  if (!EVENTS.includes(event)) {
    console.error("usage: hook <event>");
    process.exit(2);
  }
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      process.stdout.write(JSON.stringify(handle(event, JSON.parse(raw), claudePidOf(process.ppid))));
    } catch {
    }
  });
}
main();
