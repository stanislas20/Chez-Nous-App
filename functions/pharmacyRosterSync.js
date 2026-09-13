// Weekly automation for the ONPB "tour de garde" pharmacy roster sync.
//
// This does NOT write directly to the live `listings` collection. It only
// fetches the newest roster post per region, has a vision model transcribe
// it, and writes the result to `pharmacyRosterDrafts` as a *draft* pending
// human review — someone still has to compare the draft against the real
// source image and run chez-nous-pharmacy-sync/apply-draft.js before it
// reaches production. See chez-nous-pharmacy-sync/README.md for why: these
// are photographed tables, not machine-readable text, and ONPB's own site
// has been observed to miscategorize posts (a Littoral-tagged post that was
// actually that week's Ouémé/Plateau roster), so nothing here is trusted
// blindly.
//
// Neither `pharmacyRosterDrafts` nor `pharmacyRosterState` nor `appConfig`
// have any Firestore rules granting client access — they're written and
// read only via the Admin SDK (this function, and the local review script),
// so Firestore's default-deny covers them with no rule changes needed.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { recordNotification } = require("./recordNotification");

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// The 5 ONPB "tour de garde" region categories — confirmed live URLs, not
// guessed (each returns HTTP 200 and contains real weekly roster posts).
// `postingRegion` is only used for logging/state-keying; the actual
// per-pharmacy `department` used by the app comes from what the model reads
// inside the image itself (a single post can cover several sub-departments,
// e.g. one Zou/Collines/Mono/Couffo post lists pharmacies tagged with all
// four individually).
const REGIONS = [
  {
    postingRegion: "Littoral",
    departments: ["Littoral"],
    categoryUrl: "https://onpb.bj/category/tour-de-garde/littoral/",
  },
  {
    postingRegion: "Atlantique",
    departments: ["Atlantique"],
    categoryUrl: "https://onpb.bj/category/tour-de-garde/atlantique/",
  },
  {
    postingRegion: "Oueme-Plateau",
    departments: ["Ouémé", "Plateau"],
    categoryUrl: "https://onpb.bj/category/tour-de-garde/oueme-plateau/",
  },
  {
    postingRegion: "Zou-Collines-Mono-Couffo",
    departments: ["Zou", "Collines", "Mono", "Couffo"],
    categoryUrl:
      "https://onpb.bj/category/tour-de-garde/zou-collines-mono-couffo/",
  },
  {
    postingRegion: "Atacora-Donga-Borgou-Alibori",
    departments: ["Atacora", "Donga", "Borgou", "Alibori"],
    categoryUrl:
      "https://onpb.bj/category/tour-de-garde/atacora-donga-borgou-alibori/",
  },
];

const FRENCH_MONTHS = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};
const DATE_RANGE_RE =
  /(\d{1,2})\s*(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s*(\d{4})/gi;

// A bare "ChezNousPharmacySync" UA gets a 403 from the site's WAF — a
// standard browser UA string does not, so use that instead.
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// Pulls the last "DD MOIS YYYY" occurrence out of a date-range string (e.g.
// "DU 27 JUILLET AU 02 AOUT 2026" -> 2026-08-02) — the *last* match is
// always the end date regardless of how the start date is abbreviated
// (single- vs cross-month ranges are formatted inconsistently on the site).
function parseWeekEndDate(text) {
  if (!text) return null;
  const matches = [...text.matchAll(DATE_RANGE_RE)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const day = parseInt(last[1], 10);
  const month = FRENCH_MONTHS[last[2].toLowerCase()];
  const year = parseInt(last[3], 10);
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year))
    return null;
  // 23:59:59 Africa/Porto-Novo (UTC+1), matching the manual routine's
  // documented convention for dutyUntil.
  return new Date(Date.UTC(year, month, day, 22, 59, 59));
}

// Is this post an older roster resurfacing?
//
// "Newest" is a position on a page, not a date: fetchLatestPost takes the
// first programme-de-garde link in the archive HTML, and nothing on that page
// is machine-readable enough to check. A pinned post, a reordered archive, or
// an old post edited and bumped would all hand us a roster from a period that
// has already ended, and the URL test would call it new because the URL is
// one we have never seen.
//
// The post title carries its own dates — "DU 03 AOUT AU 09 AOUT 2026" — and
// parsing it costs nothing and happens before the paid vision call. So the
// rule is simply: a window that ends strictly BEFORE the one we already hold
// is the past, and the past is not news.
//
// The margin is not slack, it is the two dates being measured off different
// rulers, and the site itself is the reason.
//
// heldDutyUntil comes from the roster IMAGE, transcribed by the vision model.
// The incoming date comes from the post TITLE, and on ONPB those disagree.
// The live Littoral post is titled "DU 03 AU 08 Aout 2026" while the table
// photographed inside it is headed "DU 03 AOUT AU 09 AOUT 2026" — one day
// apart, which is why this file already carries a dateMismatchWithTitle
// warning for the reviewer.
//
// So a correction republished for the current week under a "-2" URL arrives
// with a title reading 08 against a held image date of 09, and a strict
// "before" test refuses it. That is the exact case this guard was written to
// admit, defeated by a one-day clerical difference.
//
// Rosters run weekly, so a genuinely stale post resurfacing is at least seven
// days behind. Three days is comfortably wider than any title/image skew seen
// and comfortably narrower than a week.
const SUPERSEDED_MARGIN_DAYS = 3;

