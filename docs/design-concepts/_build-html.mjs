import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const fonts = {
  haze: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap",
  pearl: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap",
  still: "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;600;700&family=Nunito+Sans:wght@400;600;700&display=swap",
  veil: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Urbanist:wght@500;600;700&display=swap",
  gleam: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;600&display=swap",
};

const screens = [
  { file: "landing.html", label: "Landing", title: "Public landing" },
  { file: "needs.html", label: "Needs", title: "Needs questionnaire" },
  { file: "compare.html", label: "Compare", title: "Masked comparison" },
  { file: "workspace.html", label: "Workspace", title: "Customer workspace" },
];

const principles = [
  { t: "Customers never pay", b: "Software providers pay MMHR a referral fee. Buyers pay nothing for this help." },
  { t: "Fees never rank vendors", b: "Referral fees stay outside every score. Rankings use approved evidence only." },
  { t: "Evidence before names", b: "You compare capabilities first. Names appear after you review requirements with an advisor, before any RFP is sent." },
];

const journey = [
  { t: "Tell us what you need", b: "Capture company context, current systems, requirements, compliance, budget, timeline, stakeholders, and decision process. Save and return anytime." },
  { t: "Compare every fit", b: "See every approved option in one matrix. Names stay masked so the evidence decides, not the brand. Choose up to five RFP contenders." },
  { t: "Talk it through", b: "An MMHR advisor reviews your requirements with you, then records disclosure of the names you chose." },
  { t: "Send one request", b: "MMHR approves and sends a single RFP. Vendors answer in a structured portal. You see only approved replies." },
  { t: "Choose with confidence", b: "Compare demos and quotes, pick a provider, and sign a direct contract with them. MMHR does not negotiate the legal contract." },
];

const vendors = [
  { id: "a", name: "Vendor A", fit: "92", start: true },
  { id: "b", name: "Vendor B", fit: "88", start: true },
  { id: "c", name: "Vendor C", fit: "84", start: false },
  { id: "d", name: "Vendor D", fit: "79", start: false },
  { id: "e", name: "Vendor E", fit: "74", start: false },
  { id: "f", name: "Vendor F", fit: "68", start: false },
];

const rows = [
  { label: "Overall fit", vals: ["92", "88", "84", "79", "74", "68"] },
  { label: "Estimated annual cost", vals: ["On file", "Range on file", "On file", "Unknown", "On file", "On file"] },
  { label: "Payroll in three states", vals: ["Met", "Met", "Limited", "Met", "Add-on", "Limited"] },
  { label: "Benefits administration", vals: ["Met", "Met", "Met", "Limited", "Met", "Missing"] },
  { label: "Time and attendance", vals: ["Met", "Met", "Unknown", "Met", "Limited", "Limited"] },
  { label: "ACA compliance reporting", vals: ["Met", "Met", "Met", "Limited", "Unknown", "Limited"] },
  { label: "Applicant tracking", vals: ["Nice", "Met", "Limited", "Met", "Limited", "Unknown"] },
  { label: "Live within 90 days", vals: ["Met", "Limited", "Met", "Missing", "Limited", "Met"] },
  { label: "Evidence coverage", vals: ["Demo notes", "Docs + call", "Statement", "Public docs", "Under review", "Statement"] },
];

const stages = [
  ["Needs", "done"],
  ["Comparison", "done"],
  ["Discussion", "done"],
  ["RFP", "now"],
  ["Responses", ""],
  ["Demos", ""],
  ["Proposals", ""],
  ["Contract", ""],
];

