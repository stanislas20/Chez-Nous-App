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

    getIdTokenResult(user)
      .then((token) => {
        if (!cancelled) setIsModerator(token.claims?.moderator === true);
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
