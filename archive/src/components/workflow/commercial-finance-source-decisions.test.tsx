import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { CommercialSourceDecision,CommercialSourceVersions } from "./commercial-finance-source-decisions";
import { CommercialCalculationDecision,CommercialContractCalculationActions } from "./commercial-finance-calculation-controls";
import { commercialAgreement,commercialContract,commercialCalculation,commercialResult,commercialOrg,commercialId,commercialAccess } from "./commercial-finance-test-fixtures";
const {execute,refresh,download}=vi.hoisted(()=>({execute:vi.fn(),refresh:vi.fn(),download:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("./finance-document-download",()=>({FinanceDocumentDownload:(props:{onAccessReady?:(id:string)=>void;document:unknown;purpose:string;organizationId:string})=>{
  download(props);return <button type="button" onClick={()=>props.onAccessReady?.(commercialAccess)}>Read exact original</button>;}}));
beforeEach(()=>{refresh.mockReset();download.mockReset();execute.mockReset().mockImplementation(async input=>commercialResult(input));});afterEach(cleanup);
function view(stale=false){const detail=commercialAgreement(),version={...detail.versions[0],canApprove:!stale};
  return render(<CommercialSourceDecision organizationId={commercialOrg} view="agreement" entityId={detail.entityId} version={version} execute={execute}/>);}
function fill(source=true){if(source){fireEvent.click(screen.getByRole("button",{name:"Read exact original"}));fireEvent.click(screen.getByRole("checkbox"));}
  fireEvent.change(screen.getByLabelText("Decision record reference"),{target:{value:"review section 3"}});
  fireEvent.change(screen.getByLabelText("Reason for this request"),{target:{value:"Stored original checked"}});
  fireEvent.submit(screen.getByLabelText("Reason for this request").closest("form")!);}
test("requires actual original download and explicit contents review",async()=>{view();expect(screen.getByRole("button",{name:"Record source decision"})).toBeDisabled();
  fill(false);expect(execute).not.toHaveBeenCalled();expect(screen.getByRole("checkbox")).toBeDisabled();fill();await screen.findByText(/request is recorded/);
  expect(download.mock.calls[0][0]).toMatchObject({organizationId:commercialOrg,purpose:"finance_original",document:commercialAgreement().versions[0].original.document});
  expect(execute.mock.calls[0][0]).toMatchObject({action:"approve_agreement",agreementId:commercialId(3),versionId:commercialId(10),expectedRevision:1,expectedSeriesRevision:0,
    predecessorVersionId:null,expectedSourceDigest:"b".repeat(64),reviewedAccessId:commercialAccess,contentsReviewed:true});});
test("permits stale source rejection while keeping approval unavailable",async()=>{view(true);expect(screen.queryByRole("option",{name:"Approve this source version"})).not.toBeInTheDocument();
  fill();await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0]).toMatchObject({action:"reject_agreement",expectedSourceDigest:"b".repeat(64),expectedSeriesRevision:0,predecessorVersionId:null});});
test("updates a removed rejection choice to the available approval without retaining an invalid selection",async()=>{const detail=commercialAgreement(),version=detail.versions[0];
  const result=render(<CommercialSourceDecision organizationId={commercialOrg} view="agreement" entityId={detail.entityId} version={version} execute={execute}/>);
  fireEvent.change(screen.getByLabelText("Source decision"),{target:{value:"reject"}});result.rerender(<CommercialSourceDecision organizationId={commercialOrg} view="agreement"
    entityId={detail.entityId} version={{...version,canReject:false}} execute={execute}/>);expect(screen.getByLabelText("Source decision")).toHaveValue("approve");
  fill();await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0].action).toBe("approve_agreement");});
test("clears acknowledgement when a fresh exact download arrives",()=>{view();fireEvent.click(screen.getByRole("button",{name:"Read exact original"}));fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).toBeChecked();fireEvent.click(screen.getByRole("button",{name:"Read exact original"}));expect(screen.getByRole("checkbox")).not.toBeChecked();});
test("keeps the original command and access grant after unknown response",async()=>{execute.mockRejectedValueOnce(new Error("private failure"));view();fill();
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private failure");fireEvent.click(screen.getByRole("button",{name:"Retry unchanged request"}));
  await screen.findByText(/request is recorded/);expect(execute.mock.calls[1][0]).toEqual(execute.mock.calls[0][0]);});
test.each(["CONFLICT","UNAUTHORIZED","FORBIDDEN","NOT_FOUND"])("requires reload for known %s",async code=>{execute.mockRejectedValue({data:{code}});view();fill();await screen.findByRole("alert");
  expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();expect(screen.getByLabelText("Reason for this request")).toBeDisabled();});
test("allows correction of known invalid fields with new request IDs",async()=>{execute.mockRejectedValueOnce({data:{code:"BAD_REQUEST"}});view();fill();await screen.findByRole("alert");
  expect(screen.getByLabelText("Reason for this request")).toBeEnabled();fireEvent.submit(screen.getByLabelText("Reason for this request").closest("form")!);await screen.findByText(/request is recorded/);
  expect(execute.mock.calls[1][0].idempotencyKey).not.toBe(execute.mock.calls[0][0].idempotencyKey);});
