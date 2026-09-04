// Opens every bank website this app offers, and says which ones answer.
//
// Deliberately NOT named check-*: the suite is run constantly and must be
// offline, fast and deterministic. This one makes a dozen requests over
// somebody's connection and its answer depends on where it is run from —
// three properties a gate must not have.
//
// It exists because "unreachable" turned out not to be a fact about a URL.
// Ecobank's was a genuine redirect loop, the same from anywhere, and had
// to go. BGFIBank Bénin's host does not resolve from the machine this was
// written on — not on the local resolver nor via 8.8.8.8, 1.1.1.1 or
// 9.9.9.9 — while the apex it is a subdomain of resolves fine, and the
// site loads for the person who asked for it. One is a dead link and the
// other is a blocked egress, and they look identical from a single
// vantage point. So this prints what it saw and from where, and a human
// decides.
//
//   node scripts/verifyBankSites.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");

function loadEsm(relative) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    }).code,
    { module: shim, exports: shim.exports, require: () => ({}), console },
  );
  return shim.exports;
}

const { beninBanks } = loadEsm("src/data/beninBanks.js");

// A browser's header. Several of these sit behind Cloudflare and answer a
// bare script with 403, which is a fact about the request and not about
// the site being up.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "fr,en;q=0.8",
};
const TIMEOUT_MS = 20000;

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await response.text().catch(() => "");
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      title: title ? title.replace(/\s+/g, " ").trim().slice(0, 70) : null,
    };
  } catch (error) {
    return { ok: false, status: null, error: error.message ?? String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const withUrl = beninBanks.filter((bank) => bank.url);
  console.log(
    `${withUrl.length} of ${beninBanks.length} banks carry a site. ` +
      `Opening each one.\n`,
  );
  const dead = [];
  for (const bank of withUrl) {
    const result = await probe(bank.url);
    if (result.ok) {
      console.log(`  ok    ${bank.shortName.padEnd(18)} ${result.status}  ${result.title ?? "(no title)"}`);
      if (result.finalUrl && result.finalUrl !== bank.url) {
        console.log(`        ${" ".repeat(18)}      -> ${result.finalUrl}`);
      }
    } else {
      dead.push(bank);
      console.log(
        `  DEAD  ${bank.shortName.padEnd(18)} ${result.status ?? ""} ${result.error ?? ""}`.trimEnd(),
      );
      console.log(`        ${" ".repeat(18)}      ${bank.url}`);
    }
  }

  const without = beninBanks.filter((bank) => !bank.url);
  if (without.length) {
    console.log(
      `\n${without.length} carry none, and the screen shows nothing for them: ` +
        without.map((bank) => bank.shortName).join(", "),
    );
  }
  if (dead.length) {
    console.log(
      `\n${dead.length} did not answer from here. Before removing one, check ` +
        `whether it resolves at all — a host that answers nowhere is a dead ` +
        `link, and a host that answers elsewhere is this machine's egress.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
