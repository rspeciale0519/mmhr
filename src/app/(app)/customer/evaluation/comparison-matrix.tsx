"use client";

import type { ReactNode } from "react";
import { requirementLabel } from "@/lib/requirement-label";
import type { MaskedOption } from "@/server/matching/option-publication-contract";
import { AnnualCost, evidenceDate, EvidenceDates, FeatureDetail, featureNeedsReview, Setup } from "./comparison-details";

export type ComparisonRequirement = {
  key: string;
  label: string;
  importance: "must" | "nice";
};

type Props = {
  options: readonly MaskedOption[];
  requirements: readonly ComparisonRequirement[];
  labels: Record<string, string>;
  selectedOptionIds: ReadonlySet<string>;
  renderChoice: (option: MaskedOption) => ReactNode;
};

const eligibilityLabels = {
  eligible: "Meets recorded required capabilities",
  ineligible: "Some required capabilities do not match",
  unknown: "More approved evidence is needed",
};

const rowHeadingClass = "sticky left-0 z-10 w-28 min-w-28 border-r bg-background px-3 py-5 text-left align-top font-medium sm:w-52 sm:min-w-52 sm:px-4";
const cellClass = "min-w-36 max-w-48 border-r px-3 py-5 align-top last:border-r-0 sm:min-w-60 sm:max-w-72 sm:px-5";
const selectedClass = "bg-[rgba(35,64,232,0.07)]";

function optionNeedsReview(option: MaskedOption) {
  return option.details?.features.some(featureNeedsReview) ?? false;
}

function ReviewMatchNote({ needed }: { needed: boolean }) {
  return needed ? <p className="mt-2 text-xs text-muted-foreground">Review a feature match below.</p> : null;
}

function Evidence({ option, labels }: { option: MaskedOption; labels: Record<string, string> }) {
  return <details className="text-sm">
    <summary className="min-h-11 cursor-pointer py-3 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
      View supporting details{" "}<span className="sr-only">for {option.maskedLabel}</span>
    </summary>
    <div className="space-y-3 pb-2 leading-6">
      <p>{option.fitReasons.length} matching needs recorded.</p>
      <p>{option.limitations.length} needs have limits or missing information.</p>
      <p>Evidence date: {option.evidenceFreshAt
        ? <time dateTime={option.evidenceFreshAt}>{evidenceDate(option.evidenceFreshAt)} UTC</time>
        : "Not available"}.</p>
      <p>Review due: {option.validUntil
        ? <time dateTime={option.validUntil}>{evidenceDate(option.validUntil)} UTC</time>
        : "Not available"}.</p>
      <p className="text-muted-foreground">Source identities stay hidden until MMHR records provider disclosure.</p>
      {option.details?.features.map((feature) => <section key={feature.requirementKey} className="border-t pt-3">
        <p className="font-medium">{requirementLabel(feature.requirementKey, labels)}</p>
        <FeatureDetail feature={feature} />
        {feature.evidence ? <EvidenceDates evidence={feature.evidence} /> : <p>No approved evidence recorded.</p>}
        {feature.coverageEvidence && <div className="mt-3">
          <p className="text-xs font-medium">Delivery type evidence</p>
          <EvidenceDates evidence={feature.coverageEvidence} />
        </div>}
      </section>)}
    </div>
  </details>;
}

