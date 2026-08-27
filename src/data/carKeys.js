// Clés auto — the price depends on the key.
//
// This follows the owner's design, and the design's whole argument is one
// spread: a plain blade is copied for 3 500 FCFA, a hands-free key remade
// with no model to copy passes 145 000. Same trade, same shop, forty times
// the money — and which one you are holding is a fact about the car that
// most people cannot name. Saying it before a specialist is called out is
// the point of the screen.
//
// So every job is priced three times, once per kind of key, and a job that
// does not exist for a kind is null rather than zero: a plain blade has no
// remote battery and no calculator to pair, and showing "0 FCFA" would read
// as free rather than as not applicable.
//
// ── On the prices ────────────────────────────────────────────────────────
//
// These are the owner's own figures for this market, not a live quote and
// not scraped from any listing. The screen has to say so where they are
// shown, and the specialist still quotes: a number presented here as if a
// particular workshop had agreed to it would be a promise this app cannot
// keep. What they are good for is the comparison — telling somebody that
// their situation is a 3 500 job or a 145 000 job before anybody drives
// across town.

// What kind of key the car takes. Three, because three is what changes the
// price; finer distinctions than this do not.
export const keyTypes = [
  {
    key: "mech",
    labelEn: "Plain blade",
    labelFr: "Clé plate",
    hintEn: "No chip",
    hintFr: "Sans puce",
    noteEn:
      "Metal only, nothing electronic. Older vehicles. The cheapest of everything here, and the only kind where cutting is the whole job.",
    noteFr:
      "Du métal, rien d'électronique. Véhicules anciens. Le moins cher de tout ce qui suit, et le seul type où tailler est tout le travail.",
  },
  {
    key: "remote",
    labelEn: "Chipped key",
    labelFr: "Clé à puce",
    hintEn: "Transponder",
    hintFr: "Transpondeur",
    noteEn:
      "A chip in the head, usually with buttons. The blade is cut and the chip is paired to the car — a copy that is only cut will not start it.",
    noteFr:
      "Une puce dans la tête, en général avec des boutons. La lame se taille et la puce s'apparie à la voiture — une copie seulement taillée ne démarrera pas.",
  },
  {
    key: "smart",
    labelEn: "Hands-free key",
    labelFr: "Clé mains libres",
    hintEn: "Button start",
    hintFr: "Démarrage bouton",
    noteEn:
      "The key stays in your pocket and the car starts on a button. Every job below costs the most on this kind, and fewest workshops can do them.",
    noteFr:
      "La clé reste dans la poche et la voiture démarre au bouton. Chaque travail ci-dessous y coûte le plus cher, et peu d'ateliers savent les faire.",
  },
];

export function getKeyType(key) {
  return keyTypes.find((item) => item.key === key) ?? null;
}

