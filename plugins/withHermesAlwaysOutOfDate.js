const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# @generated begin hermes-always-out-of-date-fix';

const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      next unless target.respond_to?(:name) && target.name == 'hermes-engine'
      target.build_phases.each do |phase|
        if phase.respond_to?(:name) && phase.name == '[CP-User] [Hermes] Replace Hermes for the right configuration, if needed'
          phase.always_out_of_date = '1'
        end
      end
    end
    # @generated end hermes-always-out-of-date-fix
`;

// Xcode's "[CP-User] [Hermes] Replace Hermes for the right configuration, if needed"
// script phase (from the hermes-engine pod) declares no outputs, so Xcode warns that
// it runs on every build. Marking it "always out of date" (unchecking "Based on
// dependency analysis") tells Xcode that's intentional and silences the warning.
// This must run every `pod install` since the phase itself is regenerated then.
function withHermesAlwaysOutOfDate(config) {
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

module.exports = withHermesAlwaysOutOfDate;
