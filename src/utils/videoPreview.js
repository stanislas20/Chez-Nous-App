// How much a card-sized video preview is allowed to buffer.
//
// expo-video's Android defaults are tuned for a player somebody is watching:
// twenty seconds of look-ahead, and `maxBufferBytes: 0`, which means "decide
// for me". Those buffers are byte arrays on the Java heap, the grid runs
// several players at once, and a looping preview never stops filling them.
// Left on the Events screen the heap climbed 85 MB → 150 MB → 242 MB in
// under a minute and the process was killed:
//
//   FATAL EXCEPTION: ExoPlayer:Playback
//   java.lang.OutOfMemoryError: ... growth limit 268435456
//
// It read as the app "shutting down on its own", because nothing about the
// crash pointed at a muted decoration in the corner of a card.
//
// A preview nobody scrubs through needs a second or two of video, not
// twenty, and a ceiling in bytes so several of them cannot add up to the
// whole heap. Full-screen players — the detail hero, the lightbox — keep
// the defaults, because there somebody IS watching.
export const previewBufferOptions = {
  preferredForwardBufferDuration: 2,
  minBufferForPlayback: 0.5,
  maxBufferBytes: 4 * 1024 * 1024,
};
