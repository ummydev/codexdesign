import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// shared/model.ts
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function errorCode(error) {
  return error !== null && typeof error === "object" && "code" in error ? String(error.code) : void 0;
}

// server/cli.ts
import { resolve as resolve2 } from "node:path";

// server/client.ts
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { join as join2 } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// server/config.ts
import { homedir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
var ROOT = fileURLToPath(new URL("../", import.meta.url));
var DATA = resolve(
  process.env.PLUGIN_DATA || process.env.CODEXDESIGN_DATA_DIR || join(homedir(), ".codex", "plugin-data", "codexdesign")
);
var RUNTIME = join(DATA, "runtime");
var CONFIG_FILE = resolve(
  process.env.CODEXDESIGN_CONFIG || join(homedir(), ".codex-design-plugin", "config.json")
);
function loadConfig() {
  const defaults = { defaultProjectDataDir: join(dirname(CONFIG_FILE), "projects") };
  let stored = {};
  try {
    stored = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(`Cannot read Codex Design settings at ${CONFIG_FILE}: ${error}`);
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    try {
      writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2) + "\n", { flag: "wx" });
      return defaults;
    } catch (error2) {
      if (error2.code !== "EEXIST") throw error2;
      return loadConfig();
    }
  }
  return { ...defaults, ...stored };
}
var config = loadConfig();
var PROJECTS_DIR = resolve(
  config.defaultProjectDataDir.replace(/^~(?=$|[\\/])/, homedir())
);
var STATE_FILE = join(RUNTIME, "daemon.json");
var VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
var BUILD_ID = (() => {
  try {
    return readFileSync(join(ROOT, "dist/build-id"), "utf8").trim();
  } catch {
    return "source";
  }
})();
var MAX_IMAGE_BYTES = 40 * 1024 * 1024;
var MAX_HTML_BYTES = 5 * 1024 * 1024;

// server/client.ts
async function daemonState() {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin) || state.dataDir !== DATA) return null;
    const response = await fetch(`${state.origin}/health`, { signal: AbortSignal.timeout(1e3) });
    const health = await response.json();
    return health.service === "codexdesign" && health.pid === state.pid ? state : null;
  } catch {
    return null;
  }
}
async function ensureDaemon() {
  const current = await daemonState();
  if (current) {
    if (current.buildId !== BUILD_ID)
      throw new Error(
        "A different Codex Design build is running. Run npm run stop in the updated plugin, then retry."
      );
    if (current.projectsDir !== PROJECTS_DIR)
      throw new Error(
        `The running Codex Design serves projects from ${current.projectsDir}, but the settings now say ${PROJECTS_DIR}. Run npm run stop, then retry.`
      );
    return current;
  }
  await mkdir(RUNTIME, { recursive: true, mode: 448 });
  const lockPath = join2(RUNTIME, "start.lock");
  let lock;
  for (let i = 0; i < 200; i++) {
    try {
      lock = await open(lockPath, "wx", 384);
      await lock.writeFile(String(process.pid));
      break;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const state = await daemonState();
      if (state) {
        if (state.buildId !== BUILD_ID)
          throw new Error("Another Codex Design build is running. Stop it before retrying.");
        return state;
      }
      try {
        const age = Date.now() - (await stat(lockPath)).mtimeMs;
        if (age > 3e4) {
          const pid = Number(await readFile(lockPath, "utf8"));
          let alive = true;
          try {
            process.kill(pid, 0);
          } catch (e) {
            if (errorCode(e) === "ESRCH") alive = false;
          }
          if (!alive) await rm(lockPath, { force: true });
        }
      } catch {
      }
      await sleep(100);
    }
  }
  if (!lock) throw new Error("Timed out waiting for daemon startup lock. See runtime/daemon.log.");
  try {
    const existing = await daemonState();
    if (existing) return existing;
    const log = await open(join2(RUNTIME, "daemon.log"), "a", 384);
    let child;
    try {
      child = spawn(process.execPath, [join2(ROOT, "dist/daemon.mjs")], {
        cwd: ROOT,
        env: { ...process.env, PLUGIN_DATA: DATA },
        detached: true,
        windowsHide: true,
        stdio: ["ignore", log.fd, log.fd]
      });
      await new Promise((resolve3, reject) => {
        child.once("spawn", resolve3);
        child.once("error", reject);
      });
      child.unref();
    } finally {
      await log.close();
    }
    for (let i = 0; i < 100; i++) {
      const state = await daemonState();
      if (state) return state;
      if (child.exitCode !== null) break;
      await sleep(100);
    }
    child.kill();
    throw new Error(`Daemon failed to start. Read ${join2(RUNTIME, "daemon.log")}`);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
async function request(state, path, body, method = body === void 0 ? "GET" : "POST") {
  const response = await fetch(`${state.origin}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${state.token}`,
      ...body === void 0 ? {} : { "Content-Type": "application/json" }
    },
    body: body === void 0 ? void 0 : JSON.stringify(body),
    signal: AbortSignal.timeout(3e4)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

// server/cli.ts
var [command = "start", ...args] = process.argv.slice(2);
var print = (value) => console.log(JSON.stringify(value, null, 2));
try {
  if (command === "stop") {
    const state = await daemonState();
    console.log(state ? await request(state, "/api/shutdown", {}) : { running: false });
  } else if (command === "status") {
    const state = await daemonState();
    print(
      state ? { running: true, origin: state.origin, pid: state.pid, projectsDir: state.projectsDir } : { running: false, projectsDir: PROJECTS_DIR, config: CONFIG_FILE }
    );
  } else if (command === "start") {
    const state = await ensureDaemon();
    const [projectId] = args;
    print(
      projectId ? await request(state, `/api/projects/${encodeURIComponent(projectId)}`) : { origin: state.origin, projectsDir: state.projectsDir, config: CONFIG_FILE }
    );
  } else if (command === "create") {
    const name = args.join(" ");
    if (!name) throw new Error("Usage: node dist/cli.mjs create <name>");
    print(await request(await ensureDaemon(), "/api/projects", { name }));
  } else if (command === "import") {
    const [imagePath, projectId] = args;
    if (!imagePath || !projectId)
      throw new Error("Usage: node dist/cli.mjs import <imagePath> <projectId>");
    const added = await request(
      await ensureDaemon(),
      `/api/projects/${encodeURIComponent(projectId)}/nodes`,
      { type: "image", data: { path: resolve2(imagePath) } }
    );
    print({ canvasUrl: added.canvasUrl, node: added.node });
  } else
    throw new Error(
      "Commands: start [projectId], create <name>, import <imagePath> <projectId>, status, stop"
    );
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
