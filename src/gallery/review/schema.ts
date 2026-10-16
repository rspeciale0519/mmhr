/**
 * Design gallery review storage. Every statement only creates what is missing,
 * so the store runs it once per server process before the first query.
 * It lives in its own database (GALLERY_REVIEW_DATABASE_URL), never in the
 * MMHR application database, so review notes can never reach customer data.
 */
export const reviewSchemaSql = `
create table if not exists gallery_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reviewer text not null check (char_length(reviewer) between 1 and 80),
  kind text not null check (kind in ('comment', 'pick', 'note')),
  design text not null check (char_length(design) between 1 and 40),
  part text check (part is null or char_length(part) <= 40),
  body text check (body is null or char_length(body) <= 4000),
  x real check (x is null or (x >= 0 and x <= 1)),
  y real check (y is null or (y >= 0 and y <= 1)),
  check (kind <> 'pick' or part is not null),
  check (kind = 'pick' or body is not null)
);

create index if not exists gallery_feedback_design_idx on gallery_feedback (design, created_at desc);

create table if not exists gallery_recipes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reviewer text not null check (char_length(reviewer) between 1 and 80),
  base_design text check (base_design is null or char_length(base_design) <= 40),
  selections jsonb not null,
  notes text check (notes is null or char_length(notes) <= 6000)
);
`;
