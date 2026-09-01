// Finds identifiers a file uses but never imports or defines.
//
// This exists because the bug keeps recurring: an edit inserts a call but the
// matching import doesn't land (often because Prettier had already rewritten
// the import block, so a literal string match silently missed). The file
// still compiles — an undefined identifier is only an error when the line
// actually runs — so it ships and blows up as a red screen on the one screen
// that uses it.
//
// Babel resolves real scopes here rather than matching text, so it sees
// through reformatting, shadowing and destructuring.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Anything genuinely available at runtime without an import.
const KNOWN_GLOBALS = new Set([
  'console', 'process', 'require', 'module', 'exports', 'globalThis', 'global',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'fetch', 'FormData', 'Headers', 'Request', 'Response',
  'URL', 'URLSearchParams', 'AbortController', 'Blob', 'FileReader', 'WebSocket',
  'Promise', 'Symbol', 'Proxy', 'Reflect', 'Intl', 'Math', 'JSON', 'Date', 'Array',
  'Object', 'String', 'Number', 'Boolean', 'Error', 'TypeError', 'RangeError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'RegExp', 'Infinity', 'NaN', 'undefined',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'atob', 'btoa', 'structuredClone',
  'ArrayBuffer', 'Uint8Array', 'BigInt', 'queueMicrotask', '__DEV__',
  // Node globals, for functions/ — which runs on Node, not in Hermes.
  'Buffer', '__dirname', '__filename',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(full, out);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// functions/ is scanned by default alongside src/.
//
// It was not, and that is how `logger` came to be called in three places in
// functions/index.js while never being imported anywhere — not a global in
// the v2 runtime, so each of those calls was a ReferenceError sitting on
// its branch. The one in moderatorPushTokens fires precisely when no
// moderators are configured, which is the moment somebody is trying to
// find out why no moderator was notified.
const roots = process.argv.slice(2);
const defaultRoots = ['src', 'functions'].filter((dir) => fs.existsSync(dir));
const files = (roots.length ? roots : defaultRoots).flatMap((r) =>
  fs.statSync(r).isDirectory() ? walk(r) : [r],
);

let failures = 0;
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator'],
    });
  } catch (error) {
    console.log(`PARSE FAIL  ${file}: ${error.message}`);
    failures += 1;
    continue;
  }

  traverse(ast, {
    Program(programPath) {
      // scope.globals is every identifier referenced but never bound in any
      // enclosing scope — precisely "used but never imported or declared".
      for (const [name, node] of Object.entries(programPath.scope.globals)) {
        if (KNOWN_GLOBALS.has(name)) continue;
        console.log(`${path.relative('.', file)}:${node.loc?.start.line ?? '?'}  '${name}' is used but never imported or defined`);
        failures += 1;
      }
    },
  });
}

console.log(failures ? `\n${failures} problem(s) across ${files.length} file(s)` : `clean: ${files.length} file(s)`);
process.exit(failures ? 1 : 0);
