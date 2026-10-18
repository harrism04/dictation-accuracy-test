// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/scoring.js");

test("perfect transcript scores 100%", () => {
  const r = S.score("The birch canoe slid on the smooth planks.", "the birch canoe slid on the smooth planks");
  assert.equal(r.strict.wer, 0);
  assert.equal(r.strict.accuracy, 1);
});

test("counts substitutions, deletions and insertions", () => {
  const r = S.score("a b c d", "a x c d e");
  assert.equal(r.strict.S, 1);
  assert.equal(r.strict.D, 0);
  assert.equal(r.strict.I, 1);
  assert.equal(r.strict.wer, 0.5);

  const r2 = S.score("a b c d", "a c d");
  assert.equal(r2.strict.D, 1);
  assert.equal(r2.strict.wer, 0.25);
});

test("case and punctuation are ignored by default", () => {
  const r = S.score("Hello, world! It's fine.", "hello world it’s fine");
  assert.equal(r.strict.wer, 0);
});

test("digits match spelled-out numbers", () => {
  assert.deepEqual(S.expandNumber("42"), ["forty", "two"]);
  assert.deepEqual(S.expandNumber("14th"), ["fourteenth"]);
  assert.deepEqual(S.expandNumber("2nd"), ["second"]);
  assert.deepEqual(S.expandNumber("320"), ["three", "hundred", "twenty"]);
  assert.deepEqual(S.expandNumber("1,500"), ["one", "thousand", "five", "hundred"]);
  assert.deepEqual(S.expandNumber("1999"), ["nineteen", "ninety", "nine"]);
  assert.deepEqual(S.expandNumber("2026"), ["twenty", "twenty", "six"]);
  assert.deepEqual(S.expandNumber("2005"), ["two", "thousand", "five"]);

  const r = S.score("She paid three hundred twenty dollars on the fourteenth at nine thirty.",
                    "She paid $320 on the 14th at 9:30.");
  assert.equal(r.strict.wer, 0);
});

test("hyphenated numbers and abbreviations normalize", () => {
  const r = S.score("Doctor Smith read forty two pages.", "Dr. Smith read forty-two pages");
  assert.equal(r.strict.wer, 0);
});

test("forgiving score ignores stutters, repeats and fillers", () => {
  const ref = "Peter Piper picked a peck of pickled peppers";
  const hyp = "P-P-Peter Piper p picked um a a peck of pickled peppers";
  const r = S.score(ref, hyp);
  assert.ok(r.strict.wer > 0, "strict should penalise the disfluencies");
  assert.equal(r.forgiving.wer, 0);
});

test("forgiving score still catches real errors", () => {
  const r = S.score("the quick brown fox", "uh the quick brown box");
  assert.equal(r.forgiving.S, 1);
  assert.equal(r.forgiving.wer, 0.25);
});

test("empty transcript is 100% deletions", () => {
  const r = S.score("one two three", "");
  assert.equal(r.strict.D, 3);
  assert.equal(r.strict.wer, 1);
  assert.equal(r.strict.accuracy, 0);
});

test("accuracy never goes below zero", () => {
  const r = S.score("hi", "this is a very long hallucinated sentence");
  assert.equal(r.strict.accuracy, 0);
  assert.ok(r.strict.wer > 1);
});
