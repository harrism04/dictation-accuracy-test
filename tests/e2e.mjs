// Browser smoke test + README screenshot, using headless Chrome over the DevTools protocol.
// No dependencies. Run with:  node tests/e2e.mjs [--screenshot]
// Set CHROME=/path/to/chrome if Chrome isn't in the default macOS/Linux location.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CANDIDATES = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
const chrome = CANDIDATES.find(p => existsSync(p));
if (!chrome) { console.log("SKIP: Chrome not found (set CHROME=...)"); process.exit(0); }

const root = resolve(import.meta.dirname, "..");
const page = pathToFileURL(join(root, "index.html")).href;
const profile = mkdtempSync(join(tmpdir(), "dat-e2e-"));
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--hide-scrollbars", "--window-size=1100,1400", "about:blank"], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch { await sleep(100); }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
  });
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  await send("Page.navigate", { url: page + "#harvard-1" });
  await sleep(800);

  // Simulate takes from three "models", the way a dictation app pastes text.
  // The stuttered take is checked on its own; the last take (with real errors) is left on screen for the screenshot.
  const takes = [
    ["Cohere Transcribe", "The b-birch canoe slid on the the smooth planks. Glue the sheet to the dark blue background. It's easy to tell the depth of a well. These days a chicken leg is a rare dish. Um, rice is often served in round bowls. The juice of lemons makes fine punch. The box was thrown beside the parked truck. The hogs were fed chopped corn and garbage. Four hours of steady work faced us. A large size in stockings is hard to sell."],
    ["Parakeet TDT 0.6B","The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background. It's easy to tell the depth of a well. These days a chicken leg is a rare dish. Rice is often served in round bowls. The juice of lemons makes fine punch. The box was thrown beside the parked truck. The hogs were fed chopped corn and garbage. 4 hours of steady work faced us. A large size in stockings is hard to sell."],
    ["Whisper Turbo", "The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background. It's easy to tell the depth of a whale. These days a chicken leg is a rare dish. Rice is often served in round bowls. The juice of lemon makes fine punch. The box was thrown beside the park truck. The hogs were fed chopped corn and garbage. Four hours of steady work faced us. A large size in stockings is hard to sell, thank you."],
  ];
  const scores = [];
  for (const [model, text] of takes) {
    await evaluate(`(() => {
      const m = document.getElementById("model"); m.value = ${JSON.stringify(model)}; m.dispatchEvent(new Event("input"));
      document.getElementById("start").click();
      const t = document.getElementById("typed"); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event("input"));
      document.getElementById("score").click();
    })()`);
    await sleep(150);
    scores.push(await evaluate(`({ model: ${JSON.stringify(model)}, acc: document.getElementById("r-acc").textContent, strict: document.getElementById("r-strict").textContent })`));
  }

  const out = await evaluate(`({
    rows: document.querySelectorAll("#board tr").length,
    resultVisible: !document.getElementById("result").hidden,
    trouble: document.querySelectorAll("#trouble .chip").length,
    wpm: document.getElementById("r-wpm").textContent
  })`);
  console.log(scores, out);

  const fail = [];
  const [stutter, perfect, whisper] = scores;
  if (!out.resultVisible) fail.push("result card not shown");
  if (stutter.acc !== "100.0%") fail.push(`forgiving accuracy for stuttered take should be 100.0%, got ${stutter.acc}`);
  if (stutter.strict === "100.0%") fail.push("strict accuracy should penalise the stutter");
  if (perfect.acc !== "100.0%") fail.push(`"4" should match "four", got ${perfect.acc}`);
  if (whisper.acc === "100.0%") fail.push("take with real errors should not score 100%");
  if (out.wpm !== "–") fail.push(`instant paste should not report a WPM, got ${out.wpm}`);
  if (out.rows !== 3) fail.push(`leaderboard should have 3 models, got ${out.rows}`);
  if (out.trouble < 1) fail.push("trouble words should be populated");
  if (errors.length) fail.push("console errors: " + errors.join(" | "));

  if (process.argv.includes("--screenshot")) {
    await evaluate(`window.scrollTo(0, 0)`);
    await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 2000, deviceScaleFactor: 2, mobile: false });
    await sleep(300);
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1100, height: 2000, scale: 1 } });
    writeFileSync(join(root, "docs", "screenshot.png"), Buffer.from(shot.result.data, "base64"));
    console.log("wrote docs/screenshot.png");
  }

  if (fail.length) { console.error("FAIL:\n - " + fail.join("\n - ")); process.exitCode = 1; }
  else console.log("PASS: e2e smoke test");
} finally {
  ws?.close(); proc.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
