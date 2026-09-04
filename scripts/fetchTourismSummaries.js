// One sentence saying what each place is, taken from the encyclopedia
// rather than written here.
//
// The design gives every card a line of "why go" prose, and hand-wrote
// fifteen of them. There are 125 sites. Writing the other 110 from
// memory is how the old five-landmark list came to place a bank in
// Parakou — plausible sentences are the easiest thing in the world to
// produce and the hardest to check.
//
// So the line comes from the French Wikipedia article the site already
// links to, trimmed to its first sentence. It is CC BY-SA like the
// photographs, credited the same way, and where there is no article there
// is no line — a card then shows what it does know, which is the place,
// the category, the heritage listing and the drive.
//
//   node scripts/fetchTourismSummaries.js           # report
//   node scripts/fetchTourismSummaries.js --write
const fs = require("fs");
const path = require("path");

const WRITE = process.argv.includes("--write");
const UA = "ChezNous/1.0 (Bénin marketplace; tourism directory)";
const FILE = path.join(__dirname, "..", "src/data/tourismSites.json");
const BATCH = 20;
const MAX_CHARS = 220;

// The first sentence, cut at a full stop that is not inside an
// abbreviation or a decimal. Wikipedia leads are long and a card is not a
// page.
function firstSentence(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const match = /^(.{40,}?[.!?])(\s|$)/.exec(clean);
  const sentence = match ? match[1] : clean;
  if (sentence.length <= MAX_CHARS) return sentence;
  return `${sentence.slice(0, MAX_CHARS - 1).replace(/[\s,;:]+\S*$/, "")}…`;
}

const titleFromArticle = (url) =>
  decodeURIComponent(url.split("/wiki/")[1] ?? "").replace(/_/g, " ");

async function extractsFor(titles, host = "fr.wikipedia.org") {
  const url =
    `https://${host}/w/api.php?action=query&format=json&prop=extracts` +
    "&exintro=1&explaintext=1&redirects=1&exsectionformat=plain" +
    `&titles=${encodeURIComponent(titles.join("|"))}`;
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`Wikipedia answered ${response.status}`);
  const json = await response.json();
  const out = new Map();
  // Redirects mean the title asked for is not always the title returned.
  const alias = new Map();
  (json.query?.redirects ?? []).forEach((r) => alias.set(r.to, r.from));
  (json.query?.normalized ?? []).forEach((r) => alias.set(r.to, r.from));
  for (const page of Object.values(json.query?.pages ?? {})) {
    const sentence = firstSentence(page.extract);
    if (!sentence) continue;
    out.set(page.title, sentence);
    if (alias.has(page.title)) out.set(alias.get(page.title), sentence);
  }
  return out;
}

// A Wikidata one-liner is sometimes a sentence and sometimes a shrug.
// "bâtiment en Afrique" is what it offers for the Royal Palaces of Abomey,
// a world heritage site: true, and no use to anybody deciding whether to
// drive there. Anything this short and this generic is treated as absent
// so a real sentence from elsewhere can take its place.
const VACUOUS = /^(bâtiment|monument|lieu|site|édifice|construction|place|building|monument|place|site)\b.{0,24}$/i;
const useful = (text) => Boolean(text) && text.length > 28 && !VACUOUS.test(text);

async function main() {
  const sites = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const withArticle = sites.filter((site) => site.article);
  console.log(`${withArticle.length} of ${sites.length} site(s) have an article.\n`);

  const found = new Map();
  for (let index = 0; index < withArticle.length; index += BATCH) {
    const slice = withArticle.slice(index, index + BATCH);
    const got = await extractsFor(slice.map((site) => titleFromArticle(site.article)));
    got.forEach((value, key) => found.set(key, value));
    console.log(`  read ${Math.min(index + BATCH, withArticle.length)}/${withArticle.length}`);
  }

  let kept = 0;
  for (const site of sites) {
    if (!site.article) continue;
    const sentence = found.get(titleFromArticle(site.article));
    if (!sentence) continue;
    site.summary = sentence;
    kept += 1;
  }

  // English, for the third of these places that has no French article.
  //
  // The Palais royaux d'Abomey has thirty-nine sitelinks and not one of
  // them is fr. Its card said nothing, then said "bâtiment en Afrique".
  // An English sentence in a French app is not ideal and is a great deal
  // better than either — and the screen prefers French wherever there is
  // any, so this only ever shows where the alternative is silence.
  const needEnglish = sites.filter(
    (site) => !site.summary && !useful(site.descriptionFr) && site.enTitle,
  );
  let english = 0;
  for (let index = 0; index < needEnglish.length; index += BATCH) {
    const slice = needEnglish.slice(index, index + BATCH);
    const got = await extractsFor(
      slice.map((site) => site.enTitle),
      "en.wikipedia.org",
    );
    slice.forEach((site) => {
      const sentence = got.get(site.enTitle);
      if (sentence) {
        site.summaryEn = sentence;
        english += 1;
      }
    });
  }
  console.log(`${english} took an English sentence for want of a French one.`);

  // A one-liner that says nothing is dropped rather than shown.
  sites.forEach((site) => {
    if (site.descriptionFr && !useful(site.descriptionFr)) {
      delete site.descriptionFr;
    }
  });

  console.log(`\n${kept} summarised, ${sites.length - kept} without.`);
  sites
    .filter((site) => site.summary)
    .slice(0, 5)
    .forEach((site) => console.log(`\n  ${site.name}\n    ${site.summary}`));

  if (WRITE) {
    fs.writeFileSync(FILE, `${JSON.stringify(sites, null, 2)}\n`);
    console.log(`\nWrote ${path.relative(process.cwd(), FILE)}`);
  } else {
    console.log("\nNothing written. Re-run with --write.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
