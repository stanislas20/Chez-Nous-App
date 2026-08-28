// Add a brand distributor to the live directory.
//
// There was no way to do this. The rules make `dealerships` world-readable
// and writable by nobody — deliberately, because "official Toyota
// distributor" is a claim a competitor must not be able to make from a phone
// — so the only route was hand-typing a nested document into the Firebase
// console. That route has three problems, and two of them are silent:
//
//   1. Live rows REPLACE the bundled seed, they do not merge with it. Put
//      one dealership in the collection and the other five disappear from
//      the screen. This script seeds the whole list first, so the collection
//      is complete before anything is added to it.
//
//   2. The query orders by `order`, and Firestore omits documents that do
//      not carry the field. A row added without it is not last — it never
//      appears, and nothing anywhere says why. Required here.
//
//   3. Everything check-dealerships enforces — no phone numbers, https only,
//      marques that resolve — was enforced against the file, and the app
//      reads the collection. Anything typed into the console bypassed all of
//      it. This calls the same validateDealership the check calls.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/addDealership.js --list
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/addDealership.js --suggestions
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/addDealership.js --seed
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/addDealership.js \
//     --key=cotonou-motors --name="Cotonou Motors" --city=Cotonou \
//     --brands=Toyota,Kia --area="Zone portuaire" --website=https://example.bj
//
// Nothing is written without --seed or a complete --key/--name/--city/--brands.
const path = require("path");
const babel = require("@babel/core");
const vm = require("vm");
// Same resolution the other admin scripts use: firebase-admin is a
// functions dependency, not a root one.
const admin = require("../functions/node_modules/firebase-admin");

function loadEsm(relative) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    }).code,
    {
      module: shim,
      exports: shim.exports,
      require: (specifier) =>
        specifier.endsWith("vehicles") ? loadEsm("src/data/vehicles.js") : {},
      console,
    },
  );
  return shim.exports;
}

const { carDealerships, validateDealership } = loadEsm(
  "src/data/carDealerships.js",
);

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, ...rest] = item.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }),
);

// The document as the app reads it. `key` becomes the document id, so it is
// not repeated inside — useDirectory maps the id onto `key` when it reads.
function toDocument(firm) {
  return {
    name: firm.name,
    brands: firm.brands,
    city: firm.city,
    area: firm.area ?? null,
    alsoIn: firm.alsoIn ?? [],
    group: firm.group ?? null,
    // The firm's own published line, for the ones that publish any. Added
    // after the collection was already seeded, which is exactly the trap
    // this script documents: the app reads the collection, so a field that
    // exists only in the bundle is a field the app never sees. Re-run
    // --seed after adding one.
    tagline: firm.tagline ?? null,
    website: firm.website ?? null,
    order: firm.order,
  };
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const collection = admin.firestore().collection("dealerships");

  const live = await collection.orderBy("order", "asc").get();
  console.log(`live: ${live.size} document(s)`);
  live.docs.forEach((doc) =>
    console.log(`  ${doc.data().order}  ${doc.id}  ${doc.data().name}`),
  );

  // A document the query cannot see is the failure this script exists to
  // prevent, so it is worth reporting on every run rather than at the end
  // of a confusing afternoon.
  const all = await collection.get();
  const invisible = all.docs.filter(
    (doc) => typeof doc.data().order !== "number",
  );
  if (invisible.length) {
    console.warn(
      `\nWARNING ${invisible.length} document(s) have no numeric \`order\` and ` +
        `never appear in the app: ${invisible.map((d) => d.id).join(", ")}`,
    );
  }

  // ── What people reported from the app ────────────────────────────────
  //
  // The screen promises that a missing distributor can be reported, and the
  // reports land in a collection nothing in the app reads. This is the only
  // way to see them, so it has to exist or the promise is a dead letter.
  //
  // Read them, check the claim against a published source — the marque's own
  // dealer page, or the company's site — and then write the row with the
  // flags below. A tip is where a row starts, never what a row is.
  if (args.suggestions) {
    const tips = await admin
      .firestore()
      .collection("dealershipSuggestions")
      .orderBy("createdAt", "desc")
      .get();
    console.log(`\nsuggestions: ${tips.size}`);
    tips.docs.forEach((doc) => {
      const tip = doc.data();
      const when = tip.createdAt?.toDate?.().toISOString().slice(0, 10) ?? "?";
      console.log(
        `\n  ${when}  ${doc.id}\n` +
          `    ${tip.name} — ${tip.city || "no city given"}\n` +
          `    marques: ${tip.brands}` +
          (tip.note ? `\n    note: ${tip.note}` : "") +
          `\n    from: ${tip.submittedBy}`,
      );
    });
    if (tips.empty) console.log("  nothing reported yet");
    return;
  }

  if (args.list) return;

  // ── Seeding ──────────────────────────────────────────────────────────
  //
  // The collection starts empty and the app falls back to the bundled six.
  // The moment anything is written, the fallback stops being used entirely,
  // so the first write has to be all six — otherwise adding a seventh
  // distributor deletes the other five from the screen.
  if (args.seed) {
    const batch = admin.firestore().batch();
    carDealerships.forEach((firm, index) => {
      const row = { ...firm, order: firm.order ?? index };
      const problems = validateDealership(row);
      if (problems.length) {
        throw new Error(`${firm.key}: ${problems.join("; ")}`);
      }
      batch.set(collection.doc(firm.key), toDocument(row), { merge: true });
    });
    await batch.commit();
    console.log(`\nseeded ${carDealerships.length} bundled distributor(s)`);
    return;
  }

  // ── Adding one ───────────────────────────────────────────────────────
  if (!args.key || !args.name || !args.city || !args.brands) {
    console.log(
      "\nnothing written. --list to inspect, --suggestions to read what was " +
        "reported from the app, --seed to publish the bundled list, or pass " +
        "--key --name --city --brands to add one.",
    );
    return;
  }

  if (live.empty) {
    throw new Error(
      "the collection is empty — run --seed first, or adding this one will " +
        "hide the bundled distributors from the app",
    );
  }

  const highest = live.docs.reduce(
    (max, doc) => Math.max(max, doc.data().order ?? 0),
    -1,
  );
  const firm = {
    key: String(args.key),
    name: String(args.name),
    city: String(args.city),
    brands: String(args.brands)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    area: args.area ? String(args.area) : null,
    group: args.group ? String(args.group) : null,
    website: args.website ? String(args.website) : null,
    alsoIn: args.alsoIn
      ? String(args.alsoIn)
          .split(",")
          .map((item) => item.trim())
      : [],
    order: args.order ? Number(args.order) : highest + 1,
  };

  const problems = validateDealership(firm);
  if (problems.length) {
    problems.forEach((line) => console.error(`  refused: ${line}`));
    throw new Error(`${firm.key} does not satisfy the directory's rules`);
  }

  const existing = await collection.doc(firm.key).get();
  if (existing.exists && !args.force) {
    throw new Error(
      `${firm.key} already exists — pass --force to overwrite it`,
    );
  }

  await collection.doc(firm.key).set(toDocument(firm), { merge: true });
  console.log(`\nwrote ${firm.key} (order ${firm.order})`);
  console.log(
    "remember to add it to src/data/carDealerships.js too, and bump " +
      "dealershipsReviewedOn — the bundled list is what a cold start shows.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\nFAILED: ${error.message}`);
    process.exit(1);
  });
