import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CustomerFrame, IntakeDetails } from "./intake-views";

afterEach(cleanup);
test("keeps staff intake details separate from customer-only navigation", () => {
  render(<IntakeDetails staffView intake={{organizationId:"org",intakeId:"intake",status:"submitted",revision:2,
    createdAt:"2026-09-13T10:00:00Z",updatedAt:"2026-09-13T10:00:00Z",submittedAt:"2026-09-13T10:00:00Z",data:{}}} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"Saved intake details"})).toBeInTheDocument();
});
test("uses the current page title with a direct path back to intakes", () => {
  render(<CustomerFrame title="Your RFP and provider review" description="Review your RFP."><p>Document</p></CustomerFrame>);
  expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
  expect(screen.getByRole("heading",{level:1})).toHaveTextContent("Your RFP and provider review");
  expect(screen.getByRole("link",{name:"Your intakes"})).toHaveAttribute("href","/customer");
});
