// Test data for the screens that have never rendered a card.
//
// Pneus and Batterie were built, shipped and never seen with content in
// them, because nobody has published a tyre or a battery yet. Every offer
// card, provider card, count row, sort and filter on both screens is
// therefore unexercised — the empty state is the only branch anyone has
// looked at. This writes enough real documents to make the rest visible.
//
// Three rules keep it from becoming a mess in a live database:
//
//   1. Every document carries `isTestSeed: true`. That flag is what
//      --remove deletes on, so cleanup can never depend on remembering ids.
//   2. Every title starts with "TEST —", so if one is ever seen by a real
//      user it reads as what it is rather than as a business that is not
//      there.
//   3. The seed is idempotent: running it twice replaces rather than
//      duplicates, because a half-cleaned database is worse than none.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/seedTestListings.js            # create
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/seedTestListings.js --remove   # delete every seeded doc
//
// Optional: --seller <uid> to attach them to a specific account. Without it
// the script reuses the seller of the most recent real listing, and says
// which — the listings then appear under that account's "Mes annonces", so
// they can also be deleted from inside the app.

const RUNNING = require.main === module;

let admin = null;
let db = null;
if (RUNNING) {
  admin = require("../functions/node_modules/firebase-admin");
  admin.initializeApp({ projectId: "benin-marketplace-3eb04" });
  db = admin.firestore();
}

const args = process.argv.slice(2);
const REMOVE = args.includes("--remove");
const sellerFlagIndex = args.indexOf("--seller");
const SELLER_OVERRIDE =
  sellerFlagIndex !== -1 ? args[sellerFlagIndex + 1] : null;

const CITY = "Cotonou";
// Cotonou's own coordinates, the same pair cityCoordinates gives a listing
// published from the app — so distance sorting has something real to work
// with rather than nulls.
const COORDS = { latitude: 6.3703, longitude: 2.3912 };

// The shape every listing shares, so the seeded ones are indistinguishable
// from published ones apart from the flag and the title prefix.
function base(sellerId, sellerName, stamp) {
  return {
    isTestSeed: true,
    sellerId,
    sellerName,
    sellerVerified: false,
    sellerPhotoUrl: null,
    sellerMemberSince: null,
    city: CITY,
    latitude: COORDS.latitude,
    longitude: COORDS.longitude,
    media: [],
    mediaType: null,
    mediaUrl: null,
    mediaPath: null,
    isPromoted: false,
    popular: false,
    // Approved on purpose: the screens read useApprovedListings, so a
    // pending document would leave every list exactly as empty as before.
    status: "approved",
    createdAt: stamp,
    approvedAt: stamp,
  };
}

function listing(sellerId, sellerName, stamp, titleFr, descriptionFr, extra) {
  return {
    ...base(sellerId, sellerName, stamp),
    titleEn: `TEST — ${titleFr}`,
    titleFr: `TEST — ${titleFr}`,
    descriptionEn: descriptionFr,
    descriptionFr,
    ...extra,
  };
}

function buildDocs(sellerId, sellerName, stamp) {
  const make = (titleFr, descriptionFr, extra) =>
    listing(sellerId, sellerName, stamp, titleFr, descriptionFr, extra);

  return [
    // --- Pneus: two offers in the same size, so "du moins cher" has
    // something to order and the new/used filter has both sides.
    make(
      "Michelin Energy XM2+ 195/65 R15",
      "Pneu neuf, montage et équilibrage inclus. Annonce de test.",
      {
        categoryKey: "vehicles",
        partType: "tyre",
        price: 62000,
        tyreBrand: "Michelin",
        tyreModel: "Energy XM2+",
        tyreWidth: 195,
        tyreRatio: 65,
        tyreDiameter: 15,
        tyreCondition: "new",
        tyreDotYear: null,
        tyreTreadMm: null,
        tyreStock: 8,
        tyreFitting: "included",
        phone: "0197000001",
        whatsapp: "0197000001",
        area: "Ganhi",
      },
    ),
    make(
      "Continental PremiumContact 195/65 R15",
      "Pneu d’occasion, gomme 6,5 mm. Annonce de test.",
      {
        categoryKey: "vehicles",
        partType: "tyre",
        price: 22000,
        tyreBrand: "Continental",
        tyreModel: "PremiumContact",
        tyreWidth: 195,
        tyreRatio: 65,
        tyreDiameter: 15,
        tyreCondition: "used",
        // Old enough to trip the DOT warning, which is a branch worth
        // seeing rendered rather than trusted.
        tyreDotYear: new Date().getFullYear() - 7,
        tyreTreadMm: 6.5,
        tyreStock: 2,
        tyreFitting: "extra",
        phone: "0197000002",
        area: "Sème-Podji",
      },
    ),

    // --- Batteries: two capacities, one with a trade-in and one without.
    make(
      "Bosch S4 005 60 Ah",
      "Batterie neuve, pose incluse. Annonce de test.",
      {
        categoryKey: "vehicles",
        partType: "battery",
        price: 145000,
        batteryCategory: "car",
        batteryBrand: "Bosch",
        batteryModel: "S4 005",
        batteryAh: 60,
        batteryAmps: 540,
        batteryTech: "lead",
        batteryTerminal: "right",
        batteryWarranty: "24",
        batteryStock: 4,
        batteryFitting: "included",
        batteryTradeIn: 8000,
        phone: "0197000003",
        whatsapp: "0197000003",
        area: "Fidjrossè",
      },
    ),
    make(
      "Fulmen Formula 45 Ah",
      "Batterie neuve, batterie seule. Annonce de test.",
      {
        categoryKey: "vehicles",
        partType: "battery",
        price: 98000,
        batteryCategory: "car",
        batteryBrand: "Fulmen",
        batteryModel: "Formula",
        batteryAh: 45,
        batteryAmps: 400,
        batteryTech: "lead",
        batteryTerminal: "left",
        batteryWarranty: "12",
        batteryStock: 2,
        batteryFitting: "none",
        batteryTradeIn: 0,
        phone: "0197000004",
        area: "Akpakpa",
      },
    ),

    // --- Providers. These are ordinary Services listings: membership of
    // Garages, Pneus and Batterie is decided by the words, so the titles
    // and descriptions have to actually name the trade.
    make(
      "Pneus et géométrie Ganhi",
      "Montage de pneus, équilibrage, géométrie et réparation de crevaison. Annonce de test.",
      {
        categoryKey: "services",
        serviceRateType: "from",
        price: 3000,
        tyreServices: ["fitting", "balancing", "alignment", "repair", "mobile"],
        tyreSizes: ["195/65 R15", "205/55 R16", "175/70 R14"],
        tyreBrands: "Michelin, Bridgestone, Dunlop",
        phone: "0197000005",
        whatsapp: "0197000005",
        area: "Ganhi",
        openDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
        openTime: "08:00",
        closeTime: "18:30",
      },
    ),
    make(
      "Batterie Express Cotonou",
      "Vente et pose de batterie auto, test de batterie, démarrage et reprise de l’ancienne. Annonce de test.",
      {
        categoryKey: "services",
        serviceRateType: "from",
        price: 2000,
        batteryServices: ["test", "boost", "install", "recycle", "mobile"],
        phone: "0197000006",
        whatsapp: "0197000006",
        area: "Vèdoko",
        openDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        openTime: "07:30",
        closeTime: "20:00",
        // Declared roadside facts, so the Dépannage card's availability
        // pill and response window render too.
        roadsideAvailability: "now",
        roadsideAvailabilityAt: stamp,
        responseTime: "15to30",
        equipment: ["booster", "compressor"],
        coverageZones: "Cotonou, Akpakpa, Vèdoko",
      },
    ),
  ];
}

