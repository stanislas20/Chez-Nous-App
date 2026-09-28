#!/usr/bin/env node
//
// A listing's contact channels survive being edited.
//
// THE BUG THIS EXISTS FOR, stated exactly, because it shipped and nothing
// noticed: the form held the five channels in one `links` object and seeded
// it with seed("links", {}) — a key NO write path has ever produced, in
// this file or anywhere else, at any point in the history. The listing
// stores them FLAT (whatsapp, website, facebook, instagram, tiktok), which
// is what keeps them queryable. So the seed always fell back to {}, every
// input opened blank when a listing was edited, and the payload then wrote
// all five back as null. Changing a restaurant's title deleted its entire
// online presence. No error, no warning, nothing on screen to notice.
//
// It is a whole class of bug rather than one slip: state read under one
// name, persisted under another. So this file does not check that the word
// "whatsapp" appears near the word "seed". It EVALUATES the real seeding
// expression and the real payload expressions, lifted out of the screen
// source, against fixtures — the same round trip a seller performs.
//
// Run: node scripts/check-listing-contact.js
if (!process.env.NODE_NO_WARNINGS) {
  const { spawnSync } = require("child_process");
  const again = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  process.exit(again.status ?? 1);
}

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const FORM_REL = "src/screens/CreateListingScreen.js";
const rawForm = read(FORM_REL);
const form = stripComments(rawForm);

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };
const eq = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${what}: got ${a}, expected ${e}`);
};

// Everything from `from` up to the delimiter that closes the first `open`
// after it. Brace-aware, so a nested object or arrow body does not end it
// early. Strings are stepped over so a brace inside one cannot unbalance it.
function balancedFrom(src, from, open, close) {
  const start = src.indexOf(from);
  if (start === -1) return null;
  let i = src.indexOf(open, start);
  if (i === -1) return null;
  let depth = 0;
  let quote = null;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

// ── Lift the real implementations out of the screen ────────────────────
const seedFn = balancedFrom(form, "const seed = (field, fallback) => {", "{", "}");
const seedTextFn = balancedFrom(form, 'const seedText = (field, fallback = "") => {', "{", "}");
const linksInit = balancedFrom(form, "const [links, setLinks] = useState(", "(", ")");
if (!seedFn) fail("could not find seed() in the form — the rest of this file is not testing anything");
if (!seedTextFn) fail("could not find seedText() in the form");
if (!linksInit) fail("could not find the links state initialiser in the form");

// The five payload lines, exactly as written.
const PAYLOAD_LINE = /^\s*(whatsapp|website|facebook|instagram|tiktok):\s*links\.\1\?\.trim\(\) \|\| null,$/gm;
const payloadLines = [...form.matchAll(PAYLOAD_LINE)];
if (payloadLines.length !== 5)
  fail(
    `${payloadLines.length} of the 5 contact channels are written to the payload ` +
      `as \`<key>: links.<key>?.trim() || null\` — a channel collected and not ` +
      `written is one the seller fills in for nobody`,
  );

if (failures) { process.exit(1); }

