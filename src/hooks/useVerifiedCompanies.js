import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

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
export function useVerifiedCompanies() {
  const [companies, setCompanies] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setCompanies([]);
      return undefined;
    }

    const companiesQuery = query(
      collection(firestore, 'verifiedCompanies'),
      orderBy('verifiedAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      companiesQuery,
      (snapshot) => {
        setCompanies(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      // An empty carousel is the correct fallback for a permissions or
      // network failure — the section hides itself rather than stranding a
      // spinner on the home feed.
      () => setCompanies([]),
    );

    return unsubscribe;
  }, []);

  return companies;
}
