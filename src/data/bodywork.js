// Bodywork, the one car repair where the customer can see the problem and
// still has no idea what it costs.
//
// A dented wing is not like a failing alternator: nothing is hidden, and the
// price depends almost entirely on judgement — whether the panel can be
// pulled or has to be replaced, whether the paint can be blended into one
// panel or three. Which is why every real conversation in this trade starts
// with photographs, and why the quote sits at the middle of this screen
// rather than at the end of it.
//
// The honesty line that matters most here: Chez-Nous does not assess damage
// and does not produce estimates. A photo goes to a carrossier the customer
// picked, in a thread with their name on it. "Montrez-nous les dégâts" would
// promise an appraisal we cannot make.

// What somebody would say, looking at their car.
//
// `service` is the declared service that answers it, and is what the
// provider list filters on. `roadside` is a breakdownProblems key, set only
// where the car may not be drivable — after a collision, and when the
// windscreen is broken, which is both a safety and a legal problem rather
// than something to book for next week.
export const bodyworkProblems = [
  {
    key: "accident",
    icon: "alert-circle-outline",
    service: "dent",
    roadside: "accident",
    // Shown across the full width, first, alone. Somebody who has just had
    // a collision is not comparing paint finishes.
    primary: true,
    labelEn: "Accident damage",
    labelFr: "Accident / dégâts",
    hintEn: "A collision, whatever the size",
    hintFr: "Un choc, quelle que soit son ampleur",
  },
  {
    key: "dent",
    icon: "hammer-outline",
    service: "dent",
    labelEn: "Dents",
    labelFr: "Débosselage",
    hintEn: "Panel beating and filling",
    hintFr: "Tôlerie et masticage",
  },
  {
    key: "paint",
    icon: "color-palette-outline",
    service: "paint",
    labelEn: "Paint",
    labelFr: "Peinture",
    hintEn: "Scratches, blending, a full respray",
    hintFr: "Rayures, raccord, peinture complète",
  },
  {
    key: "bumper",
    icon: "car-outline",
    service: "bumper",
    labelEn: "Bumper",
    labelFr: "Pare-chocs",
    hintEn: "Cracked, torn off, or hanging",
    hintFr: "Fissuré, arraché, ou qui pend",
  },
  {
    key: "door",
    icon: "log-in-outline",
    service: "dent",
    labelEn: "Doors",
    labelFr: "Portes",
    hintEn: "Dented, scraped, or will not shut",
    hintFr: "Enfoncée, rayée, ou qui ne ferme plus",
  },
  {
    key: "wing",
    icon: "shapes-outline",
    service: "dent",
    labelEn: "Wings & bonnet",
    labelFr: "Ailes / Capot",
    hintEn: "Front-end damage",
    hintFr: "Dégâts à l’avant",
  },
  {
    key: "mirror",
    icon: "tablet-landscape-outline",
    service: "mirror",
    labelEn: "Mirror",
    labelFr: "Rétroviseur",
    hintEn: "Broken glass, casing, or motor",
    hintFr: "Glace, coque, ou moteur cassé",
  },
  {
    key: "glass",
    icon: "grid-outline",
    service: "glass",
    // A broken windscreen is not a next-week job: it is a fail on the visite
    // technique and it does not survive the first hard rain.
    roadside: "electrical",
    labelEn: "Windscreen & glass",
    labelFr: "Pare-brise / Vitres",
    hintEn: "Chipped, cracked, or shattered",
    hintFr: "Impact, fissure, ou brisée",
  },
  {
    key: "pdr",
    icon: "sparkles-outline",
    service: "pdr",
    labelEn: "Paintless dent removal",
    labelFr: "Débosselage sans peinture",
    hintEn: "Hail and door dings, paint untouched",
    hintFr: "Grêle et petits chocs, peinture intacte",
  },
];

export function getBodyworkProblem(key) {
  return bodyworkProblems.find((item) => item.key === key) ?? null;
}

