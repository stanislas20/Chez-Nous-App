import { registerRootComponent } from 'expo';

// Before App, deliberately: it installs a LogBox filter for a warning that is
// emitted while App's own imports are still being evaluated. See the file.
import './src/utils/logBoxFilter';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