(async () => {
  const kindsMod = await import(
    require("url").pathToFileURL(path.join(root, "src/data/restaurantLinks.js")).href
  );
  const { restaurantLinkKinds } = kindsMod;
  const KEYS = restaurantLinkKinds.map((k) => k.key);

  // ── 5. One taxonomy, not two ─────────────────────────────────────────
  eq("the canonical taxonomy", KEYS, ["whatsapp", "website", "facebook", "instagram", "tiktok"]);
  if (!/restaurantLinkKinds/.test(linksInit))
    fail(
      "the links state is seeded from a hand-written list of channels rather " +
        "than restaurantLinkKinds — a channel added to the taxonomy would " +
        "render an input that seeds from nothing",
    );
  const written = payloadLines.map((m) => m[1]);
  eq("the payload writes exactly the taxonomy's channels", [...written].sort(), [...KEYS].sort());

  // ── The round trip, run for real ─────────────────────────────────────
  //
  // seed, seedText and the initialiser are the screen's own source; only
  // `editing` is a fixture. So this exercises the shipped code path.
  const roundTrip = new Function(
    "editing",
    "restaurantLinkKinds",
    `${seedFn};
     ${seedTextFn};
     const useState = (init) => [typeof init === "function" ? init() : init];
     ${linksInit};
     return links;`,
  );
  const seedLinks = (editing) => roundTrip(editing, restaurantLinkKinds);

  const payload = (links) =>
    new Function("links", `return { ${payloadLines.map((m) => m[0].trim()).join(" ")} };`)(links);

  const STORED = {
    id: "abc",
    title: "Chez Nous",
    whatsapp: "01 23 45 67 89",
    website: "resto.bj",
    facebook: "MonResto",
    instagram: "@resto",
    tiktok: "@resto",
  };

  // ── 1 & 2. Editing restores every persisted flat field ───────────────
  const restored = seedLinks(STORED);
  for (const key of KEYS) {
    eq(`editing restores ${key}`, restored[key], STORED[key]);
  }
  eq("the restored state has exactly the five channels", Object.keys(restored).sort(), [...KEYS].sort());

  // A new listing starts empty, not undefined — the inputs are controlled.
  const fresh = seedLinks(undefined);
  for (const key of KEYS) eq(`a new listing starts ${key} empty`, fresh[key], "");

  // ── 3. The payload still writes the flat fields ──────────────────────
  const saved = payload(restored);
  for (const key of KEYS) eq(`the payload writes ${key}`, saved[key], STORED[key]);

  // THE REGRESSION ITSELF: title-only edit must not touch the channels.
  const titleEdited = payload(seedLinks({ ...STORED, title: "Chez Nous (Cadjèhoun)" }));
  for (const key of KEYS) {
    if (titleEdited[key] !== STORED[key])
      fail(
        `editing an unrelated field erased ${key} (${JSON.stringify(STORED[key])} -> ` +
          `${JSON.stringify(titleEdited[key])}) — this is the bug this file exists for`,
      );
  }
  // And the shape that caused it must not come back.
  if (/seed\("links"/.test(form))
    fail('the links state seeds from seed("links", ...) again — no write path has ever produced that key');

  // ── 7. Clearing one channel clears only that channel ─────────────────
  const cleared = payload({ ...restored, instagram: "" });
  eq("clearing Instagram stores null", cleared.instagram, null);
  for (const key of KEYS.filter((k) => k !== "instagram"))
    eq(`clearing Instagram leaves ${key} alone`, cleared[key], STORED[key]);
  // Whitespace is a cleared field, not a value.
  eq("a whitespace-only channel stores null", payload({ ...restored, website: "   " }).website, null);

  // A listing that never had a channel keeps not having it, and does not
  // acquire an empty string.
  const partial = seedLinks({ whatsapp: "01 23 45 67 89" });
  eq("an absent channel seeds empty", partial.website, "");
  eq("and saves as null", payload(partial).website, null);
  eq("while the one it has survives", payload(partial).whatsapp, "01 23 45 67 89");

  // ── 4. The stored shape stays flat ───────────────────────────────────
  if ("links" in saved)
    fail("the payload writes a nested `links` object — the stored schema is flat and queryable");
  // Both spellings. `links,` is the shorthand property and reaches Firestore
  // as a nested object exactly like `links: links` does, while looking like
  // a stray identifier to anything grepping for a colon.
  const nested = form.match(/^\s*links\s*(?::|,\s*$)/m);
  if (nested)
    fail(
      `a \`links\` property has appeared in a write payload (${JSON.stringify(nested[0].trim())}) ` +
        `— the stored schema is flat and queryable, and nothing reads a nested one`,
    );
  // The non-negotiable half: flat keys at the top level of the document.
  for (const key of KEYS) {
    if (!new RegExp(`^\\s*${key}: links\\.${key}`, "m").test(form))
      fail(`${key} is no longer written as a top-level listing field`);
  }

  // ── 6. Product Detail still reads the flat fields ────────────────────
  const detail = read("src/screens/ProductDetailScreen.js");
  if (!/restaurantLinkKinds/.test(detail))
    fail("ProductDetailScreen no longer reads the shared taxonomy");
  if (!/listing\[kind\.key\]/.test(detail))
    fail("ProductDetailScreen no longer reads the channels as flat fields on the listing");
  // BOTH sites, counted. There are two — the trade block's own WhatsApp
  // button and the secondary button beside Call — and requiring the pattern
  // to exist "somewhere" lets either one be broken while the other keeps
  // the assertion green. That is the same shape of miss as the bug itself.
  const waSites = (detail.match(/buildLinkUrl\("whatsapp", listing\.whatsapp\)/g) ?? []).length;
  if (waSites !== 2)
    fail(
      `${waSites} of the 2 WhatsApp call sites read listing.whatsapp — the ` +
        `trade block and the button beside Call must both read the stored field`,
    );
  if (!/listing\.whatsapp \?/.test(detail))
    fail("the secondary WhatsApp button no longer checks listing.whatsapp before rendering");
  if (/listing\.links/.test(detail))
    fail("ProductDetailScreen reads a nested listing.links — nothing has ever written one");

  if (failures) process.exit(1);
  console.log(
    `clean: listing contact — ${KEYS.length} channels seed from the stored flat ` +
      `fields and survive an unrelated edit, clearing one clears only that one, ` +
      `the payload stays flat, restaurantLinkKinds is the only taxonomy`,
  );
})().catch((error) => {
  console.error(`FAIL the checker itself threw: ${error.stack}`);
  process.exit(1);
});
