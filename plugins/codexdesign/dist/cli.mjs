import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// shared/model.ts
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function errorCode(error) {
  return error !== null && typeof error === "object" && "code" in error ? String(error.code) : void 0;
}

// server/cli.ts
import { resolve as resolve4 } from "node:path";

// server/client.ts
import { mkdir, open, readFile as readFile2, rm, stat } from "node:fs/promises";
import { join as join3, resolve as resolve3 } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// server/config.ts
import { homedir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
var ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
var ISOLATED = ["test", "development"].includes(process.env.CODEXDESIGN_MODE || "");
if (ISOLATED && !process.env.CODEXDESIGN_HOME)
  throw new Error("Isolated mode requires CODEXDESIGN_HOME.");
var DATA = resolve(
  ISOLATED ? process.env.CODEXDESIGN_HOME : join(homedir(), ".codex-design-plugin")
);
var RUNTIME = join(DATA, "runtime");
var BILLING_LIVE = ISOLATED && process.env.CODEXDESIGN_BILLING === "live";
var PREFERRED_PORT = ISOLATED && process.env.CODEXDESIGN_PORT ? Number(process.env.CODEXDESIGN_PORT) : 61974;
if (!Number.isInteger(PREFERRED_PORT) || PREFERRED_PORT < 1024 || PREFERRED_PORT > 65535)
  throw new Error("CODEXDESIGN_PORT must be an integer between 1024 and 65535.");
var LEGACY_STATE_FILES = [
  ...new Set(
    [
      process.env.PLUGIN_DATA,
      process.env.CODEXDESIGN_DATA_DIR,
      ...!ISOLATED ? [join(homedir(), ".codex", "plugin-data", "codexdesign")] : []
    ].filter((path) => !!path).map((path) => join(resolve(path), "runtime", "daemon.json"))
  )
];
var CONFIG_FILE = resolve(process.env.CODEXDESIGN_CONFIG || join(DATA, "config.json"));
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

// server/runtime.ts
import { readFile, access } from "node:fs/promises";
import { resolve as resolve2, join as join2 } from "node:path";
async function probe(origin) {
  try {
    const response = await fetch(`${origin}/health`, {
      signal: AbortSignal.timeout(1e3),
      redirect: "error"
    });
    if (!response.ok) return null;
    const health = await response.json();
    return health.service === "codexdesign" && Number.isSafeInteger(health.pid) && health.pid > 0 && typeof health.version === "string" && typeof health.buildId === "string" ? health : null;
  } catch {
    return null;
  }
}
function frontendAssets(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+\.(?:js|css))"/g)].map((m) => m[1]);
}
async function frontendReady() {
  try {
    const web = join2(ROOT, "web");
    const html = await readFile(join2(web, "index.html"), "utf8");
    const assets = frontendAssets(html);
    if (!html.includes('id="root"') || !assets.some((p) => p.endsWith(".js")) || !assets.some((p) => p.endsWith(".css")))
      return false;
    for (const asset of assets) {
      const path = resolve2(web, `.${asset}`);
      if (!path.startsWith(web + "/") && !path.startsWith(web + "\\")) return false;
      await access(path);
    }
    return true;
  } catch {
    return false;
  }
}

