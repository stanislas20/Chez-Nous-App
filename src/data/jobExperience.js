// How much experience a job asks for, as three bands rather than a free
// number: a poster picks reliably between "none / 1–3 / over 3", whereas an
// open years field invites "2-3", "24 months" and "négociable", none of
// which can be coloured or filtered.
//
// The bands exist to be seen at a glance on the home feed, which is why they
// carry their own labels here rather than i18n keys, the same way
// companySectors.js does.
export const experienceLevels = [
  { key: "none", labelEn: "No experience", labelFr: "Sans expérience" },
  { key: "junior", labelEn: "1 to 3 years", labelFr: "1 à 3 ans" },
  { key: "senior", labelEn: "Over 3 years", labelFr: "Plus de 3 ans" },
];

// Jobs posted before this field existed only ever recorded a `noExp`
// boolean, so a legacy `true` still resolves to the green band. A legacy
// `false` resolves to null, NOT to a band: it recorded "not beginner-
// friendly" and nothing more, and inventing "over 3 years" from it would
// paint old listings red on a requirement nobody ever stated.
export function getExperienceLevel(job) {
  if (!job) return null;
  if (job.experienceLevel) return job.experienceLevel;
  return job.noExp ? "none" : null;
}

export function getExperienceLabel(key, language) {
  const level = experienceLevels.find((item) => item.key === key);
  if (!level) return null;
  return language === "en" ? level.labelEn : level.labelFr;
}

// Green, amber and red, carried on a badge rather than the whole card.
//
// Two separate decisions live here and it is worth keeping them apart,
// because the second one changed and the first one did not.
//
// WHERE the colour goes: on a badge. It was the card's own background for a
// while and that could not work at any strength — a wash has to stay faint
// enough to read a card of muted text through, and three steps that faint
// are not separable, while anything stronger drowns the text. A badge is a
// few words on a known ground, so it holds colour at four times the
// strength and stays legible. JobDetailScreen already did it this way.
//
// WHICH colours: green for no experience, amber for one to three years, red
// for over three. This is the owner's call, made after seeing a single-hue
// ramp on the device — three steps of one green were not telling the bands
// apart, and a scale nobody can read is not a scale. Three hues are
// unmistakable at a glance, which is what the feed needs.
//
// Three values per band, because they do three different jobs and no single
// colour does all of them:
//
//   Tint  fills the badge — a wash, so it sits behind text.
//   Mark  colours the shapes: the dot, the legend swatch, the badge border,
//         the rail on the narrow cards. Nothing here has to be read, so it
//         is the band's true colour at full strength.
//   Accent is ink — the label, at 10.5px on the tint.
//
// Mark and Accent are the same colour for green and red and differ for
// amber, which is the whole reason they are separate. #E8A33D is the amber
// this app means; as small text on white it fails contrast, so the label
// darkens to accentDark. Using that darker value for the dot as well — which
// is what one shared value forced — turned the middle swatch brown, and a
// legend that says brown when the design says amber is wrong about itself.
function bands(theme) {
  const dark = theme?.scheme === "dark";
  return dark
    ? {
        // On a dark ground the amber is already legible, so mark and ink
        // agree in all three bands here.
        none: {
          fill: "rgba(34, 178, 106, 0.22)",
          mark: "#22B26A",
          ink: "#5EDCA0",
        },
        junior: {
          fill: "rgba(240, 181, 89, 0.22)",
          mark: "#F0B559",
          ink: "#F0B559",
        },
        senior: {
          fill: "rgba(241, 112, 112, 0.22)",
          mark: "#F17070",
          ink: "#F17070",
        },
      }
    : {
        none: {
          fill: "rgba(15, 122, 74, 0.12)",
          mark: "#0F7A4A",
          ink: "#0F7A4A",
        },
        junior: {
          fill: "rgba(232, 163, 61, 0.20)",
          mark: "#E8A33D",
          ink: "#9C6A1F",
        },
        senior: {
          fill: "rgba(214, 69, 69, 0.13)",
          mark: "#D64545",
          ink: "#B3352F",
        },
      };
}

export function getExperienceTint(key, theme) {
  const band = bands(theme)[key];
  // No requirement stated is not the same as an undemanding one, so an
  // unknown band gets no badge colour rather than the green.
  return band ? band.fill : (theme?.surfaceAlt ?? "transparent");
}

// Text. Always check this one against the tint before changing it.
export function getExperienceAccent(key, theme) {
  const band = bands(theme)[key];
  return band ? band.ink : (theme?.textMuted ?? "#6B7280");
}

// Shapes: dot, swatch, border, rail. Never used for text.
export function getExperienceMark(key, theme) {
  const band = bands(theme)[key];
  return band ? band.mark : (theme?.border ?? "#E3E6EA");
}