// What a carrossier says they do. Declared, never inferred: "carrosserie
// toutes marques" tells a customer with a cracked windscreen nothing.
export const bodyworkServices = [
  {
    key: "dent",
    icon: "hammer-outline",
    labelEn: "Panel beating",
    labelFr: "Débosselage / tôlerie",
    detailEn: "Pulling, filling, replacing a panel.",
    detailFr: "Redressage, mastic, remplacement d’élément.",
  },
  {
    key: "pdr",
    icon: "sparkles-outline",
    labelEn: "Paintless dent removal",
    labelFr: "Débosselage sans peinture",
    detailEn: "Small dents with the paint left intact.",
    detailFr: "Petits chocs sans toucher à la peinture.",
  },
  {
    key: "paint",
    icon: "color-palette-outline",
    labelEn: "Painting",
    labelFr: "Peinture",
    detailEn: "Colour match, blending, full respray.",
    detailFr: "Teinte, raccord, peinture complète.",
  },
  {
    key: "polish",
    icon: "ellipse-outline",
    labelEn: "Polishing",
    labelFr: "Polissage / lustrage",
    detailEn: "Scratches, oxidation, headlight clouding.",
    detailFr: "Rayures, oxydation, phares ternis.",
  },
  {
    key: "weld",
    icon: "flame-outline",
    labelEn: "Welding & chassis",
    labelFr: "Soudure / châssis",
    detailEn: "Structural repair, sills, chassis alignment.",
    detailFr: "Réparation structurelle, bas de caisse, châssis.",
  },
  {
    key: "bumper",
    icon: "car-outline",
    labelEn: "Bumpers",
    labelFr: "Pare-chocs",
    detailEn: "Plastic repair, refitting, replacement.",
    detailFr: "Réparation plastique, repose, remplacement.",
  },
  {
    key: "glass",
    icon: "grid-outline",
    labelEn: "Windscreen & glass",
    labelFr: "Pare-brise & vitres",
    detailEn: "Chip repair, replacement, side windows.",
    detailFr: "Réparation d’impact, remplacement, vitres latérales.",
  },
  {
    key: "mirror",
    icon: "tablet-landscape-outline",
    labelEn: "Mirrors",
    labelFr: "Rétroviseurs",
    detailEn: "Glass, casing, folding motor.",
    detailFr: "Glace, coque, moteur de rabattement.",
  },
  {
    key: "antirust",
    icon: "shield-outline",
    labelEn: "Rust treatment",
    labelFr: "Traitement anti-rouille",
    detailEn: "Cutting out rust, treating, sealing.",
    detailFr: "Découpe, traitement, protection.",
  },
  {
    key: "wrap",
    icon: "layers-outline",
    labelEn: "Wrapping",
    labelFr: "Covering / adhésif",
    detailEn: "Full or partial vinyl, lettering.",
    detailFr: "Covering total ou partiel, lettrage.",
  },
  {
    key: "estimate",
    icon: "camera-outline",
    labelEn: "Quotes from photos",
    labelFr: "Devis sur photos",
    detailEn: "Will price the job from pictures first.",
    detailFr: "Chiffre le travail sur photos avant la visite.",
  },
  {
    key: "mobile",
    icon: "navigate-outline",
    labelEn: "Comes to you",
    labelFr: "Se déplace",
    detailEn: "Works at your home or office.",
    detailFr: "Intervient chez vous ou au bureau.",
  },
];

export function getBodyworkServiceLabel(key, language) {
  const item = bodyworkServices.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// What to photograph, which is the whole difference between a quote and a
// guess. Written from what a carrossier actually needs to price a job: the
// panel, its edges, and the car it belongs to. Advice, not a promise —
// nothing here says an estimate will arrive.
export const bodyworkPhotoTips = [
  {
    key: "wide",
    icon: "expand-outline",
    labelEn: "One wide shot of the whole side",
    labelFr: "Une vue large de tout le côté",
  },
  {
    key: "close",
    icon: "search-outline",
    labelEn: "One close-up of the damage itself",
    labelFr: "Un gros plan sur le dégât lui-même",
  },
  {
    key: "angle",
    icon: "resize-outline",
    labelEn: "One from an angle, so the dent shows",
    labelFr: "Une de biais, pour que le creux se voie",
  },
  {
    key: "light",
    icon: "sunny-outline",
    labelEn: "In daylight — a flash hides dents",
    labelFr: "À la lumière du jour — le flash efface les creux",
  },
];

// The parts a body repair needs, as real searches in the marketplace. A
// carrossier's price often depends on whether the customer brings the part,
// so the two belong on one screen.
export const bodyworkParts = [
  {
    key: "bumper",
    query: "pare-chocs",
    labelEn: "Bumpers",
    labelFr: "Pare-chocs",
  },
  {
    key: "light",
    query: "phare voiture",
    labelEn: "Headlights",
    labelFr: "Phares",
  },
  {
    key: "rear",
    query: "feu arrière voiture",
    labelEn: "Rear lights",
    labelFr: "Feux arrière",
  },
  { key: "wing", query: "aile voiture", labelEn: "Wings", labelFr: "Ailes" },
  {
    key: "bonnet",
    query: "capot voiture",
    labelEn: "Bonnet",
    labelFr: "Capot",
  },
  {
    key: "mirror",
    query: "rétroviseur",
    labelEn: "Mirrors",
    labelFr: "Rétroviseurs",
  },
  {
    key: "grille",
    query: "calandre",
    labelEn: "Grilles",
    labelFr: "Calandres",
  },
  {
    key: "door",
    query: "portière voiture",
    labelEn: "Doors",
    labelFr: "Portes",
  },
  {
    key: "glass",
    query: "pare-brise",
    labelEn: "Windscreens",
    labelFr: "Pare-brise",
  },
];
