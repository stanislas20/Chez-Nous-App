// Real hotels, entered by the operator, with every figure confirmed first.
//
// The Hôtels screen ships two example cards and swaps them out the moment a
// real short-stay listing is approved. The intended way for that to happen
// is an hotelier publishing one. This is the other way: the operator enters
// establishments whose rate, tax and telephone number they have confirmed
// themselves, so the screen has something true in it before the first hotel
// signs up.
//
// It follows the pharmacy import, which is the same shape of problem — real
// businesses, entered by us, from a source that is not the business itself:
//
//   - the seller names the SOURCE, not a person. A pharmacy carries
//     sellerId 'onpb-import' and the register's name. A hotel carries
//     'operator-directory' and says the sheet was filled in by Chez-Nous,
//     because a guest reading the card is entitled to know it was not
//     self-published by the hotel.
//   - `confirmedOn` is required and shown. A rate confirmed by telephone
//     goes stale like a duty roster does, and a price with no date behind
//     it is the thing this whole screen exists to argue against.
//   - `isDirectorySeed: true` on every document, so --remove can undo the
//     whole batch without depending on anybody remembering ids.
//   - idempotent: the id is derived from name and city, so running twice
//     corrects rather than duplicates.
//
// It refuses more than it accepts, on purpose. A row missing a price or a
// telephone number is not written: a hotel card people cannot ring, or one
// that does not say what the night costs, is worse than the example card it
// would replace, because the example says it is an example.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/seedHotels.js               # validate only, writes nothing
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/seedHotels.js --apply
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/seedHotels.js --remove
const admin = require("../functions/node_modules/firebase-admin");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const REMOVE = process.argv.includes("--remove");
const SELLER_ID = "operator-directory";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "GOOGLE_APPLICATION_CREDENTIALS is not set — see the usage note at the top of this file.",
  );
  process.exit(1);
}

const root = path.join(__dirname, "..");
// The city list is the app's own, so a typo here fails now rather than
// producing a listing no filter can ever reach.
const citySource = fs.readFileSync(path.join(root, "src/data/cities.js"), "utf8");
const CITIES = [...citySource.matchAll(/'([^']+)'|"([^"]+)"/g)]
  .map((m) => m[1] ?? m[2])
  .filter(Boolean);

const GENERATORS = ["full", "night", "none"];

function validate(row, index) {
  const problems = [];
  const need = (field) => {
    if (row[field] === undefined || row[field] === null || row[field] === "") {
      problems.push(`${field} is missing`);
    }
  };
  ["name", "city", "phone", "confirmedOn"].forEach(need);
  if (!(Number(row.price) > 0)) problems.push("price must be a positive number");
  if (row.touristTax == null || Number(row.touristTax) < 0) {
    problems.push("touristTax must be 0 or more — 0 means none is charged");
  }
  if (!GENERATORS.includes(row.generator)) {
    problems.push(`generator must be one of ${GENERATORS.join(", ")}`);
  }
  if (row.city && !CITIES.includes(row.city)) {
    problems.push(`city "${row.city}" is not one of the app's ${CITIES.length} cities`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.confirmedOn ?? ""))) {
    problems.push("confirmedOn must be YYYY-MM-DD — the day you confirmed the rate");
  }
  if (row.declaredStars && (row.declaredStars < 1 || row.declaredStars > 5)) {
    problems.push("declaredStars must be 1 to 5, or omitted");
  }
  return problems.length ? `row ${index + 1} (${row.name || "unnamed"}): ${problems.join("; ")}` : null;
}

const slug = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function main() {
  if (REMOVE) {
    const snapshot = await db
      .collection("listings")
      .where("sellerId", "==", SELLER_ID)
      .get();
    if (!APPLY) {
      console.log(`Would delete ${snapshot.size} directory hotel(s). Re-run with --apply.`);
      return;
    }
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    console.log(`Deleted ${snapshot.size} directory hotel(s).`);
    return;
  }

  const rows = JSON.parse(
    fs.readFileSync(path.join(__dirname, "hotels.seed.json"), "utf8"),
  ).filter((row) => !row._comment);

  if (!rows.length) {
    console.log("scripts/hotels.seed.json has no rows yet. Nothing to do.");
    return;
  }

  const problems = rows.map(validate).filter(Boolean);
  if (problems.length) {
    problems.forEach((line) => console.error(`REFUSED ${line}`));
    console.error(`\n${problems.length} row(s) refused. Nothing was written.`);
    process.exit(1);
  }

  console.log(`${rows.length} row(s) validated:\n`);
  rows.forEach((row) => {
    const allIn = Number(row.price) + Number(row.touristTax || 0);
    console.log(
      `  ${row.name} — ${row.city}\n` +
        `    ${allIn.toLocaleString("fr-FR")} FCFA all-in ` +
        `(${Number(row.price).toLocaleString("fr-FR")} + ${Number(row.touristTax || 0).toLocaleString("fr-FR")} tax)` +
        ` · generator ${row.generator} · confirmed ${row.confirmedOn}`,
    );
  });

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply.");
    return;
  }

  const batch = db.batch();
  rows.forEach((row) => {
    const id = `hotel-${slug(row.name)}-${slug(row.city)}`;
    batch.set(db.collection("listings").doc(id), {
      isDirectorySeed: true,
      sellerId: SELLER_ID,
      sellerName: "Fiche saisie par Chez-Nous",
      categoryKey: "realEstate",
      realEstateDeal: "shortStay",
      titleFr: row.name,
      titleEn: row.name,
      city: row.city,
      quartier: row.quartier || null,
      phone: row.phone,
      whatsapp: row.whatsapp || null,
      price: Number(row.price),
      touristTax: Number(row.touristTax) || null,
      generator: row.generator,
      breakfastIncluded: !!row.breakfastIncluded,
      hotWater24h: !!row.hotWater24h,
      declaredStars: Number(row.declaredStars) || null,
      confirmedOn: row.confirmedOn,
      status: "approved",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  console.log(`\nWrote ${rows.length} hotel(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
