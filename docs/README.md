\# MatchMaker HR



\*\*The easiest way to buy HR software — with an expert advisor in your corner, for free.\*\*



MatchMaker HR is a buyer-side HRIS software brokerage platform. It helps SMB-to-mid-market companies (\~50–5,000 employees) research, evaluate, and select the right HRIS at zero cost to the buyer. Revenue comes from vendor commissions on successful purchases — the same rate from every vendor, disclosed to every customer.



\---



\## What it does



\- \*\*Vendor Marketplace\*\* — 50+ HRIS vendor profiles with verified pricing estimates, pros \& cons, module capability scores, and a personalized match % — kept fresh by an automated research pipeline

\- \*\*Requirements Builder\*\* — \~200 common HRIS features, tagged must-have / nice-to-have

\- \*\*Scorecards\*\* — weighted criteria, expert question banks, and team scoring, usable live during vendor demos

\- \*\*Project Plans\*\* — milestone timelines and interactive checklists generated from your go-live date

\- \*\*Team Workspace\*\* — invites, roles \& permissions, shared progress and activity

\- \*\*Advisor\*\* — a dedicated human expert for proposal review, price benchmarking, and negotiation guidance



\### The moat: automated research pipeline

A scheduled (weekly / monthly / quarterly) crawl-and-extract pipeline (Firecrawl + LLM structured extraction) keeps vendor data, pricing, and scores continuously fresh — versioned, human-reviewed, and traceable to source. Incumbents maintain this data by hand; we automate it.



\### Business model \& trust

\- Free to buyers — no fees, no upsells, no passed-along costs, no commitment

\- Same commission rate from every vendor; disclosed to every customer

\- \*\*CBIZ Centrally HR\*\* (our white-labeled UKG Ready offering) appears in every recommendation list as a clearly labeled \*"Featured — our solution"\* placement; organic rankings are never manipulated

\- Scoring methodology published; "last verified" dates on all vendor data



\## Product surfaces



1\. \*\*Marketing site\*\* (public) — home, platform, broker model, services, case studies, resources, transparency page

2\. \*\*Buyer app\*\* (authenticated) — the six tools above, gated behind a required lead-capture sign-up (name, company, work email, direct phone)

3\. \*\*SuperAdmin dashboard\*\* (internal) — pipeline control, vendor data management, scoring config, users \& orgs, advisor operations, deals \& commissions, leads \& analytics, content, system health



\## Tech stack



| Layer | Choice |

|---|---|

| Framework | Next.js 15 (React + TypeScript) |

| UI | Tailwind CSS + shadcn/ui |

| Database / Auth | PostgreSQL via Supabase (RLS) + Drizzle/Prisma |

| Background jobs | Trigger.dev / Inngest |

| Crawling \& extraction | Firecrawl + Claude API (structured output) |

| CMS | Sanity / Payload |

| Email | Resend + Beehiiv |

| Analytics | PostHog |

| Hosting | Vercel + Supabase cloud |



\## Repository guide



| Path | Contents |

|---|---|

| `docs/PRD.md` | Product Requirements Document (v1.0) |

| `MatchMaker HR — Master Plan.md` | Master project plan (primary planning source) |

| `Homepage.dc.html` | Approved homepage design — "Bold Sage" direction |

| `Homepage Options.dc.html` | Design exploration canvas (turns 1–3) |



\## Design direction



\*\*"Bold Sage"\*\* — near-white soft-gray canvas (`#F7F7F5`), bold forest-green accent, warm soft card shadows. Type: Bricolage Grotesque (display) + Manrope (body). All screens extend this system; see `Homepage.dc.html`.



\## Status



\*\*Phase 0 — Design\*\* (in progress): homepage approved; app screens and SuperAdmin views next. See `docs/PRD.md` §6 for the full release plan and §8 for open questions.



\---



© 2026 MatchMaker HR. Internal project — not for distribution.



