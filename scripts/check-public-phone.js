#!/usr/bin/env node
//
// The number you sign in with is not the number customers see.
//
// THE DEFECT. sellers/{uid}.phone is the number an account was created
// with, and it IS the login: phoneToPseudoEmail turns it into the Firebase
// Auth identity. syncVerifiedCompanyEntry projected it into
// verifiedCompanies/{uid}, which firestore.rules serves with
// `allow read: if true`. So becoming verified silently turned a private
// credential into a world-readable contact point. Nothing at sign-up said
// it would, and the number cannot be changed afterwards without losing the
// ability to sign in.
//
// Two properties have to hold, and the second is the one that is easy to
// lose later:
//
//   `phone` is never published. Not as a fallback, not when publicPhone is
//   missing, not under another key.
//
//   Absent means ABSENT. A company with no public number publishes none.
//   The tempting `publicPhone || phone` is the defect restated, and it
//   would read as a kindness.
//
// This runs the real projection out of functions/index.js against an
// in-memory Firestore rather than grepping it, so "no phone is published"
// is asserted against the document that would actually be written.
//
// Run: node scripts/check-public-phone.js
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
const Module = require("module");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };
const eq = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const SERVER_TS = "__serverTimestamp__";

function makeWorld() {
  const docs = new Map();
  const sent = [];
  const snapOf = (p) => ({
    exists: docs.has(p), data: () => docs.get(p), ref: { path: p },
  });
  const docRef = (p) => ({
    path: p,
    async get() { return snapOf(p); },
    // set() WITHOUT merge, like the real one: this is what retires a key
    // that is no longer written.
    async set(value) { docs.set(p, { ...value }); },
    async update(value) { docs.set(p, { ...(docs.get(p) ?? {}), ...value }); },
    async delete() { docs.delete(p); },
    collection: (name) => ({
      doc: (id) => docRef(`${p}/${name}/${id}`),
      async add(value) { docs.set(`${p}/${name}/a-${docs.size}`, { ...value }); },
    }),
  });
  const query = (name, state = { filters: [], cap: Infinity }) => {
    const derive = (patch) => query(name, { ...state, ...patch });
    return {
      where: (f, _o, v) => derive({ filters: [...state.filters, [f, v]] }),
      orderBy: () => derive({}),
      limit: (n) => derive({ cap: n }),
      async get() {
        const rows = [...docs.entries()]
          .filter(([p]) => p.startsWith(`${name}/`) && p.split("/").length === 2)
          .filter(([, d]) => state.filters.every(([f, v]) => d[f] === v))
          .slice(0, state.cap);
        return { docs: rows.map(([p]) => snapOf(p)), size: rows.length, empty: !rows.length };
      },
      doc: (id) => docRef(`${name}/${id}`),
    };
  };
  const firestore = () => ({
    collection: query,
    doc: docRef,
    async getAll(...refs) { return refs.map((r) => snapOf(r.path)); },
    async runTransaction(fn) {
      return fn({ get: async (r) => snapOf(r.path), update: (r, v) => docRef(r.path).update(v) });
    },
    batch: () => ({ update() {}, set() {}, delete() {}, async commit() {} }),
  });
  firestore.FieldValue = { serverTimestamp: () => SERVER_TS, delete: () => "__delete__" };
  return {
    docs, sent,
    admin: {
      initializeApp() {},
      firestore,
      messaging: () => ({
        async sendEachForMulticast(m) { sent.push(m); return { responses: m.tokens.map(() => ({})) }; },
        async send(m) { sent.push(m); return "ok"; },
      }),
    },
  };
}

