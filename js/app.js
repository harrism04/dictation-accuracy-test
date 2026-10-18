(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const AUTO_SCORE_DELAY_MS = 1500;
  const MIN_TIMED_SECS = 2;  // shorter "takes" mean text was pasted/typed, not spoken; don't report a WPM
  const KEYS = { history: "dat.history.v1", custom: "dat.custom.v1", settings: "dat.settings.v1" };

  // ---------- storage (never throws; the page works without it) ----------
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ } }
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => (x * 100).toFixed(1) + "%";
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- state ----------
  let settings = Object.assign({ model: "", auto: true, numbers: true, ignoreCase: true, ignorePunct: true, theme: "auto", passageId: null }, store.get(KEYS.settings, {}));
  let history = store.get(KEYS.history, []);
  let custom = store.get(KEYS.custom, []);
  let passage = null;
  let lastResult = null;
  let diffMode = "forgiving";
  const take = { id: null, state: "idle", tStart: 0, tFirst: 0, timer: null, autoTimer: null };

  const allPassages = () => [...window.PASSAGES, ...custom.map(c => Object.assign({ category: "Your passages" }, c))];
  const saveSettings = () => store.set(KEYS.settings, settings);

  // ---------- theme ----------
  function applyTheme() {
    if (settings.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", settings.theme);
    $("theme").textContent = { auto: "◐", light: "☀︎", dark: "☾" }[settings.theme];
    $("theme").title = "Theme: " + settings.theme;
  }
  $("theme").onclick = () => {
    settings.theme = { auto: "light", light: "dark", dark: "auto" }[settings.theme];
    saveSettings(); applyTheme();
  };

  // ---------- passages ----------
  function renderPicker() {
    const sel = $("pick");
    sel.innerHTML = "";
    const groups = {};
    allPassages().forEach(p => { (groups[p.category] = groups[p.category] || []).push(p); });
    for (const [cat, items] of Object.entries(groups)) {
      const g = document.createElement("optgroup");
      g.label = cat;
      items.forEach(p => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.name; g.appendChild(o); });
      sel.appendChild(g);
    }
    if (passage) sel.value = passage.id;
  }

  function setPassage(id, { keepText = false } = {}) {
    const list = allPassages();
    passage = list.find(p => p.id === id) || list[0];
    settings.passageId = passage.id; saveSettings();
    $("pick").value = passage.id;
    $("passage").textContent = passage.text;
    const words = Scoring.tokenize(passage.text, opts()).length;
    $("passage-info").textContent = `${words} words · ${passage.category}`;
    $("custom-del").hidden = !passage.id.startsWith("custom-");
    try { window.history.replaceState(null, "", "#" + encodeURIComponent(passage.id)); } catch { /* some browsers block this on file:// */ }
    if (!keepText) resetTake();
    renderBoard();
  }

  function step(delta) {
    const list = allPassages();
    const i = list.findIndex(p => p.id === passage.id);
    setPassage(list[(i + delta + list.length) % list.length].id);
  }
  $("pick").onchange = () => setPassage($("pick").value);
  $("prev").onclick = () => step(-1);
  $("next").onclick = () => step(1);
  $("random").onclick = () => {
    const list = allPassages().filter(p => p.id !== passage.id);
    setPassage(list[Math.floor(Math.random() * list.length)].id);
  };

  $("custom-add").onclick = () => {
    const text = $("custom-text").value.trim();
    if (!text) { $("custom-text").focus(); return; }
    const p = { id: "custom-" + uid(), name: $("custom-name").value.trim() || "Custom passage", text };
    custom.push(p); store.set(KEYS.custom, custom);
    $("custom-name").value = ""; $("custom-text").value = "";
    renderPicker(); setPassage(p.id);
  };
  $("custom-del").onclick = () => {
    if (!confirm(`Delete "${passage.name}"? Your scores for it stay in history.`)) return;
    custom = custom.filter(c => c.id !== passage.id); store.set(KEYS.custom, custom);
    renderPicker(); setPassage(window.PASSAGES[0].id);
  };

  // ---------- options ----------
  const opts = () => ({ normalizeNumbers: settings.numbers, ignoreCase: settings.ignoreCase, ignorePunct: settings.ignorePunct });
  [["auto", "auto"], ["opt-numbers", "numbers"], ["opt-case", "ignoreCase"], ["opt-punct", "ignorePunct"]].forEach(([id, key]) => {
    $(id).checked = settings[key];
    $(id).onchange = () => { settings[key] = $(id).checked; saveSettings(); if (key !== "auto" && lastResult) score(); };
  });
  $("model").value = settings.model;
  $("model").oninput = () => { settings.model = $("model").value; saveSettings(); };

  // ---------- take lifecycle ----------
  function setStatus(state, html) {
    take.state = state;
    $("status").dataset.state = state;
    $("status-text").innerHTML = html;
  }
  function tick() { $("timer").textContent = ((performance.now() - take.tStart) / 1000).toFixed(1) + "s"; }
  function stopTimer() { clearInterval(take.timer); take.timer = null; }

  function resetTake() {
    stopTimer(); clearTimeout(take.autoTimer);
    take.id = null; take.tStart = 0; take.tFirst = 0;
    $("typed").value = "";
    $("timer").textContent = "0.0s";
    $("result").hidden = true;
    lastResult = null;
    setStatus("idle", "Press <b>Start take</b>, then hold your dictation hotkey and read.");
  }

  function startTake() {
    resetTake();
    take.id = uid();
    take.tStart = performance.now();
    take.timer = setInterval(tick, 100);
    setStatus("listening", "Recording… hold your dictation hotkey and read the passage.");
    $("typed").focus();
  }
  $("start").onclick = startTake;
  $("reset").onclick = () => { resetTake(); $("typed").focus(); };

  $("typed").addEventListener("input", () => {
    const has = $("typed").value.trim().length > 0;
    if (!take.id && has) take.id = uid();                // dictated without pressing Start: score, but no timing
    if (take.state === "listening" && has && !take.tFirst) {
      take.tFirst = performance.now();
      stopTimer(); tick();
      $("timer").textContent = ((take.tFirst - take.tStart) / 1000).toFixed(1) + "s";
    }
    if (has && take.state !== "done") setStatus("arrived", settings.auto ? "Text received. Scoring in a moment…" : "Text received. Press <b>Score</b> when it's finished.");
    clearTimeout(take.autoTimer);
    if (settings.auto && has && take.state !== "done") take.autoTimer = setTimeout(score, AUTO_SCORE_DELAY_MS);
  });

  // ---------- scoring ----------
  function grade(acc) {
    if (acc >= 0.98) return "🏆 Excellent. Basically no edits needed.";
    if (acc >= 0.95) return "✅ Great. A word or two to fix.";
    if (acc >= 0.90) return "👍 Good. A few corrections per paragraph.";
    if (acc >= 0.80) return "⚠️ Usable, but you'll be editing a lot.";
    return "❌ Rough. Try another model, a closer mic, or a quieter room.";
  }

  function score() {
    clearTimeout(take.autoTimer);
    const text = $("typed").value;
    if (!text.trim()) { $("typed").focus(); return; }
    if (!take.id) take.id = uid();
    stopTimer();

    const r = Scoring.score(passage.text, text, opts());
    lastResult = r;
    const secs = take.tFirst ? (take.tFirst - take.tStart) / 1000 : null;
    const wpm = secs >= MIN_TIMED_SECS ? Math.round(r.refWords / (secs / 60)) : null;

    $("r-acc").textContent = pct(r.forgiving.accuracy);
    $("r-strict").textContent = pct(r.strict.accuracy);
    $("r-sub").textContent = r.forgiving.S;
    $("r-del").textContent = r.forgiving.D;
    $("r-ins").textContent = r.forgiving.I;
    $("r-wpm").textContent = wpm ?? "–";
    $("r-grade").textContent = grade(r.forgiving.accuracy) +
      (r.strict.accuracy < r.forgiving.accuracy - 0.02 ? " Some errors were stutters/fillers. See the Strict tab." : "");
    renderDiff();
    $("result").hidden = false;

    const missed = r.forgiving.ops.filter(o => o.type === "sub" || o.type === "del").map(o => o.ref);
    const entry = {
      id: take.id, ts: Date.now(), model: settings.model.trim() || "(unlabeled)",
      passageId: passage.id, passageName: passage.name,
      accuracy: +r.forgiving.accuracy.toFixed(4), strict: +r.strict.accuracy.toFixed(4),
      S: r.forgiving.S, D: r.forgiving.D, I: r.forgiving.I, words: r.refWords,
      secs: secs ? +secs.toFixed(1) : null, wpm, missed, transcript: text
    };
    const i = history.findIndex(h => h.id === take.id);  // re-scoring the same take updates it
    if (i >= 0) history[i] = entry; else history.push(entry);
    store.set(KEYS.history, history);
    renderBoard(); renderTrouble(); renderHistory();

    setStatus("done", `Scored. Press <b>Start take</b> for another go, or <b>Next →</b> for a new passage.`);
    $("result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }
  $("score").onclick = score;

  function renderDiff() {
    if (!lastResult) return;
    const ops = lastResult[diffMode].ops;
    $("diff").innerHTML = ops.map(o => {
      if (o.type === "ok") return `<span class="w ok">${esc(o.hyp)}</span>`;
      if (o.type === "sub") return `<span class="w sub" title="Should be: ${esc(o.ref)}">${esc(o.hyp)}</span><span class="w was">(${esc(o.ref)})</span>`;
      if (o.type === "del") return `<span class="w del" title="Missed">${esc(o.ref)}</span>`;
      return `<span class="w ins" title="Extra word">${esc(o.hyp)}</span>`;
    }).join(" ");
    $("tab-forgiving").setAttribute("aria-selected", diffMode === "forgiving");
    $("tab-strict").setAttribute("aria-selected", diffMode === "strict");
  }
  $("tab-forgiving").onclick = () => { diffMode = "forgiving"; renderDiff(); };
  $("tab-strict").onclick = () => { diffMode = "strict"; renderDiff(); };

  // ---------- leaderboard / trouble words / history ----------
  const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

  function renderBoard() {
    const f = $("board-filter").value;
    const rows = history.filter(h => !f || (f === "__current" ? h.passageId === passage.id : h.passageId === f));
    const by = {};
    rows.forEach(h => { (by[h.model] = by[h.model] || []).push(h); });
    const models = Object.entries(by).map(([model, hs]) => {
      const w = hs.filter(h => h.wpm);
      return { model, n: hs.length, acc: avg(hs.map(h => h.accuracy)), strict: avg(hs.map(h => h.strict)),
               best: Math.max(...hs.map(h => h.accuracy)), wpm: w.length ? Math.round(avg(w.map(h => h.wpm))) : null };
    }).sort((a, b) => b.acc - a.acc);

    $("board").innerHTML = models.length ? models.map((m, i) => `
      <tr>
        <td class="rank">${["🥇", "🥈", "🥉"][i] || i + 1}</td>
        <td>${esc(m.model)}</td>
        <td class="num"${m.n < 3 ? ' title="Fewer than 3 takes: not reliable yet" style="color:var(--muted)"' : ""}>${m.n}</td>
        <td><div style="display:flex;gap:8px;align-items:center;"><span class="num" style="min-width:52px">${pct(m.acc)}</span><div class="bar" style="flex:1"><i style="width:${(m.acc * 100).toFixed(1)}%"></i></div></div></td>
        <td class="num hide-sm">${pct(m.strict)}</td>
        <td class="num hide-sm">${pct(m.best)}</td>
        <td class="num hide-sm">${m.wpm ?? "–"}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="empty">No scores yet. Do a take to start your leaderboard.</td></tr>`;
  }
  $("board-filter").onchange = renderBoard;

  function renderTrouble() {
    const counts = {};
    history.forEach(h => (h.missed || []).forEach(w => { counts[w] = (counts[w] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 24);
    $("trouble").innerHTML = top.map(([w, n]) => `<span class="chip">${esc(w)}<b>×${n}</b></span>`).join("");
    $("trouble-empty").hidden = top.length > 0;
  }

  function renderHistory() {
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    $("hist").innerHTML = history.length ? history.slice().reverse().map(h => `
      <tr>
        <td class="num">${fmt.format(h.ts)}</td>
        <td>${esc(h.model)}</td>
        <td>${esc(h.passageName)}</td>
        <td class="num">${pct(h.accuracy)}</td>
        <td class="num hide-sm">${pct(h.strict)}</td>
        <td><button class="ghost small" data-del="${esc(h.id)}" aria-label="Delete this take">✕</button></td>
      </tr>`).join("")
      : `<tr><td colspan="6" class="empty">Nothing yet.</td></tr>`;
  }
  $("hist").onclick = e => {
    const id = e.target.closest("[data-del]")?.dataset.del;
    if (!id) return;
    history = history.filter(h => h.id !== id); store.set(KEYS.history, history);
    renderBoard(); renderTrouble(); renderHistory();
  };

  // ---------- import / export ----------
  function download(name, type, body) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $("export-json").onclick = () => download(`dictation-results-${stamp()}.json`, "application/json",
    JSON.stringify({ version: 1, history, custom }, null, 2));
  $("export-csv").onclick = () => {
    const cols = ["ts", "model", "passageName", "accuracy", "strict", "S", "D", "I", "words", "secs", "wpm", "transcript"];
    const cell = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [cols.join(","), ...history.map(h => cols.map(c => cell(c === "ts" ? new Date(h.ts).toISOString() : h[c])).join(","))];
    download(`dictation-results-${stamp()}.csv`, "text/csv", lines.join("\n"));
  };
  $("import").onclick = () => $("import-file").click();
  $("import-file").onchange = async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.history || [];
      const known = new Set(history.map(h => h.id));
      const fresh = incoming.filter(h => h && h.id && typeof h.accuracy === "number" && !known.has(h.id));
      history = history.concat(fresh).sort((a, b) => a.ts - b.ts);
      const knownP = new Set(custom.map(c => c.id));
      (data.custom || []).forEach(c => { if (c && c.id && c.text && !knownP.has(c.id)) custom.push(c); });
      store.set(KEYS.history, history); store.set(KEYS.custom, custom);
      renderPicker(); setPassage(passage.id, { keepText: true }); renderTrouble(); renderHistory();
      alert(`Imported ${fresh.length} new take${fresh.length === 1 ? "" : "s"}.`);
    } catch (err) { alert("That file couldn't be read as a results export."); }
  };
  $("wipe").onclick = () => {
    if (!history.length || !confirm("Delete all scores? Export first if you want to keep them.")) return;
    history = []; store.set(KEYS.history, history);
    renderBoard(); renderTrouble(); renderHistory();
  };

  // ---------- keyboard ----------
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); score(); }
    else if (e.key === "Escape" && document.activeElement === $("typed")) { resetTake(); }
  });

  // ---------- boot ----------
  applyTheme();
  renderPicker();
  const fromHash = decodeURIComponent(location.hash.slice(1));
  setPassage(allPassages().some(p => p.id === fromHash) ? fromHash : settings.passageId || window.PASSAGES[0].id);
  renderTrouble(); renderHistory();
})();
