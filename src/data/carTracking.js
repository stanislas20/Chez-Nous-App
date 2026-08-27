// GPS & traceur — the box is bought once, the tracking is paid forever.
//
// Almost every tracker needs a SIM with data and a platform account to show
// the position on. The advert quotes the box. The SIM and the subscription
// are what you actually pay, every month, for as long as you want the thing
// to work — so two boxes at the same price can differ by a factor of three
// over three years, and the cheaper box is often the dearer one.
//
// The second half of that is worse and is why this screen leads with it: a
// tracker whose SIM has run out of credit is a dead weight that looks fitted
// and tells you nothing. Nobody discovers that on an ordinary day. They
// discover it the morning the car is gone.
//
// ── No prices here ───────────────────────────────────────────────────────
//
// Clés carries figures because the owner supplied them for that trade. No
// such figures exist for this one, and a range invented here would be quoted
// back at an installer who never agreed to it. What this screen gives
// instead is the list of questions that decide the price — the annual cost
// all-in, the reporting interval, what happens when the SIM lapses — so
// somebody can compare two quotes that look identical and are not.

// What kind of box, which decides both what it costs to fit and how long it
// survives somebody looking for it.
export const trackerKinds = [
  {
    key: "obd",
    icon: "flash-outline",
    labelEn: "OBD plug-in",
    labelFr: "Prise OBD",
    hintEn: "Fits in seconds",
    hintFr: "Se branche en quelques secondes",
    noteEn:
      "Plugs into the diagnostic socket under the dashboard. No installer, no wiring, and it can be unplugged as fast as it was fitted — which is the first place anyone taking the car will look. Good for knowing where your own vehicle is; weak against theft.",
    noteFr:
      "Se branche sur la prise diagnostic sous le tableau de bord. Sans installateur, sans câblage, et se débranche aussi vite qu'il s'est branché — c'est le premier endroit que regarde celui qui prend la voiture. Bon pour savoir où est son propre véhicule ; faible contre le vol.",
  },
  {
    key: "wired",
    icon: "build-outline",
    labelEn: "Hidden and wired in",
    labelFr: "Filaire et caché",
    hintEn: "Fitted by a technician",
    hintFr: "Posé par un technicien",
    noteEn:
      "Wired into the loom and hidden somewhere that takes time to find. Costs an installation and is the only kind that reliably survives a theft. Ask where they intend to put it — and if they answer in front of other customers, ask again in private.",
    noteFr:
      "Câblé dans le faisceau et caché à un endroit qui prend du temps à trouver. Coûte une installation, et c'est le seul type qui survit vraiment à un vol. Demandez où ils comptent le poser — et s'ils répondent devant d'autres clients, redemandez à part.",
  },
  {
    key: "battery",
    icon: "battery-half-outline",
    labelEn: "Battery, magnetic",
    labelFr: "Autonome, aimanté",
    hintEn: "Nothing to wire",
    hintFr: "Rien à câbler",
    noteEn:
      "Runs on its own battery and sticks under a wing or in a boot. Nothing to install, and nothing to keep it alive either: it has to be taken out and recharged every few weeks or months. Suits a trailer, a machine or a temporary worry — not a car you intend to forget about.",
    noteFr:
      "Fonctionne sur sa propre batterie et se colle sous une aile ou dans un coffre. Rien à installer, et rien pour le maintenir en vie non plus : il faut le retirer et le recharger toutes les quelques semaines ou quelques mois. Convient à une remorque, à un engin ou à une inquiétude passagère — pas à une voiture qu'on veut oublier.",
  },
  {
    key: "moto",
    icon: "bicycle-outline",
    labelEn: "Motorcycle unit",
    labelFr: "Traceur moto",
    hintEn: "Small, sealed, 12V",
    hintFr: "Petit, étanche, 12V",
    noteEn:
      "Sized and sealed for a two-wheeler, wired to the bike's own 12V. A car unit fitted to a moto is the common mistake here: it is bigger, it is not waterproof, and there is nowhere on a bike to hide it.",
    noteFr:
      "Dimensionné et étanche pour un deux-roues, câblé sur le 12V de la moto. L'erreur courante ici, c'est le boîtier voiture posé sur une moto : plus gros, pas étanche, et il n'y a nulle part où le cacher sur un engin.",
  },
];

