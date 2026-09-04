// Every place in Bénin worth travelling to, from Wikidata.
//
// The screen listed five landmarks written from memory. That was honest as
// far as it went — a UNESCO site is a UNESCO site — but five is not a
// country, and "everything in Bénin" cannot be recalled, only sourced.
//
// Wikidata is the source because each row carries what this screen needs
// and nothing has to be invented to fill a column: coordinates (so a drive
// time is measured rather than guessed), a type (so a waterfall is not
// filed as a museum), the heritage designation where there is one, and a
// Commons photograph with a licence and a photographer, which is what
// makes a real picture on a card publishable at all.
//
// No instance-of QIDs are hard-coded. Guessing that "national park" is
// Q46169 is exactly the kind of literal this codebase keeps getting caught
// by, and a wrong QID silently returns nothing. So the query asks for
// everything in Bénin that has coordinates and a picture, brings back each
// item's type as a *label*, and the filtering happens here in words that
// can be read.
//
//   node scripts/fetchTourismSites.js            # print what it found
//   node scripts/fetchTourismSites.js --write    # write the data file
const fs = require("fs");
const path = require("path");

const WRITE = process.argv.includes("--write");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "ChezNous/1.0 (Bénin marketplace; tourism directory)";

const QUERY = `
SELECT ?item ?itemLabel ?itemLabelEn ?coord ?typeLabel ?image ?heritageLabel ?admin ?adminLabel ?article ?website ?phone ?mail ?descFr ?enArticle
WHERE {
  ?item wdt:P17 wd:Q962 .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P31 ?type . }
  OPTIONAL { ?item wdt:P1435 ?heritage . }
  # The place's own site, which is what a visitor should be sent to.
  OPTIONAL { ?item wdt:P856 ?website . }
  # Contact, where the place has published one.
  OPTIONAL { ?item wdt:P1329 ?phone . }
  OPTIONAL { ?item wdt:P968 ?mail . }
  OPTIONAL { ?item wdt:P131 ?admin . }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://fr.wikipedia.org/> .
  }
  OPTIONAL {
    ?enArticle schema:about ?item ;
               schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "fr,en" .
    ?item rdfs:label ?itemLabel .
    ?type rdfs:label ?typeLabel .
    ?heritage rdfs:label ?heritageLabel .
    ?admin rdfs:label ?adminLabel .
  }
  OPTIONAL {
    ?item rdfs:label ?itemLabelEn .
    FILTER(LANG(?itemLabelEn) = "en")
  }
  # Wikidata's own one-line description, in French.
  #
  # A third of these places have no French Wikipedia article — the Palais
  # royaux d'Abomey among them, which has 39 sitelinks and not one of them
  # is fr. Their cards said nothing at all. This is a sentence rather than
  # a paragraph, and it is in the language the app is written in, which an
  # English extract would not be.
  OPTIONAL {
    ?item schema:description ?descFr .
    FILTER(LANG(?descFr) = "fr")
  }
}
`;

// Types worth travelling to, matched on the words Wikidata itself uses.
//
// Split in two, because a first pass that simply named every promising
// word returned 1,624 "sites" — 1,500 of them unnamed seasonal streams
// filed as "fleuve ou rivière", and a handful of hills called "montagne".
// Bénin has a great many watercourses and almost none of them is a day
// out.
//
// STRONG types are a reason to travel by themselves: nobody builds a
// museum or gazettes a national park by accident.
const STRONG = [
  "musée", "museum", "parc national", "national park", "réserve", "reserve",
  "aire protégée", "protected area", "chute", "cascade", "waterfall",
  "palais", "palace", "site archéologique", "archaeological", "monument",
  "basilique", "basilica", "cathédrale", "cathedral", "mosquée", "mosque",
  "temple", "marché", "market", "fort", "château", "village lacustre",
  "jardin botanique", "botanical garden", "zone humide", "wetland",
  "attraction touristique", "tourist attraction", "patrimoine", "heritage",
  "parc zoologique", "zoo", "site naturel", "plage", "beach",
];

// WEAK types are ordinary geography that is sometimes a destination and
// usually not. A hill is a day out when somebody wrote an encyclopedia
// article about it or a body gazetted it; otherwise it is a hill. So these
// are kept only with a French Wikipedia article or a heritage listing
// behind them — a test the data answers, rather than my opinion of which
// hills are famous.
const WEAK = [
  "lac", "lake", "lagune", "lagoon", "montagne", "mountain", "colline",
  "hill", "grotte", "cave", "île", "island", "forêt", "forest", "pont",
  "bridge", "source", "spring", "place", "square", "église", "church",
];

