#!/usr/bin/env node
//
// Finds t("...") calls whose key does not exist in translations.js.
//
// This exists because t() renders the raw key when it misses, rather than
// throwing. A wrong key therefore ships silently and only shows itself when
// that exact view renders with that exact data — which is how a vehicle
// card's primary button came to read "realEstateCallCta" to real users,
// invisible for as long as the list happened to be empty.
//
// Only literal keys are checked. Composed ones (`carsQuick_${key}`) are
// listed separately at the end so they can be eyeballed, since resolving
// them would mean evaluating the app.

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const ROOT = path.join(__dirname, "..", "src");
const TRANSLATIONS = path.join(ROOT, "i18n", "translations.js");

function loadTranslations() {
  const { code } = babel.transformFileSync(TRANSLATIONS, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(
    module,
    module.exports,
    require,
  );
  return module.exports.translations;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const translations = loadTranslations();
const languages = Object.keys(translations);

const missing = [];
const composed = new Set();

for (const file of walk(ROOT)) {
  if (file === TRANSLATIONS) continue;
  const source = fs.readFileSync(file, "utf8");

  // t("key") / t('key') — the key, optionally followed by interpolation args.
  for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) {
    const key = match[1];
    const absent = languages.filter((lang) => !(key in translations[lang]));
    if (absent.length) {
      const line = source.slice(0, match.index).split("\n").length;
      missing.push({
        file: path.relative(path.join(__dirname, ".."), file),
        line,
        key,
        absent,
      });
    }
  }

  // t(`prefix_${...}`) — reported, not resolved.
  for (const match of source.matchAll(/\bt\(\s*`([^`]*\$\{[^`]*)`/g)) {
    composed.add(match[1].trim());
  }
}

for (const item of missing) {
  console.log(
    `${item.file}:${item.line}  t("${item.key}") — missing from ${item.absent.join(", ")}`,
  );
}

if (composed.size) {
  console.log(`\n${composed.size} composed key(s), not checked:`);
  for (const pattern of [...composed].sort())
    console.log(`  t(\`${pattern}\`)`);
}

console.log(
  missing.length
    ? `\n${missing.length} missing translation key(s)`
    : "\nclean: every literal t() key resolves in " + languages.join(" + "),
);

process.exit(missing.length ? 1 : 0);
