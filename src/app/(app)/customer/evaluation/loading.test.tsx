import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import EvaluationLoading from "./loading";

test("shows a clear comparison loading state", () => {
  const markup = renderToStaticMarkup(<EvaluationLoading />);
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain("Your software comparison");
  expect(markup).toContain("Loading your comparison and saved choices…");
});
