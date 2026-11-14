import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { CommercialAgreementPreparation,CommercialContractFactsPreparation } from "./commercial-finance-preparation";
import { commercialAgreement,commercialContract,commercialChoices,commercialResult,commercialId } from "./commercial-finance-test-fixtures";
const {execute,refresh}=vi.hoisted(()=>({execute:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("./finance-document-download",()=>({FinanceDocumentDownload:()=> <p>Exact approved original access</p>}));
beforeEach(()=>{refresh.mockReset();execute.mockReset().mockImplementation(async input=>commercialResult(input));});afterEach(cleanup);
function original(){fireEvent.change(screen.getByLabelText("Approved source original"),{target:{value:commercialId(7)}});}
function finish(){fireEvent.change(screen.getByLabelText("Reason for this request"),{target:{value:"Stored synthetic terms checked"}});
  fireEvent.submit(screen.getByLabelText("Reason for this request").closest("form")!);}
function agreement(){render(<CommercialAgreementPreparation choices={commercialChoices()} execute={execute}/>);original();
  fireEvent.change(screen.getByLabelText("Currency"),{target:{value:"USD"}});fireEvent.change(screen.getByLabelText("Fixed commission amount"),{target:{value:"12.34"}});
  fireEvent.change(screen.getByLabelText("Effective from (UTC)"),{target:{value:"2026-10-03T14:00:00.000001"}});}
test("prepares exact flat terms from approved stored source without approving or inventing contract totals",async()=>{agreement();finish();await screen.findByText(/request is recorded/);
  const input=execute.mock.calls[0][0];expect(input).toMatchObject({action:"prepare_agreement",vendorOrganizationId:commercialId(4),expectedSeriesRevision:0,predecessorVersionId:null,
    replacementSourceReference:null,source:commercialChoices().items[0].original,rule:{kind:"flat_amount",amountMinorUnits:1234,currency:"USD"},
    effectiveFrom:"2026-10-03T14:00:00.000001Z",statedEffectiveEnd:null,conditionReferences:[]});expect(input).not.toHaveProperty("contractValue");expect(input).not.toHaveProperty("actorIdentityId");});
test("records real zero commission separately from unknown values",async()=>{agreement();fireEvent.change(screen.getByLabelText("Fixed commission amount"),{target:{value:"0"}});finish();
  await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0].rule.amountMinorUnits).toBe(0);});
test("resets rule fields and keeps exact rate precision when the rule changes",async()=>{agreement();fireEvent.change(screen.getByLabelText("Calculation rule"),{target:{value:"contract_value_rate"}});
  expect(screen.getByLabelText("Currency")).toHaveValue("");expect(screen.getByLabelText("Commission percentage")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Currency"),{target:{value:"USD"}});fireEvent.change(screen.getByLabelText("Commission percentage"),{target:{value:"5.55"}});finish();
  await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0].rule).toEqual({kind:"contract_value_rate",rateBasisPoints:555,currency:"USD"});});
test("records unsupported terms and conditions without a fake commission result",async()=>{agreement();fireEvent.change(screen.getByLabelText("Calculation rule"),{target:{value:"unsupported"}});
  fireEvent.change(screen.getByLabelText("Source term reference"),{target:{value:"agreement section 8"}});fireEvent.change(screen.getByLabelText("Condition references, one per line (optional)"),{target:{value:" section 9 \nsection 10"}});finish();
  await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0]).toMatchObject({rule:{kind:"unsupported",sourceTermReference:"agreement section 8"},conditionReferences:["section 9","section 10"]});});
test("binds a future amendment to the actual approved predecessor and series counter",async()=>{const agreement={...commercialAgreement().agreement,seriesRevision:3,currentApprovedVersionId:commercialId(10)};
  render(<CommercialAgreementPreparation choices={commercialChoices()} agreement={agreement} execute={execute}/>);original();fireEvent.change(screen.getByLabelText("Currency"),{target:{value:"JPY"}});
  fireEvent.change(screen.getByLabelText("Fixed commission amount"),{target:{value:"100"}});fireEvent.change(screen.getByLabelText("Effective from (UTC)"),{target:{value:"2026-11-01T00:00"}});
  fireEvent.change(screen.getByLabelText("Source replacement reference"),{target:{value:"signed amendment 2"}});finish();await screen.findByText(/request is recorded/);
  expect(execute.mock.calls[0][0]).toMatchObject({agreementId:agreement.agreementId,expectedSeriesRevision:3,predecessorVersionId:commercialId(10),replacementSourceReference:"signed amendment 2"});});
