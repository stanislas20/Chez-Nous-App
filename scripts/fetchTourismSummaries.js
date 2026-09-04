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

async function extractsFor(titles) {
  const url =
    "https://fr.wikipedia.org/w/api.php?action=query&format=json&prop=extracts" +
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
