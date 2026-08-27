// Clés auto — what actually goes wrong, and the fact that decides the bill.
//
// A modern car key is two separate things in one object: a blade that is
// cut, and a chip that is coded to the car. Cutting is mechanical and cheap;
// coding needs equipment, and the equipment does not cover every make. A
// shop that can do the first cannot necessarily do the second.
//
// The failure this screen exists to prevent is paying for a key that turns.
// A blade cut from your old one will unlock the door and turn in the
// ignition, and the engine will not start, because the immobiliser never saw
// a chip it recognises. From the customer's side that looks like a faulty
// key and a wasted morning; from the workshop's side nothing went wrong at
// all. Asking one question first — can you code my make, not just cut it —
// settles it before any money moves.
//
// Everything else here is triage: the situation decides the trade, and
// several of these are not locksmith jobs.

// What kind of key the car takes.
//
// This is not a preference, it is a fact about the vehicle, and it decides
// whether coding is needed at all. "I don't know" is offered first-class
// rather than being forced into a guess: guessing wrong here is how somebody
// pays for a duplicate that cannot start the car.
export const keyTypes = [
  {
    key: "mechanical",
    labelEn: "Plain metal key",
    labelFr: "Clé métallique simple",
    noteEn:
      "No buttons, no chip in the head. Older vehicles. A cut copy works on its own — this is the only case where cutting alone is the whole job.",
    noteFr:
      "Sans boutons, sans puce dans la tête. Véhicules anciens. Une copie taillée suffit — c'est le seul cas où la taille est tout le travail.",
  },
  {
    key: "remote",
    labelEn: "Key with a remote",
    labelFr: "Clé avec télécommande",
    noteEn:
      "Buttons to lock and unlock, folding or separate. The blade is cut and the remote has to be paired to the car; most also carry a chip.",
    noteFr:
      "Des boutons pour verrouiller et déverrouiller, pliante ou séparée. La lame se taille et la télécommande doit être appairée ; la plupart portent aussi une puce.",
  },
  {
    key: "transponder",
    labelEn: "Chipped key, no buttons",
    labelFr: "Clé à puce, sans boutons",
    noteEn:
      "Looks like a plain key with a thicker plastic head. The chip inside is what lets the engine start, and a copy that is only cut will not start it.",
    noteFr:
      "Ressemble à une clé simple avec une tête en plastique plus épaisse. C'est la puce à l'intérieur qui autorise le démarrage : une copie seulement taillée ne démarrera pas.",
  },
  {
    key: "smart",
    labelEn: "Keyless / start button",
    labelFr: "Sans clé / bouton start",
    noteEn:
      "The key stays in your pocket and the car starts on a button. The most expensive to replace, and the one fewest workshops can code — ask before you travel.",
    noteFr:
      "La clé reste dans la poche et la voiture démarre au bouton. La plus chère à remplacer, et celle que le moins d'ateliers savent coder — demandez avant de vous déplacer.",
  },
  {
    key: "unknown",
    labelEn: "I don't know",
    labelFr: "Je ne sais pas",
    noteEn:
      "Look at the head of the key: buttons mean a remote, a thick plastic head with no buttons usually means a chip. The carte grise does not say. A locksmith can tell in seconds — send a photo before you go.",
    noteFr:
      "Regardez la tête de la clé : des boutons = télécommande, une tête en plastique épaisse sans boutons = souvent une puce. La carte grise ne le dit pas. Un serrurier le voit en quelques secondes — envoyez une photo avant de vous déplacer.",
  },
];

export function getKeyType(key) {
  return keyTypes.find((item) => item.key === key) ?? null;
}

