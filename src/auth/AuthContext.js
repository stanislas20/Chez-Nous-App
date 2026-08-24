import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  firebaseAuth,
  firestore,
  isFirebaseConfigured,
} from "../config/firebase";
import {
  signUpSeller,
  signUpCompanySeller,
  loginSeller,
  logoutSeller,
} from "./phoneAuth";
import {
  signUpAdvertiser,
  loginAdvertiser,
  createAdvertiserProfile,
} from "./advertiserAuth";
import {
  registerForegroundMessageHandler,
  registerNotificationTapHandlers,
  registerPushToken,
} from "../notifications/pushToken";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [advertiserProfile, setAdvertiserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return undefined;
    }

    let unsubscribeTokenRefresh;
    let unsubscribeForegroundMessages;
    let unsubscribeNotificationTaps;
    let unsubscribeSellerProfile;
    // Guards against re-registering on every snapshot — the profile doc
    // changes for plenty of unrelated reasons (a photo, a seen-cursor bump).
    let hasRegisteredPushToken = false;

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      // Same re-firing hazard the foreground-message handler guards against
      // below — drop any listener from a previous firing before opening a
      // new one, or they stack up and each pushes its own setState.
      unsubscribeSellerProfile?.();
      unsubscribeSellerProfile = undefined;
      hasRegisteredPushToken = false;
      if (nextUser) {
        // Live, unlike the advertiser profile: verificationStatus is
        // changed by a reviewer running scripts/verifySeller.js while the
        // app is open, and a one-time read would leave the dashboard
        // showing "pending" until the next sign-in — right after a push
        // has told them they were approved.
        const sellerProfileReady = new Promise((resolve) => {
          unsubscribeSellerProfile = onSnapshot(
            doc(firestore, "sellers", nextUser.uid),
            (snapshot) => {
              setSellerProfile(snapshot.exists() ? snapshot.data() : null);
              // Registered here, not on sign-in, because savePushToken
              // writes to sellers/{uid} with merge: true — firing it for an
              // account that has no seller profile CREATES one containing
              // just a pushToken. That gave every advertiser a phantom
              // seller document, which made `sellerProfile` truthy for them
              // and quietly stopped `sellers` meaning "the set of sellers".
              // Waiting for the snapshot also removes a race: at sign-up the
              // profile is written just after auth resolves, and this fires
              // once it lands.
              if (snapshot.exists() && !hasRegisteredPushToken) {
                hasRegisteredPushToken = true;
                registerPushToken(nextUser.uid)
                  .then((unsub) => {
                    unsubscribeTokenRefresh = unsub;
                  })
                  .catch(() => {});
              }
              resolve();
            },
            () => {
              setSellerProfile(null);
              resolve();
            },
          );
        });
        // Still awaited alongside the advertiser read so isLoading below
        // only clears once the profile is actually populated.
        const [, advertiserSnapshot] = await Promise.all([
          sellerProfileReady,
          getDoc(doc(firestore, "advertisers", nextUser.uid)),
        ]);
        setAdvertiserProfile(
          advertiserSnapshot.exists() ? advertiserSnapshot.data() : null,
        );
        // onAuthStateChanged can fire more than once for the same signed-in
        // session (e.g. a profile update re-emitting the same user) — tear
        // down any listener from a previous firing first, or a single push
        // stacks up one Alert per listener and dismissing one just reveals
        // the next.
        unsubscribeForegroundMessages?.();
        unsubscribeForegroundMessages = registerForegroundMessageHandler();
        // Same teardown rule: a second firing would otherwise leave two tap
        // listeners and navigate twice for one tap.
        unsubscribeNotificationTaps?.();
        unsubscribeNotificationTaps = registerNotificationTapHandlers();
      } else {
        setSellerProfile(null);
        setAdvertiserProfile(null);
        unsubscribeTokenRefresh?.();
        unsubscribeTokenRefresh = undefined;
        unsubscribeForegroundMessages?.();
        unsubscribeForegroundMessages = undefined;
        unsubscribeNotificationTaps?.();
        unsubscribeNotificationTaps = undefined;
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      unsubscribeSellerProfile?.();
      unsubscribeTokenRefresh?.();
      unsubscribeForegroundMessages?.();
    };
  }, []);

  const completeAdvertiserOnboarding = async ({ businessName }) => {
    const phone = user.email ? `+${user.email.split("@")[0]}` : "";
    await createAdvertiserProfile({ uid: user.uid, businessName, phone });
    setAdvertiserProfile({ businessName, phone });
  };

  const value = useMemo(
    () => ({
      user,
      sellerProfile,
      advertiserProfile,
      isLoading,
      isFirebaseConfigured,
      signUp: signUpSeller,
      signUpCompany: signUpCompanySeller,
      logIn: loginSeller,
      logOut: logoutSeller,
      signUpAdvertiser,
      logInAdvertiser: loginAdvertiser,
      completeAdvertiserOnboarding,
    }),
    [user, sellerProfile, advertiserProfile, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
