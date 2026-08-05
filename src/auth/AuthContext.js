import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../config/firebase';
import { signUpSeller, loginSeller, logoutSeller } from './phoneAuth';
import { signUpAdvertiser, loginAdvertiser, createAdvertiserProfile } from './advertiserAuth';
import { registerPushToken } from '../notifications/pushToken';

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

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const [sellerSnapshot, advertiserSnapshot] = await Promise.all([
          getDoc(doc(firestore, 'sellers', nextUser.uid)),
          getDoc(doc(firestore, 'advertisers', nextUser.uid)),
        ]);
        setSellerProfile(sellerSnapshot.exists() ? sellerSnapshot.data() : null);
        setAdvertiserProfile(advertiserSnapshot.exists() ? advertiserSnapshot.data() : null);
        registerPushToken(nextUser.uid)
          .then((unsub) => {
            unsubscribeTokenRefresh = unsub;
          })
          .catch(() => {});
      } else {
        setSellerProfile(null);
        setAdvertiserProfile(null);
        unsubscribeTokenRefresh?.();
        unsubscribeTokenRefresh = undefined;
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      unsubscribeTokenRefresh?.();
    };
  }, []);

  const completeAdvertiserOnboarding = async ({ businessName }) => {
    const phone = user.email ? `+${user.email.split('@')[0]}` : '';
    await createAdvertiserProfile({ uid: user.uid, businessName, phone });
    setAdvertiserProfile({ businessName, phone });
  };

  const refreshSellerProfile = async () => {
    if (!user) return;
    const sellerSnapshot = await getDoc(doc(firestore, 'sellers', user.uid));
    setSellerProfile(sellerSnapshot.exists() ? sellerSnapshot.data() : null);
  };

  const value = useMemo(
    () => ({
      user,
      sellerProfile,
      advertiserProfile,
      isLoading,
      isFirebaseConfigured,
      signUp: signUpSeller,
      logIn: loginSeller,
      logOut: logoutSeller,
      signUpAdvertiser,
      logInAdvertiser: loginAdvertiser,
      completeAdvertiserOnboarding,
      refreshSellerProfile,
    }),
    [user, sellerProfile, advertiserProfile, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
