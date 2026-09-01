// The four pages behind the menu's Aide & sécurité block.
//
// They were rows that opened an alert saying "coming soon" — which on a
// Privacy row is worse than nothing, because the question somebody taps it
// to ask is what you already did with their number.
//
// Written from the code rather than from a template. Every claim below is
// one this app actually keeps: publishing is gated on a Béninese number by
// firestore.rules, a rejected listing really does re-enter review when it
// is edited, a seller profile really is readable by its owner alone, and a
// listing really does carry the coordinates of the CITY the seller picked
// rather than the position of their handset. A privacy page that describes
// a different app is the one document where being approximately right is
// worse than being silent — so where the app does not do a thing, this
// says so plainly instead of promising it.
//
// En/Fr sit side by side here, the way importation.js and categories.js
// carry theirs, rather than as several hundred keys in translations.js: a
// page reads as a page when its paragraphs are next to each other.

export const infoPages = [
  {
    key: "help",
    icon: "help-buoy-outline",
    // Spelled to match menuHelpCenterRow exactly. The row said "Help
    // center" and the page it opened was headed "Help Centre", so tapping
    // one arrived at the other.
    titleEn: "Help center",
    titleFr: "Centre d'aide",
    introEn:
      "How publishing, reviewing and messaging work on Chez-Nous.",
    introFr:
      "Comment fonctionnent la publication, la validation et la messagerie sur Chez-Nous.",
    sections: [
      {
        headingEn: "Who can publish",
        headingFr: "Qui peut publier",
        bodyEn:
          "Publishing needs a Béninese number, confirmed by SMS. Reading does not: anyone, anywhere, can browse every listing, call any number and message any seller. That is deliberate — the market is here, and the people buying from it are often not.",
        bodyFr:
          "Publier demande un numéro béninois, confirmé par SMS. Lire, non : n'importe qui, où qu'il soit, peut parcourir toutes les annonces, appeler n'importe quel numéro et écrire à n'importe quel vendeur. C'est voulu : le marché est ici, ceux qui y achètent souvent pas.",
      },
      {
        headingEn: "Your listing is reviewed first",
        headingFr: "Votre annonce passe d'abord en revue",
        bodyEn:
          "A new listing is checked by a moderator before it appears. You are told when it is approved, and told why if it is refused. Verified companies publish immediately.",
        bodyFr:
          "Une nouvelle annonce est vérifiée par un modérateur avant d'apparaître. Vous êtes prévenu quand elle est acceptée, et prévenu du motif si elle est refusée. Les entreprises vérifiées publient immédiatement.",
      },
      {
        headingEn: "A refusal is not the end",
        headingFr: "Un refus n'est pas définitif",
        bodyEn:
          "Correct what you were told and save: the listing goes back into the queue by itself. You never need to delete it and start again — doing that would lose its age, its views and its place in everyone's saved lists.",
        bodyFr:
          "Corrigez ce qui vous a été signalé puis enregistrez : l'annonce repart d'elle-même en validation. Inutile de la supprimer et de recommencer — vous perdriez son ancienneté, ses vues et sa place dans les favoris de chacun.",
      },
      {
        headingEn: "Editing an approved listing",
        headingFr: "Modifier une annonce déjà en ligne",
        bodyEn:
          "Everything stays editable. Changing the words, the price, the category, the city or the main photo sends it back for a quick review. Fixing a phone number or an opening time does not — those corrections should be easy to make, not punished.",
        bodyFr:
          "Tout reste modifiable. Changer le texte, le prix, la catégorie, la ville ou la photo principale renvoie l'annonce en validation rapide. Corriger un numéro ou un horaire, non — ces corrections doivent être faciles, pas sanctionnées.",
      },
      {
        headingEn: "Reaching a seller",
        headingFr: "Joindre un vendeur",
        bodyEn:
          "Call, WhatsApp or the in-app chat, which carries photos and voice messages. Prices are what the seller wrote; nothing here is an estimate made by the app.",
        bodyFr:
          "Appel, WhatsApp ou la messagerie de l'application, qui accepte photos et messages vocaux. Les prix sont ceux écrits par le vendeur ; rien ici n'est une estimation faite par l'application.",
      },
    ],
  },
  {
    key: "safety",
    icon: "shield-checkmark-outline",
    titleEn: "Safety tips",
    titleFr: "Conseils de sécurité",
    introEn: "Most trades go well. These are the ones that do not.",
    introFr:
      "La plupart des transactions se passent bien. Voici celles qui se passent mal.",
    sections: [
      {
        headingEn: "Meet in daylight, in a public place",
        headingFr: "Rencontrez-vous de jour, dans un lieu public",
        bodyEn:
          "A busy street, a filling station, the forecourt of a bank. Bring somebody with you for anything expensive, and do not go alone to a private address to see a vehicle.",
        bodyFr:
          "Une rue passante, une station-service, le parvis d'une banque. Faites-vous accompagner pour tout achat important, et n'allez jamais seul à une adresse privée pour voir un véhicule.",
      },
      {
        headingEn: "Do not pay before you have seen it",
        headingFr: "Ne payez pas avant d'avoir vu",
        bodyEn:
          "No deposit, no mobile-money transfer, no \"reservation fee\" before the thing is in front of you. This matters most for imports, where the vehicle is genuinely abroad and the photographs are genuinely of it — and where you have no way of knowing whose it is.",
        bodyFr:
          "Pas d'acompte, pas de transfert mobile money, pas de « frais de réservation » avant d'avoir la chose devant vous. C'est surtout vrai pour l'importation, où le véhicule est réellement à l'étranger et les photos réellement les siennes — sans que vous puissiez savoir à qui il appartient.",
      },
      {
        headingEn: "On a vehicle, ask about customs",
        headingFr: "Sur un véhicule, posez la question des douanes",
        bodyEn:
          "\"Non dédouané\" means the duty has not been paid and it will be paid by you, on top of the price. That sum is not small and it is not shown anywhere in this app, because it depends on the vehicle. Ask before you agree a price, not after.",
        bodyFr:
          "« Non dédouané » signifie que les droits n'ont pas été payés et qu'ils le seront par vous, en plus du prix. Cette somme n'est pas petite et n'apparaît nulle part dans l'application, car elle dépend du véhicule. Posez la question avant de convenir d'un prix, pas après.",
      },
      {
        headingEn: "What the verified badge means",
        headingFr: "Ce que signifie le badge vérifié",
        bodyEn:
          "It means a company sent us its RCCM and IFU and a person checked them. It is never granted automatically and a company cannot give it to itself. It says the business exists — it does not vouch for any particular sale.",
        bodyFr:
          "Il signifie qu'une entreprise nous a envoyé son RCCM et son IFU et qu'une personne les a vérifiés. Il n'est jamais accordé automatiquement et une entreprise ne peut pas se l'attribuer. Il atteste que l'entreprise existe — il ne garantit aucune vente en particulier.",
      },
      {
        headingEn: "Report anything that feels wrong",
        headingFr: "Signalez ce qui vous paraît anormal",
        bodyEn:
          "Every listing has a report button and every conversation can be blocked. Reporting is private: the seller is not told who reported them.",
        bodyFr:
          "Chaque annonce a un bouton de signalement et chaque conversation peut être bloquée. Le signalement est confidentiel : le vendeur ne sait pas qui l'a signalé.",
      },
      {
        headingEn: "Keep your documents out of the chat",
        headingFr: "Gardez vos documents hors de la messagerie",
        bodyEn:
          "No photographs of your ID card, your carte grise or your bank details. A buyer never needs them, and a seller who asks for them is not asking as a seller.",
        bodyFr:
          "Pas de photo de votre pièce d'identité, de votre carte grise ou de vos coordonnées bancaires. Un acheteur n'en a jamais besoin, et un vendeur qui les réclame ne les réclame pas en tant que vendeur.",
      },
    ],
  },
  {
    key: "privacy",
    icon: "lock-closed-outline",
    titleEn: "Privacy",
    titleFr: "Confidentialité",
    introEn: "What Chez-Nous holds about you, and who can see it.",
    introFr: "Ce que Chez-Nous conserve sur vous, et qui peut le voir.",
    sections: [
      {
        headingEn: "Your number",
        headingFr: "Votre numéro",
        bodyEn:
          "Confirmed by SMS, and used for two things: signing you in, and letting a buyer reach you. It appears on the listings you publish, because a seller nobody can call is where the trouble starts. It is not shown anywhere else.",
        bodyFr:
          "Confirmé par SMS, il sert à deux choses : vous connecter, et permettre à un acheteur de vous joindre. Il apparaît sur les annonces que vous publiez, car un vendeur injoignable est le début des ennuis. Il n'est affiché nulle part ailleurs.",
      },
      {
        headingEn: "Your name and photo",
        headingFr: "Votre nom et votre photo",
        bodyEn:
          "Shown on the listings you publish and on your seller profile. A company shows its trading name rather than the name of the person who filled in the form.",
        bodyFr:
          "Affichés sur vos annonces et sur votre profil vendeur. Une entreprise affiche sa raison sociale plutôt que le nom de la personne qui a rempli le formulaire.",
      },
      {
        headingEn: "Location",
        headingFr: "Localisation",
        bodyEn:
          "Asked for only to sort what is near you — the pharmacy on duty, the closest transitaire. A listing carries the coordinates of the CITY you picked, never the position of your handset, so publishing never reveals where you were standing.",
        bodyFr:
          "Demandée uniquement pour classer ce qui est proche de vous — la pharmacie de garde, le transitaire le plus proche. Une annonce porte les coordonnées de la VILLE que vous avez choisie, jamais la position de votre téléphone : publier ne révèle donc jamais où vous vous trouviez.",
      },
      {
        headingEn: "Camera, photos and microphone",
        headingFr: "Appareil photo, photos et micro",
        bodyEn:
          "The camera and your gallery are read only when you attach something. The microphone is used only while you hold the record button for a voice message, or while a voice search is listening.",
        bodyFr:
          "L'appareil photo et votre galerie ne sont lus que lorsque vous joignez quelque chose. Le micro n'est utilisé que pendant que vous maintenez le bouton d'enregistrement d'un message vocal, ou pendant l'écoute d'une recherche vocale.",
      },
      {
        headingEn: "Your profile is yours alone",
        headingFr: "Votre profil n'appartient qu'à vous",
        bodyEn:
          "The account record holding your details is readable by your account and no other — that is enforced by the database itself, not by the app being polite. Company verification documents are never public.",
        bodyFr:
          "La fiche de compte contenant vos informations n'est lisible que par votre compte et aucun autre — c'est la base de données qui l'impose, pas l'application par courtoisie. Les documents de vérification d'entreprise ne sont jamais publics.",
      },
      {
        headingEn: "Notifications",
        headingFr: "Notifications",
        bodyEn:
          "If you allow them, your device holds a token we use to tell you about your listings and your messages. Turning notifications off in your phone's settings stops them.",
        bodyFr:
          "Si vous les autorisez, votre appareil détient un jeton qui nous sert à vous informer sur vos annonces et vos messages. Les désactiver dans les réglages de votre téléphone les arrête.",
      },
      {
        headingEn: "Removing things",
        headingFr: "Supprimer",
        bodyEn:
          "You can delete any listing you published, at any time, from Mes annonces. Deleting your whole account is not yet something you can do yourself — write to us and we will do it.",
        bodyFr:
          "Vous pouvez supprimer à tout moment une annonce que vous avez publiée, depuis Mes annonces. Supprimer l'intégralité de votre compte n'est pas encore possible par vous-même — écrivez-nous et nous le ferons.",
      },
    ],
  },
  {
    key: "about",
    icon: "information-circle-outline",
    titleEn: "About Chez-Nous",
    titleFr: "À propos de Chez-Nous",
    introEn: "A market for Bénin, readable from anywhere.",
    introFr: "Un marché pour le Bénin, consultable de partout.",
    sections: [
      {
        headingEn: "What it is",
        headingFr: "Ce que c'est",
        bodyEn:
          "Somewhere to buy and sell, and a set of directories for the errands that have no listing: the pharmacy on duty tonight, a transitaire at the port, a garage that does air conditioning, a bank branch.",
        bodyFr:
          "Un endroit pour acheter et vendre, et un ensemble d'annuaires pour les démarches qui n'ont pas d'annonce : la pharmacie de garde ce soir, un transitaire au port, un garage qui fait la climatisation, une agence bancaire.",
      },
      {
        headingEn: "Open to read, Béninese to publish",
        headingFr: "Ouvert à la lecture, béninois pour publier",
        bodyEn:
          "The whole market is visible from anywhere in the world, so somebody in Paris or Lagos can browse it, call a seller and arrange something for their family here. Publishing is limited to Béninese numbers, because an unreachable seller is where the scams begin.",
        bodyFr:
          "Tout le marché est visible depuis n'importe où dans le monde : quelqu'un à Paris ou à Lagos peut le parcourir, appeler un vendeur et organiser quelque chose pour sa famille ici. La publication est réservée aux numéros béninois, car un vendeur injoignable est le point de départ des arnaques.",
      },
      {
        headingEn: "Two languages",
        headingFr: "Deux langues",
        bodyEn:
          "Everything is in French and English. Sellers write in the language they use, and search matches accents and spellings loosely enough that dedouanement finds dédouanement.",
        bodyFr:
          "Tout existe en français et en anglais. Les vendeurs écrivent dans leur langue, et la recherche tolère assez les accents et les orthographes pour que dedouanement trouve dédouanement.",
      },
      {
        headingEn: "What it will not do",
        headingFr: "Ce qu'elle ne fera pas",
        bodyEn:
          "Chez-Nous never invents a figure. It will not estimate your customs duty, guess whether a part fits your car, or tell you a price is fair. Those answers belong to a person who knows your case, and a confident wrong number is worse than no number at all.",
        bodyFr:
          "Chez-Nous n'invente jamais de chiffre. Elle n'estimera pas vos droits de douane, ne devinera pas si une pièce va sur votre voiture, et ne vous dira pas si un prix est correct. Ces réponses appartiennent à quelqu'un qui connaît votre cas, et un chiffre faux énoncé avec assurance est pire que pas de chiffre du tout.",
      },
    ],
  },
];

export function getInfoPage(key) {
  return infoPages.find((page) => page.key === key) ?? null;
}

export function infoPageTitle(page, language) {
  return language === "en" ? page.titleEn : page.titleFr;
}

export function infoPageIntro(page, language) {
  return language === "en" ? page.introEn : page.introFr;
}

export function infoSectionHeading(section, language) {
  return language === "en" ? section.headingEn : section.headingFr;
}

export function infoSectionBody(section, language) {
  return language === "en" ? section.bodyEn : section.bodyFr;
}
