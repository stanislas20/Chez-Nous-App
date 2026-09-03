// The hotel directory, from OpenStreetMap.
//
// The Hôtels screen was built for listings: an establishment publishes its
// rate, its taxe de séjour and whether it has a generator, and the screen
// compares them. That works and it is the point — but until hoteliers sign
// up it shows two example cards, and "hôtels autour de moi" cannot be
// answered at all.
//
// The pharmacy screen solves the same problem by importing an authoritative
// source and saying so. This is the equivalent for lodging: OpenStreetMap
// carries ~750 named hotels, auberges, hostels and motels in Bénin, each
// with real coordinates and about one in seven with a telephone number.
// It is openly licensed (ODbL), which is what makes it usable at all —
// the alternative sources are licensed data that may not be republished.
//
// What OSM has: a name, a kind, a position, sometimes a telephone number,
// sometimes a website. What it does not have: a rate, a taxe de séjour, a
// generator, a breakfast, a star count. So a directory card states what is
// known and says plainly that the price is not — it never guesses one. That
// is the same rule the sample cards follow and the reason the priced
// listings stay in a separate section above.
//
// Fetched at build time rather than at runtime, deliberately:
//
//   - the screen must work on a bad connection, which is most of them;
//   - Overpass is a volunteer-run service and an app polling it from every
//     phone would be an abuse of it;
//   - a bundled file is reviewable in a diff, so a bad import is visible
//     before it ships rather than after.
//
// Run: node scripts/fetchOsmHotels.js
const fs = require("fs");
const path = require("path");

// Overpass is volunteer-run and answers 504 when it is busy, which it
// often is. Mirrors are tried in turn rather than the run simply failing —
// a build script that gives up on the first busy minute is one nobody can
// rely on.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="BJ"][admin_level=2]->.bj;
(
  node["tourism"~"^(hotel|guest_house|hostel|motel)$"](area.bj);
  way["tourism"~"^(hotel|guest_house|hostel|motel)$"](area.bj);
);
out center tags;
`;

const root = path.join(__dirname, "..");

// The app stores one of 61 named cities on everything, so each OSM point is
// resolved to the nearest of them — the same radius rule nearestCity.js
// applies, for the same reason: a confident wrong city is worse than none.
const citySource = fs.readFileSync(path.join(root, "src/data/cities.js"), "utf8");
const CITIES = [...citySource.matchAll(/'([^']+)'|"([^"]+)"/g)]
  .map((m) => m[1] ?? m[2])
  .filter(Boolean);
const coordSource = fs.readFileSync(
  path.join(root, "src/data/cityCoordinates.js"),
  "utf8",
);
const CITY_COORDS = {};
for (const m of coordSource.matchAll(
  /([A-Za-zÀ-ÿ'’\-\s]+):\s*\{\s*latitude:\s*(-?[\d.]+),\s*longitude:\s*(-?[\d.]+)/g,
)) {
  CITY_COORDS[m[1].trim().replace(/^['"]|['"]$/g, "")] = {
    latitude: Number(m[2]),
    longitude: Number(m[3]),
  };
}

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const MAX_CITY_KM = 120;
function nearestCity(point) {
  let best = null;
  let bestKm = Infinity;
  for (const name of CITIES) {
    const coord = CITY_COORDS[name];
    if (!coord) continue;
    const d = km(point, coord);
    if (d < bestKm) {
      bestKm = d;
      best = name;
    }
  }
  return bestKm <= MAX_CITY_KM ? best : null;
}

// Benin numbers are ten digits beginning 01. OSM carries them in every
// shape a human types: +229 prefixes, spaces, slashes, the old eight-digit
// form. Anything that does not resolve to a dialable number is dropped
// rather than stored half-normalised — a card with a broken number is
// worse than one with none.
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

async function main() {
  let data = null;
  for (const endpoint of OVERPASS_MIRRORS) {
    process.stdout.write(`Querying ${new URL(endpoint).host}… `);
    try {
      // Form-encoded, not a bare body: Overpass answers 406 to text/plain.
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          // It answers 406 to a request that does not identify itself, and
          // it is right to: this is volunteer-run infrastructure, and an
          // anonymous script is one it cannot contact when it misbehaves.
          "user-agent": "chez-nous-marketplace/1.0 (hotel directory import)",
        },
        body: `data=${encodeURIComponent(QUERY)}`,
      });
      if (!response.ok) {
        console.log(`${response.status}`);
        continue;
      }
      data = await response.json();
      console.log(`${data.elements.length} element(s)`);
      break;
    } catch (error) {
      console.log(error.message);
    }
  }
  if (!data) throw new Error("every Overpass mirror refused or timed out");
  const seen = new Set();
  const entries = [];
  let noName = 0;
  let noCity = 0;

  for (const element of data.elements) {
    const tags = element.tags ?? {};
    const name = (tags.name ?? "").trim();
    if (!name) {
      noName += 1;
      continue;
    }
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude == null || longitude == null) continue;

    const city = nearestCity({ latitude, longitude });
    if (!city) {
      noCity += 1;
      continue;
    }

    // Two OSM objects can describe the same building — a node inside a way.
    // Same name within a hundred metres is treated as one place.
    const key = `${name.toLowerCase()}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      id: `osm-${element.type}-${element.id}`,
      name,
      kind: tags.tourism,
      city,
      latitude: Number(latitude.toFixed(5)),
      longitude: Number(longitude.toFixed(5)),
      phone: normalizePhone(tags.phone ?? tags["contact:phone"]),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const withPhone = entries.filter((entry) => entry.phone).length;
  const out = path.join(root, "src/data/osmLodging.json");
  fs.writeFileSync(out, `${JSON.stringify(entries, null, 0)}\n`);

  console.log(
    `\nWrote ${entries.length} place(s) to src/data/osmLodging.json\n` +
      `  ${withPhone} with a dialable number\n` +
      `  skipped: ${noName} unnamed, ${noCity} beyond ${MAX_CITY_KM} km of any known city`,
  );
  console.log(
    "\nData © OpenStreetMap contributors, ODbL. The screen must say so.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