export function getTrackerKind(key) {
  return trackerKinds.find((item) => item.key === key) ?? null;
}

// Why somebody wants one. The kinds listed are the ones that answer it —
// several of these rule a kind out rather than in.
export const trackingNeeds = [
  {
    key: "theft",
    icon: "shield-outline",
    urgent: true,
    labelEn: "Find it after a theft",
    labelFr: "Retrouver après un vol",
    hintEn: "The vehicle is gone",
    hintFr: "Le véhicule a disparu",
    kinds: ["wired", "moto"],
    noteEn:
      "Only a hidden, wired unit is worth fitting for this. An OBD box is unplugged in the first minute, and a battery unit is flat when you need it. What a tracker gives you is a position to hand the police — it does not recover a vehicle, and no installer can promise that it will.",
    noteFr:
      "Seul un boîtier filaire et caché vaut la peine pour ça. Un boîtier OBD se débranche dans la première minute, et un boîtier à batterie est à plat le jour où il faut. Ce qu'un traceur donne, c'est une position à remettre à la police — il ne récupère pas un véhicule, et aucun installateur ne peut promettre le contraire.",
  },
  {
    key: "fleet",
    icon: "business-outline",
    urgent: false,
    labelEn: "Follow several vehicles",
    labelFr: "Suivre plusieurs véhicules",
    hintEn: "Taxis, delivery, transport",
    hintFr: "Taxis, livraison, transport",
    kinds: ["wired", "obd"],
    noteEn:
      "The box matters less than the platform: ask to see it with more than one vehicle on it before you buy, and ask what a year costs per vehicle rather than per box.",
    noteFr:
      "Le boîtier compte moins que la plateforme : demandez à la voir avec plusieurs véhicules dessus avant d'acheter, et demandez ce que coûte une année par véhicule plutôt que par boîtier.",
  },
  {
    key: "rented",
    icon: "people-outline",
    urgent: false,
    labelEn: "A vehicle somebody rents from me",
    labelFr: "Un véhicule que je loue à quelqu'un",
    hintEn: "Moto or car on hire",
    hintFr: "Moto ou voiture en location",
    kinds: ["moto", "wired"],
    noteEn:
      "Tell the rider it is fitted. Not only because it is fair — a tracker somebody discovers is a tracker somebody removes, and the argument that follows costs more than the box.",
    noteFr:
      "Dites au conducteur qu'il est posé. Pas seulement parce que c'est correct — un traceur qu'on découvre est un traceur qu'on retire, et la dispute qui suit coûte plus cher que le boîtier.",
  },
  {
    key: "driver",
    icon: "speedometer-outline",
    urgent: false,
    labelEn: "How my vehicle is driven",
    labelFr: "Comment on conduit mon véhicule",
    hintEn: "Speed, routes, hours",
    hintFr: "Vitesse, trajets, horaires",
    kinds: ["obd", "wired"],
    noteEn:
      "This is the one where the reporting interval decides everything. A box that reports every five minutes cannot tell you anything about speed; it draws a straight line between two points five minutes apart and calls it a journey.",
    noteFr:
      "C'est ici que l'intervalle de position décide de tout. Un boîtier qui remonte toutes les cinq minutes ne peut rien dire de la vitesse : il trace une ligne droite entre deux points espacés de cinq minutes et appelle ça un trajet.",
  },
  {
    key: "asset",
    icon: "cube-outline",
    urgent: false,
    labelEn: "A machine or a trailer",
    labelFr: "Un engin ou une remorque",
    hintEn: "No power of its own",
    hintFr: "Sans alimentation propre",
    kinds: ["battery"],
    noteEn:
      "Nothing to wire into, so a battery unit is the only answer — and the recharge interval is the specification that matters. Ask for it in weeks, on the setting you will actually use.",
    noteFr:
      "Rien où se câbler : un boîtier à batterie est la seule réponse — et l'autonomie est la caractéristique qui compte. Demandez-la en semaines, sur le réglage que vous utiliserez vraiment.",
  },
];

export function getTrackingNeed(key) {
  return trackingNeeds.find((item) => item.key === key) ?? null;
}

