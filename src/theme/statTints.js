// One colour per thing a seller counts.
//
// The dashboard has coloured its stat cards for a while — Vues violet,
// Appels green, Messages teal, J'aime pink — and the same four figures now
// sit in the footer of every card on Mes annonces. Two tables would have
// drifted the first time one of them was touched, and the drift would be
// invisible: nothing breaks when the same word is violet on one screen and
// blue on the next, it just stops being learnable.
//
// So the colour belongs to the measurement, not to the screen drawing it.
// A seller who learns the violet eye on the dashboard reads it on a listing
// card without being told, which is the entire point of colouring them.
//
// Set here rather than in the theme's palette because these are not the
// app's colours: nothing else is violet or pink, and they are deliberately
// unlike the brand green so a count never reads as an action.
export const statTints = {
  views: "#6A5AE0",
  saved: "#C4478A",
  contacts: "#12876A",
  messages: "#12908C",
};