// server/client.ts
async function readState(path) {
  try {
    const state = JSON.parse(await readFile2(path, "utf8"));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin) || typeof state.dataDir !== "string" || join3(resolve3(state.dataDir), "runtime", "daemon.json") !== path || typeof state.token !== "string" || !state.token || typeof state.projectsDir !== "string")
      return null;
    const health = await probe(state.origin);
    if (!health || health.pid !== state.pid) return null;
    return {
      ...state,
      version: health.version,
      buildId: health.buildId,
      installRoot: health.installRoot
    };
  } catch {
    return null;
  }
}
async function runningDaemons() {
  const states = await Promise.all(
    [.../* @__PURE__ */ new Set([STATE_FILE, ...LEGACY_STATE_FILES])].map(readState)
  );
  return [
    ...new Map(states.filter((s) => !!s).map((s) => [s.origin, s])).values()
  ];
}
async function daemonState() {
  return (await runningDaemons())[0] || null;
}
async function usable(state) {
  if (state.version !== VERSION || state.buildId !== BUILD_ID || state.installRoot !== ROOT || state.dataDir !== DATA || state.projectsDir !== PROJECTS_DIR)
    return false;
  try {
    const health = await probe(state.origin);
    if (!health?.frontendReady || health.pid !== state.pid || health.version !== VERSION || health.buildId !== BUILD_ID || health.installRoot !== ROOT || health.runtimeDir !== RUNTIME)
      return false;
    const response = await fetch(state.origin + "/", {
      signal: AbortSignal.timeout(1500),
      redirect: "error"
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return false;
    const html = await response.text();
    const assets = frontendAssets(html);
    if (!html.includes('id="root"') || !assets.some((p) => p.endsWith(".js")) || !assets.some((p) => p.endsWith(".css")))
      return false;
    for (const asset of assets) {
      const response2 = await fetch(new URL(asset, state.origin), {
        method: "HEAD",
        signal: AbortSignal.timeout(1500),
        redirect: "error"
      });
      if (!response2.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}
function newerVersion(version) {
  const current = version.split(".").map(Number);
  const desired = VERSION.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (current[i] > desired[i]) return true;
    if (current[i] < desired[i]) return false;
  }
  return false;
}
async function stopForUpgrade(state) {
  await request(state, "/api/shutdown", {});
  for (let i = 0; i < 80; i++) {
    const health = await probe(state.origin);
    if (!health || health.pid !== state.pid) return;
    await sleep(50);
  }
  throw new Error(`Codex Design at ${state.origin} did not stop. Retry after it exits.`);
}
async function ensureDaemon() {
  if (!await frontendReady())
    throw new Error(`Frontend files are missing from ${ROOT}. Reinstall Codex Design.`);
  await mkdir(RUNTIME, { recursive: true, mode: 448 });
  const lockPath = join3(RUNTIME, "start.lock");
  let lock;
  for (let i = 0; i < 600; i++) {
    try {
      lock = await open(lockPath, "wx", 384);
      await lock.writeFile(String(process.pid));
      break;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      try {
        const age = Date.now() - (await stat(lockPath)).mtimeMs;
        if (age > 3e4) {
          const pid = Number(await readFile2(lockPath, "utf8"));
          if (Number.isSafeInteger(pid) && pid > 0) {
            try {
              process.kill(pid, 0);
            } catch (error2) {
              if (errorCode(error2) === "ESRCH") await rm(lockPath, { force: true });
            }
          }
        }
      } catch {
      }
      await sleep(100);
    }
  }
  if (!lock) throw new Error(`Timed out waiting for daemon startup lock. See ${RUNTIME}.`);
  try {
    const existing = await runningDaemons();
    for (const state of existing) {
      if (state.projectsDir !== PROJECTS_DIR)
        throw new Error(
          `Codex Design at ${state.origin} serves ${state.projectsDir}, but settings now say ${PROJECTS_DIR}. Stop that installation before changing project directories.`
        );
      if (newerVersion(state.version))
        throw new Error(
          `Codex Design ${state.version} is already running. This older ${VERSION} client will not replace it. Restart Codex to load the updated plugin.`
        );
    }
    const reusable = existing.find((state) => state.dataDir === DATA);
    for (const state of existing) if (state !== reusable) await stopForUpgrade(state);
    if (reusable && await usable(reusable)) return reusable;
    if (reusable) await stopForUpgrade(reusable);
    const log = await open(join3(RUNTIME, "daemon.log"), "a", 384);
    let child;
    try {
      child = spawn(process.execPath, [join3(ROOT, "dist/daemon.mjs")], {
        cwd: ROOT,
        env: process.env,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", log.fd, log.fd]
      });
      await new Promise((resolve5, reject) => {
        child.once("spawn", resolve5);
        child.once("error", reject);
      });
      child.unref();
    } finally {
      await log.close();
    }
    for (let i = 0; i < 100; i++) {
      const state = await readState(STATE_FILE);
      if (state && await usable(state)) return state;
      if (child.exitCode !== null) break;
      await sleep(100);
    }
    child.kill();
    const detail = (await readFile2(join3(RUNTIME, "daemon.log"), "utf8")).slice(-2e3);
    throw new Error(`Daemon failed to start. See ${join3(RUNTIME, "daemon.log")}.
${detail}`);
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
      { type: "image", data: { path: resolve4(imagePath) } }
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
