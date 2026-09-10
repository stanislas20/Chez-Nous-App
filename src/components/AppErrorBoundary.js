import { Component } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { reportFatal } from "../utils/reportError";

// The boundary the whole app sits inside.
//
// ScreenErrorBoundary already existed and was used once, around Restaurants,
// to chase a crash that could not be reproduced. Every other screen rendered
// unprotected — and in a release bundle there is no red box: an uncaught
// render error unmounts the tree and the person sees a blank screen or an app
// that closes. They have no way to tell anybody what it said, and nothing
// reported it, so the first signal was a review.
//
// This is deliberately plain. It cannot use the theme, the string table or
// any styled component, because the thing that just failed may be exactly
// those: a boundary that throws while rendering its own fallback takes the
// app down with the bug it was supposed to contain. Hard-coded colours,
// hard-coded English and French, no providers, no hooks.
//
// It cannot catch everything, and the limit is worth stating: a crash inside
// a native module — the map, the speech recogniser, the audio player — never
// reaches JavaScript. If the app still closes outright, that is itself the
// finding.
const COPY = {
  title: "Quelque chose s'est mal passé\nSomething went wrong",
  body:
    "L'écran n'a pas pu s'afficher. Vous pouvez réessayer.\n" +
    "This screen could not be displayed. You can try again.",
  retry: "Réessayer · Try again",
};

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    reportFatal(this.props.label ?? "app", error, info?.componentStack);
  }

  // Remounting the subtree is the only recovery a boundary can offer, and it
  // is usually enough: the common case is a screen handed data in a shape it
  // did not expect, and the screen below has since moved on.
  handleRetry = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>{COPY.title}</Text>
        <Text style={styles.body}>{COPY.body}</Text>
        <Pressable
          onPress={this.handleRetry}
          style={styles.button}
          accessibilityRole="button"
        >
          <Text style={styles.buttonLabel}>{COPY.retry}</Text>
        </Pressable>
        {/* Only where a developer can act on it. In a release build the
            stack is reported, not printed — it means nothing to the reader
            and naming internals on screen is its own small leak. */}
        {__DEV__ ? (
          <ScrollView style={styles.details}>
            <Text selectable style={styles.detailsText}>
              {String(error?.message ?? error)}
              {"\n\n"}
              {String(info?.componentStack ?? "").trim()}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    );
  }
}

const styles = {
  root: { flex: 1, backgroundColor: "#0E1513", padding: 24, paddingTop: 80 },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    lineHeight: 27,
  },
  body: { color: "#B0BFB8", fontSize: 15, lineHeight: 22, marginBottom: 24 },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#0B6E4F",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  buttonLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  details: { marginTop: 28 },
  detailsText: { color: "#7E8F87", fontSize: 11, lineHeight: 16 },
};