// Named one by one, because typing cannot find them.
//
// Ganvié is filed as a "human settlement" and the Route des Pêches has no
// type at all, so no rule about museums and waterfalls reaches either —
// and they are two of the three places anybody actually names when asked
// what to see in Bénin. The rest of this list is the same problem: a
// commune whose draw is the town itself, a beach that Wikidata models as
// a river mouth, a range that is a landscape rather than a monument.
//
// So they are asked for by identity. Coordinates, photograph and heritage
// status still come from Wikidata; what is hand-made here is only the
// judgement that the place belongs in a tourism directory, which is a
// judgement and should look like one.
const ALSO = {
  Q1493703: "Ganvié",
  Q65553736: "Route des Pêches",
  Q1542478: "Grand-Popo",
  Q21788696: "Bouche du Roy",
  Q2609335: "Dassa-Zoumè",
  Q2269248: "Tanguiéta",
  Q2269235: "Boukoumbé",
  Q994125: "Natitingou",
  Q189685: "Abomey",
};

// And the noise typing lets through.
//
// Wikidata knows about thirty village markets, a dozen roundabouts and
// every bridge in Cotonou. A market where the town buys its tomatoes is
// not a day out; Dantokpa, the largest open-air market in West Africa, is.
// A roundabout with a monument on it is a thing you drive around. Naming
// the exclusions here, rather than tightening the type filter until they
// vanish, keeps them visible: somebody can disagree with this list by
// reading it.
const DROP_TYPES = ["carrefour giratoire", "pont", "statue", "sculpture", "fontaine"];
const DROP_NAME = /^(place |rond-point |marché |mosquée centrale)/i;
const KEEP_ANYWAY = /dantokpa|grande mosquée|place du souvenir|esplanade des amazones/i;

// Inside the country, checked rather than trusted.
//
// The query asks for country = Bénin and that is not the same as being in
// Bénin: the Grande Muraille Verte carries the tag and sits at 17°N 10°E,
// in the Sahara, because it is a continental project rather than a place.
// One bad coordinate is one card sending somebody 1,200 km into Niger.
//
// The box is Bénin's extent with a little air: 6.1–12.5 N, 0.7–3.9 E.
const IN_BENIN = (entry) =>
  entry.latitude >= 6.1 &&
  entry.latitude <= 12.5 &&
  entry.longitude >= 0.7 &&
  entry.longitude <= 3.9;

function tier(entry) {
  if (!IN_BENIN(entry)) return null;
  const types = entry.types.map((type) => type.toLowerCase());
  if (ALSO[entry.id]) return "named";
  const name = entry.name ?? "";
  if (!KEEP_ANYWAY.test(name)) {
    if (DROP_NAME.test(name)) return null;
    if (types.every((type) => DROP_TYPES.some((word) => type.includes(word)))) {
      return null;
    }
  }
  const has = (words) =>
    types.some((type) => words.some((word) => type.includes(word)));
  if (has(STRONG)) return "strong";
  if (has(WEAK) && (entry.article || entry.heritage.length)) return "weak";
  return null;
}

// Bénin renumbered to ten digits in 2020 by prefixing 01, and most of
// what is published anywhere is still the dead eight-digit form —
// "+229 20 21 35 66" for the musée Honmè, for instance. The same rule
// scripts/fetchOsmHotels.js applies: strip to digits, drop the country
// code, prefix 01 to an eight-digit number, and keep only what ends up
// looking like a Bénin number. Anything else is dropped rather than
// shown, because a number that rings nowhere is worse than none.
function normalizePhone(raw) {
  if (!raw) return null;
  const parts = String(raw)
    .split(/[;,/]/)
    .map((part) => part.replace(/[^\d]/g, ""))
    .map((digits) => digits.replace(/^229/, ""))
    .map((digits) => (digits.length === 8 ? `01${digits}` : digits))
    .filter((digits) => /^01\d{8}$/.test(digits));
  return parts.length ? [...new Set(parts)].join("/") : null;
}

