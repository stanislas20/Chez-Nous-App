// Climatisation — what actually goes wrong, and the one fact that saves money.
//
// A car's air conditioning is a sealed circuit. It does not consume gas the
// way an engine consumes oil, so it does not need "topping up" on a
// schedule. If it needs regassing every few months, it is leaking, and each
// recharge is paying to fill a bucket with a hole in it.
//
// That single sentence is the reason this screen exists rather than a filter
// on the garage list. Recharge is the cheapest thing to sell and the easiest
// thing to sell twice, and somebody who does not know a circuit is sealed has
// no way to tell a repair from a repeat.
//
// Everything else here is triage: the symptom decides the trade, and half of
// these are not air-conditioning jobs at all.

// The gas is not a choice, and it is not interchangeable.
//
// Which one a car takes is decided by the car. Putting the wrong one in — or
// a hydrocarbon "universal" substitute, which is flammable and which some
// yards still sell — damages the system and, in the substitute's case, is
// dangerous. The label under the bonnet settles it, which is why the screen
// sends the reader to look rather than asking them to guess from the year.
export const refrigerants = [
  {
    key: "r134a",
    labelEn: "R134a",
    labelFr: "R134a",
    noteEn:
      "The great majority of vehicles circulating here. Most cars imported before the late 2010s use it.",
    noteFr:
      "La grande majorité des véhicules qui circulent ici. La plupart des voitures importées avant la fin des années 2010 l’utilisent.",
  },
  {
    key: "r1234yf",
    labelEn: "R1234yf",
    labelFr: "R1234yf",
    noteEn:
      "Found on more recent imports. It costs considerably more and not every workshop stocks it — worth asking before you arrive.",
    noteFr:
      "Présent sur les importations récentes. Il coûte nettement plus cher et tous les ateliers n’en ont pas — à demander avant de vous déplacer.",
  },
  {
    key: "unknown",
    labelEn: "I don't know",
    labelFr: "Je ne sais pas",
    // The honest default, and the one that gets the reader the right answer.
    noteEn:
      "There is a label under the bonnet that says which gas the system takes. Read it, or have the workshop read it, before anything is put in.",
    noteFr:
      "Une étiquette sous le capot indique le gaz du circuit. Lisez-la, ou faites-la lire par l’atelier, avant de mettre quoi que ce soit.",
  },
];

export function getRefrigerant(key) {
  return refrigerants.find((item) => item.key === key) ?? null;
}

// Symptom first, because that is what the reader has. Each cause names the
// trade that fixes it, and several of these are not air-conditioning work at
// all — a blower that has stopped is an electrical fault, and a puddle in the
// footwell is a blocked drain, not a leak of anything expensive.
export const airconSymptoms = [
  {
    key: "notCold",
    icon: "thermometer-outline",
    labelEn: "It blows, but the air is not cold",
    labelFr: "Elle souffle, mais l’air n’est pas froid",
    causes: [
      {
        labelEn: "Refrigerant has leaked out",
        labelFr: "Le gaz s’est échappé",
        specialty: "clim",
      },
      {
        labelEn: "Compressor or its clutch",
        labelFr: "Le compresseur ou son embrayage",
        specialty: "clim",
      },
      {
        labelEn: "Pressure switch or a fuse",
        labelFr: "Pressostat ou fusible",
        specialty: "elec",
      },
    ],
  },
  {
    key: "noAir",
    icon: "close-circle-outline",
    labelEn: "No air comes out at all",
    labelFr: "Aucun air ne sort",
    causes: [
      {
        labelEn: "Blower motor or its resistor",
        labelFr: "Le pulseur ou sa résistance",
        specialty: "elec",
      },
      {
        labelEn: "Fuse",
        labelFr: "Un fusible",
        specialty: "elec",
      },
    ],
  },
  {
    key: "weakFlow",
    icon: "funnel-outline",
    labelEn: "The airflow has grown weak",
    labelFr: "Le débit d’air a faibli",
    causes: [
      {
        // The cheap one, and the one worth trying first here.
        labelEn: "Blocked cabin filter",
        labelFr: "Filtre d’habitacle encrassé",
        specialty: "clim",
      },
      {
        labelEn: "Evaporator clogged with dust",
        labelFr: "Évaporateur encrassé de poussière",
        specialty: "clim",
      },
    ],
  },
  {
    key: "warmInTraffic",
    icon: "car-outline",
    labelEn: "Cold when moving, warm in traffic",
    labelFr: "Froid en roulant, tiède dans les embouteillages",
    causes: [
      {
        labelEn: "Condenser fan not turning",
        labelFr: "Le ventilateur du condenseur ne tourne plus",
        specialty: "elec",
      },
      {
        labelEn: "Condenser blocked with dust or insects",
        labelFr: "Condenseur obstrué par la poussière ou les insectes",
        specialty: "clim",
      },
    ],
  },
  {
    key: "smell",
    icon: "alert-circle-outline",
    labelEn: "It smells bad when switched on",
    labelFr: "Elle sent mauvais à l’allumage",
    causes: [
      {
        labelEn: "Mould on the evaporator",
        labelFr: "Moisissures sur l’évaporateur",
        specialty: "clim",
      },
      {
        labelEn: "Cabin filter long overdue",
        labelFr: "Filtre d’habitacle jamais remplacé",
        specialty: "clim",
      },
    ],
  },
  {
    key: "noise",
    icon: "volume-high-outline",
    labelEn: "A noise starts when the A/C goes on",
    labelFr: "Un bruit apparaît quand la clim s’enclenche",
    causes: [
      {
        labelEn: "Compressor clutch or bearing",
        labelFr: "Embrayage ou roulement du compresseur",
        specialty: "clim",
      },
      {
        labelEn: "Slack or worn belt",
        labelFr: "Courroie détendue ou usée",
        specialty: "meca",
      },
    ],
  },
  {
    key: "water",
    icon: "water-outline",
    labelEn: "Water collects inside the car",
    labelFr: "De l’eau s’accumule dans l’habitacle",
    causes: [
      {
        // Almost always this, and almost always cheap.
        labelEn: "Blocked condensate drain",
        labelFr: "Évacuation des condensats bouchée",
        specialty: "clim",
      },
    ],
  },
];