// The situations somebody actually opens this screen in, each pointing at
// the trade that can end it.
//
// Not all of them are locksmith work, which is the whole reason for the
// triage: a key that turns without starting the engine is an immobiliser
// question, a worn ignition barrel is mechanical, and a car locked with the
// keys inside is whoever can get there fastest.
export const keySituations = [
  {
    key: "lostAll",
    icon: "alert-circle-outline",
    labelEn: "I have lost every key",
    labelFr: "J'ai perdu toutes mes clés",
    causes: [
      {
        specialty: "keys",
        labelEn: "A key made from scratch, at the car",
        labelFr: "Une clé faite à partir de zéro, sur place",
        noteEn:
          "The car cannot be driven to the workshop, so this is either a locksmith who comes to you or a tow. Ask which before you arrange anything — a tow you did not need is the expensive half.",
        noteFr:
          "La voiture ne peut pas rouler jusqu'à l'atelier : c'est donc un serrurier qui se déplace, ou un remorquage. Demandez lequel avant d'organiser quoi que ce soit — un remorquage inutile est la moitié chère.",
      },
    ],
  },
  {
    key: "lostOne",
    icon: "key-outline",
    labelEn: "I lost one, I still have another",
    labelFr: "J'en ai perdu une, il m'en reste une",
    causes: [
      {
        specialty: "keys",
        labelEn: "A duplicate, cut and coded from the one you have",
        labelFr: "Un double, taillé et codé à partir de celle qui reste",
        noteEn:
          "Much cheaper than a key made from scratch, and worth doing before the second one goes too. Bring the key you still have.",
        noteFr:
          "Bien moins cher qu'une clé faite de zéro, et à faire avant que la seconde ne disparaisse aussi. Apportez la clé qui vous reste.",
      },
    ],
  },
  {
    key: "spare",
    icon: "copy-outline",
    labelEn: "I want a spare",
    labelFr: "Je veux un double",
    causes: [
      {
        specialty: "keys",
        labelEn: "A second key while you still have one",
        labelFr: "Une deuxième clé pendant qu'il en reste une",
        noteEn:
          "The cheapest this job is ever going to be. A spare made now costs a fraction of a key made from scratch after the last one is lost.",
        noteFr:
          "Le moment le moins cher pour ce travail. Un double fait maintenant coûte une fraction d'une clé faite de zéro une fois la dernière perdue.",
      },
    ],
  },
  {
    key: "remoteDead",
    icon: "radio-outline",
    labelEn: "The remote no longer opens the car",
    labelFr: "La télécommande n'ouvre plus",
    causes: [
      {
        specialty: "keys",
        labelEn: "A flat battery in the remote",
        labelFr: "La pile de la télécommande est morte",
        noteEn:
          "Try this first. It is a coin cell, it costs almost nothing, and it is the answer far more often than a broken remote is. The key still opens the door by hand in the meantime.",
        noteFr:
          "À essayer en premier. C'est une pile bouton, cela ne coûte presque rien, et c'est la réponse bien plus souvent qu'une télécommande cassée. En attendant, la clé ouvre toujours la porte à la main.",
      },
      {
        specialty: "keys",
        labelEn: "The remote has lost its pairing",
        labelFr: "La télécommande a perdu son appairage",
        noteEn:
          "It has to be re-paired to the car with the same equipment that codes a new one.",
        noteFr:
          "Il faut la réappairer à la voiture, avec le même équipement qui code une clé neuve.",
      },
      {
        specialty: "elec",
        labelEn: "The central locking itself",
        labelFr: "La centralisation elle-même",
        noteEn:
          "If the remote works on some doors and not others, or nothing responds at all, the fault is in the car rather than in the key.",
        noteFr:
          "Si la télécommande agit sur certaines portes et pas d'autres, ou si rien ne répond, la panne est dans la voiture, pas dans la clé.",
      },
    ],
  },
  {
    key: "turnsNoStart",
    icon: "power-outline",
    labelEn: "The key turns but the engine will not start",
    labelFr: "La clé tourne mais le moteur ne démarre pas",
    causes: [
      {
        specialty: "elec",
        labelEn: "The immobiliser does not recognise the key",
        labelFr: "L'antidémarrage ne reconnaît pas la clé",
        noteEn:
          "Classic sign of a key that was cut but never coded, or a chip that has failed. A warning light shaped like a car with a key or a padlock usually stays on.",
        noteFr:
          "Signe classique d'une clé taillée mais jamais codée, ou d'une puce en panne. Un témoin en forme de voiture avec une clé ou un cadenas reste souvent allumé.",
      },
      {
        specialty: "keys",
        labelEn: "The key needs coding to this car",
        labelFr: "La clé doit être codée sur cette voiture",
        noteEn:
          "If the key is new or was copied elsewhere, coding is the missing step and not a second fault.",
        noteFr:
          "Si la clé est neuve ou a été copiée ailleurs, le codage est l'étape manquante, pas une seconde panne.",
      },
      {
        specialty: "batt",
        labelEn: "Or simply a flat battery",
        labelFr: "Ou simplement une batterie à plat",
        noteEn:
          "Worth ruling out first: if the dashboard lights are dim or nothing turns at all, this is a battery question and no key will fix it.",
        noteFr:
          "À écarter d'abord : si le tableau de bord est faible ou que rien ne tourne, c'est une question de batterie et aucune clé n'y changera rien.",
      },
    ],
  },
  {
    key: "brokenInLock",
    icon: "cut-outline",
    labelEn: "The key broke, or is stuck in the lock",
    labelFr: "La clé est cassée ou bloquée dans la serrure",
    causes: [
      {
        specialty: "keys",
        labelEn: "Extraction, then a new blade",
        labelFr: "Extraction, puis une lame neuve",
        noteEn:
          "Do not force what is left with pliers — a broken blade pushed further in turns a key job into a lock replacement.",
        noteFr:
          "Ne forcez pas le morceau restant avec une pince : une lame cassée enfoncée plus loin transforme un travail de clé en remplacement de serrure.",
      },
    ],
  },
  {
    key: "lockedOut",
    icon: "lock-closed-outline",
    labelEn: "I am locked out, the keys are inside",
    labelFr: "Je suis enfermé dehors, les clés sont dedans",
    causes: [
      {
        specialty: "keys",
        labelEn: "Opening without damage",
        labelFr: "Ouverture sans casse",
        noteEn:
          "A locksmith opens a door without breaking anything. Ask on the phone whether they do — the alternative costs a window.",
        noteFr:
          "Un serrurier ouvre une porte sans rien casser. Demandez-le au téléphone — l'alternative coûte une vitre.",
      },
      {
        specialty: "depan",
        labelEn: "Roadside assistance, if nobody closer answers",
        labelFr: "Un dépanneur, si personne de plus proche ne répond",
        noteEn:
          "Breakdown outfits are used to being called out and are often the ones already on the road.",
        noteFr:
          "Les dépanneurs ont l'habitude des sorties et sont souvent déjà sur la route.",
      },
    ],
  },
  {
    key: "barrelWorn",
    icon: "construct-outline",
    labelEn: "The lock or the ignition barrel is worn",
    labelFr: "La serrure ou le neiman est abîmé",
    causes: [
      {
        specialty: "keys",
        labelEn: "The barrel repaired or replaced",
        labelFr: "Le barillet réparé ou remplacé",
        noteEn:
          "A key that has to be jiggled is usually the lock wearing out rather than the key, and it fails completely sooner or later.",
        noteFr:
          "Une clé qu'il faut remuer, c'est en général la serrure qui s'use plutôt que la clé — et elle finit par lâcher complètement.",
      },
      {
        specialty: "meca",
        labelEn: "The steering lock or the ignition switch",
        labelFr: "L'antivol de direction ou le contacteur",
        noteEn:
          "If the wheel is locked hard or the key will not turn at all, the mechanism behind the barrel is the suspect.",
        noteFr:
          "Si le volant est bloqué dur ou que la clé ne tourne pas du tout, c'est le mécanisme derrière le barillet qui est en cause.",
      },
    ],
  },
];

