const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# @generated begin rnfb-always-out-of-date-fix';

const SNIPPET = `
${MARKER}
post_integrate do |installer|
  user_projects = []
  installer.aggregate_targets.each do |aggregate_target|
    aggregate_target.user_targets.each do |user_target|
      user_target.build_phases.each do |phase|
        if phase.respond_to?(:name) && phase.name == '[CP-User] [RNFB] Core Configuration'
          phase.always_out_of_date = '1'
        end
      end
    end
    user_projects << aggregate_target.user_project
  end
  user_projects.uniq.each(&:save)

  # react-native-firebase modules (RNFBApp, RNFBAuth, ...) are built as framework
  # modules but import plain (non-modularized) React-Core headers like
  # <React/RCTConvert.h>, which Xcode treats as a hard error
  # (-Werror,-Wnon-modular-include-in-framework-module) unless this build
  # setting is relaxed. This is react-native-firebase's own documented fix.
  # Bundled into this same hook because CocoaPods only allows one
  # post_integrate block per Podfile.
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
    end
  end
  installer.pods_project.save
end
# @generated end rnfb-always-out-of-date-fix
`;

// react-native-firebase's "Core Configuration" script phase is added to the
// app target by CocoaPods' user-project integration step, which runs AFTER
// `post_install`. Only `post_integrate` sees the phase, since by then it
// already exists on the target, so that's the hook this must use. Without
// this, Xcode warns the script has no outputs and runs on every build.
// Must run every `pod install` since the phase itself is regenerated then.
// This hook also carries an unrelated-but-forced-together fix (modular
// headers, see below) since CocoaPods only allows one post_integrate block.
function withRNFBAlwaysOutOfDate(config) {
  return withPodfile(config, (config) => {
    const { contents } = config.modResults;

    if (contents.includes(MARKER)) {
      return config;
    }

    config.modResults.contents = `${contents}\n${SNIPPET}`;

    return config;
  });
}

module.exports = withRNFBAlwaysOutOfDate;
