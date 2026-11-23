import Link from "next/link";

type Props = {
  href?: string;
  as?: "link" | "span";
};

export function BrandMark({ href = "/", as = "link" }: Props) {
  const mark = (
    <>
      <i aria-hidden="true" />
      MMHR
    </>
  );
  if (as === "span") return <span className="co-brand">{mark}</span>;
  return (
    <Link className="co-brand" href={href}>
      {mark}
    </Link>
  );
}
