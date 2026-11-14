import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const fonts = {
  docket:
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=IBM+Plex+Mono:wght@500;700&family=Karla:wght@400;500;700&display=swap",
  wayfind:
    "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap",
  kiln:
    "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500;1,9..144,600&family=Outfit:wght@400;500;600;700&display=swap",
  cut:
    "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Syne:wght@500;700;800&display=swap",
  survey:
    "https://fonts.googleapis.com/css2?family=League+Spartan:wght@500;700&family=Libre+Franklin:wght@400;500;600;700&display=swap",
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
  { id: "a", name: "Vendor A", fit: "92", cost: "Quote on file", start: true },
  { id: "b", name: "Vendor B", fit: "88", cost: "Range on file", start: true },
  { id: "c", name: "Vendor C", fit: "84", cost: "Quote on file", start: false },
  { id: "d", name: "Vendor D", fit: "79", cost: "Quote required", start: false },
  { id: "e", name: "Vendor E", fit: "74", cost: "Quote on file", start: false },
  { id: "f", name: "Vendor F", fit: "68", cost: "Quote on file", start: false },
];

const rows = [
  { label: "Overall fit", key: "fit", vals: ["92", "88", "84", "79", "74", "68"] },
  { label: "Estimated annual cost", key: "cost", vals: ["On file", "Range on file", "On file", "Unknown", "On file", "On file"] },
  { label: "Payroll in three states", key: "pay", vals: ["Met", "Met", "Limited", "Met", "Add-on", "Limited"] },
  { label: "Benefits administration", key: "ben", vals: ["Met", "Met", "Met", "Limited", "Met", "Missing"] },
  { label: "Time and attendance", key: "time", vals: ["Met", "Met", "Unknown", "Met", "Limited", "Limited"] },
  { label: "ACA compliance reporting", key: "aca", vals: ["Met", "Met", "Met", "Limited", "Unknown", "Limited"] },
  { label: "Applicant tracking", key: "ats", vals: ["Nice", "Met", "Limited", "Met", "Limited", "Unknown"] },
  { label: "Live within 90 days", key: "live", vals: ["Met", "Limited", "Met", "Missing", "Limited", "Met"] },
  { label: "Evidence coverage", key: "ev", vals: ["Demo notes", "Docs + call", "Statement", "Public docs", "Under review", "Statement"] },
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
    .map(
      (s) =>
        `<a href="${s.file}"${s.file === current ? ' aria-current="page"' : ""}>${s.label}</a>`,
    )
    .join("");
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
          const cls = val === "Unknown" || val === "Quote required" ? ' class="unknown"' : "";
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

function workspaceBody(extra = "", stageMarkup) {
  const pills = stages
    .map(([name, state]) => `<span${state ? ` data-state="${state}"` : ""}>${name}</span>`)
    .join("");
  const stageBlock = stageMarkup ?? `<div class="stages" aria-label="Case stages">${pills}</div>`;
  return `
<section class="workspace">
  <article class="card">
    <p class="kicker">Sample case</p>
    <h1>Fernwood Dental Group</h1>
    <p>240 employees. Replace payroll and benefits with one platform.</p>
    ${stageBlock}
    ${extra}
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

const concepts = [
  {
    id: "concept-1-docket",
    key: "docket",
    name: "Docket",
    note: "Concept 1 of 5 · records office",
    chrome(current) {
      return `<div class="frame">
<aside class="rail" aria-hidden="true">Exhibit file · MMHR-2026-014 · Sample</aside>
<div class="page">
<header class="top">
  <a class="brand" href="landing.html"><b>MMHR</b><small>Docket</small></a>
  <button class="menu" type="button" data-nav-toggle aria-expanded="false">Menu</button>
  <nav class="tabs nav-panel" data-nav-panel data-open="false" aria-label="Concept screens">${navLinks(current)}<a class="gallery-link" href="../index.html">All concepts</a></nav>
</header>
<main id="main">`;
    },
    close: `</main></div></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <div>
      <p class="kicker">Buyer-side HRIS brokerage</p>
      <h1>The case file for choosing HR software.</h1>
      <p class="lede">MatchMaker HR runs a private selection process for registered buyers. You describe what the company needs. We keep a complete record from intake through a direct contract with the provider you choose.</p>
      <div class="actions">
        <a class="btn" href="needs.html">Open an intake</a>
        <a class="btn ghost" href="compare.html">Read a sample comparison</a>
      </div>
      <p class="fine">Free to buyers. Providers pay MMHR under commission or referral arrangements. Sample layout only.</p>
    </div>
    <aside class="exhibits" aria-label="Process exhibits">
      <header><span>File 014</span><span>Sample</span></header>
      <ol>
        <li><b>Ex. A</b><div>Needs worksheet, saved with revision history</div></li>
        <li><b>Ex. B</b><div>Masked comparison of every published option</div></li>
        <li><b>Ex. C</b><div>Recorded name disclosure after advisor review</div></li>
        <li><b>Ex. D</b><div>Approved RFP issued to selected providers</div></li>
      </ol>
    </aside>
  </section>
  <section class="section">
    <div class="section-head"><h2>How the file moves</h2><span class="stamp">Sample</span></div>
    <div class="journey">${journey.map((j) => `<article><div><h3>${j.t}</h3><p>${j.b}</p></div></article>`).join("")}</div>
  </section>
  <section class="section">
    <div class="section-head"><h2>Standing rules</h2></div>
    <div class="principles">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap"><p class="kicker">Working worksheet</p><h1>Describe what the team needs</h1><p class="lede">Save a draft now. You can return later. This preview does not store data on a server.</p>${needsForm()}</div>`;
    },
    compare() {
      return `<div class="wrap"><p class="kicker">Exhibit B · masked</p><h1>Compare every published option</h1>${matrix()}</div>`;
    },
    workspace() {
      return `<div class="wrap">${workspaceBody(`<p class="fine">Case owner on file. Next action, due date, and decision history stay with the record.</p>`)}</div>`;
    },
  },
  {
    id: "concept-2-wayfind",
    key: "wayfind",
    name: "Wayfind",
    note: "Concept 2 of 5 · transit board",
    chrome(current) {
      return `<div class="station">
<header class="mast">
  <a class="brand" href="landing.html"><b>MMHR</b><small>Wayfind</small></a>
  <div class="clock" aria-hidden="true">14:20</div>
  <button class="menu" type="button" data-nav-toggle aria-expanded="false">Menu</button>
  <nav class="links nav-panel" data-nav-panel data-open="false" aria-label="Concept screens">${navLinks(current)}<a href="../index.html">Gallery</a></nav>
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <div>
      <p class="kicker">Departures · HR software selection</p>
      <h1>Your search has a timetable.</h1>
      <p class="lede">A buyer-side brokerage that routes companies to HRIS vendors. One intake, one comparison, one approved request — instead of forty sales calls.</p>
      <div class="actions"><a class="btn" href="needs.html">Start intake</a><a class="btn ghost" href="compare.html">See the board</a></div>
      <p class="fine">Customers never pay MMHR. Providers pay a referral fee after you sign with them.</p>
    </div>
    <div>
      <div class="board" aria-label="Selection timetable">
        <div class="board-head"><span>Time</span><span>Stage</span><span>Status</span><span>Gate</span></div>
        <div class="row"><span>08:00</span><span class="dots">Needs</span><span class="status-on">Live</span><span>A</span></div>
        <div class="row"><span>09:20</span><span class="dots">Compare</span><span class="status-on">Live</span><span>B</span></div>
        <div class="row"><span>11:00</span><span class="dots">Disclose</span><span class="status-hold">Hold</span><span>C</span></div>
        <div class="row"><span>13:40</span><span class="dots">RFP</span><span class="status-hold">Staff</span><span>D</span></div>
        <div class="row"><span>16:10</span><span class="dots">Contract</span><span>Direct</span><span>E</span></div>
      </div>
    </div>
  </section>
  <section class="section">
    <h2>Platform stops</h2>
    <div class="split">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </section>
  <section class="section">
    <h2>The route</h2>
    <div class="journey" style="display:grid;gap:12px">${journey.map((j, i) => `<article class="card"><h3>0${i + 1} ${j.t}</h3><p class="muted">${j.b}</p></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap"><p class="kicker">Gate A · intake</p><h1>File the destination</h1><p class="lede">Company context through decision process. Saved drafts keep their revision number.</p>${needsForm()}</div>`;
    },
    compare() {
      return `<div class="wrap"><p class="kicker">Gate B · all published options</p><h1>Read the board before the names</h1>${matrix()}</div>`;
    },
    workspace() {
      const rows = stages
        .map(
          ([name, state], i) =>
            `<div data-state="${state}"><span>${String(8 + i).padStart(2, "0")}:00</span><span>${name}</span><span class="mark">${state === "now" ? "Now" : state === "done" ? "Clear" : "Hold"}</span></div>`,
        )
        .join("");
      return `<div class="wrap">${workspaceBody("", `<div class="stages" aria-label="Case stages">${rows}</div>`)}</div>`;
    },
  },
  {
    id: "concept-3-kiln",
    key: "kiln",
    name: "Kiln",
    note: "Concept 3 of 5 · ceramic studio",
    chrome(current) {
      return `<div class="studio">
<header class="nav">
  <a class="brand" href="landing.html"><b>MMHR Kiln</b></a>
  <button class="menu" type="button" data-nav-toggle aria-expanded="false">Menu</button>
  <nav class="links nav-panel" data-nav-panel data-open="false" aria-label="Concept screens">${navLinks(current)}<a href="../index.html">Gallery</a></nav>
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <div>
      <p class="kicker">White-glove HRIS selection</p>
      <h1>A human process, fired until it <em>fits</em>.</h1>
      <p class="lede">MatchMaker HR is the advisor in the room. You bring the company’s needs. We keep the catalog current, the scores independent of fees, and the names hidden until you are ready.</p>
      <div class="actions"><a class="btn" href="needs.html">Begin the worksheet</a><a class="btn ghost" href="workspace.html">Open a sample case</a></div>
      <p class="fine">Buyers never pay MMHR. Sample preview — not a performance claim.</p>
    </div>
    <div class="shelf" aria-label="What the studio holds">
      <article class="tile clay"><h3>Intake</h3><p>Company, systems, compliance, budget, timeline, people who decide.</p></article>
      <article class="tile"><h3>Matrix</h3><p>Every published option. Up to five contenders.</p></article>
      <article class="tile glaze"><h3>Advisor</h3><p>Disclosure, RFP approval, demos, then a direct contract.</p></article>
      <article class="tile"><h3>Record</h3><p>Complete history. Nothing consequential leaves as unapproved AI.</p></article>
    </div>
  </section>
  <section class="section">
    <h2>The firing schedule</h2>
    <div class="journey">${journey.map((j, i) => `<article><div class="mark">${i + 1}</div><div><h3>${j.t}</h3><p>${j.b}</p></div></article>`).join("")}</div>
  </section>
  <section class="section">
    <h2>What we will not glaze over</h2>
    <div class="principles">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap"><p class="kicker">Worksheet</p><h1>What should this platform hold?</h1><p class="lede">Answer in your own words. Save often. MMHR staff review before a comparison is published.</p>${needsForm()}</div>`;
    },
    compare() {
      return `<div class="wrap"><p class="kicker">Shelf · names still in the kiln</p><h1>Every option, still unnamed</h1>${matrix()}</div>`;
    },
    workspace() {
      return `<div class="wrap">${workspaceBody("")}</div>`;
    },
  },
  {
    id: "concept-4-cut",
    key: "cut",
    name: "Cut",
    note: "Concept 4 of 5 · editorial",
    chrome(current) {
      return `<div class="spread">
<header class="mast">
  <div class="issue">Vol. 01 / Sample</div>
  <a class="brand" href="landing.html">MMHR</a>
  <button class="menu" type="button" data-nav-toggle aria-expanded="false">Menu</button>
  <nav class="links nav-panel" data-nav-panel data-open="false" aria-label="Concept screens">${navLinks(current)}<a href="../index.html">Gallery</a></nav>
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <div class="hero-copy">
      <p class="kicker">The selection issue</p>
      <h1>Compare the <span>evidence.</span> Names come later.</h1>
      <p class="lede">MatchMaker HR is a buyer-side brokerage for HR and workforce software. The opening spread is a masked matrix, not a vendor ad.</p>
      <div class="actions"><a class="btn" href="compare.html">Open the matrix</a><a class="btn ghost" href="needs.html">File needs</a></div>
      <p class="fine">Customers never pay. Provider names stay behind the bar until an advisor records disclosure.</p>
    </div>
    <aside class="crop" aria-hidden="true"><strong><span>Vendor names</span><span class="bar-mask">██████</span><span>until the interview</span></strong></aside>
  </section>
  <section class="section grid3">
    ${principles.map((p, i) => `<article class="panel ${["magenta", "cyan", "yellow"][i]}"><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}
  </section>
  <section class="section">
    <h2>The story, in five cuts</h2>
    <div class="journey">${journey.map((j, i) => `<article><b>0${i + 1}</b><div><h3>${j.t}</h3><p>${j.b}</p></div></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap"><p class="kicker">Reporter notes</p><h1>Facts before the shortlist</h1><p class="lede">Company context, systems, compliance, budget, timeline, stakeholders, decision process.</p>${needsForm()}</div>`;
    },
    compare() {
      return `<div class="wrap"><p class="kicker">The matrix</p><h1>Six columns. No masthead logos.</h1>${matrix()}</div>`;
    },
    workspace() {
      return `<div class="wrap">${workspaceBody("")}</div>`;
    },
  },
  {
    id: "concept-5-survey",
    key: "survey",
    name: "Survey",
    note: "Concept 5 of 5 · cadastral map",
    chrome(current) {
      return `<div class="plat">
<header class="nav">
  <a class="brand" href="landing.html"><span class="north" aria-hidden="true">N</span><b>MMHR Survey</b></a>
  <button class="menu" type="button" data-nav-toggle aria-expanded="false">Menu</button>
  <nav class="links nav-panel" data-nav-panel data-open="false" aria-label="Concept screens">${navLinks(current)}<a href="../index.html">Gallery</a></nav>
</header>
<main id="main">`;
    },
    close: `</main></div>`,
    landing() {
      return `
<div class="wrap">
  <section class="hero">
    <div>
      <p class="kicker">Plat of the HRIS market</p>
      <h1>Map the market. Stake your five.</h1>
      <p class="lede">MatchMaker HR surveys approved HR and workforce software, then lets buyers stake up to five parcels for an RFP. Names stay off the map until the advisor walk-through.</p>
      <div class="actions"><a class="btn" href="needs.html">Record the site</a><a class="btn ghost" href="compare.html">Read the plat</a></div>
      <p class="fine">Sample map. Not a ranking and not a complete catalog.</p>
    </div>
    <div class="map" aria-label="Sample market parcels">
      <div class="parcel"><small>Parcel A</small><strong>Masked</strong><span>Fit 92</span></div>
      <div class="parcel"><small>Parcel B · flagged</small><strong>Masked</strong><span>Fit 88 · selected</span></div>
      <div class="parcel"><small>Parcel C</small><strong>Masked</strong><span>Fit 84</span></div>
      <div class="parcel"><small>Parcel D</small><strong>Masked</strong><span>Unknown cost</span></div>
      <div class="parcel"><small>Remaining published options</small><strong>Shown, not capped</strong><span>Five stakes maximum</span></div>
      <span class="scale">Scale · sample only</span>
    </div>
  </section>
  <section class="section">
    <h2>Survey notes</h2>
    <div class="principles">${principles.map((p) => `<article><h3>${p.t}</h3><p>${p.b}</p></article>`).join("")}</div>
  </section>
  <section class="section">
    <h2>Traverse</h2>
    <div class="journey">${journey.map((j) => `<article><h3>${j.t}</h3><p>${j.b}</p></article>`).join("")}</div>
  </section>
</div>`;
    },
    needs() {
      return `<div class="wrap"><p class="kicker">Field book</p><h1>Record the site conditions</h1><p class="lede">This worksheet is the survey before the plat. MMHR publishes a comparison only after review.</p>${needsForm()}</div>`;
    },
    compare() {
      return `<div class="wrap"><p class="kicker">Plat book</p><h1>Every published parcel</h1>${matrix()}</div>`;
    },
    workspace() {
      return `<div class="wrap">${workspaceBody("")}</div>`;
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
