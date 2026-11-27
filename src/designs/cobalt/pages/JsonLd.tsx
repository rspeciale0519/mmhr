/**
 * Structured data (JSON-LD) for search engines and answer engines.
 *
 * JSON-LD is a small JSON description of the page (for example "this page
 * has these questions and answers") placed in a
 * `<script type="application/ld+json">` tag. Browsers do not run it; crawlers
 * read it. Next.js recommends a plain <script> tag in the page for this
 * (node_modules/next/dist/docs/01-app/02-guides/json-ld.md), not next/script.
 */

/** Any JSON value that JSON.stringify can write. */
export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue };

/**
 * Turns structured data into text that is safe inside a <script> tag.
 *
 * JSON.stringify alone is not enough: a value containing `</script>` would
 * end the tag early and let the rest be read as HTML. Writing `<`, `>`, and
 * `&` as JSON unicode escapes (`<` and so on) keeps the same data,
 * because any JSON reader turns the escapes back into the same characters,
 * while the HTML parser never sees a tag. U+2028 and U+2029 (line and
 * paragraph separators) are escaped too, as older JavaScript parsers treat
 * them as line breaks.
 */
export function serializeJsonLd(data: JsonLdValue): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Renders one JSON-LD script tag. Use it inside a page's Server Components. */
export function JsonLd({ data }: { data: JsonLdValue }) {
  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes every character that could close the tag.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