test.each(["","-1","1.234","9007199254740992"])("denies invalid fixed amount %s before sending",async amount=>{agreement();fireEvent.change(screen.getByLabelText("Fixed commission amount"),{target:{value:amount}});finish();
  await screen.findByRole("alert");expect(execute).not.toHaveBeenCalled();expect(screen.getByLabelText("Fixed commission amount")).toBeEnabled();});
test("denies end time equal to exact start time",async()=>{agreement();fireEvent.change(screen.getByLabelText("Stated end (UTC, optional)"),{target:{value:"2026-10-03T14:00:00.000001"}});finish();
  await screen.findByRole("alert");expect(execute).not.toHaveBeenCalled();});
test("keeps unknown contract total and unknown currency null",async()=>{render(<CommercialContractFactsPreparation choices={commercialChoices(true)} contract={commercialContract().contract} execute={execute}/>);original();
  fireEvent.change(screen.getByLabelText("Contract total status"),{target:{value:"unknown"}});fireEvent.change(screen.getByLabelText("Contract source reference"),{target:{value:"signed section 3"}});finish();
  await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0]).toMatchObject({action:"prepare_contract_facts",contractValue:{amountMinorUnits:null,currency:null},expectedFactsRevision:0,
    predecessorVersionId:null,contractId:commercialId(11),handoffId:commercialId(12)});});
test("keeps confirmed zero contract total and exact currency",async()=>{render(<CommercialContractFactsPreparation choices={commercialChoices(true)} contract={commercialContract().contract} execute={execute}/>);original();
  fireEvent.change(screen.getByLabelText("Contract total status"),{target:{value:"known"}});fireEvent.change(screen.getByLabelText("Currency"),{target:{value:"USD"}});
  fireEvent.change(screen.getByLabelText("Confirmed contract total"),{target:{value:"0"}});fireEvent.change(screen.getByLabelText("Contract source reference"),{target:{value:"signed section 3"}});finish();
  await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0].contractValue).toEqual({amountMinorUnits:0,currency:"USD"});});
test("clears known total fields after switching to unknown and preserves separately confirmed currency",async()=>{render(<CommercialContractFactsPreparation choices={commercialChoices(true)} contract={commercialContract().contract} execute={execute}/>);original();
  fireEvent.change(screen.getByLabelText("Contract total status"),{target:{value:"known"}});fireEvent.change(screen.getByLabelText("Currency"),{target:{value:"BHD"}});
  fireEvent.change(screen.getByLabelText("Confirmed contract total"),{target:{value:"1.001"}});fireEvent.change(screen.getByLabelText("Contract total status"),{target:{value:"unknown"}});
  expect(screen.queryByLabelText("Confirmed contract total")).not.toBeInTheDocument();expect(screen.getByLabelText("Currency")).toHaveValue("");fireEvent.change(screen.getByLabelText("Currency"),{target:{value:"BHD"}});
  fireEvent.change(screen.getByLabelText("Contract source reference"),{target:{value:"signed section 3"}});finish();await screen.findByText(/request is recorded/);
  expect(execute.mock.calls[0][0].contractValue).toEqual({amountMinorUnits:null,currency:"BHD"});});
test("requires an explicit known or unknown total choice",async()=>{render(<CommercialContractFactsPreparation choices={commercialChoices(true)} contract={commercialContract().contract} execute={execute}/>);original();finish();
  await screen.findByRole("alert");expect(execute).not.toHaveBeenCalled();});
test("does not accept a foreign signed source or a bare source identifier",()=>{const choices=commercialChoices(true);if(choices.source.sourceClass!=="signed_contract")throw new Error("Invalid fixture");
  render(<CommercialContractFactsPreparation choices={{...choices,source:{...choices.source,handoffId:commercialId(99)}}} contract={commercialContract().contract} execute={execute}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("signed contract source is unavailable");expect(screen.queryByRole("textbox")).not.toBeInTheDocument();});
test("gives an empty original list a clear state without enabling preparation",()=>{const choices=commercialChoices();render(<CommercialAgreementPreparation choices={{...choices,items:[]}} execute={execute}/>);
  expect(screen.getByRole("status")).toHaveTextContent("No approved current originals");expect(screen.getByRole("button",{name:"Record proposed terms"})).toBeDisabled();});
test("blocks unsafe reason text locally without exposing its value in an error",async()=>{agreement();fireEvent.change(screen.getByLabelText("Reason for this request"),{target:{value:"https://example.invalid/private"}});
  fireEvent.submit(screen.getByLabelText("Reason for this request").closest("form")!);expect(await screen.findByRole("alert")).not.toHaveTextContent("example.invalid");expect(execute).not.toHaveBeenCalled();});