function isRosterSuperseded(title, heldDutyUntil) {
  if (!heldDutyUntil) return false;
  const incoming = parseWeekEndDate(title);
  // Unparseable title: no opinion. Let it through and let the reviewer see
  // it — refusing on a failed regex would go blind the day ONPB changes how
  // it words a headline.
  if (!incoming) return false;
  const daysBehind =
    (heldDutyUntil.getTime() - incoming.getTime()) / (24 * 60 * 60 * 1000);
  return daysBehind > SUPERSEDED_MARGIN_DAYS;
}

// Has a post we already ingested been given different images since?
//
// The URL test answers "is this a post we have seen", which is not the same
// question as "is this the roster we transcribed". ONPB publishes photographs
// of a printed table, and the correction for a wrong phone number is to
// upload a better photo — often to the post that is already up. Same URL,
// different table, and a sync that compares only URLs never opens it again.
//
// Compared as a set: the order images appear in a post is a layout detail,
// and a reshuffle is not a new roster.
//
// This compares URLs rather than image bytes. WordPress gives a re-uploaded
// file its own name, so a new photo is a new URL and this sees it. Replacing
// the bytes behind an existing URL needs a plugin and leaves the filename
// alone — that case would need a daily download and hash of every image, and
// it is not what a WhatsApp screenshot workflow does.
function imageSetChanged(previous, current) {
  if (!Array.isArray(previous) || previous.length === 0) return false;
  const a = [...new Set(previous)].sort();
  const b = [...new Set(current)].sort();
  return a.length !== b.length || a.some((url, index) => url !== b[index]);
}
// ─── end of the pure detection helpers (see check-roster-detection.js) ───

// Finds the newest post link + title on a region's category archive page.
// The site is an Elementor-built WordPress archive; posts are listed
// newest-first with no machine-readable timestamp, only plain post links.
async function fetchLatestPost(categoryUrl) {
  const response = await fetch(categoryUrl, { headers: FETCH_HEADERS });
  if (!response.ok)
    throw new Error(`Category page fetch failed: ${response.status}`);
  const html = await response.text();

  const linkMatch =
    /<a[^>]+href="(https:\/\/onpb\.bj\/programme-de-garde[^"]*)"[^>]*>/i.exec(
      html,
    );
  if (!linkMatch) return null;
  const postUrl = linkMatch[1];

  const titleMatch = new RegExp(
    `<h3 class="elementor-post__title">\\s*<a[^>]*href="${postUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([^<]*)</a>`,
    "i",
  ).exec(html);
  const title = titleMatch ? titleMatch[1].trim() : null;

  return { postUrl, title };
}

// Extracts the roster photo(s) from a post page — these are WhatsApp
// screenshots uploaded straight into wp-content/uploads, distinguishable
// from site chrome (logo, banner, profile thumbs) by filename. Keeps only
// the full-resolution URL for each image (drops the "-NNNxNNN" responsive
// srcset variants) and preserves the order they appear in the post.
async function fetchPostImages(postUrl) {
  const response = await fetch(postUrl, { headers: FETCH_HEADERS });
  if (!response.ok)
    throw new Error(`Post page fetch failed: ${response.status}`);
  const html = await response.text();

  const seen = new Set();
  const images = [];
  const imgRe =
    /https:\/\/onpb\.bj\/wp-content\/uploads\/\d{4}\/\d{2}\/[^\s"']*?\.(?:jpe?g|png|webp)/gi;
  for (const match of html.matchAll(imgRe)) {
    let url = match[0];
    // Drop responsive-size suffix ("-723x1024") to get the full-res original.
    url = url.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))$/i, "$1");
    if (/logo-onpb|ban2\.jpg|elementor\/thumbs|ultimatemember/i.test(url))
      continue;
    if (seen.has(url)) continue;
    seen.add(url);
    images.push(url);
  }
  return images;
}

