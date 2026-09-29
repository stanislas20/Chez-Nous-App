#!/usr/bin/env node
//
// A company's profile details reach a listing only because somebody asked.
//
// This is a convenience, and conveniences are how private data escapes. The
// failures it guards are all the same shape — a value that moves without a
// decision behind it:
//
//   THE WRONG PHONE. sellerProfile.phone is the number the account signs in
//   with; phoneToPseudoEmail turns it into the Firebase Auth identity.
//   publicPhone is the one a company typed knowing customers would see it.
//   Copying the first would publish a credential, and the two sit one
//   letter apart in the same object.
//
//   THE DEFAULT THAT IS ON. A checkbox that starts ticked is not consent,
//   it is a pre-filled form somebody pressed past.
//
//   THE SILENT REFRESH. If opening an edit re-read the profile, a number
//   changed last month would rewrite a listing that has been live since,
//   and the seller would never see it happen.
//
//   THE MODE THAT DECIDES DISPLAY. contactSource is authoring metadata. The
//   moment ProductDetail reads it, a listing's public contact depends on
//   how it was typed rather than on what it says.
//
// The helper is RUN here; the wiring is read, because it lives inside a
// 10,000-line component. Where it is read, it is read for the property
// rather than for a spelling.
//
// Run: node scripts/check-profile-contact.js
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

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };
const eq = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const ACCOUNT_PHONE = "+2290197000001";
const PUBLIC_PHONE = "+2290155000002";