// The kinds that answer a need, as objects, in the order the need lists them
// — the first is the one the note argues for.
export function kindsFor(needKey) {
  const need = getTrackingNeed(needKey);
  if (!need) return [];
  return need.kinds.map(getTrackerKind).filter(Boolean);
}

// Whether a kind is a sensible answer to a need. Used to say so plainly when
// somebody picks a combination the trade would talk them out of.
export function kindSuitsNeed(needKey, kindKey) {
  const need = getTrackingNeed(needKey);
  if (!need) return false;
  return need.kinds.includes(kindKey);
}

// What to ask before paying, which on this screen stands where the prices
// stand on Clés.
//
// The first is the whole point: everything else on a quote is noise until
// the annual, all-in figure is on the table. The rest are the questions
// whose answers move that figure, or decide whether the thing works at all
// on the day it is needed.
export const trackingQuestions = [
  {
    key: "yearly",
    icon: "cash-outline",
    labelEn: "What does a year cost, all in?",
    labelFr: "Combien coûte une année, tout compris ?",
    noteEn:
      "Box, SIM and platform together. A quote for the box alone cannot be compared with anything.",
    noteFr:
      "Boîtier, SIM et plateforme ensemble. Un devis pour le seul boîtier ne se compare à rien.",
  },
  {
    key: "interval",
    icon: "time-outline",
    labelEn: "How often does it report?",
    labelFr: "À quel intervalle remonte-t-il ?",
    noteEn:
      "\"Real time\" is a word, not a number. Ask for the number, in seconds, moving and parked — they are usually different.",
    noteFr:
      "« Temps réel » est un mot, pas un chiffre. Demandez le chiffre, en secondes, en roulant et à l'arrêt — ils sont en général différents.",
  },
  {
    key: "lapse",
    icon: "alert-circle-outline",
    labelEn: "What happens when the SIM runs out?",
    labelFr: "Que se passe-t-il quand la SIM n'a plus de crédit ?",
    noteEn:
      "The honest answer is that it stops working. What you want to know is whether anything warns you — and whether that warning reaches you or only them.",
    noteFr:
      "La réponse honnête, c'est qu'il s'arrête. Ce qu'il faut savoir, c'est si quelque chose vous prévient — et si l'alerte vous arrive à vous ou seulement à eux.",
  },
  {
    key: "history",
    icon: "albums-outline",
    labelEn: "How long is the history kept?",
    labelFr: "L'historique est gardé combien de temps ?",
    noteEn:
      "Thirty days and a year are both common, and the difference only matters once — when you need to show where the vehicle was last month.",
    noteFr:
      "Trente jours et un an sont tous deux courants, et la différence ne compte qu'une fois : le jour où il faut montrer où était le véhicule le mois dernier.",
  },
  {
    key: "account",
    icon: "person-outline",
    labelEn: "Whose account is it?",
    labelFr: "À qui appartient le compte ?",
    noteEn:
      "Yours, or the installer's with you as a guest. It decides who can still see the vehicle after you fall out with them, and who has to be involved when you sell it.",
    noteFr:
      "Le vôtre, ou celui de l'installateur avec vous en invité. Cela décide qui peut encore voir le véhicule après une brouille, et qui doit intervenir le jour où vous le revendez.",
  },
  {
    key: "alerts",
    icon: "notifications-outline",
    labelEn: "Which alerts, and to whom?",
    labelFr: "Quelles alertes, et vers qui ?",
    noteEn:
      "Movement, power cut, leaving an area. A power-cut alert is the one that matters: it is what tells you the box has been found, while the vehicle is still nearby.",
    noteFr:
      "Mouvement, coupure d'alimentation, sortie de zone. L'alerte coupure d'alimentation est celle qui compte : c'est elle qui vous dit que le boîtier a été trouvé, pendant que le véhicule est encore près.",
  },
];

// Engine cut-off, kept apart from the questions because it is the one thing
// on this screen that can hurt somebody.
//
// It is sold as the headline feature and it is the one to be slowest about.
// A relay that can cut a running engine can cut it at speed, taking the
// power steering and the brake servo with it. Properly fitted, it inhibits
// the starter so the vehicle cannot be started again — which is what stops a
// theft, and does nothing to a vehicle already moving.
export const CUTOFF_KEY = "cutoff";