export function ComparisonMatrix({ options, requirements, labels, selectedOptionIds, renderChoice }: Props) {
  const requirementMap = new Map(requirements.map((requirement) => [requirement.key, requirement]));
  const reviewOptionIds = new Set(options.filter(optionNeedsReview).map((option) => option.optionId));
  // Legacy publications provide matching keys, but cannot distinguish absent facts from failed requirements.
  const keys = [...new Set([...requirements.map((item) => item.key), ...Object.keys(labels),
    ...options.flatMap((option) => [...option.fitReasons, ...option.limitations])])];
  const required = requirements.filter((item) => item.importance === "must");

  function row(label: string, content: (option: MaskedOption) => ReactNode, hint?: string) {
    return <tr className="border-b last:border-b-0">
      <th scope="row" className={rowHeadingClass}>{label}{" "}
        {hint && <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{hint}</span>}
      </th>
      {options.map((option) => <td key={option.optionId}
        className={`${cellClass} ${selectedOptionIds.has(option.optionId) ? selectedClass : ""}`}>{content(option)}</td>)}
    </tr>;
  }

  return <div className="min-w-0 space-y-3">
    <p id="comparison-scroll-help" className="text-sm leading-6 text-muted-foreground">
      Scroll across to compare every option. Requirement labels stay in view.
    </p>
    <div role="region" aria-label="Software comparison" aria-describedby="comparison-scroll-help"
      tabIndex={0} className="co-table-wrap co-gl relative max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1e3ad4]">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Vendor options compared with your saved software requirements</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className={rowHeadingClass}>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Your comparison</span>{" "}
              <span className="mt-2 block text-lg font-semibold">Software fit</span>
            </th>
            {options.map((option) => <th scope="col" key={option.optionId}
              className={`${cellClass} border-t-4 text-left ${selectedOptionIds.has(option.optionId)
                ? `border-t-[#1e3ad4] ${selectedClass}` : "border-t-transparent"}`}>
              <h3 className="text-lg font-semibold tracking-tight">{option.maskedLabel}</h3>
              <p className="mt-2 min-h-12 text-xs font-normal leading-5 text-muted-foreground">
                {option.eligibility === "eligible" && reviewOptionIds.has(option.optionId) ? "Review a feature match" : eligibilityLabels[option.eligibility]}
              </p>
              <div className="mt-4">{renderChoice(option)}</div>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {row("Overall fit", (option) => <div>
            <span className="co-sc text-3xl font-semibold tabular-nums tracking-tight">
              {(option.deterministicScore / 100).toFixed(1)}<span className="ml-0.5 text-base">%</span>
            </span>
            <ReviewMatchNote needed={reviewOptionIds.has(option.optionId)} />
          </div>, "Based on recorded requirements")}
          {row("Estimated annual cost", (option) => <AnnualCost estimate={option.details?.annualCost} />, "Approved estimate required")}
          {row("Required features met", (option) => requirements.length === 0
            ? <span className="text-muted-foreground">Unknown</span>
            : required.length === 0 ? "No required features recorded"
              : <div><span className="font-semibold tabular-nums">{required.filter((item) => option.fitReasons.includes(item.key)).length} of {required.length}</span>
                <ReviewMatchNote needed={reviewOptionIds.has(option.optionId)} /></div>)}
          {keys.map((key) => {
            const requirement = requirementMap.get(key);
            return <tr key={key} className="border-b">
              <th scope="row" className={rowHeadingClass}>
                <span className="block break-words">{requirement?.label ?? requirementLabel(key, labels)}</span>{" "}
                {requirement && <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {requirement.importance === "must" ? "Required" : "Nice to have"}
                </span>}
              </th>
              {options.map((option) => {
                const feature = option.details?.features.find((item) => item.requirementKey === key);
                return <td key={option.optionId}
                className={`${cellClass} ${selectedOptionIds.has(option.optionId) ? selectedClass : ""}`}>
                {feature
                  ? <FeatureDetail feature={feature} />
                  : option.fitReasons.includes(key)
                  ? <span className="font-medium">Match confirmed</span>
                  : <span className="text-muted-foreground">Unknown</span>}
              </td>; })}
            </tr>;
          })}
          {row("Evidence coverage", (option) => <span className="font-semibold tabular-nums">{(option.confidenceBasisPoints / 100).toFixed(1)}%</span>,
            "Information available, not predicted success")}
          {row("Estimated setup", (option) => <Setup estimate={option.details?.setup} />, "Approved time estimate required")}
          {row("Evidence details", (option) => <Evidence option={option} labels={labels} />)}
        </tbody>
      </table>
    </div>
    <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
      Unknown means this comparison does not confirm the detail. It does not mean the feature is unavailable.
      Cost, setup, and package details need approved evidence.
    </p>
  </div>;
}