function head(concept, title, font) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ${concept.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${font}" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
`;
}

function foot(note) {
  return `
<footer class="site">
  <div class="foot">
    <span>MatchMaker HR · sample preview · not a product claim</span>
    <span>${note}</span>
  </div>
</footer>
<script src="../shared.js"></script>
</body>
</html>
`;
}

function navLinks(current) {
  return screens
    .map((s) => `<a href="${s.file}"${s.file === current ? ' aria-current="page"' : ""}>${s.label}</a>`)
    .join("");
}

function chromeNav(current, extraClass = "links") {
  return `<button class="menu" type="button" data-nav-toggle aria-expanded="false">Menu</button>
  <nav class="${extraClass} nav-panel" data-nav-panel data-open="false" aria-label="Concept screens">${navLinks(current)}<a href="../index.html">Gallery</a></nav>`;
}

function needsForm() {
  return `
<form class="sheet" data-needs-form>
  <div class="field-grid">
    <div class="field"><label for="company">Company context</label><span>Who you are and how the company is organized.</span><input id="company" name="company" value="Fernwood Dental Group" /></div>
    <div class="field"><label for="employees">Employees</label><span>Whole number from 1 to 100,000.</span><input id="employees" name="employees" inputmode="numeric" value="240" /></div>
    <div class="field"><label for="systems">Current systems</label><span>Payroll, HR, and adjacent tools in use now.</span><input id="systems" name="systems" value="Separate payroll and benefits tools" /></div>
    <div class="field"><label for="email">Work email</label><span>Used to save this workspace.</span><input id="email" name="email" type="email" value="sam@example.com" /></div>
    <div class="field wide"><label for="req">Must-have requirements</label><span>Structured and custom needs. Importance is set with your advisor.</span><textarea id="req" name="req">Payroll in three states. Benefits administration. ACA reporting. Live within 90 days.</textarea></div>
    <div class="field"><label for="compliance">Compliance needs</label><input id="compliance" name="compliance" value="ACA reporting; multi-state payroll" /></div>
    <div class="field"><label for="budget">Budget</label><input id="budget" name="budget" value="Not disclosed in this sample" /></div>
    <div class="field"><label for="timeline">Timeline</label><input id="timeline" name="timeline" value="Live before next benefits cycle" /></div>
    <div class="field"><label for="owners">Stakeholders</label><input id="owners" name="owners" value="HR lead, finance, practice owner" /></div>
    <div class="field wide"><span>Must-have modules</span>
      <div class="checks">
        <label><input type="checkbox" name="features" value="Payroll" checked /> Payroll</label>
        <label><input type="checkbox" name="features" value="Benefits" checked /> Benefits</label>
        <label><input type="checkbox" name="features" value="Time tracking" /> Time tracking</label>
        <label><input type="checkbox" name="features" value="Hiring" /> Hiring</label>
      </div>
    </div>
    <div class="field wide"><label for="decision">Decision process</label><textarea id="decision" name="decision">Committee review after demos. Final signature by the practice owner. Direct contract with the chosen provider.</textarea></div>
  </div>
  <div class="save-row">
    <button class="btn ghost" type="submit">Save draft</button>
    <a class="btn" href="compare.html">Save and continue</a>
    <p class="fine" data-save-status hidden></p>
  </div>
</form>`;
}

function matrix() {
  const headCells = vendors
    .map(
      (v) =>
        `<th data-col="${v.id}"><button class="pick" type="button" data-vendor="${v.id}" data-start="${v.start}" aria-pressed="${v.start}">Select ${v.name}</button><div>${v.name}</div><div class="muted">Masked until disclosure</div></th>`,
    )
    .join("");
  const body = rows
    .map((row) => {
      const cells = row.vals
        .map((val, i) => {
          const cls = val === "Unknown" ? ' class="unknown"' : "";
          return `<td data-col="${vendors[i].id}"${cls}>${val}</td>`;
        })
        .join("");
      return `<tr><th>${row.label}</th>${cells}</tr>`;
    })
    .join("");
  return `
<p class="fine">Sample comparison. Fit scores, costs, and coverage are fictional. Unknown means MMHR has no verified evidence yet — not the same as a missing feature. Select up to five contenders.</p>
<div class="matrix-wrap">
<table class="matrix">
  <thead><tr><th>Requirement</th>${headCells}</tr></thead>
  <tbody>${body}</tbody>
</table>
</div>
<div class="bar" data-pick-bar>
  <span><span data-pick-count>2</span> of 5 contenders selected</span>
  <a class="btn" href="workspace.html">Continue to workspace</a>
</div>`;
}

function workspaceBody() {
  const pills = stages
    .map(([name, state]) => `<span${state ? ` data-state="${state}"` : ""}>${name}</span>`)
    .join("");
  return `
<section class="workspace">
  <article class="card">
    <p class="kicker">Sample case</p>
    <h1>Fernwood Dental Group</h1>
    <p>240 employees. Replace payroll and benefits with one platform.</p>
    <div class="stages" aria-label="Case stages">${pills}</div>
    <h2>Recent activity</h2>
    <ol class="activity">
      <li><time>Oct 14</time><span>Advisor sent the RFP draft for approval.</span></li>
      <li><time>Oct 12</time><span>Provider names disclosed for the five selected contenders.</span></li>
      <li><time>Oct 09</time><span>Masked comparison published from the submitted intake.</span></li>
    </ol>
  </article>
  <aside class="card">
    <p class="kicker">Waiting for you</p>
    <h2>Approve the RFP draft</h2>
    <p>Due Thursday, October 15. Advisor Dana Ortiz.</p>
    <p class="fine">MMHR records the staff approval. Sending to vendors stays disabled until that approval is stored.</p>
    <div class="actions">
      <button class="btn" type="button">Approve draft</button>
      <button class="btn ghost" type="button">Request changes</button>
    </div>
    <h3>Open tasks</h3>
    <ul>
      <li>Confirm multi-state payroll scope</li>
      <li>Attach benefits plan summary</li>
      <li>Invite finance to the workspace</li>
    </ul>
    <h3>Current candidates</h3>
    <p>Five masked options selected. Names remain in the case file after recorded disclosure.</p>
  </aside>
</section>`;
}

function needsBlock(kicker, title, lede) {
  return `<p class="kicker">${kicker}</p><h1>${title}</h1><p class="lede">${lede}</p>${needsForm()}`;
}

function compareBlock(kicker, title) {
  return `<p class="kicker">${kicker}</p><h1>${title}</h1>${matrix()}`;
}

const concepts = [
  {
    id: "concept-1-haze",
    key: "haze",
    name: "Haze",
    note: "Concept 1 of 5 · cool mist, flat",
    chrome(current) {
      return `<div class="shell">
<header class="nav">
  <a class="brand" href="landing.html"><b>MMHR</b><small>Haze</small></a>
  ${chromeNav(current)}
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <div>
      <p class="kicker">Buyer-side HRIS brokerage</p>
      <h1>HR software, compared before the names appear.</h1>
      <p class="lede">MatchMaker HR is a private selection process for registered buyers. You describe what the company needs. We keep a complete record from intake through a direct contract with the provider you choose.</p>
      <div class="actions">
        <a class="btn" href="needs.html">Start an intake</a>
        <a class="btn ghost" href="compare.html">Open a sample comparison</a>
      </div>
      <p class="fine">Free to buyers. Providers pay MMHR under commission or referral arrangements. Sample layout only.</p>
    </div>
    <aside class="preview" aria-label="Sample masked options">
      <header><span>Published options</span><span>Masked</span></header>
      <ol>
        <li><span>Vendor A</span><span class="muted">On file</span><span class="fit">92</span></li>
        <li><span>Vendor B</span><span class="muted">Range</span><span class="fit">88</span></li>
        <li><span>Vendor C</span><span class="muted">On file</span><span class="fit">84</span></li>
        <li><span>Vendor D</span><span class="muted">Unknown</span><span class="fit">79</span></li>
      </ol>
    </aside>
  </section>
  <section class="section">
    <h2>How it works</h2>
    <div class="journey">${journey.map((j, i) => `<article><b>0${i + 1}</b><div><h3>${j.t}</h3><p>${j.b}</p></div></article>`).join("")}</div>
  </section>
  <section class="section">
    <div class="principles">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap">${needsBlock("Intake", "Describe what the team needs", "Save a draft now. You can return later. This preview does not store data on a server.")}</div>`;
    },
    compare() {
      return `<div class="wrap">${compareBlock("Masked comparison", "Every published option")}</div>`;
    },
    workspace() {
      return `<div class="wrap">${workspaceBody()}</div>`;
    },
  },
  {
    id: "concept-2-pearl",
    key: "pearl",
    name: "Pearl",
    note: "Concept 2 of 5 · warm sand, soft depth",
    chrome(current) {
      return `<div class="shell">
<header class="nav">
  <a class="brand" href="landing.html">MMHR<small>Pearl</small></a>
  ${chromeNav(current)}
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <p class="kicker">Free for buyers</p>
    <h1>A quiet way to choose HR software.</h1>
    <p class="lede">A buyer-side brokerage. You capture needs, compare every approved option with names still hidden, then take up to five contenders into an approved request.</p>
    <div class="actions"><a class="btn" href="needs.html">Begin the intake</a><a class="btn ghost" href="workspace.html">View a sample case</a></div>
    <p class="fine">Customers never pay MMHR. Providers pay a referral fee after you sign with them.</p>
  </section>
  <div class="bento">
    ${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}
  </div>
  <section class="section">
    <h2>The process</h2>
    <div class="journey">${journey.map((j, i) => `<article><div class="mark">${i + 1}</div><div><h3>${j.t}</h3><p>${j.b}</p></div></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap">${needsBlock("Saved worksheet", "What should this platform cover?", "Company context through decision process. MMHR staff review before a comparison is published.")}</div>`;
    },
    compare() {
      return `<div class="wrap">${compareBlock("All published options", "Compare on evidence")}</div>`;
    },
    workspace() {
      return `<div class="wrap">${workspaceBody()}</div>`;
    },
  },
  {
    id: "concept-3-still",
    key: "still",
    name: "Still",
    note: "Concept 3 of 5 · sage glass",
    chrome(current) {
      return `<div class="app">
<aside class="rail">
  <a class="brand" href="landing.html">MMHR<small>Still</small></a>
  ${chromeNav(current)}
</aside>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <p class="kicker">Masked until disclosure</p>
    <h1>See every fit. Take five forward.</h1>
    <p class="lede">MatchMaker HR keeps the catalog current and the scores independent of fees. Names stay hidden until you review requirements with an advisor.</p>
    <div class="actions"><a class="btn" href="needs.html">Open intake</a><a class="btn ghost" href="compare.html">Preview the matrix</a></div>
    <p class="fine">Buyers never pay MMHR. Sample preview — not a performance claim.</p>
  </section>
  <div class="glass">
    <div class="glass-row">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </div>
  <section class="section">
    <h2>From intake to a direct contract</h2>
    <div class="journey">${journey.map((j) => `<article><h3>${j.t}</h3><p>${j.b}</p></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap">${needsBlock("Workspace intake", "Capture the requirements", "Save often. Revision history stays with the record.")}</div>`;
    },
    compare() {
      return `<div class="wrap">${compareBlock("Published catalog", "Select up to five contenders")}</div>`;
    },
    workspace() {
      return `<div class="wrap">${workspaceBody()}</div>`;
    },
  },
  {
    id: "concept-4-veil",
    key: "veil",
    name: "Veil",
    note: "Concept 4 of 5 · lavender-gray wash",
    chrome(current) {
      return `<div class="shell">
<header class="nav">
  <a class="brand" href="landing.html">MMHR<small>Veil</small></a>
  ${chromeNav(current)}
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<section class="band">
  <div class="wrap hero">
    <div>
      <p class="kicker">Approved catalog</p>
      <h1>Compare on evidence. Disclose when you are ready.</h1>
      <p class="lede">MatchMaker HR is a buyer-side brokerage for HR and workforce software. The first view is a masked matrix, not a vendor advertisement.</p>
      <div class="actions"><a class="btn" href="compare.html">Open the matrix</a><a class="btn ghost" href="needs.html">Start with needs</a></div>
      <p class="fine">Customers never pay. Provider names appear after an advisor records disclosure.</p>
    </div>
    <aside class="stat" aria-label="Sample options">
      <ol>
        <li><span>Vendor A</span><span>Fit 92</span></li>
        <li><span>Vendor B</span><span>Fit 88</span></li>
        <li><span>Vendor C</span><span>Fit 84</span></li>
        <li><span>Remaining options</span><span>Shown, not capped</span></li>
      </ol>
    </aside>
  </div>
</section>
<section class="band alt">
  <div class="wrap">
    <h2>Standing rules</h2>
    <div class="principles" style="margin-top:28px">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </div>
</section>
<section class="band">
  <div class="wrap">
    <h2>Five steps</h2>
    <div class="journey" style="margin-top:28px">${journey.map((j, i) => `<article><b>0${i + 1}</b><h3>${j.t}</h3><p>${j.b}</p></article>`).join("")}</div>
  </div>
</section>`;
    },
    needs() {
      return `<div class="wrap page-pad">${needsBlock("Intake", "Facts before the shortlist", "Company context, systems, compliance, budget, timeline, stakeholders, decision process.")}</div>`;
    },
    compare() {
      return `<div class="wrap page-pad">${compareBlock("Masked matrix", "Six columns. No logos.")}</div>`;
    },
    workspace() {
      return `<div class="wrap page-pad">${workspaceBody()}</div>`;
    },
  },
  {
    id: "concept-5-gleam",
    key: "gleam",
    name: "Gleam",
    note: "Concept 5 of 5 · monochrome, champagne accent",
    chrome(current) {
      return `<div class="shell">
<header class="nav">
  <a class="brand" href="landing.html">MMHR</a>
  ${chromeNav(current)}
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <p class="kicker">Sample preview</p>
    <h1>The comparison is the product.</h1>
    <p class="lede">One intake. Every published option, names still hidden. Up to five contenders, then an approved request and a contract you sign with the provider.</p>
    <div class="actions"><a class="btn" href="needs.html">Start</a><a class="btn ghost" href="compare.html">Comparison</a></div>
    <p class="fine">Free to buyers. Fees never enter the ranking.</p>
  </section>
  <aside class="window" aria-label="Sample product frame">
    <header><i></i><i></i><i></i><span>Masked comparison · sample</span></header>
    <div class="window-body">
      <div><span>Vendor A</span><strong>92</strong></div>
      <div><span>Vendor B</span><strong>88</strong></div>
      <div><span>Vendor C</span><strong>84</strong></div>
      <div><span>Selected</span><span>2 of 5</span></div>
    </div>
  </aside>
  <section class="section">
    <div class="principles">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </section>
  <section class="section">
    <h2>Process</h2>
    <div class="journey">${journey.map((j, i) => `<article><b>0${i + 1}</b><div><h3>${j.t}</h3><p>${j.b}</p></div></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap">${needsBlock("Intake", "Describe the need", "A single column. Save a draft and continue when you are ready.")}</div>`;
    },
    compare() {
      return `<div class="wide">${compareBlock("Matrix", "Every published option")}</div>`;
    },
    workspace() {
      return `<div class="wide">${workspaceBody()}</div>`;
    },
  },
];

for (const concept of concepts) {
  const font = fonts[concept.key];
  const pages = {
    "landing.html": concept.landing,
    "needs.html": concept.needs,
    "compare.html": concept.compare,
    "workspace.html": concept.workspace,
  };
  for (const [file, render] of Object.entries(pages)) {
    const title = screens.find((s) => s.file === file).title;
    const html =
      head(concept, `${concept.name} · ${title}`, font) +
      concept.chrome(file) +
      render() +
      concept.close +
      foot(concept.note);
    writeFileSync(join(root, concept.id, file), html);
  }
}

console.log("Wrote 20 concept pages");
