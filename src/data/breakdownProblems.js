// Roadside problems, in the words of somebody standing next to a car that
// will not move.
//
// This is deliberately not the Garages triage. That one asks "what is wrong
// with the car" to route a considered repair; this one starts from "I am
// stuck right now" and its only job is to reach a human quickly. So the
// labels are plain — "Batterie à plat", not "circuit de démarrage" — and
// every path ends at real providers with a phone number.
//
// `trades` are keys from garageSpecialties. A problem lists the trades that
// can actually address it, and the follow-up question narrows that further
// where the answer genuinely changes who you need — a puncture you can
// change yourself is a tyre fitter, one you cannot is a tyre fitter OR a
// recovery truck. A follow-up that did not change the outcome would be a
// question asked for the sake of asking, at the worst possible moment.
//
// The eight ordered first are the ones to launch with; accident and "other"
// follow because they are the two that behave differently.
export const breakdownProblems = [
  {
    key: "battery",
    emoji: "🔋",
    labelEn: "Flat battery",
    labelFr: "Batterie à plat",
    trades: ["batt", "elec"],
    followUp: {
      questionEn: "Is the car stuck where it is?",
      questionFr: "Votre voiture est-elle immobilisée ?",
      options: [
        {
          key: "yes",
          labelEn: "Yes, it will not move",
          labelFr: "Oui, elle ne bouge pas",
          trades: ["batt", "elec", "depan"],
        },
        {
          key: "no",
          labelEn: "No, it still runs",
          labelFr: "Non, elle roule encore",
          trades: ["batt", "elec"],
        },
      ],
    },
  },
  {
    key: "puncture",
    emoji: "🛞",
    labelEn: "Puncture",
    labelFr: "Crevaison",
    trades: ["pneu"],
    followUp: {
      questionEn: "Can you change the wheel yourself?",
      questionFr: "Pouvez-vous changer la roue vous-même ?",
      options: [
        {
          key: "yes",
          labelEn: "Yes, I have a spare",
          labelFr: "Oui, j’ai une roue de secours",
          trades: ["pneu"],
        },
        {
          key: "no",
          labelEn: "No, I need someone to come",
          labelFr: "Non, il faut que quelqu’un vienne",
          trades: ["pneu", "depan"],
        },
      ],
    },
  },
  {
    key: "noStart",
    emoji: "🚗",
    labelEn: "It will not start",
    labelFr: "Elle ne démarre pas",
    trades: ["batt", "elec", "diag", "meca"],
    followUp: {
      questionEn: "What happens when you turn the key?",
      questionFr: "Que se passe-t-il quand vous tournez la clé ?",
      options: [
        {
          key: "silent",
          labelEn: "No sound at all",
          labelFr: "Aucun bruit",
          trades: ["batt", "elec"],
        },
        {
          key: "lights",
          labelEn: "The lights come on",
          labelFr: "Les voyants s’allument",
          trades: ["elec", "batt"],
        },
        {
          key: "turns",
          labelEn: "It turns over but will not catch",
          labelFr: "Le moteur tourne mais ne démarre pas",
          trades: ["meca", "diag"],
        },
        {
          key: "noise",
          labelEn: "An unusual noise",
          labelFr: "Un bruit inhabituel",
          trades: ["meca", "diag"],
        },
        {
          key: "unsure",
          labelEn: "I am not sure",
          labelFr: "Je ne sais pas",
          trades: ["diag", "meca", "elec"],
        },
      ],
    },
  },
  {
    key: "towing",
    emoji: "🪝",
    labelEn: "I need towing",
    labelFr: "J’ai besoin d’un remorquage",
    trades: ["depan"],
  },
  {
    key: "electrical",
    emoji: "⚡",
    labelEn: "Electrical fault",
    labelFr: "Panne électrique",
    trades: ["elec", "diag"],
  },
  {
    key: "overheat",
    emoji: "🌡️",
    labelEn: "Overheating",
    labelFr: "Surchauffe",
    trades: ["meca", "depan"],
    // Shown before anything else, because the useful thing to say about an
    // overheating engine is "stop", not "here are four garages".
    safetyKey: "breakdownSafetyOverheat",
  },
  {
    key: "fuel",
    emoji: "⛽",
    labelEn: "Out of fuel",
    labelFr: "Panne de carburant",
    trades: ["depan"],
    // Chez-Nous delivers nothing. Saying so up front is better than a
    // "Demander une livraison" button that quietly means "phone somebody
    // and ask if they do that".
    safetyKey: "breakdownNoteFuel",
  },
  {
    key: "keys",
    emoji: "🔑",
    labelEn: "Keys lost or locked in",
    labelFr: "Clés perdues ou enfermées",
    trades: ["keys"],
  },
  {
    key: "accident",
    emoji: "🚙",
    labelEn: "I have had a collision",
    labelFr: "J’ai eu un accident",
    trades: ["depan", "carro"],
    // The one path that leads somewhere other than a provider list first.
    emergency: true,
    safetyKey: "breakdownSafetyAccident",
  },
  {
    key: "other",
    emoji: "❓",
    labelEn: "Something else",
    labelFr: "Autre problème",
    // Everything, because we do not know — better a long list than a wrong
    // narrow one when somebody could not describe the fault.
    trades: [],
  },
];

export function getBreakdownProblem(key) {
  return breakdownProblems.find((item) => item.key === key) ?? null;
}
