import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
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
  refreshPushRegistration,
  ensureNotificationChannels,
  PUSH_OK,
} from "../notifications/pushToken";
import { useI18n } from "../i18n/I18nContext";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { language } = useI18n();
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
                // Latched on SUCCESS, not on attempt.
                //
                // Setting it before awaiting made a denied permission
                // permanent for the session: the latch said "registered",
                // the registration had actually failed, and nothing tried
                // again. Only the unsubscribe returned by a successful
                // registerPushToken proves a token was stored.
                registerPushToken(nextUser.uid)
                  .then((unsub) => {
                    unsubscribeTokenRefresh = unsub;
                    hasRegisteredPushToken = Boolean(unsub);
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
        // Before any reminder can arrive, and every sign-in rather than
        // once: Android keeps the channel after the first call, but a
        // reinstall or a cleared app storage drops it, and a channel that
        // does not exist is a reminder that arrives without a sound.
        ensureNotificationChannels();
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

    // Coming back to the foreground is the only moment the app can notice a
    // permission that was changed outside it.
    //
    // Android Settings does not tell an app its notification switch was
    // flipped; there is no callback. The reader grants permission, returns
    // to the app, and as far as the app is concerned nothing happened — so
    // the token that was never registered stays never registered, and push
    // silently does not work until the next cold start.
    //
    // Reading firebaseAuth.currentUser rather than the `user` state keeps
    // this correct without re-subscribing on every sign-in: the listener is
    // installed once, and asks who is signed in at the moment it fires.
    //
    // This does NOT prompt, and writes nothing when the token is unchanged,
    // so it is safe on every single resume.
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      refreshPushRegistration(uid)
        .then((result) => {
          if (result === PUSH_OK) hasRegisteredPushToken = true;
        })
        .catch(() => {});
    });

    return () => {
      unsubscribe();
      unsubscribeSellerProfile?.();
      unsubscribeTokenRefresh?.();
      unsubscribeForegroundMessages?.();
      unsubscribeNotificationTaps?.();
      appStateSubscription.remove();
    };
  }, []);

  // The one place the reader's language becomes a fact the SERVER can read.
  //
  // It is chosen on the handset and stored in AsyncStorage, which is private
  // to the device — so a Cloud Function composing a push had no way to know
  // it, and every server-composed notification went out in French. That is
  // why an English moderator was told "Nouvelle annonce à valider".
  //
  // updateDoc rather than setDoc({merge:true}), for the reason the snapshot
  // handler above spells out: a merge write CREATES the document, and doing
  // that here would give every advertiser a phantom seller profile
  // containing nothing but a language. updateDoc rejects on a missing
  // document, which is exactly the behaviour wanted — an account with no
  // seller profile has no server-composed notifications to receive either.
  const lastWrittenLanguage = useRef(null);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const uid = user?.uid;
    if (!uid || !language) return;
    // One write per (account, language), not one per render or per resume.
    const key = `${uid}:${language}`;
    if (lastWrittenLanguage.current === key) return;
    lastWrittenLanguage.current = key;
    updateDoc(doc(firestore, "sellers", uid), { language }).catch(() => {
      // No seller profile, or offline. Neither is worth telling anybody
      // about: the fallback is French, which is what the notification would
      // have said anyway, and the next language change or sign-in retries.
      lastWrittenLanguage.current = null;
    });
  }, [user?.uid, language]);

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
