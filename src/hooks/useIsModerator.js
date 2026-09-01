import { useEffect, useState } from "react";
import { getIdTokenResult } from "firebase/auth";

// Whether this account may moderate, as the server sees it.
//
// Read from the ID token rather than from a Firestore document, because the
// token is what the rules check — anything else could say yes to a screen the
// database would then refuse. It arrives after a refresh, so a moderator who
// was granted the claim a moment ago sees the entry appear on next sign-in
// rather than instantly, which is the honest behaviour of a custom claim.
export function useIsModerator(user) {
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsModerator(false);
      return undefined;
    }

    // Cached first, then one forced refresh if the cached answer was no.
    //
    // getIdTokenResult without the flag returns whatever token is already
    // in memory, and a custom claim granted server-side is not in it — the
    // token only picks the claim up when it refreshes, which is on sign-in
    // or after about an hour. Meanwhile the server knows perfectly well,
    // so the moderator push goes out.
    //
    // That asymmetry is what somebody reports as "I get the notification
    // because I am the moderator, but I am never offered approve or deny":
    // the notification is sent from a source that has the claim, and the
    // screen is gated on a source that does not have it yet.
    //
    // A yes from the cache is trusted — a claim cannot appear in a token
    // that was not issued with it. Only a no is worth a round trip, and
    // only once.
    getIdTokenResult(user)
      .then((token) => {
        if (cancelled) return null;
        if (token.claims?.moderator === true) {
          setIsModerator(true);
          return null;
        }
        return getIdTokenResult(user, true);
      })
      .then((refreshed) => {
        if (cancelled || !refreshed) return;
        setIsModerator(refreshed.claims?.moderator === true);
      })
      .catch(() => {
        if (!cancelled) setIsModerator(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return isModerator;
}
