import { Component } from "react";
import { ScrollView, Text, View } from "react-native";

// Catches a render-time JavaScript error in one screen and shows the
// message on screen instead of letting it take the app down.
//
// This exists because a crash that cannot be reproduced on the developer's
// device is nearly undiagnosable from "it crashed" alone: the red box only
// appears in a dev build attached to Metro, and a user on another phone has
// no way to relay what it said. Showing the message and the component stack
// in place turns that into something readable and quotable.
//
// It cannot catch everything. A crash inside a native module (a map, the
// speech recogniser) never reaches JavaScript, so if a screen still closes
// the app outright, that itself is the finding: the fault is native, not in
// the render tree.
export class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Also to the console, so it reaches Metro and `adb logcat` even if the
    // person hitting it never reads the screen.
    console.error("[ScreenErrorBoundary]", error?.message, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: "#3B0A0A", padding: 20, paddingTop: 60 }}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
          {this.props.label ?? "Screen error"}
        </Text>
        <Text selectable style={{ color: "#FFD9D9", fontSize: 14, marginBottom: 14 }}>
          {String(error?.message ?? error)}
        </Text>
        <ScrollView>
          <Text selectable style={{ color: "#FFB3B3", fontSize: 11, lineHeight: 16 }}>
            {String(info?.componentStack ?? "").trim()}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
