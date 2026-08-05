const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# @generated begin expo-constants-space-in-path-fix';

const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      next unless target.respond_to?(:name) && target.name == 'EXConstants'
      target.build_phases.each do |phase|
        next unless phase.respond_to?(:name) && phase.name&.include?('Generate app.config for prebuilt Constants.manifest')
        old_fragment = '$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh'
        new_fragment = '\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"'
        unless phase.shell_script.include?(new_fragment)
          phase.shell_script = phase.shell_script.sub(old_fragment, new_fragment)
        end
      end
    end
    # @generated end expo-constants-space-in-path-fix
`;

// EXConstants' "Generate app.config for prebuilt Constants.manifest" script phase
// runs `bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"`. The
// nested `bash -c` re-parses that expanded path as a fresh command line, so if the
// project lives under a directory with a space in its name (e.g. "MarketPlace
// Benin"), it word-splits there and fails with "No such file or directory". Wrapping
// the path in an escaped quote pair makes it survive the nested re-parse.
function withExpoConstantsSpaceInPathFix(config) {
  return withPodfile(config, (config) => {
    const { contents } = config.modResults;

    if (contents.includes(MARKER)) {
      return config;
    }

    const postInstallRegex = /(post_install do \|installer\|\n)/;
    if (!postInstallRegex.test(contents)) {
      return config;
    }

    config.modResults.contents = contents.replace(postInstallRegex, `$1${SNIPPET}`);

    return config;
  });
}

module.exports = withExpoConstantsSpaceInPathFix;
