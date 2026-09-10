// A tiny runner for the Cloud Functions tests.
//
// The rules tests have @firebase/rules-unit-testing to lean on; the callables
// have nothing, and Phase B shipped two of them — deleteAccount and
// placesProxy — that "parse but have not been executed". That is not a
// standard anybody should accept for a function that deletes accounts.
//
// firebase-functions v2 gives a CallableFunction a `.run()` method for
// exactly this: it invokes the real handler with a synthetic request, so the
// auth checks, the argument validation and the error mapping under test are
// the ones that will run in production. What it skips is the HTTPS transport,
// which is Google's code and not ours.
const assert = require("assert");

const results = [];

async function check(label, fn) {
  try {
    await fn();
    results.push([true, label]);
  } catch (error) {
    results.push([false, `${label} — ${String(error.message).slice(0, 200)}`]);
  }
}

// A callable that fails is expected to fail in a SPECIFIC way. A test that
// only asserts "it threw" passes when the function throws for the wrong
// reason, which is how a validation test comes to be satisfied by a crash.
async function expectHttpsError(promise, code, { messageMustNotInclude } = {}) {
  let error = null;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `expected an error with code "${code}", got success`);
  assert.strictEqual(
    error.code,
    code,
    `expected code "${code}", got "${error.code}" (${error.message})`,
  );
  for (const secret of messageMustNotInclude ?? []) {
    assert.ok(
      !String(error.message).includes(secret),
      `the error returned to the client leaked "${secret}"`,
    );
  }
  return error;
}

// A signed-in caller whose token was minted just now, which is what the
// freshness checks in deleteAccount and resetSellerPassword look for.
function callerContext(uid, { authTimeSecondsAgo = 0, extraClaims = {} } = {}) {
  return {
    auth: {
      uid,
      token: {
        uid,
        auth_time: Math.floor(Date.now() / 1000) - authTimeSecondsAgo,
        ...extraClaims,
      },
    },
  };
}

function report(suiteName) {
  for (const [ok, label] of results) {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  }
  const failed = results.filter(([ok]) => !ok);
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} ${suiteName}`);
  return results.length;
}

module.exports = { check, expectHttpsError, callerContext, report, assert };