export function getSituation(key) {
  return keySituations.find((item) => item.key === key) ?? null;
}

// The trades a situation needs, de-duplicated and in the order the causes
// are listed — the first cause is the likeliest, so the first trade is the
// one to try first.
export function specialtiesForSituation(key) {
  const situation = getSituation(key);
  if (!situation) return [];
  const seen = [];
  for (const cause of situation.causes) {
    if (!seen.includes(cause.specialty)) seen.push(cause.specialty);
  }
  return seen;
}

// What a workshop can actually be asked for, so somebody can name the job
// on the phone instead of describing it.
export const keyServices = [
  {
    key: "duplicate",
    icon: "copy-outline",
    labelEn: "Duplicate from an existing key",
    labelFr: "Double à partir d'une clé existante",
    noteEn:
      "Cut, and coded if the car needs it. Bring the key you have and the carte grise.",
    noteFr:
      "Taillée, et codée si la voiture l'exige. Apportez la clé que vous avez et la carte grise.",
  },
  {
    key: "coding",
    icon: "hardware-chip-outline",
    labelEn: "Coding and pairing only",
    labelFr: "Codage et appairage seulement",
    noteEn:
      "For a key or remote you already have that the car does not recognise. This is the step a cutting shop cannot always do.",
    noteFr:
      "Pour une clé ou une télécommande que vous avez déjà et que la voiture ne reconnaît pas. C'est l'étape qu'un atelier de taille ne sait pas toujours faire.",
  },
  {
    key: "allLost",
    icon: "albums-outline",
    labelEn: "Full set when every key is gone",
    labelFr: "Jeu complet quand tout est perdu",
    noteEn:
      "The longest and dearest version of the job, and the one where the make matters most — some require data only a dealer holds.",
    noteFr:
      "La version la plus longue et la plus chère, et celle où la marque compte le plus — certaines exigent des données que seule une concession détient.",
  },
  {
    key: "opening",
    icon: "lock-open-outline",
    labelEn: "Opening a locked car",
    labelFr: "Ouverture d'un véhicule fermé",
    noteEn: "Without breaking anything. Confirm that on the phone.",
    noteFr: "Sans rien casser. À confirmer au téléphone.",
  },
  {
    key: "remoteShell",
    icon: "battery-half-outline",
    labelEn: "Remote battery or shell",
    labelFr: "Pile ou coque de télécommande",
    noteEn:
      "The cheap end of this trade, and often the whole answer to a remote that stopped working.",
    noteFr:
      "Le bas de gamme de ce métier, et souvent toute la réponse à une télécommande qui ne marche plus.",
  },
  {
    key: "lockRepair",
    icon: "build-outline",
    labelEn: "Door lock or ignition barrel",
    labelFr: "Serrure de porte ou neiman",
    noteEn:
      "Repair or replacement, keyed to the key you already carry where that is possible.",
    noteFr:
      "Réparation ou remplacement, sur la clé que vous avez déjà quand c'est possible.",
  },
];

// What to have with you.
//
// The third line is the point of the list. A locksmith who asks for the
// carte grise and an ID is not being difficult — they are checking the car
// is yours, and one who never asks would do the same for whoever took it.
// It is worth reading as reassurance rather than as an obstacle.
export const keyChecklist = [
  {
    key: "carteGrise",
    labelEn: "The carte grise",
    labelFr: "La carte grise",
  },
  {
    key: "id",
    labelEn: "Your own ID",
    labelFr: "Votre pièce d'identité",
  },
  {
    key: "remaining",
    labelEn: "Any key you still have, even a broken one",
    labelFr: "Toute clé qui vous reste, même cassée",
  },
];
