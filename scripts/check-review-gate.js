#!/usr/bin/env node
//
// "Leave a review" vanished, and the app could not tell you why.
//
// Eligibility to review somebody comes from a contacts/{pair} marker — the
// two of you must have messaged. That was read with a single getDoc whose
// rejection was swallowed:
//
//     try { canRate = contact.exists(); } catch { canRate = false; }
//
// So a transient network failure — one blip, on a Bénin mobile connection,
// or in the seconds after an outage — resolved eligibility to FALSE for the
// entire life of the screen. Nothing retried. Nothing was said. The control
// simply was not there, and only a fresh mount brought it back. Seen during
// RC2 testing: the link disappeared after a network test and returned after
// a relaunch, which is indistinguishable from the app forgetting the two
// accounts had ever spoken.
//
// The distinction this file defends is between an ANSWER and a FAILURE:
//
//   eligible     the marker exists      show the control
//   ineligible   the marker does not    a real verdict. Final. No retry.
//   unknown      the read threw         not a verdict at all. Retry,
//                                       bounded. Control stays hidden.
//   loading      before the first answer
//
// And the direction of the failure mode, which matters more than the retry:
// UNKNOWN renders exactly like INELIGIBLE. A failed read can never GRANT the
// ability to review — only withhold it temporarily. Server rules remain the
// real gate either way; nothing here loosens them.
//
// Run: node scripts/check-review-gate.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const HOOK = "src/hooks/useRatings.js";
const RULES = "firestore.rules";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!fs.existsSync(path.join(root, HOOK))) {
  console.log(`FAIL ${HOOK} is missing — this check reads it`);
  process.exit(1);
}

const hook = stripComments(read(HOOK));

// 1. A failed read is not an answer.
if (/catch \{\s*canRate = false;\s*\}/.test(hook)) {
  failures.push(
    "a failed contacts read is still collapsed straight into canRate=false " +
      "— that is the defect: one blip hides the review control for the whole " +
      "life of the screen, with no retry and nothing said",
  );
}
if (!/eligibility = "unknown"/.test(hook)) {
  failures.push(
    "there is no distinct 'unknown' state, so a failed read is " +
      "indistinguishable from a genuine 'these two have never messaged'",
  );
}
for (const verdict of ["eligible", "ineligible"]) {
  if (!new RegExp(`"${verdict}"`).test(hook)) {
    failures.push(`the '${verdict}' eligibility state is gone`);
  }
}

// 2. Only a real 'eligible' grants the control. This is the safety
//    direction: a failure must never open the gate.
if (!/canRate: eligibility === "eligible"/.test(hook)) {
  failures.push(
    "canRate is not derived strictly from eligibility === 'eligible' — a " +
      "failed or pending read could then present the review control to " +
      "somebody who has not earned it",
  );
}
if (/canRate: true/.test(hook)) {
  failures.push(
    "canRate is hard-coded true somewhere, which hands the review control " +
      "out without the interaction check",
  );
}

// 3. Retry exists, is bounded, and cannot become polling.
if (!/RATING_GATE_MAX_RETRIES/.test(hook)) {
  failures.push(
    "nothing retries an unknown eligibility, so a transient failure is " +
      "still permanent for that screen",
  );
}
if (!/attempt >= RATING_GATE_MAX_RETRIES/.test(hook)) {
  failures.push(
    "the retry has no ceiling — an unreachable backend would turn this into " +
      "a permanent read loop against Firestore",
  );
}
const maxRetries = hook.match(/const RATING_GATE_MAX_RETRIES = (\d+)/);
if (maxRetries && Number(maxRetries[1]) > 5) {
  failures.push(
    `RATING_GATE_MAX_RETRIES is ${maxRetries[1]}; beyond a handful this is ` +
      `polling with extra steps`,
  );
}
// A definite answer must stop the retrying.
if (!/if \(eligibility !== "unknown"\) \{[\s\S]{0,60}return;/.test(hook)) {
  failures.push(
    "a definite verdict does not stop the retry chain, so an 'ineligible' " +
      "answer would keep re-reading contacts forever",
  );
}

// 4. Cleanup. A retry timer that outlives the screen keeps reading.
// Scoped to the TEARDOWN. The snapshot handler clears this timer too, so a
// whole-file match passed while the teardown's own clear had been deleted —
// the same blind spot this suite hit once already.
const teardown = hook.slice(hook.search(/return \(\) => \{\s*active = false;/));
if (!teardown.trim()) {
  failures.push(
    "the eligibility effect has no teardown marking itself inactive",
  );
} else {
  const block = teardown.slice(0, teardown.indexOf("};") + 2);
  if (!/clearTimeout\(retryTimer\)/.test(block)) {
    failures.push(
      "the teardown does not clear the pending retry timer — it keeps " +
        "firing, and reading contacts, after the profile screen is gone",
    );
  }
  if (!/unsubscribe\(\)/.test(block)) {
    failures.push(
      "the teardown does not unsubscribe the ratings listener",
    );
  }
}
if (!/active = false;/.test(hook)) {
  failures.push(
    "the effect does not mark itself inactive on teardown, so a late retry " +
      "can setState on an unmounted component",
  );
}

// 5. Server-side authorisation is untouched. The client gate is a courtesy;
//    the rules are the actual control, and this fix must not have relaxed
//    them to make the UI simpler.
if (fs.existsSync(path.join(root, RULES))) {
  const rules = read(RULES);
  const ratingsBlock = rules.slice(
    rules.search(/match \/ratings\/\{/),
    rules.search(/match \/ratings\/\{/) + 1200,
  );
  if (ratingsBlock && !/contacts/.test(ratingsBlock)) {
    failures.push(
      "the ratings rules no longer consult the contacts marker — the " +
        "server-side interaction requirement has been weakened, which is a " +
        "much larger change than the client retry this file is about",
    );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: a failed eligibility read is retried rather than mistaken for a " +
      "refusal, and only a real answer opens the control",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
