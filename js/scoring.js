// Scoring: text normalization + word-level alignment (WER).
// Works in the browser (window.Scoring) and in Node (module.exports) so it can be unit-tested.
(function (root) {
  "use strict";

  const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const ORDINAL_IRREGULAR = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };

  // Common written forms that a dictation engine may produce instead of the spoken word.
  const ALIASES = { dr: "doctor", mr: "mister", mrs: "missus", ok: "okay", "&": "and", vs: "versus", etc: "etcetera" };

  const FILLERS = /^(u+m+|u+h+|e+r+m*|a+h+|h+m+|m+h*m+|e+h+)$/;

  function under1000(n) {
    const out = [];
    if (n >= 100) { out.push(ONES[Math.floor(n / 100)], "hundred"); n %= 100; }
    if (n >= 20) { out.push(TENS[Math.floor(n / 10)]); n %= 10; if (n) out.push(ONES[n]); }
    else if (n > 0 || out.length === 0) out.push(ONES[n]);
    return out;
  }

  // 0 – 999,999,999 → array of words. "and" is omitted, matching how the passages are written.
  function numberToWords(n) {
    if (n === 0) return ["zero"];
    const out = [];
    const scales = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
    for (const [size, word] of scales) {
      if (n >= size) { out.push(...under1000(Math.floor(n / size)), word); n %= size; }
    }
    if (n > 0) out.push(...under1000(n));
    return out;
  }

  function ordinalize(words) {
    const last = words[words.length - 1];
    let ord;
    if (ORDINAL_IRREGULAR[last]) ord = ORDINAL_IRREGULAR[last];
    else if (last.endsWith("y")) ord = last.slice(0, -1) + "ieth";
    else ord = last + "th";
    return [...words.slice(0, -1), ord];
  }

  // Expand digit tokens ("42", "1,500", "14th", "2nd") into spoken words so "42" == "forty two".
  function expandNumber(token) {
    const m = token.match(/^(\d{1,3}(?:,\d{3})+|\d+)(st|nd|rd|th)?$/);
    if (!m) return [token];
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (!Number.isFinite(n) || n > 999999999) return [token];
    // Years like 1999 / 2026 are spoken as two pairs ("nineteen ninety nine").
    if (!m[2] && m[1].length === 4 && n >= 1100 && n <= 2099 && n % 100 !== 0 && !(n >= 2000 && n < 2010)) {
      return [...numberToWords(Math.floor(n / 100)), ...(n % 100 < 10 ? ["oh"] : []), ...numberToWords(n % 100)];
    }
    const words = numberToWords(n);
    return m[2] ? ordinalize(words) : words;
  }

  const DEFAULTS = { ignoreCase: true, ignorePunct: true, normalizeNumbers: true };

  // Turn raw text into comparable word tokens.
  function tokenize(text, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    let s = String(text || "").normalize("NFKC").replace(/[‘’ʼ`]/g, "'").replace(/[“”]/g, '"');
    if (o.ignoreCase) s = s.toLowerCase();
    if (o.normalizeNumbers) {
      s = s.replace(/\$(\d[\d,]*)(?!\.\d)/g, "$1 dollars")   // "$320" → "320 dollars"
           .replace(/(\d)\s?%/g, "$1 percent");               // "45%"  → "45 percent"
    }
    if (o.ignorePunct) {
      s = s.replace(/[—–-]/g, " ")                     // hyphens/dashes split words: "forty-two", "I-I-I"
           .replace(/(\d),(\d{3})/g, "$1$2")              // keep 1,500 together
           .replace(/[^\p{L}\p{N}\s'&]/gu, " ")           // drop punctuation (incl. $ % : .)
           .replace(/(^|\s)'+|'+(?=\s|$)/g, " ");         // quotes, but keep apostrophes inside words
    }
    let words = s.split(/\s+/).filter(Boolean);
    if (o.ignoreCase) words = words.map(w => ALIASES[w] || w);
    if (o.normalizeNumbers) words = words.flatMap(expandNumber);
    return words;
  }

  // Remove disfluencies: filler words, immediate repetitions ("I I I want"),
  // and short part-word starts ("p p picked", "w- want").
  function removeDisfluencies(words) {
    const noFillers = words.filter(w => !FILLERS.test(w.toLowerCase()));
    const out = [];
    for (let i = 0; i < noFillers.length; i++) {
      const w = noFillers[i];
      const next = noFillers[i + 1];
      if (next !== undefined && w === next) continue;                                    // repeated whole word
      if (next !== undefined && w.length <= 3 && w.length < next.length && next.startsWith(w)) continue; // part-word start
      out.push(w);
    }
    return out;
  }

  // Levenshtein alignment over words. Returns ops: {type: ok|sub|del|ins, ref?, hyp?}
  function align(ref, hyp) {
    const n = ref.length, m = hyp.length;
    const d = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = 0; i <= n; i++) d[i][0] = i;
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const c = ref[i - 1] === hyp[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j - 1] + c, d[i - 1][j] + 1, d[i][j - 1] + 1);
      }
    }
    const ops = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
        ops.push(ref[i - 1] === hyp[j - 1] ? { type: "ok", ref: ref[i - 1], hyp: hyp[j - 1] } : { type: "sub", ref: ref[i - 1], hyp: hyp[j - 1] });
        i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        ops.push({ type: "del", ref: ref[i - 1] }); i--;
      } else {
        ops.push({ type: "ins", hyp: hyp[j - 1] }); j--;
      }
    }
    return ops.reverse();
  }

  function summarize(ops, refLen) {
    const S = ops.filter(o => o.type === "sub").length;
    const D = ops.filter(o => o.type === "del").length;
    const I = ops.filter(o => o.type === "ins").length;
    const wer = refLen ? (S + D + I) / refLen : (I ? 1 : 0);
    return { ops, S, D, I, N: refLen, wer, accuracy: Math.max(0, 1 - wer) };
  }

  // Score a transcript against a reference.
  // strict:    every word the engine typed counts.
  // forgiving: disfluencies (fillers, repeats, part-word starts) are removed from both sides first,
  //            so a faithful transcript of a stutter isn't penalised.
  function score(reference, transcript, opts) {
    const ref = tokenize(reference, opts);
    const hyp = tokenize(transcript, opts);
    const strict = summarize(align(ref, hyp), ref.length);
    const refF = removeDisfluencies(ref);
    const forgiving = summarize(align(refF, removeDisfluencies(hyp)), refF.length);
    return { strict, forgiving, refWords: ref.length, hypWords: hyp.length };
  }

  const api = { tokenize, removeDisfluencies, align, score, numberToWords, expandNumber };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Scoring = api;
})(typeof window !== "undefined" ? window : globalThis);
