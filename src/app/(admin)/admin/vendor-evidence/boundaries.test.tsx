import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import EvidenceError from "./error";
import EvidenceLoading from "./loading";
afterEach(cleanup);
test("retries the saved read without resubmitting a command",()=>{
  const reset=vi.fn();
  render(<EvidenceError reset={reset}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("Check its saved state");
  fireEvent.click(screen.getByRole("button",{name:"Retry saved evidence"}));
  expect(reset).toHaveBeenCalledOnce();
});
test("announces loading without exposing evidence",()=>{
  render(<EvidenceLoading/>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading saved vendor evidence.");
});
