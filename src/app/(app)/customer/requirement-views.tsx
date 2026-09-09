import Link from "next/link";
import type { ReactNode } from "react";
import type { getIntakeRequirementsPage } from "@/server/commands/requirement-read";

type RequirementPage = Awaited<ReturnType<typeof getIntakeRequirementsPage>>;
type Requirement = RequirementPage["requirements"][number];

const linkStyle =
  "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const importanceLabels: Record<Requirement["importance"], string> = {
  must: "Must have",
  nice: "Nice to have",
  not_applicable: "Not applicable",
};

const typeLabels: Record<Requirement["requirementType"], string> = {
  structured: "Standard requirement",
  custom: "Custom request",
};

export function ResponseValue({ value, path = "response" }: { value: Requirement["response"]; path?: string }): ReactNode {
  if (value === null) return <span>No answer saved</span>;
  if (typeof value === "string") {
    if (value.length === 0) return <span>Empty text saved</span>;
    return (
      <>
        <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</span>
        {value.trim().length === 0 && <span className="sr-only">Whitespace-only text</span>}
      </>
    );
  }
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") return <span className="tabular-nums">{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>No saved items</span>;
    return (
      <ul className="list-disc space-y-2 pl-5">
        {value.map((item, index) => (
          <li key={path + "-" + index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            <ResponseValue value={item} path={path + "-" + index} />
          </li>
        ))}
      </ul>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return <span>No saved fields</span>;
  return (
    <dl className="space-y-3">
      {entries.map(([key, entry]) => (
        <div key={path + "-" + key}>
          <dt className="whitespace-pre-wrap font-medium [overflow-wrap:anywhere]">{key}</dt>
          <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
            <ResponseValue value={entry} path={path + "-" + key} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RequirementCard({ requirement, editHref }: { requirement: Requirement; editHref?: string }) {
  return (
    <article className="border-t py-6" aria-label={requirement.label + " active requirement"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-balance whitespace-pre-wrap text-lg font-semibold [overflow-wrap:anywhere]">
            {requirement.label}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded bg-muted px-2 py-1">Active requirement</span>
            <span className="rounded bg-muted px-2 py-1">{typeLabels[requirement.requirementType]}</span>
          </div>
        </div>
        <dl className="grid shrink-0 gap-1 text-right text-sm sm:text-left sm:grid-cols-[auto_auto] sm:gap-x-2">
          <dt className="text-muted-foreground">Importance</dt>
          <dd className="font-medium">{importanceLabels[requirement.importance]}</dd>
          <dt className="text-muted-foreground">Weight</dt>
          <dd className="font-medium tabular-nums">{requirement.weight}</dd>
        </dl>
      </div>
      <div className="mt-6 rounded-lg bg-muted p-4 text-sm leading-6">
        <h4 className="font-medium">Response</h4>
        <div className="mt-2 min-w-0">
          <ResponseValue value={requirement.response} />
        </div>
      </div>
      {editHref && <Link href={editHref} prefetch={false} className={`${linkStyle} mt-3`}
        aria-label={`Edit requirement ${requirement.label}`}>Edit requirement</Link>}
    </article>
  );
}

export function SavedRequirements({
  intakeId,
  page,
  hasCursor,
  afterId,
  canEdit = false,
}: {
  intakeId: string;
  page: RequirementPage;
  hasCursor: boolean;
  afterId?: string;
  canEdit?: boolean;
}) {
  const intakeHref = "/customer?intake=" + encodeURIComponent(intakeId);
  const nextHref = page.nextCursor
    ? intakeHref + "&requirementsAfter=" + encodeURIComponent(page.nextCursor)
    : null;
  const currentHref = intakeHref + (afterId ? "&requirementsAfter=" + encodeURIComponent(afterId) : "");

  return (
    <section aria-labelledby="saved-requirements" className="mt-10">
      <h2 id="saved-requirements" className="text-balance text-xl font-semibold">
        Active requirements
      </h2>
      <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
        These saved requirements are active for this intake.
      </p>
      {canEdit && <Link href={intakeHref + "&newRequirement=1"} prefetch={false}
        className={`${linkStyle} mt-3`}>Add requirement</Link>}
      {page.requirements.length === 0 ? (
        <p role="status" className="mt-6 rounded-lg bg-muted p-6 text-pretty leading-7">
          {hasCursor
            ? "There are no more saved active requirements in this intake."
            : "There are no saved active requirements in this intake."}
        </p>
      ) : (
        <div className="mt-6">
          {page.requirements.map((requirement) => (
            <RequirementCard key={requirement.requirementId} requirement={requirement}
              editHref={canEdit ? currentHref + "&editRequirement=" + encodeURIComponent(requirement.requirementId) : undefined} />
          ))}
        </div>
      )}
      {(hasCursor || nextHref) && (
        <nav aria-label="Saved requirement pages" className="mt-5 flex flex-wrap justify-between gap-3">
          {hasCursor && (
            <Link href={intakeHref} prefetch={false} className={linkStyle}>
              Back to first requirements page
            </Link>
          )}
          {nextHref && (
            <Link href={nextHref} prefetch={false} className={linkStyle + " ml-auto"}>
              Next requirements page
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