// Every job a key specialist does, priced per kind of key.
//
// `mins` is how long the work takes, which matters as much as the price when
// somebody is standing next to a locked car deciding whether to wait.
export const keyJobs = [
  {
    key: "open",
    labelEn: "Door opening",
    labelFr: "Ouverture de porte",
    detailEn: "Tracing tool, no damage",
    detailFr: "Outil de traçage, sans dégât",
    mins: 20,
    price: { mech: 8000, remote: 10000, smart: 15000 },
  },
  {
    key: "extract",
    labelEn: "Broken key extraction",
    labelFr: "Extraction de clé cassée",
    detailEn: "Removing the piece from the barrel",
    detailFr: "Retrait du morceau dans le barillet",
    mins: 30,
    price: { mech: 10000, remote: 15000, smart: 20000 },
  },
  {
    key: "battery",
    labelEn: "Remote battery",
    labelFr: "Pile de télécommande",
    detailEn: "Replaced, battery included",
    detailFr: "Remplacement, pile comprise",
    mins: 10,
    price: { mech: null, remote: 2500, smart: 3500 },
  },
  {
    key: "shell",
    labelEn: "Shell and buttons",
    labelFr: "Coque et boutons",
    detailEn: "New casing, existing electronics kept",
    detailFr: "Boîtier neuf, électronique conservée",
    mins: 30,
    price: { mech: null, remote: 12000, smart: 25000 },
  },
  {
    key: "copy",
    labelEn: "Copy from an existing key",
    labelFr: "Double sur clé existante",
    detailEn: "Mechanical copy and transponder",
    detailFr: "Copie mécanique et transpondeur",
    mins: 45,
    price: { mech: 3500, remote: 25000, smart: 65000 },
  },
  {
    key: "origin",
    labelEn: "Key remade with no model",
    labelFr: "Clé refaite sans modèle",
    detailEn: "Decoded from the chassis number",
    detailFr: "Décodage par numéro de châssis",
    mins: 120,
    price: { mech: 15000, remote: 55000, smart: 145000 },
  },
  {
    key: "program",
    labelEn: "Calculator programming",
    labelFr: "Programmation calculateur",
    detailEn: "Pairing, and voiding the lost keys",
    detailFr: "Appariement, invalidation des clés perdues",
    mins: 90,
    price: { mech: null, remote: 35000, smart: 60000 },
  },
  {
    key: "code",
    labelEn: "Reading the lock code",
    labelFr: "Lecture du code serrure",
    detailEn: "Taken from the dismounted barrel",
    detailFr: "Relevé sur barillet démonté",
    mins: 60,
    price: { mech: 8000, remote: 12000, smart: 18000 },
  },
  {
    key: "diag",
    labelEn: "Immobiliser diagnosis",
    labelFr: "Diagnostic antidémarrage",
    detailEn: "Reading codes, testing the transponder",
    detailFr: "Lecture des codes, test transpondeur",
    mins: 45,
    price: { mech: null, remote: 10000, smart: 12000 },
  },
  {
    key: "lockchange",
    labelEn: "Lock replacement",
    labelFr: "Changement de serrure",
    detailEn: "Barrel and cylinders, part included",
    detailFr: "Barillet et cylindres, pièce comprise",
    mins: 180,
    price: { mech: 45000, remote: 65000, smart: 120000 },
  },
];

export function getKeyJob(key) {
  return keyJobs.find((item) => item.key === key) ?? null;
}