test.each(["organizationId","entityId","action","revision"])("does not claim a foreign %s result as saved",async field=>{execute.mockImplementation(async input=>({...commercialResult(input),[field]:field==="revision"?9:commercialId(99)}));
  view();fill();await screen.findByRole("alert");expect(screen.queryByText(/request is recorded/)).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Retry unchanged request"})).toBeEnabled();});
test("keeps saved acknowledgement if page refresh fails",async()=>{refresh.mockImplementation(()=>{throw new Error("refresh failed");});view();fill();
  await screen.findByText("The page could not refresh. The recorded result remains saved.");expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();});
test("never renders a source decision for the preparer",()=>{const detail=commercialAgreement();render(<CommercialSourceDecision organizationId={commercialOrg} view="agreement" entityId={detail.entityId}
  version={{...detail.versions[0],canDecide:false,canApprove:false,canReject:false}} execute={execute}/>);expect(screen.getByRole("status")).toHaveTextContent("No independent decision");expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();});
test("records contract fact decisions against stored counter and predecessor",async()=>{const detail=commercialContract();render(<CommercialSourceDecision organizationId={commercialOrg} view="contract"
  entityId={detail.entityId} version={detail.versions[0]} execute={execute}/>);fill();await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0]).toMatchObject({action:"approve_contract_facts",contractId:detail.entityId,
    expectedFactsRevision:0,predecessorVersionId:null,versionId:commercialId(14),reviewedAccessId:commercialAccess});});
test("denies source review across a selected workspace mismatch",()=>{const detail=commercialAgreement();render(<CommercialSourceDecision organizationId={commercialId(99)} view="agreement" entityId={detail.entityId}
  version={detail.versions[0]} execute={execute}/>);expect(screen.getByRole("alert")).toHaveTextContent("Select the original");expect(download).not.toHaveBeenCalled();});
test("shows immutable source history with staff labels and exact original metadata",()=>{const detail=commercialAgreement();detail.versions[0]={...detail.versions[0],state:"rejected",revision:2,canDecide:false,canApprove:false,canReject:false,
  decidedByIdentityId:commercialId(20),decidedByLabel:"Synthetic independent reviewer",decidedAt:"2026-10-03T11:00:00Z",decisionReason:"Changed source needs new terms"};
  const {container}=render(<CommercialSourceVersions detail={detail} execute={execute}/>);expect(screen.getByText(/Synthetic independent reviewer/)).toBeInTheDocument();
  expect(screen.getByText("Changed source needs new terms")).toBeInTheDocument();expect(container.textContent).not.toContain(commercialId(20));expect(container.querySelector("article")).toHaveClass("[overflow-wrap:anywhere]");});
test("uses row decision revision rather than calculation serial number",async()=>{render(<CommercialCalculationDecision organizationId={commercialOrg} calculation={commercialCalculation().calculation} execute={execute}/>);
  fill(false);await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0]).toMatchObject({action:"approve_calculation",expectedCalculationRevision:1,expectedEventRevision:4});
  expect(execute.mock.calls[0][0]).not.toHaveProperty("amountMinorUnits");});
test("permits stale calculation rejection using its immutable digest",async()=>{const calculation={...commercialCalculation().calculation,currentSourceDigest:null,canApprove:false};
  render(<CommercialCalculationDecision organizationId={commercialOrg} calculation={calculation} execute={execute}/>);expect(screen.queryByRole("option",{name:"Approve this calculation"})).not.toBeInTheDocument();
  fill(false);await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0]).toMatchObject({action:"reject_calculation",expectedSourceDigest:"b".repeat(64)});});
test("does not submit duplicate requests while a response is pending",async()=>{execute.mockImplementation(()=>new Promise(()=>{}));view();fill();fill(false);await waitFor(()=>expect(execute).toHaveBeenCalledTimes(1));});
test("resolves actual signed source eligibility without client money or signing inputs",async()=>{render(<CommercialContractCalculationActions organizationId={commercialOrg} contract={commercialContract().contract} execute={execute}/>);
  fireEvent.change(screen.getByLabelText("Reason for this request"),{target:{value:"Check signed source"}});fireEvent.submit(screen.getByLabelText("Reason for this request").closest("form")!);
  await screen.findByText(/request is recorded/);expect(execute.mock.calls[0][0]).toMatchObject({action:"resolve_eligibility",contractId:commercialId(11),handoffId:commercialId(12)});
  expect(execute.mock.calls[0][0]).not.toHaveProperty("signedAt");expect(execute.mock.calls[0][0]).not.toHaveProperty("contractValue");});
test("prepares the current eligible event with its exact source digest and revision",async()=>{const contract={...commercialContract().contract,commissionEventId:commercialId(16),commissionState:"pending_review" as const,
  approvedFactsVersionId:commercialId(14),currentFactsRevision:2,currentEventRevision:4,currentSourceDigest:"b".repeat(64),canResolveEligibility:false,canPrepareCalculation:true};
  render(<CommercialContractCalculationActions organizationId={commercialOrg} contract={contract} execute={execute}/>);fireEvent.change(screen.getByLabelText("Reason for this request"),{target:{value:"Prepare approved sources"}});
  fireEvent.submit(screen.getByLabelText("Reason for this request").closest("form")!);await screen.findByText(/request is recorded/);
  expect(execute.mock.calls[0][0]).toMatchObject({action:"prepare_calculation",commissionEventId:commercialId(16),expectedEventRevision:4,expectedSourceDigest:"b".repeat(64)});
  expect(execute.mock.calls[0][0]).not.toHaveProperty("amountMinorUnits");expect(execute.mock.calls[0][0]).not.toHaveProperty("agreementVersionId");});
