import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// How many verified companies the caller wants.
//
// This was an unbounded realtime listener over the whole collection, on the
// home screen, opened by every visitor including signed-out ones — the single
// most expensive read in the app once the directory grows. verifiedCompanies
// is world-readable precisely so the home feed can show it, which means the
// bill scales with visitors multiplied by companies.
//
// The home carousel shows a handful, so it asks for a handful. The dedicated
// directory screen asks for more. Neither reads the collection.
const DEFAULT_COMPANIES = 20;

// Companies that have cleared manual review, for the "Entreprises vérifiées"
// row. Reads `verifiedCompanies` rather than `sellers` because the latter is
// rules-locked to its owner — it holds the phone number, RCCM, IFU and the
// representative's ID, none of which belongs in a public carousel. The
// Admin SDK projects the safe fields across on approval (see
// functions/index.js#syncVerifiedCompanyEntry), so simply appearing in this
// query already means a human approved the company.
//
// Newest first: a freshly approved business is the one worth surfacing, and
// it gives an operator immediate visible confirmation that an approval
// landed.
export function useVerifiedCompanies(pageSize = DEFAULT_COMPANIES) {
  const [companies, setCompanies] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setCompanies([]);
      return undefined;
    }

    const companiesQuery = query(
      collection(firestore, "verifiedCompanies"),
      orderBy("verifiedAt", "desc"),
      limit(pageSize),
    );

    const unsubscribe = onSnapshot(
      companiesQuery,
      (snapshot) => {
        setCompanies(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      // An empty carousel is the correct fallback for a permissions or
      // network failure — the section hides itself rather than stranding a
      // spinner on the home feed.
      () => setCompanies([]),
    );

    return unsubscribe;
  }, [pageSize]);

  return companies;
}