(async () => {
  // Purity first, and before the import: a helper that has grown a Firebase
  // dependency would otherwise fail with a module-resolution error, which
  // reads as "the checker is broken" rather than "the helper reached for
  // the network".
  const helperCode = stripComments(read("src/utils/profileContact.js"));
  if (/\.phone\b/.test(helperCode))
    fail("the helper reads a `.phone` property — publicPhone is the only phone it may touch");
  if (/firebase|firestore/i.test(helperCode))
    fail("the helper has acquired a Firebase dependency; it is a pure mapping");
  if (failures) process.exit(1);

  const url = (rel) => require("url").pathToFileURL(path.join(root, rel)).href;
  const { profileContactDefaults, hasProfileContact } =
    await import(url("src/utils/profileContact.js"));
  const { restaurantLinkKinds } = await import(url("src/data/restaurantLinks.js"));

  // ── 1. The helper reads publicPhone and never phone ─────────────────
  const COMPANY = {
    accountType: "company",
    phone: ACCOUNT_PHONE,              // the login key
    publicPhone: PUBLIC_PHONE,         // the one they chose to publish
    whatsapp: "0155000003",
    website: "lacananeenne.bj",
    instagram: "@laCananeenne",
    facebook: "",
    tiktok: null,
  };
  const defaults = profileContactDefaults(COMPANY);
  eq("1 the phone default is publicPhone", defaults.phone, PUBLIC_PHONE);
  if (JSON.stringify(defaults).includes(ACCOUNT_PHONE.replace("+", "")))
    fail("1 THE SIGN-IN NUMBER IS IN THE DEFAULTS");
  // Even when publicPhone is absent, phone must not stand in for it.
  const noPublic = profileContactDefaults({ ...COMPANY, publicPhone: undefined });
  eq("1 no publicPhone means no phone default", noPublic.phone, "");
  if (JSON.stringify(noPublic).includes("0197000001"))
    fail("1 the sign-in number filled in for a missing public one");
  for (const shape of [null, undefined, {}, "x", 7, { phone: ACCOUNT_PHONE }]) {
    const out = profileContactDefaults(shape);
    if (JSON.stringify(out).includes("0197000001"))
      fail(`1 the sign-in number leaked for input ${JSON.stringify(shape)}`);
    if (typeof out.phone !== "string") fail("1 the phone default is not a string");
  }

  // ── 2. Channels come from the shared taxonomy, cleaned ──────────────
  eq("2 every channel is offered",
    Object.keys(defaults.links).sort(),
    restaurantLinkKinds.map((k) => k.key).sort());
  eq("2 an unset channel is empty, not absent", defaults.links.tiktok, "");
  eq("2 a blank channel stays blank", defaults.links.facebook, "");
  eq("2 a configured channel comes through", defaults.links.instagram, "@laCananeenne");
  eq("2 whitespace is trimmed",
    profileContactDefaults({ website: "  site.bj  " }).links.website, "site.bj");
  for (const bad of [42, true, {}, [], null]) {
    eq(`2 a ${typeof bad} channel is dropped`,
      profileContactDefaults({ instagram: bad }).links.instagram, "");
  }

  // ── 3. WhatsApp is never the public phone ───────────────────────────
  eq("3 whatsapp comes from whatsapp", defaults.links.whatsapp, "0155000003");
  const onlyPhone = profileContactDefaults({ publicPhone: PUBLIC_PHONE });
  eq("3 a company with only a public phone gets no whatsapp", onlyPhone.links.whatsapp, "");
  if (onlyPhone.links.whatsapp === PUBLIC_PHONE)
    fail("3 whatsapp was filled from the public phone");

  // ── 4. Nothing to offer means no offer ──────────────────────────────
  eq("4 a profile with only the sign-in number offers nothing",
    hasProfileContact({ phone: ACCOUNT_PHONE }), false);
  eq("4 an empty profile offers nothing", hasProfileContact({}), false);
  eq("4 no profile offers nothing", hasProfileContact(undefined), false);
  eq("4 a public phone alone is enough",
    hasProfileContact({ publicPhone: PUBLIC_PHONE }), true);
  eq("4 one social channel alone is enough",
    hasProfileContact({ instagram: "@x" }), true);
  eq("4 blanks are not enough",
    hasProfileContact({ publicPhone: "  ", instagram: "" }), false);

  // ── 5. The form: eligibility, default off, one copy path ────────────
  const rawForm = read("src/screens/CreateListingScreen.js");
  const form = stripComments(rawForm);

  const gate = form.match(/const canUseProfileContact =\s*([^;]+);/);
  if (!gate) fail("5 the form has no canUseProfileContact gate");
  else {
    const expr = gate[1].replace(/\s+/g, " ").trim();
    if (!/sellerProfile\?\.accountType === "company"/.test(expr))
      fail("5 the profile-defaults control is not company-only — an individual would be offered it");
    if (!/isRestaurant \|\| isServices \|\| isPartOffer/.test(expr))
      fail("5 eligibility does not match the four types that already collect contact — this phase adds contact to no category");
    if (!/hasProfileContact\(sellerProfile\)/.test(expr))
      fail("5 the control is offered even when the profile has nothing configured");
    if (/verif/i.test(expr))
      fail("5 eligibility depends on verification — a business owns its phone number whether or not it has a badge");
  }

  // Default OFF: the state starts as "custom" and only a tap changes it.
  if (!/useState\(\s*seed\("contactSource", "custom"\)/.test(form.replace(/\s+/g, " ")))
    fail('5 contactSource does not default to "custom" — absent must read as custom and nothing may start inherited');
  // Exactly one function copies, and it is called only from a press.
  const applyCount = (form.match(/const applyProfileContact = \(\) =>/g) ?? []).length;
  if (applyCount !== 1) fail(`5 ${applyCount} copy paths; expected exactly 1`);
  // Counted as REFERENCES, not as calls with parentheses: one site invokes
  // it from a ternary and the other hands it to onPress bare, and requiring
  // one spelling would have missed the other.
  const refs = (form.match(/\bapplyProfileContact\b/g) ?? []).length - 1;
  if (refs < 2)
    fail(`5 the copy action is wired to ${refs} control(s); expected the tick and the explicit refresh`);
  // It must not run from an effect — that is a silent copy.
  if (/useEffect\([^)]*applyProfileContact/.test(form) ||
      /applyProfileContact\(\);\s*\}, \[/.test(form))
    fail("5 the copy runs from an effect — profile details must move only on a tap");

  // ── 5b. The toggle, DRIVEN ──────────────────────────────────
  //
  // Reading the handler tells you it calls setContactSource("custom") and
  // nothing else. It does not tell you what a seller ends up with after
  // ON, an edit, and OFF — which is the sequence that decides whether this
  // feature can destroy somebody's work.
  //
  // So the real handler and the real copy action are lifted out of the
  // screen and run against a tracked state. Turning the tick OFF must
  // change one thing: who the details are said to belong to. It must not
  // clear a field, and it must not put back a value the seller replaced.
  const applyAt = rawForm.indexOf("const applyProfileContact = () => {");
  const applyEnd = rawForm.indexOf("\n  };", applyAt);
  const applySrc = applyAt === -1 || applyEnd === -1 ? "" : rawForm.slice(applyAt, applyEnd + 5);
  const pressAt = rawForm.indexOf("onPress={() =>", rawForm.indexOf("canUseProfileContact ? ("));
  let toggleSrc = "";
  if (pressAt !== -1) {
    let depth = 0;
    for (let i = rawForm.indexOf("{", pressAt); i < rawForm.length; i += 1) {
      if (rawForm[i] === "{") depth += 1;
      else if (rawForm[i] === "}") {
        depth -= 1;
        if (!depth) { toggleSrc = rawForm.slice(rawForm.indexOf("{", pressAt) + 1, i); break; }
      }
    }
  }
  if (!applySrc || !toggleSrc) {
    fail("5b could not lift the toggle or the copy action out of the form — the transition is not being tested");
  } else {
    const PROFILE = {
      accountType: "company",
      phone: ACCOUNT_PHONE,
      publicPhone: PUBLIC_PHONE,
      whatsapp: "0155000003",
      website: "lacananeenne.bj",
      instagram: "@laCananeenne",
      facebook: "",
      tiktok: "",
    };
    const blankLinks = () =>
      Object.fromEntries(restaurantLinkKinds.map((k) => [k.key, ""]));

    const makeForm = (initial) => {
      const state = {
        phone: initial.phone,
        links: { ...initial.links },
        contactSource: initial.contactSource,
      };
      const setPhone = (v) => { state.phone = typeof v === "function" ? v(state.phone) : v; };
      const setLinks = (v) => { state.links = typeof v === "function" ? v(state.links) : v; };
      const setContactSource = (v) => {
        state.contactSource = typeof v === "function" ? v(state.contactSource) : v;
      };
      const profileContact = profileContactDefaults(PROFILE);
      // sellerProfile and the setters are bound DELIBERATELY, even though
      // neither the copy action nor the toggle should reach for them the
      // wrong way. Leaving them out means a version that clears fields on
      // OFF, or copies the sign-in number, fails with "not defined" — a
      // pass for the wrong reason, and one that stops being a pass the
      // moment somebody binds them. Bound, those versions fail on the
      // invariant instead.
      const bindings = {
        setPhone, setLinks, setContactSource, profileContact,
        restaurantLinkKinds, sellerProfile: PROFILE,
      };
      const names = Object.keys(bindings);
      const values = names.map((n) => bindings[n]);
      const applyProfileContact = new Function(
        ...names,
        `${applySrc} return applyProfileContact;`,
      )(...values);
      // Rebuilt on every press so `contactSource` is read fresh, the way a
      // re-rendered component closes over the current value.
      const press = () =>
        new Function(
          ...names, "contactSource", "applyProfileContact",
          `return (${toggleSrc});`,
        )(...values, state.contactSource, applyProfileContact)();
      return { state, press, setPhone, setLinks };
    };

    // ── OFF -> ON -> edit -> OFF -> publish ───────────────────────────
    const f = makeForm({ phone: "", links: blankLinks(), contactSource: "custom" });
    eq("5b starts off", f.state.contactSource, "custom");
    eq("5b starts empty", f.state.phone, "");

    f.press(); // ON
    eq("5b ON copies the public phone", f.state.phone, PUBLIC_PHONE);
    eq("5b ON copies whatsapp", f.state.links.whatsapp, "0155000003");
    eq("5b ON copies instagram", f.state.links.instagram, "@laCananeenne");
    eq("5b ON leaves an unconfigured channel empty", f.state.links.tiktok, "");
    eq("5b ON marks the source", f.state.contactSource, "profile");
    if (f.state.phone === ACCOUNT_PHONE) fail("5b ON copied the sign-in number");

    // The seller corrects one number and removes one channel.
    f.setPhone("+2290166000009");
    f.setLinks((prev) => ({ ...prev, instagram: "" }));
    eq("5b editing after ON keeps the source", f.state.contactSource, "profile");

    const beforeOff = JSON.parse(JSON.stringify({ phone: f.state.phone, links: f.state.links }));
    f.press(); // OFF
    eq("5b OFF does not clear the phone", f.state.phone, beforeOff.phone);
    eq("5b OFF does not clear the links", f.state.links, beforeOff.links);
    eq("5b OFF does not restore the replaced number", f.state.phone, "+2290166000009");
    eq("5b OFF does not bring the cleared channel back", f.state.links.instagram, "");
    eq("5b OFF makes the details the seller's own", f.state.contactSource, "custom");

    // Publish stores exactly what is on screen.
    const published = {
      phone: f.state.phone,
      ...Object.fromEntries(
        restaurantLinkKinds.map((k) => [k.key, f.state.links[k.key]?.trim() || null]),
      ),
      contactSource: f.state.contactSource,
    };
    eq("5b publishes the edited phone", published.phone, "+2290166000009");
    eq("5b publishes the cleared channel as null", published.instagram, null);
    eq("5b publishes the kept channel", published.website, "lacananeenne.bj");
    eq("5b publishes the source", published.contactSource, "custom");

    // Reopening the edit seeds from the STORED values, never the profile —
    // and the profile has since moved on.
    const MOVED_ON = { ...PROFILE, publicPhone: "+2290177000077", instagram: "@nouveau" };
    const reopened = makeForm({
      phone: published.phone,
      links: Object.fromEntries(
        restaurantLinkKinds.map((k) => [k.key, published[k.key] ?? ""]),
      ),
      contactSource: published.contactSource,
    });
    eq("5b reopening shows the stored phone", reopened.state.phone, "+2290166000009");
    eq("5b reopening keeps the channel cleared", reopened.state.links.instagram, "");
    eq("5b reopening keeps the source", reopened.state.contactSource, "custom");
    if (reopened.state.phone === profileContactDefaults(MOVED_ON).phone)
      fail("5b reopening adopted the profile's newer number — an edit must never refresh itself");

    // ── OFF -> ON -> OFF, untouched ───────────────────────────────────
    const g = makeForm({ phone: "", links: blankLinks(), contactSource: "custom" });
    g.press();
    const copied = JSON.parse(JSON.stringify({ phone: g.state.phone, links: g.state.links }));
    g.press();
    eq("5b ON then OFF keeps the copied phone", g.state.phone, copied.phone);
    eq("5b ON then OFF keeps the copied links", g.state.links, copied.links);
    eq("5b ON then OFF erases nothing", g.state.phone, PUBLIC_PHONE);
    eq("5b ON then OFF marks them the seller's own", g.state.contactSource, "custom");

    // ── ON -> OFF -> ON takes the profile again ───────────────────────
    g.setPhone("+2290111111111");
    g.press();
    eq("5b turning it back ON re-copies", g.state.phone, PUBLIC_PHONE);
    eq("5b and marks the source again", g.state.contactSource, "profile");
  }

  // ── 6. Edit never refreshes by itself ───────────────────────────────
  // Every contact input still seeds from the listing, not the profile.
  if (!/seedText\(kind\.key, ""\)/.test(form))
    fail("6 the link inputs no longer seed from the stored listing values");
  if (!/seedText\("phone", ""\)/.test(form))
    fail("6 the phone input no longer seeds from the stored listing value");
  if (/useState\([^)]*profileContact\.phone/.test(form) ||
      /useState\(\s*profileContactDefaults/.test(form))
    fail("6 a contact input is seeded from the profile — opening an edit would silently adopt the current profile");

  // ── 7. contactSource is authoring metadata only ─────────────────────
  if (!/^\s*contactSource,$/m.test(form))
    fail("7 the payload does not write contactSource");
  // Never derived by comparing values against the profile.
  if (/contactSource\s*=\s*[^;]*===\s*profileContact/.test(form))
    fail("7 contactSource is derived by comparison — it records how the values were first filled in, not whether they still match");
  const detail = stripComments(read("src/screens/ProductDetailScreen.js"));
  if (/contactSource/.test(detail))
    fail("7 ProductDetail reads contactSource — what a buyer sees must not depend on how the seller typed it");
  // Scoped to CODE, not to the file: "sellerProfileActiveListings" is a
  // translation key on the seller card and has nothing to do with contact.
  // A blanket substring match failed on it, which would have taught the
  // next reader to loosen the rule rather than aim it.
  for (const [pattern, what] of [
    [/\bprofileContactDefaults\b|\bhasProfileContact\b/, "the profile-contact helper"],
    [/\bpublicPhone\b/, "publicPhone"],
    [/sellerProfile\??\.\??[a-z]/i, "the seller's profile document"],
  ]) {
    if (pattern.test(detail))
      fail(`7 ProductDetail reaches for ${what} — the listing's own fields are the public values`);
  }
  // The six public values on the detail screen are still the listing's.
  if (!/buildLinkUrl\(kind\.key, listing\[kind\.key\]\)/.test(detail))
    fail("7 ProductDetail no longer resolves channels from the listing");

  // ── 8. No server-side fan-out ───────────────────────────────────────
  const fns = stripComments(read("functions/index.js"));
  if (/contactSource/.test(fns))
    fail("8 a Cloud Function reads contactSource — profile-to-listing fan-out is not part of this");
  for (const field of ["publicPhone", "whatsapp", "website", "instagram", "facebook", "tiktok"]) {
    if (new RegExp(`listing[^\\n]*\\b${field}\\b|\\b${field}\\b[^\\n]*listing`).test(fns))
      fail(`8 a Cloud Function moves ${field} between a profile and a listing`);
  }

  // ── 9. Both languages ───────────────────────────────────────────────
  const babel = require("@babel/core");
  const { code } = babel.transformFileSync(path.join(root, "src/i18n/translations.js"), {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, require);
  const T = mod.exports.translations ?? mod.exports.default ?? mod.exports;
  for (const key of ["sellUseProfileContact", "sellContactFromProfile", "sellUpdateFromProfile"]) {
    for (const lang of ["en", "fr"]) {
      if (!T?.[lang]?.[key]) fail(`9 ${key} is missing from the ${lang} translations`);
    }
    if (!form.includes(key)) fail(`9 the form does not use ${key}`);
  }

  // ── 10. No new collection, index, rule or projection ────────────────
  const rules = read("firestore.rules");
  if (/contactSource/.test(rules))
    fail("10 firestore.rules mentions contactSource — it is the seller's own authoring choice and needs no rule");
  const indexes = read("firestore.indexes.json");
  if (/contactSource|publicPhone/.test(indexes))
    fail("10 an index was added for a field nothing queries");

  if (failures) process.exit(1);
  console.log(
    "clean: profile contact — publicPhone is the only phone offered, the " +
      "sign-in number is unreachable, the control is company-only and off " +
      "by default, nothing copies without a tap, an edit never refreshes " +
      "itself, and contactSource decides nothing a buyer sees",
  );
})().catch((error) => {
  console.error(`FAIL the checker itself threw: ${error.stack}`);
  process.exit(1);
});
