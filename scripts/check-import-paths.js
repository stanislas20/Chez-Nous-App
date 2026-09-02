// Every relative import must point at a file that exists.
//
// This is the cheapest possible check and it exists because of the most
// expensive possible afternoon. ServicesScreen imported useAuth from
// "../context/AuthContext"; the file is at "../auth/AuthContext". Metro
// answered every bundle request with a 500 from that moment on, for iOS
// and for Android alike.
//
// Nothing here said so. The screen parses — a wrong path is still valid
// JavaScript. check-undefined-identifiers.js passes, because `useAuth` IS
// imported, from somewhere. The phone in my hand kept running the last
// bundle it had successfully loaded, so it went on looking correct through
// several more changes, and the only symptom anywhere was somebody else
// saying "changes are not showing on iOS".
//
// A resolution failure is a total failure — no screen, no app, no partial
// degradation — and it is invisible to every other check in this folder.
//
// Run: node scripts/check-import-paths.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

// The order Metro tries, minus the platform-specific variants, which no
// file in this project uses.
const SUFFIXES = ["", ".js", ".jsx", ".json", ".ts", ".tsx"];
const INDEXES = ["/index.js", "/index.jsx", "/index.ts", "/index.tsx"];

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : /\.(js|jsx)$/.test(entry.name)
          ? [path.join(dir, entry.name)]
          : [],
    );

const resolves = (from, request) => {
  const target = path.resolve(path.dirname(from), request);
  return (
    SUFFIXES.some((suffix) => fs.existsSync(target + suffix)) ||
    INDEXES.some((index) => fs.existsSync(target + index))
  );
};

const roots = ["src", "scripts", "functions"].filter((dir) =>
  fs.existsSync(path.join(root, dir)),
);

let checked = 0;
for (const dir of roots) {
  for (const file of walk(path.join(root, dir))) {
    if (file.includes("node_modules")) continue;
    // Comments first. A note explaining a past mistake — `} from
    // "../data/countries";` — is not an import, and a check that cannot
    // tell prose from code teaches people to ignore it.
    const source = fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/[^\n]*/g, "$1");
    const requests = [
      ...source.matchAll(/(?:from|require\()\s*["'](\.[^"']+)["']/g),
    ].map((match) => match[1]);
    for (const request of requests) {
      checked += 1;
      if (!resolves(file, request)) {
        failures.push(
          `${path.relative(root, file)} imports "${request}", which does not ` +
            `exist — Metro answers every bundle request with a 500 until this ` +
            `is fixed, on every platform`,
        );
      }
    }
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(`clean: import paths — ${checked} relative imports all resolve`);
