// Nobody navigates by key again.
//
// React Navigation 6 let you return to an exact screen with
// `navigate({ key })`. Version 7 removed it: CommonActions.navigate throws
// "You need to specify a name when calling navigate with an object as the
// argument", and the stack router's NAVIGATE handler only ever reads
// payload.name.
//
// It shipped. Signing in threw a render error instead of returning anybody
// anywhere, because the auth screens all ended by navigating back to the key
// they had recorded on the way in. Nothing caught it: the call is valid
// JavaScript, the screens render fine, and the throw only happens at the
// moment authentication succeeds — the one path a person cannot reach twice
// without signing out.
//
// Navigating by name does the same job. The router finds the last route with
// that name already on the stack and unwinds to it, params intact.
//
// Run: node scripts/check-navigation-calls.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "src");
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) inspect(full);
  }
}

function inspect(file) {
  const source = fs.readFileSync(file, "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  const relative = path.relative(path.join(__dirname, ".."), file);

  // navigate({ ... }) with no name in the object.
  for (const match of code.matchAll(/\.navigate\(\s*\{([^}]*)\}/g)) {
    if (!/\bname\s*:/.test(match[1])) {
      failures.push(
        `${relative} calls navigate({${match[1].trim().slice(0, 40)}}) with no name — ` +
          `v7 throws on this. Navigate by route name instead.`,
      );
    }
  }
  // The specific shape that shipped.
  if (/navigate\(\s*\{\s*key\s*:/.test(code)) {
    failures.push(`${relative} navigates by key, which v7 removed`);
  }
}

walk(root);

// And the replacement is actually in place.
const gate = fs.readFileSync(
  path.join(__dirname, "..", "src/utils/openAccountGate.js"),
  "utf8",
);
if (!/navigation\.navigate\(originName\)/.test(gate)) {
  failures.push("openAccountGate no longer returns callers to their origin by name");
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log("clean: navigation — no navigate-by-key, no nameless navigate object");
