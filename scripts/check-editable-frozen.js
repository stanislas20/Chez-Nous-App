#!/usr/bin/env node
//
// Every field the posting form writes that firestore.rules freezes on an
// owner update has to be stripped before the edit path calls updateDoc.
//
// This exists because of a defect a live listing found and a synthetic one
// could not. The form writes `sellerVerified: false` and
// `sellerCompanyName: null` on every save. Both are frozen — they are claims
// about the seller granted by review, not facts an edit may restate — and on
// a listing created by the CURRENT form that was invisible: the values
// already matched, so affectedKeys() saw no change and the write passed.
//
// On anything older, where neither field exists yet, writing them ADDS the
// keys. Firestore counts an addition as a change, the frozen check fires, and
// the entire update is refused. Every listing predating those fields could
// therefore never be edited again — any field, material or not — and the
// seller was told only that nothing could be saved.
//
// The shape of that bug is what makes it worth a check rather than a test:
// it is invisible to any fixture the current form produces, which is exactly
// what a test fixture is. It only appears against data written by an older
// version of the app, and that data lives in production.
//
// So this compares three lists directly:
//
//   what the form writes        — the `data` object in CreateListingScreen
//   what the rules freeze       — the hasAny([...]) in the owner update branch
//   what the edit path strips   — the destructure that produces `editable`
//
// and fails if anything is in the first two and not the third.

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.join(__dirname, "..");
const FORM = path.join(root, "src", "screens", "CreateListingScreen.js");
const RULES = path.join(root, "firestore.rules");

// ── what the rules freeze ────────────────────────────────────────────────
//
// The owner update branch, and only that one. The moderator branch below it
// has its own hasOnly() list of keys a moderator MAY write, which is a
// different question and must not be read as a freeze.
function frozenKeys() {
  const rules = fs.readFileSync(RULES, "utf8");
  const ownerBranch = rules.slice(
    rules.indexOf("allow update: if request.auth != null"),
  );
  const match = ownerBranch.match(
    /affectedKeys\(\)\s*\n?\s*\.hasAny\(\[([\s\S]*?)\]\)/,
  );
  if (!match) return null;
  return [...match[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
}

// ── what the form writes, and what the edit path strips ──────────────────
//
// Parsed rather than grepped. The keys sit at several indentation levels
// behind conditional spreads, and matching them by leading whitespace reads
// a partial list as a complete one — which is a check that passes because it
// looked at less than it claimed to.
function formKeys() {
  const ast = babel.parseSync(fs.readFileSync(FORM, "utf8"), {
    filename: FORM,
    presets: [require.resolve("babel-preset-expo")],
    babelrc: false,
    configFile: false,
  });

  const written = new Set();
  const stripped = new Set();

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);

    // const data = { ... }
    if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "Identifier" &&
      node.id.name === "data" &&
      node.init?.type === "ObjectExpression"
    ) {
      for (const prop of node.init.properties) {
        if (prop.type === "ObjectProperty" && !prop.computed) {
          const k = prop.key.name ?? prop.key.value;
          if (k) written.add(k);
        }
      }
    }

    // const { a: _a, b: _b, ...editable } = data
    if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "ObjectPattern" &&
      node.id.properties.some(
        (p) => p.type === "RestElement" && p.argument?.name === "editable",
      )
    ) {
      for (const prop of node.id.properties) {
        if (prop.type === "ObjectProperty" && !prop.computed) {
          const k = prop.key.name ?? prop.key.value;
          if (k) stripped.add(k);
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      walk(node[key]);
    }
  };

  walk(ast);
  return { written, stripped };
}

const frozen = frozenKeys();
const failures = [];

if (!frozen || frozen.length === 0) {
  failures.push(
    "could not find the owner update branch's affectedKeys().hasAny([...]) " +
      "list in firestore.rules — this check is reading nothing and would " +
      "pass on anything",
  );
} else {
  const { written, stripped } = formKeys();

  if (written.size === 0) {
    failures.push(
      "could not find the `data` object in CreateListingScreen — same " +
        "problem: a check that found no fields cannot fail on one",
    );
  }
  if (stripped.size === 0) {
    failures.push(
      "could not find the `...editable` destructure in CreateListingScreen",
    );
  }

  for (const key of frozen) {
    if (written.has(key) && !stripped.has(key)) {
      failures.push(
        `the form writes "${key}" and firestore.rules freezes it, but the ` +
          `edit path does not strip it — editing any listing where "${key}" ` +
          `is absent will be refused outright, because writing the field ` +
          `adds the key and an addition counts as a change`,
      );
    }
  }

  if (failures.length === 0) {
    console.log(
      `clean: ${frozen.length} frozen field(s); every one the form writes is ` +
        `stripped before the edit`,
    );
  }
}

for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
