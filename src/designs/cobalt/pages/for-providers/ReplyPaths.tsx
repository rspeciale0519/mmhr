"use client";

import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { useReducedMotion } from "../../motion/media";
import { Tilt } from "../../motion/pointer";
import { useInView } from "../../motion/scroll";

/** The two ways a provider can answer an RFP. */
export type ReplyPath = "form" | "email";

/**
 * What each path looks like, step by step. Every step restates a fact from
 * the "Answering the RFP" list on the same page (Body.tsx); nothing here is
 * new information. `at` is when the step lights up in the preview, in
 * seconds (matched by the CSS timings in for-providers.css).
 */
export const replyPaths: Record<ReplyPath, { label: string; steps: readonly { text: string; at: number }[] }> = {
  form: {
    label: "Web form link",
    steps: [
      { text: "Open the private link. No account or password.", at: 0.2 },
      { text: "Answers save automatically as you go.", at: 0.9 },
      { text: "Upload the documents the buyer asks for.", at: 2.7 },
      { text: "Submit, and the form locks.", at: 3.5 },
    ],
  },
  email: {
    label: "Email reply",
    steps: [
      { text: "Reply to MMHR by email instead.", at: 0.2 },
      { text: "MMHR staff record your reply.", at: 2.7 },
    ],
  },
};

/** False on the server and during hydration, true once the page is live. */
const noSubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** `--at` for a CSS animation delay, in seconds. */
const at = (seconds: number) => ({ "--at": `${seconds}s` }) as CSSProperties;

/** Small line icons. */
function LockIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12">
      <rect height="10" rx="2" width="14" x="5" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function ClipIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </svg>
  );
}
function TickIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" viewBox="0 0 24 24" width="12">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <rect height="14" rx="2.5" width="18" x="3" y="5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
function FormIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <rect height="16" rx="2.5" width="16" x="4" y="4" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </svg>
  );
}

/** The drawn web form: a private link, answers saving, an upload, a lock. */
function FormPreview() {
  return (
    <>
      <div className="co-fp-win-bar">
        <i /><i /><i />
        <span className="co-fp-url" style={at(0.2)}>
          <LockIcon />
          <span className="co-fp-sk" style={{ width: "58%" }} />
        </span>
      </div>
      <div className="co-fp-win-body">
        <span className="co-fp-sk co-fp-sk-h" />
        <span className="co-fp-sk" style={{ width: "72%" }} />
        {[0.9, 1.5, 2.1].map((start) => (
          <span className="co-fp-q" key={start} style={at(start)}>
            <span className="co-fp-sk co-fp-sk-l" />
            <span className="co-fp-field"><span className="co-fp-fill" /></span>
            <span className="co-fp-saved"><TickIcon />Saved</span>
          </span>
        ))}
        <span className="co-fp-up" style={at(2.7)}>
          <ClipIcon />
          <span className="co-fp-sk" style={{ width: 84 }} />
        </span>
        <span className="co-fp-submit" style={at(3.5)}>
          <span className="co-fp-submit-a">Submit</span>
          <span className="co-fp-submit-b"><LockIcon />Locked</span>
        </span>
      </div>
    </>
  );
}

/** The drawn email: a reply to MMHR, sent off, recorded by staff. */
function EmailPreview() {
  return (
    <>
      <div className="co-fp-win-bar">
        <i /><i /><i />
        <span className="co-fp-sk" style={{ width: "34%", marginLeft: 10 }} />
      </div>
      <div className="co-fp-win-body">
        <span className="co-fp-to">
          <span className="co-fp-to-k">To</span>
          <span className="co-chip co-fp-to-v">MatchMaker HR</span>
        </span>
        {[0.5, 0.8, 1.1, 1.4].map((start, index) => (
          <span className="co-fp-line" key={start} style={{ ...at(start), width: `${[92, 80, 86, 48][index]}%` }} />
        ))}
        <span className="co-fp-send-row">
          <span className="co-fp-send" style={at(1.9)}>Send</span>
          <span className="co-fp-env" style={at(2.1)}><MailIcon /></span>
        </span>
        <span className="co-fp-recorded" style={at(2.7)}>
          <TickIcon />
          Reply recorded
        </span>
      </div>
    </>
  );
}

/**
 * "Reply by web form link or by email": a two-way switch with a small
 * drawn preview of each path, labelled "Illustration".
 *
 * - The switch is two real buttons with `aria-pressed`, in a labelled group.
 * - Choosing a path plays its preview once: the private link opens, answers
 *   fill in and save, a document is attached, the form locks; or the email
 *   is written, sent, and recorded. The steps beside it light up in time.
 * - The preview plays when it scrolls into view (and again on each switch).
 *   Before that, without JavaScript, and with reduced motion, it shows its
 *   finished state, still. The preview is decorative (aria-hidden); the
 *   steps list says the same thing in words.
 */
export function ReplyPaths() {
  const [path, setPath] = useState<ReplyPath>("form");
  // Bumped on every switch, so the preview remounts and plays again.
  const [run, setRun] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, threshold: 0.35 });
  const reduced = useReducedMotion();
  const hydrated = useHydrated();
  // "wait": hold at the first frame until it is on screen; "run": play.
  const anim = hydrated && !reduced ? (inView ? "run" : "wait") : undefined;
  const current = replyPaths[path];

  const choose = (next: ReplyPath) => {
    if (next === path) return;
    setPath(next);
    setRun((count) => count + 1);
  };

  return (
    <div className="co-fp-reply" ref={ref}>
      <div className="co-fp-reply-head">
        <div aria-label="Reply by" className="co-fp-switch" data-path={path} role="group">
          {(Object.keys(replyPaths) as ReplyPath[]).map((key) => (
            <button aria-pressed={path === key} className="co-fp-switch-b" key={key} onClick={() => choose(key)} type="button">
              {key === "form" ? <FormIcon /> : <MailIcon />}
              {replyPaths[key].label}
            </button>
          ))}
        </div>
        <span className="co-chip co-chip-n">Illustration</span>
      </div>

      <Tilt className="co-fp-win-tilt" innerClassName="co-fp-win" max={5} spotlight>
        <div aria-hidden="true" className="co-fp-win-in" data-anim={anim} data-kind={path} key={`${path}-${run}`}>
          {path === "form" ? <FormPreview /> : <EmailPreview />}
        </div>
      </Tilt>

      <ol className="co-fp-reply-steps" data-anim={anim} key={`steps-${path}-${run}`}>
        {current.steps.map((step) => (
          <li key={step.text} style={at(step.at)}>
            {step.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
