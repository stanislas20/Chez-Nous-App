import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// Photographs are shrunk before they are uploaded.
//
// Every picker in the app already passed `quality: 0.8`, and it was doing
// less than it looked. `quality` is compression, not resizing: it changes
// how many bytes the file takes and never how many pixels it holds. And it
// only applies when expo-image-picker re-encodes at all — an iPhone's HEIC
// came through untouched. A photo measured out of a real listing was
// 4032×3024, 2.9 MB on disk, and 49 MB the moment anything decoded it,
// because a bitmap costs width × height × 4 bytes whatever the file weighed.
//
// Four things follow from capping the long edge at 1600px:
//
//   - a decode costs about 7 MB instead of 49
//   - a seller posting six photos uploads about 2 MB instead of 18, which
//     on a Bénin mobile connection is both money and the difference between
//     an upload that finishes and one that gives up
//   - storage and egress fall by the same order
//   - the file stops being HEIC, which no browser and no chat app's link
//     preview can decode — the share page had to fall back to a text-only
//     preview for exactly these photos
//
// 1600 is chosen against the screens that show these, not against a printer:
// the largest a listing photo is ever drawn is a phone's full width on the
// detail screen — about 1200px on the densest phones in use here. 1600 keeps
// room to zoom without keeping room for nothing.
export const MAX_UPLOAD_EDGE = 1600;

// What a picture is saved as afterwards. JPEG because it is the one format
// every browser, every crawler and every Android version reads.
const OUTPUT = { format: SaveFormat.JPEG, compress: 0.8 };

const ALREADY_JPEG = /\.jpe?g$/i;

// One photograph. Returns a new local uri, or the one it was given if there
// is nothing worth doing or anything goes wrong.
export async function downscalePhoto(uri) {
  if (!uri) return uri;
  try {
    // Rendered once with no actions, purely to read the real dimensions —
    // they are not knowable from the uri, and resizing by a guess would
    // enlarge a small picture rather than leave it alone.
    const source = await ImageManipulator.manipulate(uri).renderAsync();
    const longestEdge = Math.max(source.width, source.height);

    // Small and already a JPEG: nothing to gain, and re-encoding it would
    // only throw away a little quality for no reason.
    if (longestEdge <= MAX_UPLOAD_EDGE && ALREADY_JPEG.test(uri)) return uri;

    const context = ImageManipulator.manipulate(source);
    if (longestEdge > MAX_UPLOAD_EDGE) {
      // One edge only; the other follows to keep the ratio. Which edge
      // depends on the orientation, or a portrait photo would come out
      // 1600 wide and taller than it started.
      context.resize(
        source.width >= source.height
          ? { width: MAX_UPLOAD_EDGE }
          : { height: MAX_UPLOAD_EDGE },
      );
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync(OUTPUT);
    return saved.uri ?? uri;
  } catch {
    // A photo that cannot be shrunk is still a photo somebody chose. This
    // never blocks a listing from being posted — it just uploads the
    // original, which is what the app did for all of its life so far.
    return uri;
  }
}

// The small copy a card shows.
//
// One file was serving every context: the 168px card on Pour vous pulled
// the same 1600px picture the full-width detail hero does — about 250 KB to
// paint a thumbnail, on every card, on every screen, for every reader. This
// is the second copy, uploaded beside the first, and it is around 25 KB.
//
// 600px rather than the 168 a rail card measures in points: the grid card
// on Local is half the width of the phone, and half of a 1080-wide screen
// is 540 real pixels. A thumbnail that has to be stretched looks worse than
// one 20 KB heavier, and at 600 nothing in the app ever stretches it.
export const THUMBNAIL_EDGE = 600;

export async function makeThumbnail(uri) {
  if (!uri) return null;
  try {
    const source = await ImageManipulator.manipulate(uri).renderAsync();
    const context = ImageManipulator.manipulate(source);
    context.resize(
      source.width >= source.height
        ? { width: THUMBNAIL_EDGE }
        : { height: THUMBNAIL_EDGE },
    );
    const rendered = await context.renderAsync();
    // Compressed harder than the full copy: at this size the artefacts are
    // invisible and the bytes are the entire point.
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.7,
    });
    return saved.uri ?? null;
  } catch {
    // No thumbnail is not a failure — the card falls back to the full
    // picture, which is what every listing published before this does.
    return null;
  }
}

// A whole picker result. Videos pass through untouched: this resizes
// pictures, and handing a video to the image manipulator would either fail
// or silently produce a still.
export async function downscalePickedAssets(assets) {
  if (!Array.isArray(assets)) return assets;
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset?.uri || asset.type === "video") return asset;
      const uri = await downscalePhoto(asset.uri);
      return uri === asset.uri ? asset : { ...asset, uri };
    }),
  );
}
