#!/usr/bin/env node
//
// Finds translation strings whose placeholders t() will never substitute.
//
// t() interpolates by literal string replacement, in I18nContext.js:
//
//   Object.keys(params).reduce(
//     (result, paramKey) => result.replace(`{${paramKey}}`, params[paramKey]),
//     template,
//   )
//
// Single braces, and `replace` rather than `replaceAll`. Nothing throws when
// a placeholder does not match — the braces simply survive into the rendered
// string and the user reads them.
//
// That is not hypothetical. `sellVideoTooLong` and `sellVideoTooLarge` were
// written with `{{seconds}}` and `{{megabytes}}` in both languages, which is
// the convention every other i18n library uses. They shipped, and for as long
// as they were live the upload error read "la vidéo dépasse {90}s" — the
// outer brace consumed, the inner one left behind. Nobody noticed, because
// the only way to see it is to attach an over-long video.
//
// Three ways a placeholder fails to render, all checked here:
//
//   1. {{double}} — t() replaces `{double}` inside it and leaves the outer
//      braces, so the string renders with stray punctuation around the value.
//   2. The same placeholder twice in one string — `replace` substitutes the
//      first occurrence only, so the second renders as literal braces.
//   3. The placeholder sets differ between languages for one key — whichever
//      language is missing it silently drops a number the other shows.

const path = require("path");
const babel = require("@babel/core");

const TRANSLATIONS = path.join(__dirname, "..", "src", "i18n", "translations.js");

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

// The placeholder t() understands, and nothing else. A brace around anything
// that is not a bare identifier is prose — "{" appears in code samples and in
// the odd bit of punctuation — and is left alone.
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

function placeholders(value) {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

const translations = loadTranslations();
const languages = Object.keys(translations);
const keys = [
  ...new Set(languages.flatMap((lang) => Object.keys(translations[lang]))),
].sort();

const problems = [];

for (const key of keys) {
  const sets = [];

  for (const lang of languages) {
    const value = translations[lang][key];
    if (typeof value !== "string") continue;

    if (value.includes("{{") || value.includes("}}")) {
      problems.push(
        `${lang}.${key} — double braces; t() uses {one}, not {{two}}\n    ${value}`,
      );
    }

    const found = placeholders(value);
    const seen = new Set();
    const repeated = new Set();
    for (const name of found) {
      if (seen.has(name)) repeated.add(name);
      seen.add(name);
    }
    if (repeated.size) {
      problems.push(
        `${lang}.${key} — {${[...repeated].join("}, {")}} appears more than once; ` +
          `t() uses replace(), so only the first is substituted\n    ${value}`,
      );
    }

    sets.push({ lang, names: [...seen].sort().join(", ") });
  }

  if (new Set(sets.map((entry) => entry.names)).size > 1) {
    problems.push(
      `${key} — placeholders differ by language; the language missing one ` +
        `drops a value the other shows\n    ` +
        sets.map((entry) => `${entry.lang}: [${entry.names}]`).join("  "),
    );
  }
}

for (const problem of problems) console.log(problem);

console.log(
  problems.length
    ? `\n${problems.length} unrenderable placeholder(s)`
    : `clean: every placeholder in ${keys.length} key(s) across ` +
        `${languages.join(" + ")} is one t() will substitute`,
);

process.exit(problems.length ? 1 : 0);
