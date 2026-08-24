import { Alert } from "react-native";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "../config/firebase";
import { openAccountGate } from "./openAccountGate";

// `attachOnOpen` is for the roadside case: someone who has just tapped
// "Envoyer une photo" means the photo, not the thread, so the chat opens
// straight into the picker instead of making them find the paperclip while
// standing next to a broken-down car.
export async function openChat({
  listing,
  listingTitle,
  user,
  navigation,
  t,
  attachOnOpen = false,
}) {
  if (!user) {
    Alert.alert(t("chatSignUpRequiredTitle"), t("chatSignUpRequiredMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("signUpButton"),
        onPress: () => openAccountGate(navigation),
      },
    ]);
    return;
  }

  const conversationId = `${listing.id}_${user.uid}`;

  try {
    const conversationRef = doc(firestore, "conversations", conversationId);
    const snapshot = await getDoc(conversationRef);
    if (!snapshot.exists()) {
      await setDoc(conversationRef, {
        listingId: listing.id,
        listingTitle,
        listingThumbnail: listing.mediaUrl ?? listing.image ?? null,
        sellerId: listing.sellerId,
        buyerId: user.uid,
        participantIds: [listing.sellerId, user.uid],
        // Denormalized so the thread can name the person, not just the
        // listing — and so tapping through to their profile has something
        // to show. Nulls are left as nulls rather than filled with a guess;
        // the chat header falls back to a generic label, which is also what
        // conversations created before this field get.
        participantNames: {
          [listing.sellerId]: listing.sellerName ?? null,
          [user.uid]: user.displayName ?? null,
        },
        lastMessage: null,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: null,
        unreadCount: { [listing.sellerId]: 0, [user.uid]: 0 },
        createdAt: serverTimestamp(),
      });
    }
    navigation.navigate("Chat", { conversationId, listingTitle, attachOnOpen });
  } catch (error) {
    Alert.alert(t("errorChatFailedTitle"), t("errorChatFailed"));
  }
}