async function findSeeded() {
  const snapshot = await db
    .collection("listings")
    .where("isTestSeed", "==", true)
    .get();
  return snapshot.docs;
}

async function remove() {
  const docs = await findSeeded();
  if (!docs.length) {
    console.log("Nothing to remove: no seeded listing found.");
    return;
  }
  const batch = db.batch();
  docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Removed ${docs.length} seeded listing(s).`);
}

async function resolveSeller() {
  if (SELLER_OVERRIDE) return { id: SELLER_OVERRIDE, name: "Compte de test" };

  // Borrow the seller from an existing listing — almost always the person
  // running this. Two rules, both learned the hard way on the first run:
  //
  //   * Skip the machine accounts. The pharmacy roster is imported under a
  //     real professional body's name, and it owns more listings than every
  //     human put together, so "any existing listing" landed test tyres
  //     under the Ordre National des Pharmaciens du Bénin. Putting invented
  //     stock under a real organisation's name is the one thing this script
  //     must never do, whatever it costs in convenience.
  //   * Prefer whoever has published in the categories being seeded, since
  //     the listings then sit in a "Mes annonces" where they make sense and
  //     can be deleted from inside the app.
  const snapshot = await db.collection("listings").get();
  const owners = new Map();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.isTestSeed || !data.sellerId) return;
    // An imported roster is not a seller: no human owns that account, so
    // nobody can take the test data down from inside the app either.
    if (data.categoryKey === "pharmacyOnDuty") return;
    const entry = owners.get(data.sellerId) ?? {
      name: data.sellerName || "Vendeur",
      count: 0,
      relevant: 0,
    };
    entry.count += 1;
    if (data.categoryKey === "vehicles" || data.categoryKey === "services") {
      entry.relevant += 1;
    }
    owners.set(data.sellerId, entry);
  });

  const ranked = [...owners.entries()].sort(
    (a, b) => b[1].relevant - a[1].relevant || b[1].count - a[1].count,
  );

  if (!ranked.length) {
    throw new Error(
      "No human-owned listing to borrow a seller from. Pass --seller <uid>.",
    );
  }
  const [id, entry] = ranked[0];
  return { id, name: entry.name };
}

async function seed() {
  // Idempotent: a second run replaces the first rather than doubling it.
  const existing = await findSeeded();
  if (existing.length) {
    const batch = db.batch();
    existing.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Cleared ${existing.length} listing(s) from a previous run.`);
  }

  const seller = await resolveSeller();
  console.log(`Attaching to seller ${seller.id} (${seller.name}).`);

  const docs = buildDocs(
    seller.id,
    seller.name,
    admin.firestore.FieldValue.serverTimestamp(),
  );
  const batch = db.batch();
  docs.forEach((doc) => batch.set(db.collection("listings").doc(), doc));
  await batch.commit();

  console.log(`\nCreated ${docs.length} test listing(s):`);
  docs.forEach((doc) => console.log(`  ${doc.titleFr}`));
  console.log(
    "\nPneus: search 195/65 R15 — two offers, new and used, cheapest first.",
    "\nBatterie: two capacities, 60 Ah and 45 Ah, one with a trade-in.",
    "\nBoth screens also gain one professional each.",
    "\n\nRemove them with:  node scripts/seedTestListings.js --remove",
  );
}

module.exports = { buildDocs };

if (RUNNING) {
  (REMOVE ? remove() : seed())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