function loadFunctions(world) {
  const capture = () => (_spec, handler) => handler;
  const noop = () => () => {};
  const stubs = {
    "firebase-admin": world.admin,
    "firebase-functions/logger": { info() {}, warn() {}, error() {} },
    "firebase-functions/v2": { setGlobalOptions() {} },
    "firebase-functions/v2/https": { onCall: noop, HttpsError: class extends Error {} },
    "firebase-functions/v2/firestore": {
      onDocumentCreated: capture(), onDocumentDeleted: capture(),
      onDocumentUpdated: capture(), onDocumentWritten: capture(),
    },
    "./deleteAccount": {}, "./listingPage": {}, "./paperReminders": {},
    "./pharmacyRosterSync": {}, "./placesProxy": {}, "./profilePage": {},
  };
  const load = (rel, extra = {}) => {
    const file = path.join(root, rel);
    const m = new Module(file, null);
    m.filename = file;
    m.paths = Module._nodeModulePaths(path.dirname(file));
    const table = { ...stubs, ...extra };
    m.require = (id) => (id in table ? table[id] : Module.prototype.require.call(m, id));
    m._compile(fs.readFileSync(file, "utf8"), file);
    return m.exports;
  };
  const recordNotification = load("functions/recordNotification.js");
  return load("functions/index.js", { "./recordNotification": recordNotification });
}

const COMPANY = {
  accountType: "company",
  companyName: "La Cananeenne",
  sector: "food",
  companyCity: "Cotonou",
  photoUrl: "https://example.test/logo.jpg",
  // The login number. It must never reach a public document.
  phone: "+2290197000001",
};

async function project(world, fns, { before, after, uid = "c1" }) {
  world.docs.set(`sellers/${uid}`, { ...after });
  await fns.notifyCompanyVerificationDecision({
    params: { sellerId: uid },
    data: {
      before: { data: () => before },
      after: { data: () => after, ref: world.admin.firestore().doc(`sellers/${uid}`) },
    },
  });
  return world.docs.get(`verifiedCompanies/${uid}`);
}

