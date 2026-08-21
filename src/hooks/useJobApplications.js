import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

// Applications a seller has received across all of their job postings,
// newest first — read by employerUid, not scoped to a single listing, so
// the "Candidatures" screen shows everything in one place.
export function useJobApplications(employerUid) {
  const [applications, setApplications] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !employerUid) {
      setApplications([]);
      return undefined;
    }

    const applicationsQuery = query(
      collection(firestore, 'jobApplications'),
      where('employerUid', '==', employerUid),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      applicationsQuery,
      (snapshot) => setApplications(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
      () => setApplications([]),
    );

    return unsubscribe;
  }, [employerUid]);

  return applications;
}
