// Every value a screen destructures from a hook must be a value that hook
// actually returns.
//
// This exists because one did not. PapersScreen took `rememberVehicle` off
// useVehiclePapers, the hook returned `{ papers, loaded, remember, write }`,
// and the mismatch was invisible everywhere that matters: it parses, it
// lints, it renders, and check-undefined-identifiers is satisfied because
// the name IS defined — as undefined. The screen only fell over when
// somebody tapped Save on the vehicle sheet, which is to say in front of a
// user rather than in front of us.
//
// A destructured name that the hook never returns is always a bug. There is
// no case where you mean to pull a key that does not exist.
//
// Run: node scripts/check-hook-contracts.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const hooksDir = path.join(root, "src", "hooks");

// The consumers. Hooks call each other too, so they check each other.
const consumerDirs = ["src/screens", "src/components", "src/hooks", "src/navigation"];

const failures = [];

// The final `return { ... }` of the hook — the object its callers destructure.
// Rest and spread are read as "we cannot see the whole shape", and the hook is
// skipped rather than guessed at: a false failure here would be worse than a
// missed one, because it would train somebody to ignore the script.
function returnedKeys(rawSource, hookName) {
  // Comments stripped FIRST, and this was not a tidiness choice: the parser
  // below splits the returned object on commas and reads what is before the
  // first colon, so a comment line in front of a key made the key read as the
  // comment and be discarded. Any hook whose return object was commented was
  // silently reported with a shape smaller than it has — which then failed
  // its callers for destructuring keys it really does return. Found when
  // useListingsSearch came back as four keys of its six.
  const source = stripComments(rawSource);
  const marker = new RegExp(`export function ${hookName}\\b`);
  const start = source.search(marker);
  if (start === -1) return null;

  const body = source.slice(start);
  const matches = [...body.matchAll(/return\s*\{([\s\S]*?)\}\s*;/g)];
  if (!matches.length) return null;

  const keys = new Set();
  for (const match of matches) {
    const inner = match[1];
    if (inner.includes("...")) return null;
    for (const part of inner.split(",")) {
      const name = part.split(":")[0].trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) keys.add(name);
    }
  }
  return keys;
}

const hookFiles = fs
  .readdirSync(hooksDir)
  .filter((file) => file.endsWith(".js"));

const contracts = new Map();
for (const file of hookFiles) {
  const name = file.replace(/\.js$/, "");
  const source = fs.readFileSync(path.join(hooksDir, file), "utf8");
  const keys = returnedKeys(source, name);
  if (keys) contracts.set(name, keys);
}

function walk(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".js")
          ? [path.join(dir, entry.name)]
          : [],
    );
}

let checked = 0;
for (const relative of consumerDirs.flatMap(walk)) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  for (const [hook, keys] of contracts) {
    const pattern = new RegExp(
      `const\\s*\\{([^}]*)\\}\\s*=\\s*${hook}\\s*\\(`,
      "g",
    );
    for (const match of source.matchAll(pattern)) {
      const inner = match[1];
      // `...rest` on the caller's side is fine — it takes whatever is there.
      if (inner.includes("...")) continue;
      for (const part of inner.split(",")) {
        const name = part.split(":")[0].split("=")[0].trim();
        if (!name) continue;
        checked += 1;
        if (!keys.has(name)) {
          failures.push(
            `${relative} destructures ${name} from ${hook}(), which returns ` +
              `only { ${[...keys].sort().join(", ")} }`,
          );
        }
      }
    }
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: ${checked} destructured value(s) across ${contracts.size} hooks all exist`,
);