(async () => {
  const pending = { ...COMPANY, verificationStatus: "pending" };
  const verified = { ...COMPANY, verificationStatus: "verified" };

  // ── 1. Verified with no public phone publishes no phone ─────────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    const pub = await project(w, fns, { before: pending, after: verified });
    if (!pub) { fail("1 verification published no company document at all"); }
    else {
      eq("1 publicPhone is null when none was configured", pub.publicPhone, null);
      if ("phone" in pub) fail("1 the public document carries a `phone` key at all");
      const values = JSON.stringify(pub);
      if (values.includes(COMPANY.phone.replace("+", "")) || values.includes(COMPANY.phone))
        fail(`1 THE LOGIN NUMBER IS PUBLISHED: ${values}`);
      eq("1 the company name is published", pub.companyName, "La Cananeenne");
    }
  }

  // ── 2. Verified WITH a public phone publishes exactly that ──────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    const withPublic = { ...verified, publicPhone: "+2290155000002" };
    const pub = await project(w, fns, { before: { ...pending, publicPhone: "+2290155000002" }, after: withPublic });
    eq("2 the configured number is published", pub.publicPhone, "+2290155000002");
    if (JSON.stringify(pub).includes("0197000001"))
      fail("2 the login number leaked alongside the public one");
  }

  // ── 3. Clearing it removes it from the public document ──────────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    const withPublic = { ...verified, publicPhone: "+2290155000002" };
    await project(w, fns, { before: { ...pending, publicPhone: "+2290155000002" }, after: withPublic });
    eq("3 published first", w.docs.get("verifiedCompanies/c1").publicPhone, "+2290155000002");
    // Same status, publicPhone cleared: projectedChanged must notice.
    const cleared = { ...verified, publicPhone: null };
    const pub = await project(w, fns, { before: withPublic, after: cleared });
    eq("3 clearing the public phone clears it publicly", pub.publicPhone, null);
    if (JSON.stringify(pub).includes("0155000002"))
      fail("3 the old public number is still published — stale public contact data");
  }

  // ── 4. A change to the LOGIN number republishes nothing ─────────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    await project(w, fns, { before: pending, after: verified });
    const movedLogin = { ...verified, phone: "+2290199999999" };
    const pub = await project(w, fns, { before: verified, after: movedLogin });
    if (JSON.stringify(pub ?? {}).includes("0199999999"))
      fail("4 changing the login number published it");
  }

  // ── 5. Verification never manufactures a public phone ───────────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    const pub = await project(w, fns, { before: pending, after: verified });
    eq("5 verification does not create a public phone", pub.publicPhone, null);
    // …and changing the public phone does not touch verification.
    const before = w.docs.get("sellers/c1").verificationStatus;
    await project(w, fns, { before: verified, after: { ...verified, publicPhone: "+2290155000003" } });
    eq("5 verification status is unchanged by a public phone edit",
      w.docs.get("sellers/c1").verificationStatus, before);
    eq("5 and the badge is still verified", w.docs.get("sellers/c1").verificationStatus, "verified");
  }

  // ── 6. Losing verification removes the public document entirely ─────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    await project(w, fns, { before: pending, after: { ...verified, publicPhone: "+2290155000002" } });
    const pub = await project(w, fns, {
      before: { ...verified, publicPhone: "+2290155000002" },
      after: { ...COMPANY, publicPhone: "+2290155000002", verificationStatus: "rejected" },
    });
    eq("6 a rejected company leaves no public record", pub, undefined);
  }

  // ── 7. A legacy public document carrying `phone` is retired ─────────
  //
  // set() without merge is what does this: the next legitimate projection
  // writes the new shape and the old key is gone, with no migration.
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    w.docs.set("verifiedCompanies/c1", {
      companyName: "La Cananeenne", phone: "+2290197000001", verifiedAt: 1,
    });
    const pub = await project(w, fns, { before: verified, after: { ...verified, sector: "retail" } });
    if ("phone" in pub)
      fail("7 a re-projection left the legacy `phone` key in place — the old private number stays published");
    eq("7 and the new shape is written", pub.publicPhone, null);
  }

  // ── 8. The company name never falls back to a person's name ─────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    const noName = { ...verified, companyName: "", fullName: "Stanislas Setondji" };
    const pub = await project(w, fns, { before: { ...pending, companyName: "" }, after: noName });
    if (JSON.stringify(pub).includes("Stanislas"))
      fail("8 a missing company name published the representative's personal name");
    eq("8 it publishes an empty name instead", pub.companyName, "");
  }

  // ── 9. WhatsApp is never inferred from either number ─────────────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    const pub = await project(w, fns, {
      before: pending,
      after: { ...verified, publicPhone: "+2290155000002" },
    });
    if ("whatsapp" in pub)
      fail("9 the projection invented a whatsapp value");
  }
  const fnSrc = stripComments(read("functions/index.js"));
  for (const [pattern, what] of [
    [/whatsapp:\s*[^,\n]*\bpublicPhone\b/, "publicPhone"],
    [/whatsapp:\s*[^,\n]*\bseller\.phone\b/, "the login number"],
    [/publicPhone:\s*[^,\n]*\bseller\.phone\b/, "the login number"],
    [/publicPhone[^\n]*\|\|\s*seller\.phone/, "the login number as a fallback"],
  ]) {
    if (pattern.test(fnSrc)) fail(`a public contact value is derived from ${what}`);
  }

  // ── 10. The other public projection stays contact-free ──────────────
  const syncAt = fnSrc.indexOf("exports.syncSellerPublicProfile");
  const syncBody = syncAt === -1 ? "" : fnSrc.slice(syncAt, syncAt + 900);
  if (!syncBody) fail("could not find syncSellerPublicProfile");
  else for (const field of ["phone", "publicPhone", "whatsapp", "website", "instagram", "facebook", "tiktok"]) {
    if (new RegExp(`\\b${field}\\b`).test(syncBody))
      fail(`sellerStats has gained ${field} — that projection is world-readable and is name and photo only`);
  }

  // ── 11. The company profile screen ──────────────────────────────────
  const url2 = (rel) => require("url").pathToFileURL(path.join(root, rel)).href;
  const { restaurantLinkKinds } = await import(url2("src/data/restaurantLinks.js"));
  // phoneAuth pulls Firebase in, so the normaliser is lifted out of it the
  // same way the payload is: it is the shipped function, not a copy.
  const phoneAuthSrc = read("src/auth/phoneAuth.js");
  const normStart = phoneAuthSrc.indexOf("export function normalizePhone");
  const normEnd = phoneAuthSrc.indexOf("\n}", normStart) + 2;
  if (normStart === -1 || normEnd < 2) fail("could not lift normalizePhone out of phoneAuth.js");
  const normalizePhoneReal = new Function(
    `${phoneAuthSrc.slice(normStart, normEnd).replace("export function", "function")}; return normalizePhone;`,
  )();
  const screen = stripComments(read("src/screens/CompanyProfileEditScreen.js"));
  // ── The save payload, BUILT and inspected ─────────────────────
  //
  // THE PROPERTY IS "no phone key", not "no particular spelling of one".
  // A regex for `phone: phone.trim()` let `phone: publicPhone.trim()`
  // through — the same leak with a different right-hand side — and the next
  // variant would have too. So the object literal is lifted out of the
  // screen and evaluated, and the assertion is made against the keys the
  // save would actually send.
  const rawScreen = read("src/screens/CompanyProfileEditScreen.js");
  const setDocCount = (stripComments(rawScreen).match(/setDoc\(/g) ?? []).length;
  if (setDocCount !== 1)
    fail(`${setDocCount} setDoc call(s) in the company profile screen; this check reads the one save payload and would be looking at the wrong one`);
  const objStart = rawScreen.indexOf("{", rawScreen.indexOf('doc(firestore, "sellers", user.uid),'));
  let depth = 0, objEnd = -1, quote = null;
  for (let i = objStart; i < rawScreen.length; i += 1) {
    const ch = rawScreen[i];
    if (quote) { if (ch === "\\") { i += 1; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (!depth) { objEnd = i + 1; break; } }
  }
  if (objStart === -1 || objEnd === -1) {
    fail("could not lift the profile save payload out of the screen — the rest of this section is not being tested");
  } else {
    const literal = rawScreen.slice(objStart, objEnd);
    // `phone` and `sellerProfile` are bound DELIBERATELY, even though the
    // payload must not use them. Leaving them out would make a payload that
    // reached for the login number fail with "not defined" — a pass for the
    // wrong reason, and one that would stop being a pass the moment
    // somebody bound them. Bound, the same mutation fails on the invariant
    // itself: a `phone` key, or a publicPhone that came back as the
    // account number.
    const ACCOUNT_PHONE = "+2290197000001";
    const buildPayload = (publicPhoneInput) =>
      new Function(
        "publicPhone", "sectorKey", "city", "photoUrl", "links",
        "normalizePhone", "restaurantLinkKinds", "phone", "sellerProfile",
        `return ${literal};`,
      )(
        publicPhoneInput, "food", "Cotonou", "https://example.test/logo.jpg",
        { whatsapp: "", website: "", facebook: "", instagram: "", tiktok: "" },
        // The real normaliser, so what the payload carries is what the app
        // would store.
        normalizePhoneReal, restaurantLinkKinds,
        ACCOUNT_PHONE, { phone: ACCOUNT_PHONE },
      );

    // The invariant, stated once and checked against several inputs so it
    // cannot pass by luck: whatever the company types, the save never
    // carries the sign-in number under any key.
    for (const [label, input] of [
      ["empty", ""],
      ["whitespace", "   "],
      ["a local number", "01 55 00 00 02"],
      ["an international number", "+22890123456"],
      // The nastiest case: the company types their login number on
      // purpose. That is allowed — it is their choice — but it must arrive
      // as publicPhone, never as phone.
      ["the account number typed by hand", ACCOUNT_PHONE],
    ]) {
      let payload;
      try {
        payload = buildPayload(input);
      } catch (error) {
        fail(`the save payload could not be evaluated for ${label}: ${error.message}`);
        continue;
      }
      const keys = Object.keys(payload);
      if (keys.includes("phone"))
        fail(`the profile save writes a \`phone\` key (${label}) — that is the sign-in identity and this screen must not write it under any value or any name`);
      for (const key of keys) {
        if (/^phone$/i.test(key) || (/phone/i.test(key) && key !== "publicPhone"))
          fail(`the profile save writes ${key}, which is not the one public number this screen owns`);
      }
      if (!("publicPhone" in payload))
        fail(`the profile save does not write publicPhone (${label})`);
    }

    // Empty means none. Not "", not the account number.
    eq("an empty public phone saves as null", buildPayload("").publicPhone, null);
    eq("whitespace saves as null", buildPayload("   ").publicPhone, null);
    // Normalised through the existing helper, international preserved.
    eq("a local number is normalised to Benin",
      buildPayload("01 55 00 00 02").publicPhone, "+2290155000002");
    eq("an international number keeps its own country code",
      buildPayload("+22890123456").publicPhone, "+22890123456");
    // And the account number never arrives unless it was typed.
    if (buildPayload("").publicPhone === ACCOUNT_PHONE)
      fail("an empty field produced the account number — publicPhone must never fall back to the sign-in number");
  }
  if (/useState\(\s*sellerProfile\?\.phone/.test(screen))
    fail("a profile field is still seeded from the login number");
  if (/publicPhone[^\n]*sellerProfile\?\.phone/.test(screen))
    fail("publicPhone is seeded from the login number — it must start empty");
  if (!/publicPhone:\s*publicPhone\.trim\(\)/.test(screen))
    fail("CompanyProfileEditScreen does not save publicPhone");
  if (!/normalizePhone\(/.test(screen))
    fail("the public number is stored unnormalised — it must go through the existing normaliser, not a second parser");
  if (!/:\s*null,/.test(screen.slice(screen.indexOf("publicPhone: publicPhone.trim()"), screen.indexOf("publicPhone: publicPhone.trim()") + 140)))
    fail("an empty public phone is not stored as null — empty must mean no public phone");
  // The login number is shown, and shown as private.
  for (const key of ["companyFieldSignInPhone", "companySignInPhoneHint", "companyFieldPublicPhone", "companyPublicPhoneHint"]) {
    if (!screen.includes(key)) fail(`the profile screen does not use ${key}`);
  }
  if (/value=\{phone\}/.test(screen))
    fail("the login number is still an editable input");

  // Both languages, through the real table.
  const babel = require("@babel/core");
  const { code } = babel.transformFileSync(path.join(root, "src/i18n/translations.js"), {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, require);
  const T = mod.exports.translations ?? mod.exports.default ?? mod.exports;
  for (const key of ["companyFieldSignInPhone", "companySignInPhoneKey", "companySignInPhoneHint", "companyFieldPublicPhone", "companyPublicPhoneHint"]) {
    if (key === "companySignInPhoneKey") continue;
    for (const lang of ["en", "fr"]) {
      if (!T?.[lang]?.[key]) fail(`${key} is missing from the ${lang} translations`);
    }
  }
  if (T?.fr?.companySignInPhoneHint && !/Priv/i.test(T.fr.companySignInPhoneHint))
    fail("the French sign-in hint does not say the number is private");
  if (T?.en?.companyPublicPhoneHint && !/customers/i.test(T.en.companyPublicPhoneHint))
    fail("the English public-phone hint does not say who sees it");

  // ── 12. Individuals are untouched ───────────────────────────────────
  {
    const w = makeWorld();
    const fns = loadFunctions(w);
    const individual = { accountType: "individual", fullName: "Stanislas", phone: "+2290197000009", verificationStatus: "verified" };
    const pub = await project(w, fns, { before: { ...individual, verificationStatus: "pending" }, after: individual, uid: "i1" });
    eq("12 an individual gets no public company record", pub, undefined);
  }

  // ── 13. The listing's own contact values stay authoritative ─────────
  //
  // This section used to forbid the publish form mentioning publicPhone at
  // all, on the grounds that listing inheritance was a later phase. That
  // phase has since landed, and the form now offers a company its profile
  // details as an authoring convenience. The old assertion still passed —
  // by luck, because the form reaches the profile through a helper rather
  // than by naming the field — which is a check passing for the wrong
  // reason, and worth replacing rather than leaving.
  //
  // What must still hold is narrower and more important: the listing keeps
  // writing its OWN flat phone, and nothing in the form reaches for the
  // sign-in number.
  const form = stripComments(read("src/screens/CreateListingScreen.js"));
  if (!/phone: phone\.trim\(\)/.test(form))
    fail("the publish form no longer writes its own listing phone");
  if (/sellerProfile\??\.\??phone\b/.test(form))
    fail("the publish form reads sellerProfile.phone — that is the sign-in identity and no listing may carry it");
  // scripts/check-profile-contact.js owns the rest of that boundary.

  if (failures) process.exit(1);
  console.log(
    "clean: public phone — the sign-in number is never projected, an " +
      "unconfigured company publishes none, clearing one removes it, " +
      "verification neither creates nor is created by it, WhatsApp is not " +
      "inferred, sellerStats stays name-and-photo, and listings are untouched",
  );
})().catch((error) => {
  console.error(`FAIL the checker itself threw: ${error.stack}`);
  process.exit(1);
});
