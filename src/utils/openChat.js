import { Alert } from 'react-native';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';

export async function openChat({ listing, listingTitle, user, navigation, t }) {
  if (!user) {
    Alert.alert(t('chatSignUpRequiredTitle'), t('chatSignUpRequiredMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signUpButton'),
        onPress: () => navigation.navigate('MainTabs', { screen: 'Sell' }),
      },
    ]);
    return;
  }

  const conversationId = `${listing.id}_${user.uid}`;

  try {
    const conversationRef = doc(firestore, 'conversations', conversationId);
    const snapshot = await getDoc(conversationRef);
    if (!snapshot.exists()) {
      await setDoc(conversationRef, {
        listingId: listing.id,
        listingTitle,
        listingThumbnail: listing.mediaUrl ?? listing.image ?? null,
        sellerId: listing.sellerId,
        buyerId: user.uid,
        participantIds: [listing.sellerId, user.uid],
        lastMessage: null,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: null,
        unreadCount: { [listing.sellerId]: 0, [user.uid]: 0 },
        createdAt: serverTimestamp(),
      });
    }
    navigation.navigate('Chat', { conversationId, listingTitle });
  } catch (error) {
    Alert.alert(t('errorChatFailedTitle'), t('errorChatFailed'));
  }
}
