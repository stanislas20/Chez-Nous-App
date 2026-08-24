import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

// Finishes what somebody set out to do before they were asked to sign in.
//
// openAccountGate returns a visitor to the screen they came from, which is
// right but stops one step short: an owner who tapped "Faire figurer mon
// garage", created an account, and came back was looking at the same button
// they had already pressed, with nothing to say the app had understood.
// They had to press it again.
//
// The intent is remembered here rather than carried through the auth flow.
// The gate is shared by half a dozen callers and returns to a *screen* by
// key — it has no notion of resuming an action, and teaching it one would
// mean every caller threading a destination through three auth screens.
//
// Resuming on FOCUS, not on `user` changing, is the part that matters. The
// account flips while the auth screen is still up, so acting on it there
// would race the gate's own navigation back — two moves at once, from a
// screen nobody is looking at. Waiting for focus means the return has
// already happened and this is the only thing moving.
//
// Coming back without an account drops the intent, so a tap abandoned days
// ago cannot fire later when the person signs in for some unrelated reason.
export function useAccountGateIntent(user, resume) {
  const pending = useRef(false);
  // Held in a ref so a caller can pass an inline arrow without the effect
  // re-subscribing on every render.
  const resumeRef = useRef(resume);
  resumeRef.current = resume;

  useFocusEffect(
    useCallback(() => {
      if (!pending.current) return;
      pending.current = false;
      if (user) resumeRef.current();
    }, [user]),
  );

  return {
    remember: () => {
      pending.current = true;
    },
  };
}
