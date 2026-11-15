import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkflowCommand, WorkflowFieldError, commandFailure, rejectedMessage, uncertainMessage } from "./workflow-command";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); refresh.mockReset(); });

const trpcError = (code: string) => Object.assign(new Error("Request failed"), { data: { code } });

function setup(execute: (input: { value: string; key: number }) => Promise<unknown>, prepare?: (data: FormData) => { value: string; key: number }) {
  let key = 0;
  const prepareSpy = vi.fn(prepare ?? ((data: FormData) => ({ value: String(data.get("value")), key: ++key })));
  render(<WorkflowCommand<{ value: string; key: number }> label="Save" success="Saved." invalidMessage="Use letters only."
    prepare={prepareSpy} execute={execute}>
    <label>Value<input name="value" defaultValue="abc"/></label>
  </WorkflowCommand>);
  return prepareSpy;
}

describe("commandFailure", () => {
  test("separates input errors and refusals from unknown results", () => {
    expect(commandFailure(trpcError("BAD_REQUEST"))).toBe("invalid");
    for (const code of ["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "CONFLICT"]) expect(commandFailure(trpcError(code))).toBe("rejected");
    expect(commandFailure(trpcError("INTERNAL_SERVER_ERROR"))).toBe("unknown");
    expect(commandFailure(new Error("Network failed"))).toBe("unknown");
    expect(commandFailure(null)).toBe("unknown");
  });
});

describe("WorkflowCommand", () => {
  test("shows the form's field rule when the server rejects input, and builds a new request", async () => {
    const execute = vi.fn().mockRejectedValueOnce(trpcError("BAD_REQUEST")).mockResolvedValueOnce({});
    const prepare = setup(execute);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use letters only.");
    expect(screen.queryByText(uncertainMessage)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Value")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]![0]).not.toBe(execute.mock.calls[0]![0]);
  });

  test("reports a refusal as a definite result with no retry", async () => {
    setup(vi.fn().mockRejectedValueOnce(trpcError("NOT_FOUND")));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(rejectedMessage);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload saved state" })).toBeInTheDocument();
  });

  test("keeps an unknown result as the same request for a retry", async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error("Network failed")).mockResolvedValueOnce({});
    const prepare = setup(execute);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(uncertainMessage);
    fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute.mock.calls[1]![0]).toBe(execute.mock.calls[0]![0]);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  test("shows a field rule from prepare without sending a request", async () => {
    const execute = vi.fn();
    setup(execute, () => { throw new WorkflowFieldError("No spaces are allowed."); });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No spaces are allowed.");
    expect(execute).not.toHaveBeenCalled();
  });
});
