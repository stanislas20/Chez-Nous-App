const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# @generated begin rnfirebase-as-static-framework';

const SNIPPET = `${MARKER}
$RNFirebaseAsStaticFramework = true
# @generated end rnfirebase-as-static-framework
`;

// react-native-firebase requires this Ruby global whenever CocoaPods uses
// static frameworks (use_frameworks! :linkage => :static), set via the
// expo-build-properties plugin. expo-build-properties has no option for
// this specific global, so it needs its own Podfile mod.
function withRNFirebaseAsStaticFramework(config) {
  return withPodfile(config, (config) => {
    const { contents } = config.modResults;

    if (contents.includes(MARKER)) {
      return config;
    }

    config.modResults.contents = `${SNIPPET}\n${contents}`;

    return config;
  });
}

module.exports = withRNFirebaseAsStaticFramework;
