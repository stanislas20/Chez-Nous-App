import { useEffect, useState } from "react";
import styled from "styled-components/native";
import { fontFamily } from "../theme/typography";

// Somebody's face, or their initial.
//
// Three screens show the same small circle — the conversation header, each
// inbox row, each review — and all three had the same two problems. The
// first was that they showed an initial even for people who have a picture.
// The second is the one this component exists for:
//
//   <Image source={{ uri }} /> with a uri that fails to load renders NOTHING.
//
// Not a broken-image glyph, not a placeholder: an empty circle, forever, with
// no error anywhere. A Storage object removed, a token rotated, a device
// offline before the image cache is warm — every one of those turns an avatar
// into a hole. So loading is a state here rather than an assumption, and a
// failure falls back to the letter the screen would have shown anyway.
//
// The failure is SCOPED to this instance on purpose. A url that fails once on
// a flaky connection must not mark that person pictureless everywhere else in
// the app, so nothing is written back to the profile cache and no other
// avatar of the same person is told. The cost is that a genuinely dead url is
// retried once per place it appears, which is bounded by how many avatars are
// on screen.
const EMERALD = "#0B6E4F";

export function PublicAvatar({
  photoUrl,
  name,
  size = 34,
  // The header's initial is derived from the routed name, a review's from the
  // looked-up profile. Both arrive here as `name`, so the fallback letter is
  // computed one way for all three screens.
  testID,
}) {
  const [failed, setFailed] = useState(false);

  // A new person in the same slot — an inbox row recycled by FlatList, or the
  // header after navigating to another thread — must not inherit the previous
  // one's failure. Keyed on the url rather than the component's position.
  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  const initial = String(name ?? "").trim().charAt(0).toUpperCase() || "?";
  const showPhoto = Boolean(photoUrl) && !failed;

  if (showPhoto) {
    return (
      <AvatarImage
        testID={testID}
        size={size}
        source={{ uri: photoUrl }}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityLabel={name ?? undefined}
      />
    );
  }

  return (
    <AvatarFallback size={size} testID={testID}>
      <AvatarInitial size={size}>{initial}</AvatarInitial>
    </AvatarFallback>
  );
}

const AvatarImage = styled.Image`
  width: ${(props) => props.size}px;
  height: ${(props) => props.size}px;
  border-radius: ${(props) => props.size / 2}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const AvatarFallback = styled.View`
  width: ${(props) => props.size}px;
  height: ${(props) => props.size}px;
  border-radius: ${(props) => props.size / 2}px;
  background-color: ${EMERALD};
  align-items: center;
  justify-content: center;
`;

// Scaled from the circle rather than fixed, because the same component is a
// 34px review avatar and a 44px conversation header.
const AvatarInitial = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: ${(props) => Math.round(props.size * 0.42)}px;
  color: #ffffff;
`;