export function getSymptom(key) {
  return airconSymptoms.find((item) => item.key === key) ?? null;
}

export function specialtiesForSymptom(key) {
  const symptom = getSymptom(key);
  if (!symptom) return [];
  return [...new Set(symptom.causes.map((cause) => cause.specialty))];
}

// The jobs themselves, so a workshop can be asked for one by name and a
// reader knows what to expect to be quoted for.
export const airconServices = [
  {
    key: "diagnose",
    icon: "search-outline",
    labelEn: "Pressure test and diagnosis",
    labelFr: "Contrôle des pressions et diagnostic",
    noteEn: "What should happen before anything is bought or refilled.",
    noteFr: "Ce qui devrait précéder tout achat ou toute recharge.",
  },
  {
    key: "leak",
    icon: "git-branch-outline",
    labelEn: "Leak detection",
    labelFr: "Recherche de fuite",
    noteEn:
      "Tracer dye or an electronic detector. This is the job that stops you paying for gas twice.",
    noteFr:
      "Traceur fluorescent ou détecteur électronique. C’est ce qui évite de payer le gaz deux fois.",
  },
  {
    key: "recharge",
    icon: "sync-outline",
    labelEn: "Evacuate and recharge",
    labelFr: "Vidange et recharge",
    noteEn: "Worth doing once the circuit holds. On its own it treats nothing.",
    noteFr: "Utile une fois le circuit étanche. Seule, elle ne soigne rien.",
  },
  {
    key: "filter",
    icon: "layers-outline",
    labelEn: "Cabin filter",
    labelFr: "Filtre d’habitacle",
    noteEn:
      "Cheap, quick, and the usual answer to weak airflow and a bad smell.",
    noteFr:
      "Bon marché, rapide, et la réponse habituelle à un débit faible et à une mauvaise odeur.",
  },
  {
    key: "clean",
    icon: "sparkles-outline",
    labelEn: "Circuit cleaning and disinfection",
    labelFr: "Nettoyage et désinfection du circuit",
    noteEn: "For the smell, once the filter has been ruled out.",
    noteFr: "Pour l’odeur, une fois le filtre écarté.",
  },
  {
    key: "compressor",
    icon: "cog-outline",
    labelEn: "Compressor replacement",
    labelFr: "Remplacement du compresseur",
    noteEn:
      "The expensive one. Ask whether the receiver drier is being replaced with it — fitting a compressor without it is what kills the new one.",
    noteFr:
      "La pièce chère. Demandez si le déshydrateur est remplacé en même temps — le monter sans lui est ce qui tue le compresseur neuf.",
  },
];
