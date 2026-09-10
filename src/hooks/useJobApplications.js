import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { reportNonFatal } from "../utils/reportError";

// An employer's applications, newest first. A popular job post can attract
// hundreds; the screen shows the recent ones and the count that matters is on
// the listing itself.
const APPLICATIONS_CAP = 100;

// Applications a seller has received across all of their job postings,
// newest first — read by employerUid, not scoped to a single listing, so
// the "Candidatures" screen shows everything in one place.
export function useJobApplications(employerUid) {
  const [applications, setApplications] = useState(null);
  // Whether the empty array above means empty, or means the read failed.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !employerUid) {
      setApplications([]);
      return undefined;
    }

    const applicationsQuery = query(
      collection(firestore, "jobApplications"),
      where("employerUid", "==", employerUid),
      orderBy("createdAt", "desc"),
      limit(APPLICATIONS_CAP),
    );

    const unsubscribe = onSnapshot(
      applicationsQuery,
      (snapshot) =>
        setApplications(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ),
      // "No applicants yet" and "we could not load your applicants" are very
      // different things to tell an employer. See useSellerListings.
      (error) => {
        setFailed(true);
        setApplications([]);
        reportNonFatal("jobApplications", error, { where: "useJobApplications" });
      },
    );

    return unsubscribe;
  }, [employerUid]);

  return { applications, failed };
}