async function downloadImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl, { headers: FETCH_HEADERS });
  if (!response.ok)
    throw new Error(`Image download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = imageUrl.split(".").pop().toLowerCase();
  const mediaType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { mediaType, data: buffer.toString("base64") };
}

const BENIN_DEPARTMENTS = [
  "Alibori",
  "Atacora",
  "Atlantique",
  "Borgou",
  "Collines",
  "Couffo",
  "Donga",
  "Littoral",
  "Mono",
  "Ouémé",
  "Plateau",
  "Zou",
];
const BENIN_DEPARTMENTS_BY_LOWER = new Map(
  BENIN_DEPARTMENTS.map((d) => [d.toLowerCase(), d]),
);

// Keep in sync with src/data/cities.js — that's the fixed list the app's
// city picker, distance sorting, and "same city" filtering all key off of
// with plain string equality. This function deploys standalone (firebase.json
// scopes the functions source to this directory), so it can't just import
// that file; it's duplicated here instead.
//
// Roster images print each entry's city however ONPB happened to type it —
// often ALL CAPS, without accents, sometimes with a hyphen/space swapped, or
// with an arrondissement suffix tacked on ("Djougou Centre", "Kandi arr
// sonsoro"). Left as-is, that city string silently fails every exact-match
// comparison the app does against the accented, title-cased canonical name
// (this is exactly what made ~40 already-live pharmacies invisible to the
// city picker and to "Porto novo"-style searches before this fix).
const CANONICAL_CITIES = [
  "Cotonou",
  "Porto-Novo",
  "Parakou",
  "Abomey-Calavi",
  "Bohicon",
  "Ouidah",
  "Djougou",
  "Natitingou",
  "Allada",
  "Toffo",
  "Torri-Bossito",
  "Zè",
  "Kpomassè",
  "Sèmè-Kpodji",
  "Akpro-Missérété",
  "Adjarra",
  "Pobè",
  "Abomey",
  "Agbangnizoun",
  "Aplahoué",
  "Bantè",
  "Bopa",
  "Comè",
  "Covè",
  "Dassa-Zoumè",
  "Djakotomey",
  "Djidja",
  "Dogbo",
  "Glazoué",
  "Grand-Popo",
  "Houéyogbé",
  "Klouékanmè",
  "Lalo",
  "Lokossa",
  "Ouèssè",
  "Ouinhi",
  "Savalou",
  "Savè",
  "Toviklin",
  "Za-Kpota",
  "Zogbodomey",
  "Kérou",
  "Tanguiéta",
  "Bassila",
  "Copargo",
  "Ouaké",
  "Banikoara",
  "Kandi",
  "Malanville",
  "Bembéréké",
  "N'Dali",
  "Nikki",
  "Tchaourou",
  "Avrankou",
  "Ifangni",
  "Dangbo",
  "Adjohoun",
  "Sakété",
  "Ikpinlé",
  "Adja-Ouèrè",
  "Kétou",
];
// Accent/case/punctuation-insensitive key: "PORTO-NOVO", "Porto Novo", and
// "Porto-Novo" all fold to the same "PORTONOVO", so any of those spellings
// resolve to the one real canonical string.
function foldCityKey(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
}
const CANONICAL_CITIES_BY_FOLD = new Map(
  CANONICAL_CITIES.map((c) => [foldCityKey(c), c]),
);
// A few roster entries use a real-but-different French romanization of the
// same commune (not a guess — these are well-documented alternate spellings
// of these specific towns, and no other Bénin commune name is this close to
// any of them): Dassa is the common short form of Dassa-Zoumè.
CANONICAL_CITIES_BY_FOLD.set(foldCityKey("Dassa"), "Dassa-Zoumè");
CANONICAL_CITIES_BY_FOLD.set(foldCityKey("Klouekanmey"), "Klouékanmè");
CANONICAL_CITIES_BY_FOLD.set(foldCityKey("Djacotomey"), "Djakotomey");

// Resolves a roster's raw city text to the app's canonical spelling. Tries
// the whole string first, then just its first word (covers "Djougou
// Centre"/"Kandi arr sonsoro"-style arrondissement suffixes). Returns null,
// not a guess, when nothing matches — the caller decides what to do with
// that (fall back to the raw text, and flag it for human review).
function resolveCanonicalCity(rawCity) {
  const trimmed = (rawCity || "").trim();
  if (!trimmed) return null;
  const wholeMatch = CANONICAL_CITIES_BY_FOLD.get(foldCityKey(trimmed));
  if (wholeMatch) return wholeMatch;
  const firstWord = trimmed.split(/\s+/)[0];
  return CANONICAL_CITIES_BY_FOLD.get(foldCityKey(firstWord)) ?? null;
}

// Bénin's 2021 numbering-plan reform prefixed every existing 8-digit number
// with "01" nationwide — ONPB's own roster images are inconsistent about
// showing the modern 10-digit form vs. the pre-reform 8-digit one, so this
// normalizes deterministically rather than trusting whatever's printed.
//
// The tricky part: a clean 8-digit number is genuinely ambiguous on its
// own — it's the exact same shape whether it's a real old-format number OR
// a 10-digit number truncated by a cropped image margin (observed live on
// the Zou/Collines/Mono/Couffo roster). Digit-count alone can't tell them
// apart. What *can*: within one entry's phone field, a short number sitting
// next to an already-clean 10-digit number is almost certainly a truncated
// fragment (real pharmacies don't mix old- and new-format numbers on the
// same line), whereas a short number with no such neighbor is far more
// likely a genuine standalone old-format number. So the same digit count
// is trusted or distrusted depending on what else is in that entry's phone
// field — never guessed at in isolation.
function classifyPhoneDigits(digits) {
  if (digits.length === 8) return "old-format";
  if (digits.length === 10 && digits.startsWith("01")) return "modern";
  return "unrecognized";
}

function normalizeEntries(entries, region) {
  const ambiguousPhones = [];
  const unresolvedCities = [];

  const normalized = (entries || []).map((entry) => {
    // Single-department regions (Littoral = Cotonou only, Atlantique) have
    // no real ambiguity — the model has been observed substituting
    // neighborhood/arrondissement names or inconsistent casing here even
    // though there's only one correct answer, so force it deterministically
    // instead of trusting the model's classification.
    let department;
    if (region.departments.length === 1) {
      department = region.departments[0];
    } else {
      department =
        BENIN_DEPARTMENTS_BY_LOWER.get(
          (entry.department || "").trim().toLowerCase(),
        ) ?? entry.department;
    }

    const numbers = (entry.phone || "")
      .split("/")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((raw) => {
        const digits = raw.replace(/\D/g, "");
        return { raw, digits, kind: classifyPhoneDigits(digits) };
      });
    const hasModernSibling = numbers.some((n) => n.kind === "modern");

    const results = numbers.map((n) => {
      if (n.kind === "modern") return { ...n, ok: true, value: n.digits };
      // Only trust a standalone old-format number, not one accompanying an
      // already-modern number in the same entry — that combination is the
      // truncation signature, not a real old+new number pair.
      if (n.kind === "old-format" && !hasModernSibling)
        return { ...n, ok: true, value: `01${n.digits}` };
      return { ...n, ok: false, value: n.digits };
    });

    const kept = results.filter((r) => r.ok).map((r) => r.value);
    const ambiguous = results.filter((r) => !r.ok);
    for (const r of ambiguous) {
      ambiguousPhones.push(
        `${entry.name}: "${r.raw}" (${r.digits.length} digits after stripping)`,
      );
    }

    // Don't leave a pharmacy with zero callable numbers just because every
    // number on its row was ambiguous — fall back to the untouched raw
    // string so at least what was printed survives for manual follow-up,
    // rather than silently dropping the pharmacy's only contact info.
    const phone = kept.length > 0 ? kept.join("/") : entry.phone;

    // Littoral's roster only ever lists Cotonou neighborhoods (it's the
    // department's one and only commune) — cities.js and cityCoordinates
    // only know "Cotonou", not "Fidjrosse" or "Akpakpa", so the neighborhood
    // detail is preserved in the name instead of lost, and city is forced
    // to the one value the rest of the app can actually use for distance
    // and grouping. Atlantique is also single-department but spans several
    // real, separately-known communes (Allada, Ouidah, ...), so it's exempt.
    //
    // The app's search matches on title text, so both the specific
    // neighborhood ("Agla Akplomey") AND the broader zone banner
    // ("Fidjrosse") get folded into the name — real users search by
    // whichever one they actually know a pharmacy by, and both are
    // genuinely true of the same pharmacy, not a guess.
    let name = entry.name;
    let city = entry.city;
    if (
      region.postingRegion === "Littoral" &&
      entry.city &&
      entry.city !== "Cotonou"
    ) {
      const zone =
        entry.zone &&
        entry.zone.trim() &&
        entry.zone.trim().toLowerCase() !== entry.city.trim().toLowerCase()
          ? entry.zone.trim()
          : null;
      name = zone
        ? `${entry.name} (${entry.city}, ${zone})`
        : `${entry.name} (${entry.city})`;
      city = "Cotonou";
    } else {
      // Whatever ONPB printed (casing, accents, hyphen vs. space, an
      // arrondissement suffix) gets folded to the exact string cities.js
      // uses, so the picker's and search's plain string comparisons find
      // this pharmacy. A city that doesn't resolve to any known commune is
      // left exactly as printed and reported in unresolvedCities instead of
      // being silently dropped or guessed at — either a genuinely new
      // commune not yet in cities.js, or a transcription the model misread.
      const resolved = resolveCanonicalCity(entry.city);
      if (resolved) {
        city = resolved;
      } else if (entry.city && entry.city.trim()) {
        unresolvedCities.push(`${entry.name}: "${entry.city}"`);
      }
    }

    return { ...entry, name, city, department, phone };
  });

  return { entries: normalized, ambiguousPhones, unresolvedCities };
}

const TRANSCRIPTION_PROMPT = `You are transcribing a photographed weekly pharmacy on-duty roster ("tour de garde") published by Bénin's Ordre National des Pharmaciens (ONPB). This will be reviewed by a human against the original image before it goes anywhere near production data, but only transcribe entries you can read with real confidence — do not invent, autocomplete, or guess any name, phone number, or city that isn't clearly legible. If a row or whole section is blurry, cut off, or ambiguous, leave it out of "entries" and describe it in "illegible" instead.

Read the date range and each entry's city exactly as printed INSIDE the image — do not assume anything from outside context. The image usually groups pharmacies under section headers, but those headers are often the COMMUNE/city name (e.g. "PORTO-NOVO", "SEME-KPODJI", "ABOMEY"), not the wider administrative department. Existing production data tags every pharmacy by department, not commune, so for each entry's "department" field, classify which of Bénin's 12 official departments that entry's city/commune actually belongs to — do not just copy the section header if it's a commune name. Bénin's 12 departments are exactly: ${BENIN_DEPARTMENTS.join(", ")}. If you are not confident which department a city belongs to, still fill in your best-supported answer but add a note about that specific entry to "illegible" rather than silently guessing.

Some rosters (Littoral/Cotonou especially) group entries under TWO levels: a broader zone banner spanning several rows (e.g. "AKPAKPA", or "AGLA / AKPLOMEY / AÏBATIN / FIDJROSSE") with each individual pharmacy's own specific neighborhood listed underneath in a QUARTIER column. When you see that two-level structure, capture the broader zone banner text too, in a "zone" field for every entry under it — real people search by that broader, more commonly-known zone name (e.g. "Fidjrosse"), not just the finer neighborhood, so dropping it makes those pharmacies unfindable by name. If the image only has one level of grouping (a single section header, no separate per-row neighborhood underneath), leave "zone" as an empty string.

If multiple images are provided, they're pages of the same roster (do not duplicate entries that appear on more than one page).

Respond with ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:
{
  "weekRangeText": "the date range exactly as printed in the image, e.g. 'DU 27 JUILLET AU 02 AOUT 2026'",
  "entries": [
    { "name": "pharmacy name only, without any 'Pharmacie' prefix", "city": "city or commune as printed", "zone": "the broader section-header zone this entry falls under, if the image has two levels of grouping — otherwise an empty string", "department": "one of Bénin's 12 official department names listed above", "phone": "phone number(s), '/' separated if the row lists more than one" }
  ],
  "illegible": ["short description of any row or section you could not read confidently, if any"],
  "imageQualityNote": "any concern about the photo itself (blur, glare, cropped edge), or an empty string if none"
}`;

// How much JSON one roster may produce.
//
// Raised twice now, both times by a region outgrowing it in production and
// both times silently until it wasn't:
//
//   4096  — truncated the JSON mid-string on the larger rosters, which
//           surfaced as an unterminated-string parse error.
//   8192  — held for a year, then failed on Zou-Collines-Mono-Couffo. That
//           post is one roster covering FOUR departments, so it is roughly
//           twice the size of any other region's, and it sat just under the
//           ceiling until a week with more pharmacies on duty pushed it
//           over. The others draft 27 to 50 entries; this one is the only
//           four-department post ONPB publishes.
//
// So the ceiling is not set to "enough for today" a third time. Output
// tokens are billed as generated, not as reserved, so a cap far above the
// need costs nothing until it is used.
const MAX_OUTPUT_TOKENS = 32000;

// If the model ever stops accepting a cap this high, the request 400s and
// every region fails — a worse outcome than the one being fixed. So a
// rejection specifically about max_tokens retries once at the old ceiling,
// which is known to work for four regions out of five.
const FALLBACK_OUTPUT_TOKENS = 8192;

async function transcribeRosterImages(imageUrls, apiKey) {
  const images = await Promise.all(imageUrls.map(downloadImageAsBase64));

  const content = [
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    })),
    { type: "text", text: TRANSCRIPTION_PROMPT },
  ];

  const ask = (maxTokens) =>
    fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content }],
      }),
    });

  let response = await ask(MAX_OUTPUT_TOKENS);

  // Only this one rejection is retried, and only downwards. A 401, a 429 or
  // a 500 means something else is wrong and quietly asking again would hide
  // it; a cap the model will not accept is the one failure where the old
  // ceiling is strictly better than nothing.
  if (response.status === 400) {
    const body = await response.text();
    if (/max_tokens/i.test(body)) {
      logger.warn(
        `max_tokens=${MAX_OUTPUT_TOKENS} refused, retrying at ` +
          `${FALLBACK_OUTPUT_TOKENS}: ${body.slice(0, 200)}`,
      );
      response = await ask(FALLBACK_OUTPUT_TOKENS);
    } else {
      throw new Error(`Anthropic API error 400: ${body.slice(0, 500)}`);
    }
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic API error ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }

  const data = await response.json();
  if (data.stop_reason === "max_tokens") {
    // Fail loudly and specifically rather than let JSON.parse throw a
    // confusing "unterminated string" error further down. The figure comes
    // from the constant, because the first version wrote it into the
    // sentence by hand and the sentence would have gone on saying 8192
    // after the limit was raised.
    throw new Error(
      `Anthropic response was truncated at the token limit ` +
        `(roster too large for max_tokens=${MAX_OUTPUT_TOKENS}).`,
    );
  }

  const text = data.content?.find((block) => block.type === "text")?.text ?? "";
  // Model was instructed to return raw JSON, but strip markdown fences
  // defensively in case it wraps the response anyway.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/, "");
  return JSON.parse(cleaned);
}

// The reviewer's identity AND their token, because those are two different
// questions and this used to answer only the second. A reviewer with no
// registered token returned null, and the whole notification was abandoned —
// nothing sent, nothing recorded, nothing anywhere to find later.
async function getReviewer() {
  const db = admin.firestore();
  const configSnap = await db.doc("appConfig/pharmacyRosterReviewer").get();
  const reviewerUid = configSnap.exists ? configSnap.data().sellerUid : null;
  if (!reviewerUid) {
    logger.info(
      "No pharmacyRosterReviewer configured — nothing to notify.",
    );
    return null;
  }

  const sellerSnap = await db.doc(`sellers/${reviewerUid}`).get();
  const pushToken = sellerSnap.exists ? sellerSnap.data().pushToken : null;
  if (!pushToken) {
    logger.info(
      `Reviewer ${reviewerUid} has no pushToken registered — recording the ` +
        `notification without pushing it.`,
    );
  }
  return { uid: reviewerUid, pushToken: pushToken ?? null };
}

// Record first, then push.
//
// A push used to be the whole notification. FCM is a delivery attempt and
// nothing more: it leaves no trace, so a roster notification existed only for
// as long as the banner was on screen. Tapping "Voir" on it routed to the
// notification centre — openNotification has no case for these types and its
// default lands there — and the centre is built from unread conversations,
// newly approved listings and job applications. It had never heard of a
// pharmacy roster. The reviewer was told something had happened, tapped to
// see it, and was shown "no notifications yet".
//
// So the durable record is written first and the push second. The order is
// the point: if messaging throws, if the token is stale, if the reviewer
// never registered one at all, the notification is still there to be found.
// The push is now an alert ABOUT a record rather than the record itself.
async function sendReviewerPush(title, body, data) {
  const reviewer = await getReviewer();
  if (!reviewer) return;

  await recordNotification(reviewer.uid, { title, body, data });

  if (!reviewer.pushToken) return;

  try {
    await admin.messaging().send({
      token: reviewer.pushToken,
      notification: { title, body },
      data,
    });
  } catch (error) {
    logger.warn("Failed to send reviewer push notification", error);
  }
}

async function notifyReviewer(newDraftCount, revisionCount = 0) {
  // A revision is said out loud and said first. An ordinary draft is next
  // week's roster and can wait for the morning; a revision means the roster
  // already on people's screens has been corrected at the source, and the
  // wrong version is the one live right now.
  const body = revisionCount
    ? `${revisionCount} CORRECTED roster${revisionCount > 1 ? "s" : ""} re-published at the source` +
      (newDraftCount > revisionCount
        ? `, plus ${newDraftCount - revisionCount} new draft${newDraftCount - revisionCount > 1 ? "s" : ""}.`
        : ".")
    : `${newDraftCount} new "tour de garde" draft${newDraftCount > 1 ? "s" : ""} waiting for review.`;
  await sendReviewerPush(
    revisionCount ? "Pharmacy roster corrected" : "Pharmacy roster drafts ready",
    body,
    { type: "pharmacyRosterDraft" },
  );
}

// Distinct from "no new post" (which is normal and silent) — this only
// fires when a region actually threw, so silence from this function
// reliably means nothing broke, not just "nothing new happened to notice."
// The reminder for drafts nobody has acted on yet.
//
// Counted from the same query apply-draft.js lists with — status
// 'pending_review', which apply() moves to 'applied' and reject() to
// 'rejected' — so clearing the queue silences this with no extra
// bookkeeping and no flag that could disagree with reality.
//
// Says the oldest age out loud. "3 drafts waiting" reads like a to-do;
// "3 drafts waiting, oldest 5 days" says the app is serving last week.
async function remindAboutPendingDrafts() {
  const snap = await admin
    .firestore()
    .collection("pharmacyRosterDrafts")
    .where("status", "==", "pending_review")
    .get();
  if (snap.empty) return;

  const now = Date.now();
  let oldestDays = 0;
  let alreadyPast = 0;
  const regions = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.postingRegion) regions.push(data.postingRegion);
    // `fetchedAt`, which is what the draft is actually written with. Reading
    // `createdAt` here returned undefined on every document and the age
    // simply vanished from the message — a wrong field name that degrades to
    // silence rather than to an error, which is the kind of thing this whole
    // function exists to stop happening.
    const fetchedMs = data.fetchedAt?.toMillis?.();
    if (fetchedMs) {
      const days = Math.floor((now - fetchedMs) / DAY_MS);
      if (days > oldestDays) oldestDays = days;
    }
    // A draft whose own duty week has already ended cannot fix the screen —
    // applying it swaps one expired roster for another. It needs the reviewer
    // to know that rather than to work through it and wonder why nothing
    // improved; the replacement comes from the next sync, not from this draft.
    const dutyUntilMs = data.dutyUntil?.toMillis?.();
    if (dutyUntilMs && dutyUntilMs < now) alreadyPast += 1;
  });

  const count = snap.size;
  const age =
    oldestDays > 0
      ? `, oldest ${oldestDays} day${oldestDays > 1 ? "s" : ""} old`
      : "";
  const expired =
    alreadyPast > 0
      ? ` ${alreadyPast} of them ${alreadyPast > 1 ? "cover weeks" : "covers a week"} that ${alreadyPast > 1 ? "have" : "has"} already ended and ${alreadyPast > 1 ? "need" : "needs"} a fresh sync instead.`
      : "";
  await sendReviewerPush(
    "Pharmacy rosters still waiting",
    `${count} draft${count > 1 ? "s" : ""} not yet applied${age}` +
      (regions.length ? `: ${[...new Set(regions)].join(", ")}.` : ".") +
      " The app is showing the previous roster until they are." +
      expired,
    { type: "pharmacyRosterDraft" },
  );
}

async function notifyFailure(failedRegions) {
  await sendReviewerPush(
    "Pharmacy roster sync failed",
    `Sync failed for: ${failedRegions.join(", ")}. Check functions logs.`,
    { type: "pharmacyRosterSyncFailure" },
  );
}

// Telling "nothing new to fetch" apart from "we have gone blind".
//
// Both produce the same line in the log — "no new post since last check" —
// and the second one produces it forever. A changed page layout, a moved
// feed or a renamed category would look exactly like a quiet week, and the
// only symptom would be pharmacies on the screen whose duty period ended
// weeks ago.
//
// So each region's last roster is checked against its own coverage. A roster
// states the date its duty runs until; once that date has passed and no
// replacement has appeared, the silence has stopped being normal.
const DUTY_GRACE_DAYS = 2;
// For regions whose last roster had no readable date — the fallback, and a
// deliberately loose one. ONPB has been observed skipping a week, so this
// only fires when the gap is longer than anything yet seen.
const NO_DATE_STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function rosterStaleness(state, now) {
  if (!state) return null;

  const dutyUntil = state.lastDutyUntil?.toDate?.();
  if (dutyUntil) {
    const overdueDays = Math.floor(
      (now.getTime() - dutyUntil.getTime()) / DAY_MS,
    );
    if (overdueDays > DUTY_GRACE_DAYS) {
      return {
        reason: "dutyExpired",
        detail: `duty ended ${overdueDays} day(s) ago`,
      };
    }
    return null;
  }

  // No parsed date on the last roster: fall back to how long ago we last
  // ingested anything at all.
  const processedAt = state.lastProcessedAt?.toDate?.();
  if (!processedAt) return null;
  const ageDays = Math.floor((now.getTime() - processedAt.getTime()) / DAY_MS);
  if (ageDays > NO_DATE_STALE_DAYS) {
    return {
      reason: "noNewRoster",
      detail: `nothing ingested for ${ageDays} day(s)`,
    };
  }
  return null;
}

// Separate from notifyFailure: nothing threw, which is the point. This is
// the failure that does not raise an exception.
async function notifyStale(staleRegions) {
  await sendReviewerPush(
    "Pharmacy rosters look stale",
    `No fresh roster for: ${staleRegions.join(", ")}. The source may have changed.`,
    { type: "pharmacyRosterStale" },
  );
}

async function syncPharmacyRosters(apiKey) {
  const db = admin.firestore();
  const now = new Date();
  let newDraftCount = 0;
  let revisionCount = 0;
  const failedRegions = [];
  const staleRegions = [];

  for (const region of REGIONS) {
    try {
      const latest = await fetchLatestPost(region.categoryUrl);
      if (!latest) {
        logger.warn(`No posts found for ${region.postingRegion}`);
        continue;
      }

      const stateRef = db.doc(`pharmacyRosterState/${region.postingRegion}`);
      const stateSnap = await stateRef.get();
      const state = stateSnap.exists ? stateSnap.data() : null;

      // Nothing new to say about the roster we already hold. Normal and
      // silent — unless it has outlived the period it covers.
      const holdSteady = (line) => {
        const stale = rosterStaleness(state, now);
        if (stale) {
          logger.warn(
            `${region.postingRegion}: ${line}, and the roster we hold is stale — ${stale.detail} (${latest.postUrl})`,
          );
          staleRegions.push(region.postingRegion);
        } else {
          logger.info(`${region.postingRegion}: ${line}.`);
        }
      };

      let imageUrls = null;
      // Set when the post URL is one we have already transcribed but its
      // images have since changed — a correction, not a new week. The
      // reviewer needs to know which, because a revision replaces entries
      // for a period that may already be half over.
      let isRevision = false;

      if (state?.lastProcessedPostUrl === latest.postUrl) {
        // Same post. Before concluding nothing has happened, look at what it
        // is actually showing — a re-photographed table arrives at the same
        // URL and would otherwise never be read again.
        imageUrls = await fetchPostImages(latest.postUrl);
        if (!imageSetChanged(state.lastImageUrls, imageUrls)) {
          // A state doc written before lastImageUrls existed has no baseline
          // to compare against, and imageSetChanged says "unchanged" rather
          // than guessing. Record what the post shows today so the next run
          // has something to compare — the cheap half of the check, with no
          // vision call attached.
          if (!state.lastImageUrls && imageUrls.length > 0) {
            await stateRef.set({ lastImageUrls: imageUrls }, { merge: true });
          }
          holdSteady("no new post");
          continue;
        }
        isRevision = true;
        logger.warn(
          `${region.postingRegion}: same post, different images — treating as a revision (${latest.postUrl})`,
        );
      } else if (isRosterSuperseded(latest.title, state?.lastDutyUntil?.toDate?.())) {
        // A URL we have never seen, carrying a period that ended before the
        // one we already hold. The archive has handed us the past.
        holdSteady(
          `archive is showing an older roster ("${latest.title}") than the one we hold`,
        );
        continue;
      }

      if (imageUrls === null) {
        imageUrls = await fetchPostImages(latest.postUrl);
      }
      if (imageUrls.length === 0) {
        logger.warn(
          `${region.postingRegion}: post found but no roster images detected — ${latest.postUrl}`,
        );
        continue;
      }

      const transcription = await transcribeRosterImages(imageUrls, apiKey);
      const {
        entries: normalizedEntries,
        ambiguousPhones,
        unresolvedCities,
      } = normalizeEntries(transcription.entries, region);
      const weekEndDate = parseWeekEndDate(transcription.weekRangeText);
      const titleWeekEndDate = parseWeekEndDate(latest.title);
      const dateMismatch =
        weekEndDate &&
        titleWeekEndDate &&
        weekEndDate.getTime() !== titleWeekEndDate.getTime();

      // The site has been observed to miscategorize posts (a post filed
      // under one region's category actually being another region's
      // roster) — flag it for the reviewer rather than trusting the
      // category, since the per-entry `department` values already come
      // from the image itself and don't depend on this. Compares against
      // the actual set of departments this posting region should cover,
      // not a crude substring match (a single combined post like
      // "Zou/Collines/Mono/Couffo" legitimately spans 4 departments).
      const expectedDepartments = new Set(
        region.departments.map((d) => d.toLowerCase()),
      );
      const unexpectedDepartments = [
        ...new Set(
          normalizedEntries
            .map((e) => (e.department || "").trim())
            .filter(Boolean),
        ),
      ].filter((d) => !expectedDepartments.has(d.toLowerCase()));
      const categoryMismatch = unexpectedDepartments.length > 0;

      await db.collection("pharmacyRosterDrafts").add({
        postingRegion: region.postingRegion,
        sourcePostUrl: latest.postUrl,
        sourcePostTitle: latest.title,
        sourceImageUrls: imageUrls,
        status: "pending_review",
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        weekRangeText: transcription.weekRangeText ?? null,
        dutyUntil: weekEndDate
          ? admin.firestore.Timestamp.fromDate(weekEndDate)
          : null,
        entries: normalizedEntries,
        illegible: transcription.illegible ?? [],
        imageQualityNote: transcription.imageQualityNote ?? "",
        warnings: {
          dateMismatchWithTitle: Boolean(dateMismatch),
          possibleCategoryMismatch: Boolean(categoryMismatch),
          unexpectedDepartments,
          noWeekRangeParsed: !weekEndDate,
          ambiguousPhones,
          unresolvedCities,
          // The post was already transcribed once and its images changed
          // afterwards. Whoever reviews this is replacing entries that may
          // already be live, mid-period, so it wants reading against the
          // previous draft rather than applied on its own.
          revisionOfProcessedPost: isRevision,
        },
      });

      // Fall back to the title's dates when the image's did not parse.
      //
      // This matters more than it looks. All five regions currently hold a
      // null lastDutyUntil, because it was written only from the vision
      // model's weekRangeText and that has never parsed — and a null quietly
      // switches OFF the two guards that depend on it: rosterStaleness loses
      // its precise "duty ended N days ago" test and drops to the loose
      // 14-day ingest-age fallback, and isRosterSuperseded returns false
      // before it looks at anything. Two guards, disabled by an absent field,
      // with nothing in the logs to say so.
      //
      // The title parses perfectly well — titleWeekEndDate is right here,
      // already computed for the mismatch warning above.
      //
      // State only. The draft keeps the image-derived date, null and warned
      // about, because that is the one a human reviews against the photograph
      // and it is what becomes listing data. This value never leaves the
      // state document; it exists so the sync can reason about its own
      // freshness, which is a question the title is good enough to answer.
      const freshnessDate = weekEndDate ?? titleWeekEndDate;
      await stateRef.set({
        lastProcessedPostUrl: latest.postUrl,
        lastProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Carried onto the state doc so a later run can ask "has this roster
        // outlived itself?" without reading back the draft it came from.
        lastDutyUntil: freshnessDate
          ? admin.firestore.Timestamp.fromDate(freshnessDate)
          : null,
        // Which of the two it came from, so a reader of this document is
        // never left guessing whether the date was transcribed or inferred.
        lastDutyUntilSource: weekEndDate
          ? "image"
          : titleWeekEndDate
            ? "title"
            : null,
        // What the post was showing when we transcribed it. Tomorrow's run
        // compares against this to notice a re-photographed table arriving
        // at a URL we have already seen.
        lastImageUrls: imageUrls,
      });

      newDraftCount += 1;
      if (isRevision) revisionCount += 1;
      logger.info(
        `${region.postingRegion}: drafted ${transcription.entries?.length ?? 0} entries from ${latest.postUrl}`,
      );
    } catch (error) {
      // One region's failure (network hiccup, unreadable image, API error)
      // must not block the others.
      logger.error(`${region.postingRegion}: sync failed`, error);
      failedRegions.push(region.postingRegion);
    }
  }

  if (newDraftCount > 0) {
    await notifyReviewer(newDraftCount, revisionCount);
  } else {
    // Nothing new today, but something may still be waiting from a previous
    // day — and until now that was said exactly once, on the day the draft
    // was written, and never again.
    //
    // That single push was the whole feedback loop. Miss it and the drafts
    // sat in Firestore while the app went on serving the previous week,
    // because nothing downstream of the notification knows or cares whether
    // a reviewer ever saw it: no badge, no in-app queue, no second attempt.
    // The only backstop was rosterStaleness below, which needs a fortnight
    // to speak up.
    //
    // Measured, not imagined: on 2026-09-12 four drafts were pending, three
    // of them the CURRENT week's rosters for Littoral, Atlantique and the
    // northern departments, written five days earlier. 151 of 204 pharmacy
    // listings were serving an expired duty period, one group of them five
    // weeks out of date, and no alert had fired about any of it.
    //
    // So the reminder repeats for as long as there is something to review.
    // It is one query against a collection that holds a handful of documents,
    // it only sends when the count is non-zero, and a reviewer who has
    // cleared the queue never hears from it.
    await remindAboutPendingDrafts();
  }
  if (failedRegions.length > 0) {
    await notifyFailure(failedRegions);
  }
  // Only when nothing new arrived anywhere. A region that drafted today is
  // plainly not blind, and warning about its neighbours in the same breath
  // would train the reviewer to ignore this.
  if (staleRegions.length > 0 && newDraftCount === 0) {
    await notifyStale(staleRegions);
  }
}

// Daily at 08:00 Africa/Porto-Novo — ONPB doesn't post on a fixed day
// (observed landing anywhere from Monday to mid-week), so checking daily
// keeps worst-case staleness under 24h instead of up to 6 days. Cheap: the
// per-region state check means the paid vision call only fires on an
// actual new post, not on every run.
exports.syncPharmacyRosters = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "Africa/Porto-Novo",
    secrets: [anthropicApiKey],
    timeoutSeconds: 300,
  },
  async () => {
    await syncPharmacyRosters(anthropicApiKey.value());
  },
);

// Exported for local testing/inspection without waiting for the schedule.
exports._internal = {
  parseWeekEndDate,
  isRosterSuperseded,
  imageSetChanged,
  fetchLatestPost,
  fetchPostImages,
  syncPharmacyRosters,
  classifyPhoneDigits,
  normalizeEntries,
  resolveCanonicalCity,
};
