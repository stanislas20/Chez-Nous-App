// Where a public business phone may be set, and what setting it may not buy.
//
// publicPhone is the number a company chooses to show customers. Its source
// of truth is the company's OWN private sellers/{uid} document, and the
// server copies it into the world-readable verifiedCompanies projection.
// That split is the point: the company controls the value, the server
// controls publication, and the client can never write the public document
// directly (rules.test.js already proves that half).
//
// What is proved here is the other half, which the split makes newly
// relevant: setting a public phone must be an ordinary owner edit, it must
// not be reachable by anybody else, and it must not become a way to touch
// verification. A company that could set publicPhone AND verificationStatus
// in one write would publish itself.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");

const OWNER = "company-uid";
const STRANGER = "stranger-uid";

const results = [];
const check = async (label, promise) => {
  try {
    await promise;
    results.push([true, label]);
  } catch (error) {
    results.push([false, `${label} — ${error.message?.slice(0, 120)}`]);
  }
};

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "public-contact-probe",
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "..", "firestore.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `sellers/${OWNER}`), {
      accountType: "company",
      fullName: "Stanislas",
      companyName: "La Cananeenne",
      rccm: "RB/COT/123",
      ifu: "1234567890",
      phone: "+2290197000001",
      verificationStatus: "verified",
      verifiedAt: new Date(),
    });
    await setDoc(doc(ctx.firestore(), `sellerStats/${OWNER}`), {
      displayName: "La Cananeenne",
    });
    await setDoc(doc(ctx.firestore(), `verifiedCompanies/${OWNER}`), {
      companyName: "La Cananeenne",
      publicPhone: null,
    });
  });

  const owner = env.authenticatedContext(OWNER).firestore();
  const stranger = env.authenticatedContext(STRANGER).firestore();

  // ── The source value is the owner's to set ──────────────────────────
  await check(
    "the company can set its own public phone",
    assertSucceeds(
      updateDoc(doc(owner, `sellers/${OWNER}`), { publicPhone: "+2290155000002" }),
    ),
  );
  await check(
    "and can clear it again",
    assertSucceeds(updateDoc(doc(owner, `sellers/${OWNER}`), { publicPhone: null })),
  );
  await check(
    "a stranger cannot set it on somebody else's profile",
    assertFails(
      updateDoc(doc(stranger, `sellers/${OWNER}`), { publicPhone: "+22900000000" }),
    ),
  );
  await check(
    "a stranger cannot even read the private profile it lives in",
    assertFails(getDoc(doc(stranger, `sellers/${OWNER}`))),
  );

  // ── …and buys nothing else ──────────────────────────────────────────
  await check(
    "setting a public phone cannot smuggle in a verification status",
    assertFails(
      updateDoc(doc(owner, `sellers/${OWNER}`), {
        publicPhone: "+2290155000002",
        verificationStatus: "verified",
        verifiedAt: new Date(),
      }),
    ),
  );
  await check(
    "nor rewrite the verified company name alongside it",
    assertFails(
      updateDoc(doc(owner, `sellers/${OWNER}`), {
        publicPhone: "+2290155000002",
        companyName: "Autre Entreprise",
      }),
    ),
  );

  // ── The published copy stays the server's ───────────────────────────
  await check(
    "the company cannot publish a phone into its own public record",
    assertFails(
      updateDoc(doc(owner, `verifiedCompanies/${OWNER}`), {
        publicPhone: "+2290155000002",
      }),
    ),
  );
  await check(
    "nor create a public record for itself",
    assertFails(
      setDoc(doc(owner, `verifiedCompanies/${STRANGER}`), {
        companyName: "Fausse Entreprise",
        publicPhone: "+22900000000",
      }),
    ),
  );
  await check(
    "nor put contact details into the public seller projection",
    assertFails(
      updateDoc(doc(owner, `sellerStats/${OWNER}`), { publicPhone: "+22900000000" }),
    ),
  );
  // The public record is readable by anyone — that is what it is for, and
  // it is why what goes into it matters.
  await check(
    "anybody may read the public company record",
    assertSucceeds(getDoc(doc(stranger, `verifiedCompanies/${OWNER}`))),
  );

  await env.cleanup();

  const failed = results.filter(([ok]) => !ok);
  results.forEach(([ok, label]) => console.log(`${ok ? "  ok  " : "FAIL  "}${label}`));
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} public-contact rule(s) hold`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