async function run() {
  const response = await fetch(
    `${ENDPOINT}?format=json&query=${encodeURIComponent(QUERY)}`,
    { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } },
  );
  if (!response.ok) {
    throw new Error(`Wikidata answered ${response.status}`);
  }
  const json = await response.json();
  const rows = json.results.bindings;
  console.log(`${rows.length} row(s) from Wikidata.\n`);

  // One row per item per type/heritage combination, so they are merged.
  const byId = new Map();
  for (const row of rows) {
    const id = row.item.value.split("/").pop();
    const entry = byId.get(id) ?? {
      id,
      name: row.itemLabel?.value ?? null,
      nameEn: row.itemLabelEn?.value ?? null,
      types: new Set(),
      heritage: new Set(),
      admin: row.adminLabel?.value ?? null,
      image: null,
      article: row.article?.value ?? null,
      website: row.website?.value ?? null,
      descriptionFr: row.descFr?.value ?? null,
      enTitle: row.enArticle
        ? decodeURIComponent(row.enArticle.value.split("/wiki/")[1] ?? "").replace(/_/g, " ")
        : null,
      phone: normalizePhone(row.phone?.value) ?? null,
      mail: (row.mail?.value ?? "").replace(/^mailto:/, "") || null,
      latitude: null,
      longitude: null,
    };
    if (row.typeLabel?.value) entry.types.add(row.typeLabel.value);
    if (row.heritageLabel?.value) entry.heritage.add(row.heritageLabel.value);
    if (row.image?.value && !entry.image) entry.image = row.image.value;
    if (!entry.article && row.article?.value) entry.article = row.article.value;
    if (!entry.website && row.website?.value) entry.website = row.website.value;
    if (!entry.descriptionFr && row.descFr?.value) {
      entry.descriptionFr = row.descFr.value;
    }
    if (!entry.enTitle && row.enArticle?.value) {
      entry.enTitle = decodeURIComponent(
        row.enArticle.value.split("/wiki/")[1] ?? "",
      ).replace(/_/g, " ");
    }
    if (!entry.phone && row.phone?.value) entry.phone = normalizePhone(row.phone.value);
    if (!entry.mail && row.mail?.value) {
      entry.mail = row.mail.value.replace(/^mailto:/, "");
    }
    if (!entry.admin && row.adminLabel?.value) entry.admin = row.adminLabel.value;
    // Point(lon lat)
    const point = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord.value);
    if (point) {
      entry.longitude = Number(point[1]);
      entry.latitude = Number(point[2]);
    }
    byId.set(id, entry);
  }

  const all = [...byId.values()].map((entry) => ({
    ...entry,
    types: [...entry.types],
    heritage: [...entry.heritage],
  }));

  const kept = all
    .filter((entry) => entry.name && tier(entry))
    .map((entry) => ({ ...entry, tier: tier(entry) }));
  const dropped = all.filter((entry) => !tier(entry));

  kept.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const withPhoto = kept.filter((entry) => entry.image);

  console.log(`kept    ${kept.length} (${withPhoto.length} with a photograph)`);
  console.log(`left out ${dropped.length}\n`);
  kept.forEach((entry) => {
    console.log(
      `  ${entry.image ? "📷" : "  "} ${entry.name} — ${entry.types.join(", ")}` +
        `${entry.heritage.length ? ` [${entry.heritage.join(", ")}]` : ""}`,
    );
  });

  const types = new Set();
  dropped.forEach((entry) => entry.types.forEach((type) => types.add(type)));
  console.log(`\nTypes left out, so widening the list is a matter of reading:`);
  console.log(`  ${[...types].sort().join(" · ")}`);

  if (WRITE) {
    const out = path.join(__dirname, "..", "src/data/tourismSites.json");
    // Merged, never replaced.
    //
    // Two later stages write into this file — the Commons licence and
    // author, and the photograph's new home in the app's own Storage after
    // scripts/uploadTourismPhotos.js copies it there. A plain overwrite
    // here would throw all of that away and the only symptom would be
    // cards quietly losing their pictures, which is the failure this
    // codebase keeps finding. So the fetched fields are updated and
    // everything else on a record is left exactly as it was.
    const previous = fs.existsSync(out)
      ? JSON.parse(fs.readFileSync(out, "utf8"))
      : [];
    const byId = new Map(previous.map((site) => [site.id, site]));
    const merged = kept.map((site) => {
      const before = byId.get(site.id);
      return before ? { ...before, ...site, photo: before.photo ?? null } : site;
    });
    fs.writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
    const carried = merged.filter((site) => site.photo || site.summary).length;
    console.log(
      `\nWrote ${merged.length} site(s) to ${path.relative(process.cwd(), out)} ` +
        `(${carried} kept a photograph or a summary from a previous run)`,
    );
  } else {
    console.log("\nNothing written. Re-run with --write.");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
