#!/usr/bin/env node
//
// Contact links: where they may point, and who gets shown them.
//
// Three defects, each of which shipped:
//
//   THE DISGUISED LINK. buildLinkUrl returned any value beginning http(s)
//   unchanged, so an Instagram glyph could open anywhere its seller liked,
//   and a bare value with a dot in it became "https://<that>". The icon is
//   the claim; the target was the seller's to choose. Everything else
//   reaching Linking.openURL from a seller-typed field has the same shape.
//
//   THE STOLEN COUNTRY CODE. WhatsApp resolution did
//   `digits.startsWith('229') ? digits : '229' + digits`, so +228 90 12 34 56
//   became wa.me/22922890123456 — a real number, belonging to somebody else.
//   Every non-Benin number was silently rewritten.
//
//   THE CHANNEL COLLECTED AND NEVER SHOWN. The publish form asks a tyre or
//   battery shop for area, hours, phone and five links; ProductDetail gated
//   the display on `isRestaurant || services`. The seller filled them in for
//   nobody.
//
// The link assertions RUN buildLinkUrl. The display assertions cannot —
// ProductDetail is a component — so they read the two gates and assert they
// agree with the form's, which is the property that broke.
//
// Run: node scripts/check-contact-links.js
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

(async () => {
  const url = (rel) => require("url").pathToFileURL(path.join(root, rel)).href;
  const { buildLinkUrl, restaurantLinkKinds } = await import(url("src/data/restaurantLinks.js"));
  const { POSTING_DIAL } = await import(url("src/data/countries.js"));
  if (typeof buildLinkUrl !== "function") { fail("buildLinkUrl is gone"); process.exit(1); }

  const SOCIALS = ["facebook", "instagram", "tiktok"];
  const ALL = restaurantLinkKinds.map((k) => k.key);
  eq("the channels", ALL, ["whatsapp", "website", "facebook", "instagram", "tiktok"]);

  // ── 1. Nothing but http(s) ever reaches Linking.openURL ──────────────
  //
  // Run against EVERY kind, because a scheme rejected for Instagram and
  // accepted for Website is still a scheme this app opens.
  const HOSTILE = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "intent://evil#Intent;scheme=http;end",
    "content://com.evil/x",
    "vbscript:msgbox(1)",
    "mailto:someone@example.com",
    "tel:+22900000000",
    "about:blank",
    "//evil.example/phish",
    "https://user:pass@evil.example",
    "https://user@evil.example",
    "https://evil.example\u0000.instagram.com",
    "https://evil.example/‮gnp.exe",
    "https://exemple.bj/\u0009x",
    `https://exemple.bj/${"a".repeat(400)}`,
    "a".repeat(400),
    // Just under the cap as a handle, just over it once the scheme is
    // prepended. The only input the two length checks disagree about, so
    // it is the only one that proves the second is load-bearing.
    `${"a".repeat(291)}.bj`,
  ];
  for (const kind of ALL) {
    for (const value of HOSTILE) {
      const out = buildLinkUrl(kind, value);
      if (out !== null)
        fail(`${kind}: hostile input ${JSON.stringify(value.slice(0, 48))} resolved to ${JSON.stringify(out)}`);
    }
  }
  // Whatever any input produces, it is null or a web URL. Belt and braces
  // over the list above, which can only ever be the cases somebody thought of.
  const CORPUS = [...HOSTILE, "@resto", "resto", "exemple.bj", "instagram.com/resto",
    "https://instagram.com/resto", "01 23 45 67 89", "+22890123456", "", "   ", "@", "///"];
  for (const kind of ALL) {
    for (const value of CORPUS) {
      const out = buildLinkUrl(kind, value);
      if (out !== null && !/^https?:\/\//.test(out))
        fail(`${kind}: ${JSON.stringify(value.slice(0, 32))} produced a non-web URL ${JSON.stringify(out)}`);
      if (typeof out === "string" && /[\u0000- \u007f-\u009f‪-‮]/.test(out))
        fail(`${kind}: output carries a control or bidi character`);
    }
  }

  // ── 2. A branded glyph points at its own brand ───────────────────────
  const WRONG_HOST = [
    "https://evil.example/resto",
    "https://instagram.com.evil.example/resto",
    "https://notinstagram.com/resto",
    "https://facebook.com.evil.example/x",
  ];
  for (const kind of SOCIALS) {
    for (const value of WRONG_HOST) {
      const out = buildLinkUrl(kind, value);
      if (out !== null)
        fail(`${kind}: a link to another host resolved (${JSON.stringify(value)} -> ${JSON.stringify(out)}) — the icon is a claim about where it goes`);
    }
  }
  // A website may be any host. That is what the field means.
  eq("website accepts any host",
    buildLinkUrl("website", "https://anything.example/page"),
    "https://anything.example/page");

  // ── 3. Valid input, including everything already stored ──────────────
  const VALID = [
    ["instagram", "@resto", "https://instagram.com/resto"],
    ["instagram", "resto", "https://instagram.com/resto"],
    ["instagram", "instagram.com/resto", "https://instagram.com/resto"],
    ["instagram", "https://instagram.com/resto", "https://instagram.com/resto"],
    ["instagram", "https://www.instagram.com/resto", "https://www.instagram.com/resto"],
    ["instagram", "https://m.instagram.com/resto", "https://m.instagram.com/resto"],
    ["facebook", "MonResto", "https://facebook.com/MonResto"],
    ["facebook", "https://www.facebook.com/MonResto", "https://www.facebook.com/MonResto"],
    ["facebook", "https://fb.me/MonResto", "https://fb.me/MonResto"],
    ["tiktok", "@monresto", "https://tiktok.com/@monresto"],
    ["tiktok", "https://vm.tiktok.com/ZM123/", "https://vm.tiktok.com/ZM123/"],
    ["website", "exemple.bj", "https://exemple.bj"],
    ["website", "www.exemple.bj", "https://www.exemple.bj"],
    ["website", "https://exemple.bj/menu", "https://exemple.bj/menu"],
    // A business whose site has never had a certificate is a real thing;
    // refusing it breaks a working listing for no security gain.
    ["website", "http://exemple.bj", "http://exemple.bj"],
    ["website", "pasdepoint", null],
  ];
  for (const [kind, input, expected] of VALID)
    eq(`${kind} ${JSON.stringify(input)}`, buildLinkUrl(kind, input), expected);

  // ── 4. WhatsApp keeps the number it was given ────────────────────────
  const dial = POSTING_DIAL.replace(/\D/g, "");
  eq("the posting dial code", dial, "229");
  const WA = [
    // Benin, written the local way — the commonest stored value.
    ["01 23 45 67 89", `https://wa.me/${dial}0123456789`],
    ["0123456789", `https://wa.me/${dial}0123456789`],
    // Benin, already international, with and without the plus. Both are
    // legacy shapes and both must resolve exactly as they did before.
    ["+2290123456789", "https://wa.me/2290123456789"],
    ["2290123456789", "https://wa.me/2290123456789"],
    ["+229 01 23 45 67 89", "https://wa.me/2290123456789"],
    // NOT Benin. These were being rewritten into Benin numbers.
    ["+22890123456", "https://wa.me/22890123456"],
    ["+228 90 12 34 56", "https://wa.me/22890123456"],
    ["+33612345678", "https://wa.me/33612345678"],
    ["+2348012345678", "https://wa.me/2348012345678"],
    ["+15551234567", "https://wa.me/15551234567"],
    // Not numbers.
    ["12345", null],
    ["", null],
    ["abc", null],
    [`+${"9".repeat(20)}`, null],
  ];
  for (const [input, expected] of WA)
    eq(`whatsapp ${JSON.stringify(input)}`, buildLinkUrl("whatsapp", input), expected);
  // The defect, stated as a rule: an international number never acquires a
  // second country code.
  for (const [input] of WA) {
    const out = buildLinkUrl("whatsapp", input);
    if (out && /wa\.me\/229\d*229/.test(out))
      fail(`whatsapp ${JSON.stringify(input)} produced a doubled country code: ${out}`);
    if (out && String(input).trim().startsWith("+") && !out.includes(String(input).replace(/\D/g, "")))
      fail(`whatsapp ${JSON.stringify(input)} did not keep the number it was given: ${out}`);
  }
  // And it is never a stored URL: the link is built at open time.
  if (/wa\.me/.test(stripComments(read("src/screens/CreateListingScreen.js"))))
    fail("the publish form writes a wa.me URL — WhatsApp is stored as a number and linked at open time");

  // ── 5. Everyone asked for channels is shown them ─────────────────────
  const form = stripComments(read("src/screens/CreateListingScreen.js"));
  const detail = stripComments(read("src/screens/ProductDetailScreen.js"));
  if (!/\{isRestaurant \|\| isServices \|\| isPartOffer \? \(/.test(form))
    fail("the publish form's contact block is no longer gated on isRestaurant || isServices || isPartOffer — this checker is comparing against the wrong gate");
  if (!/const isPartOffer = isVehicle && \(isTyre \|\| isBattery\);/.test(detail))
    fail("ProductDetail no longer derives isPartOffer");
  const gate = detail.match(/const showsContactChannels =\s*([^;]+);/);
  if (!gate) fail("ProductDetail no longer has a showsContactChannels gate");
  else {
    const expr = gate[1].replace(/\s+/g, " ").trim();
    eq("the display gate matches the form's",
      expr, 'isRestaurant || listing.categoryKey === "services" || isPartOffer');
  }
  // Both channel computations read the new gate, not the card's gate.
  for (const name of ["whatsappUrl", "restaurantLinks"]) {
    if (!new RegExp(`const ${name} = showsContactChannels`).test(detail))
      fail(`${name} is not computed from showsContactChannels, so part offers would still resolve to nothing`);
  }
  // THE TRAP: isTrade also selects the trade PRICE CARD, and the cards are
  // one mutually exclusive chain. Widening it moves a tyre listing onto a
  // card that prints no price.
  const trade = detail.match(/const isTrade = ([^;]+);/);
  if (!trade) fail("isTrade is gone");
  else if (/isPartOffer/.test(trade[1]))
    fail("isPartOffer has been folded into isTrade — that moves tyre and battery listings onto the trade price card, which prints no price");

  // One element, two render sites, so the two cannot drift apart.
  if (!/const contactChannels = \(/.test(detail))
    fail("the contact channels are no longer one shared element");
  const rendered = (detail.match(/\{contactChannels\}/g) ?? []).length
    + (detail.match(/\{isPartOffer \? contactChannels : null\}/g) ?? []).length;
  if (rendered !== 2)
    fail(`the contact channels render at ${rendered} site(s); expected 2 — the trade card, and part offers beside their price row`);
  if (!/\{isPartOffer \? contactChannels : null\}/.test(detail))
    fail("part offers still have no render site for their contact channels");
  // Rendering them twice for a restaurant would put two WhatsApp buttons on
  // one listing.
  if (/\{showsContactChannels \? contactChannels/.test(detail))
    fail("the second render site is gated on showsContactChannels, so a restaurant would render the channels twice");

  // ── 6. Still stored as typed, still not indexed ──────────────────────
  for (const [file, label] of [
    ["src/utils/searchTokens.js", "the client search index"],
    ["functions/searchTokens.js", "the server search index"],
  ]) {
    const src = stripComments(read(file));
    for (const field of ["whatsapp", "website", "facebook", "instagram", "tiktok", "phone"])
      if (new RegExp(`listing\\??\\.${field}\\b`).test(src))
        fail(`${label} reads listing.${field} — contact details must not become search material`);
  }

  if (failures) process.exit(1);
  console.log(
    `clean: contact links — ${HOSTILE.length} hostile inputs rejected across ` +
      `${ALL.length} channels, branded glyphs pinned to their own hosts, ` +
      `WhatsApp keeps international numbers intact (+228/+33/+234/+1) and ` +
      `still assumes ${POSTING_DIAL} only for a local one, part offers show ` +
      `the channels they were asked for without losing their price`,
  );
})().catch((error) => {
  console.error(`FAIL the checker itself threw: ${error.stack}`);
  process.exit(1);
});