// What has happened, and which jobs it turns into.
//
// Each note is the thing worth knowing before anybody is paid — and three of
// them are warnings about what people do while waiting, which is when the
// expensive mistakes get made.
export const keyNeeds = [
  {
    key: "locked",
    icon: "lock-closed-outline",
    urgent: true,
    labelEn: "Keys locked in",
    labelFr: "Clés enfermées",
    hintEn: "Inside the vehicle",
    hintFr: "Dans le véhicule",
    jobs: ["open"],
    noteEn:
      "Opened without damage using a tracing tool. Do not try the coat hanger: on a recent model you cut the door airbag wiring.",
    noteFr:
      "Ouverture sans casse par outil de traçage. N'essayez pas le cintre : sur un modèle récent vous coupez les câbles d'airbag de porte.",
  },
  {
    key: "lost",
    icon: "search-outline",
    urgent: true,
    labelEn: "Keys lost",
    labelFr: "Clés perdues",
    hintEn: "No spare at all",
    hintFr: "Aucun double",
    jobs: ["origin", "code", "program", "lockchange"],
    noteEn:
      "With no spare, the calculator has to be reprogrammed to void the lost key. Otherwise whoever finds it keeps access.",
    noteFr:
      "Sans aucun double, il faut reprogrammer le calculateur pour invalider la clé perdue. Sinon celui qui la trouve garde l'accès.",
  },
  {
    key: "broken",
    icon: "cut-outline",
    urgent: false,
    labelEn: "Key broken",
    labelFr: "Clé cassée",
    hintEn: "In the lock, or in two",
    hintFr: "Dans la serrure ou en deux",
    jobs: ["extract", "origin", "code"],
    noteEn:
      "Do not force the piece left in the barrel: a failed extraction turns a 15 000 job into a lock replacement.",
    noteFr:
      "Ne forcez pas le morceau resté dans le barillet : une extraction ratée transforme un travail de 15 000 en changement de serrure.",
  },
  {
    key: "copy",
    icon: "copy-outline",
    urgent: false,
    labelEn: "Make a spare",
    labelFr: "Faire un double",
    hintEn: "A second key",
    hintFr: "Clé de secours",
    jobs: ["origin", "copy", "program"],
    noteEn:
      "Do it before you need it: a copy taken from an existing key costs three to ten times less than a key remade from nothing.",
    noteFr:
      "Faites-le avant d'en avoir besoin : un double fait sur clé existante coûte trois à dix fois moins qu'une clé refaite à partir de rien.",
  },
  {
    key: "remote",
    icon: "radio-outline",
    urgent: false,
    labelEn: "Dead remote",
    labelFr: "Télécommande morte",
    hintEn: "No longer locks",
    hintFr: "Ne verrouille plus",
    jobs: ["battery", "program", "shell"],
    noteEn:
      "Nine times out of ten it is the battery or the button contact, not the electronics. Have it tested before you accept a new key.",
    noteFr:
      "Neuf fois sur dix c'est la pile ou le contact du bouton, pas l'électronique. Faites tester avant d'accepter une clé neuve.",
  },
  {
    key: "immo",
    icon: "power-outline",
    urgent: false,
    labelEn: "Immobiliser",
    labelFr: "Antidémarrage",
    hintEn: "It turns, nothing starts",
    hintFr: "La clé tourne, rien ne part",
    jobs: ["diag", "program"],
    noteEn:
      "A key or padlock warning light means the transponder is no longer recognised. That is programming work, not mechanics.",
    noteFr:
      "Un voyant clé ou cadenas allumé signifie que le transpondeur n'est plus reconnu. C'est un travail de programmation, pas de mécanique.",
  },
];

export function getKeyNeed(key) {
  return keyNeeds.find((item) => item.key === key) ?? null;
}

// The jobs a need turns into, for the kind of key actually held — dropping
// the ones that do not exist on it.
//
// Returning an empty array is a real answer and the screen says so: asking
// about a dead remote on a plain blade is asking about a part the key does
// not have, and the honest reply is "not on that key", not an empty list
// that looks like nobody offers it.
export function jobsFor(needKey, typeKey) {
  const need = getKeyNeed(needKey);
  if (!need) return [];
  return need.jobs
    .map(getKeyJob)
    .filter(Boolean)
    .filter((job) => job.price[typeKey] != null);
}

// The cheapest and dearest of a need, on one kind of key. What the screen
// shows before anything is chosen, because the spread is the message.
export function priceRangeFor(needKey, typeKey) {
  const prices = jobsFor(needKey, typeKey).map((job) => job.price[typeKey]);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// Which trades can end a need.
//
// The design does not model this — it lists "spécialistes" — but the
// provider list has to come from somewhere, and two of these are genuinely
// not locksmith work. An immobiliser that no longer recognises a
// transponder is an auto electrician's day, and a car locked in the street
// is whoever is already on the road. Sending both to a locksmith would be a
// filtered garage list with extra steps.
export function specialtiesForNeed(needKey) {
  if (needKey === "immo") return ["keys", "elec"];
  if (needKey === "locked") return ["keys", "depan"];
  return getKeyNeed(needKey) ? ["keys"] : [];
}

// What to bring. The first two are the ones that matter: a specialist who
// asks for the carte grise and an ID is protecting the car, and one who
// never asks would make a key for whoever took it.
export const keyChecklist = [
  { key: "carteGrise", labelEn: "The carte grise", labelFr: "La carte grise" },
  { key: "id", labelEn: "Your own ID", labelFr: "Votre pièce d'identité" },
  {
    key: "remaining",
    labelEn: "Any key you still have, even a broken one",
    labelFr: "Toute clé qui vous reste, même cassée",
  },
];
