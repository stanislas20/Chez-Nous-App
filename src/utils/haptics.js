// Haptics, safe to call from a build that doesn't have them.
//
// expo-haptics is a native module: it exists only in a binary that was built
// after it was added. A plain top-level import would take the whole screen
// down in the dev client currently on the phone, so it is required
// defensively and every call is wrapped — the tick simply doesn't happen
// until the next native build picks the module up.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}

// The light tick for changing a selection — a segmented control, a picker.
// Deliberately not the heavier impact/notification styles: this confirms a
// choice, it does not announce an event.
export function selectionTick() {
  try {
    const result = Haptics?.selectionAsync?.();
    // Rejects rather than throws when the JS side resolves but the native
    // side is missing.
    if (result?.catch) result.catch(() => {});
  } catch {
    // No haptics in this build, or the device has none. Nothing to do.
  }
}
