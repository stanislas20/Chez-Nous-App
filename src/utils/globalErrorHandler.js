import { reportFatal, reportNonFatal } from "./reportError";

// The errors no boundary can see.
//
// AppErrorBoundary catches what React throws while rendering. It cannot catch
// anything else: an exception inside a setTimeout, a rejected promise nobody
// awaited, a throw from a native event callback. Those go to React Native's
// own global handler, which in a release build ends the process without a
// word — and the audit's finding was that nothing anywhere reported it.
//
// Two hooks, because React Native has two.
let installed = false;

export function installGlobalErrorHandler() {
  // Called at module scope in App.js, and module scope runs once — but a
  // fast refresh re-evaluates it, and chaining a handler onto itself twice
  // means every error is reported twice.
  if (installed) return;
  installed = true;

  // 1. Uncaught exceptions.
  //
  // The previous handler is called afterwards rather than replaced. It is
  // the one that shows the red box in development and ends the process in
  // production, and both of those behaviours are correct — this only adds a
  // report on the way past. Swallowing a fatal error to keep the app alive
  // would leave it running in a state nobody has reasoned about.
  const globalHandler = global.ErrorUtils?.getGlobalHandler?.();
  global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    try {
      if (isFatal) reportFatal("uncaught", error);
      else reportNonFatal("uncaught", error);
    } catch {
      // Reporting must never be the thing that crashes the crash handler.
    }
    globalHandler?.(error, isFatal);
  });

  // 2. Unhandled promise rejections.
  //
  // These are the quiet ones and there are real candidates in this codebase:
  // fire-and-forget writes, the getInitialNotification chain, the parallel
  // uploads in company signup. React Native routes them through this global
  // when the polyfill is present; where it is not, this is simply a no-op.
  const tracking = global.HermesInternal?.hasPromise?.()
    ? global.HermesInternal?.enablePromiseRejectionTracker
    : null;
  tracking?.({
    allRejections: true,
    onUnhandled: (id, rejection) => {
      try {
        reportNonFatal("unhandledRejection", rejection);
      } catch {
        /* as above */
      }
    },
    // Fired when something attaches a catch later than the tracker expected.
    // Nothing to do: the report already went, and a rejection that is handled
    // a tick late is not worth a second message.
    onHandled: () => {},
  });
}
