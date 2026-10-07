import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PublicationControls } from "./publication-controls";

const state = vi.hoisted(() => ({ error: false, calls: [] as number[], prepare: vi.fn(), publish: vi.fn(), refetch: vi.fn() }));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/trpc/client",()=>({useTRPC:()=>({evaluations:{
  prepare:{mutationOptions:()=>({kind:"prepare"})},publish:{mutationOptions:()=>({kind:"publish"})},
  review:{queryOptions:(input:unknown,options:unknown)=>({input,options})},
}})}));
vi.mock("@tanstack/react-query",()=>({
  useMutation:({kind}:{kind:string})=>({mutateAsync:kind==="publish"?state.publish:state.prepare}),
  useQuery:({input,options}:{input:{afterOrdinal:number};options:{enabled:boolean}})=>{
    state.calls.push(input.afterOrdinal);
    return {isPending:!options.enabled,isError:state.error,isFetching:false,refetch:state.refetch,
      data:options.enabled?{inputDigest:"digest",nextOrdinal:input.afterOrdinal===0?50:null,
        options:Array.from({length:input.afterOrdinal===0?50:1},(_,i)=>({optionId:String(i+input.afterOrdinal),maskedLabel:`Option ${i+input.afterOrdinal+1}`,deterministicScore:10000,confidenceBasisPoints:10000,fitReasons:[],limitations:[]}))}:undefined};
  },
}));
beforeEach(()=>{state.error=false;state.calls=[];vi.clearAllMocks();state.prepare.mockResolvedValue({publicationId:"p",inputDigest:"digest",optionCount:51});});
afterEach(cleanup);
function setup(){render(<PublicationControls organizationId="org" intakeId="intake" revision={2} complete requirements={[{stableKey:"payroll",label:"Payroll",importance:"must",response:true}]}/>);}
async function prepare(){
  fireEvent.change(screen.getByLabelText("Payroll · approved vendor field"),{target:{value:"input_payroll"}});
  fireEvent.submit(screen.getByRole("button",{name:"Prepare comparison"}).closest("form")!);
  await screen.findByText(/This page shows/);
}
test("requires review of every options page before allowing publication",async()=>{
  setup();await prepare();
  expect(state.prepare.mock.calls[0][0]).toMatchObject({configuration:{version:2}});
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByRole("rowheader",{name:/Estimated annual cost/})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Publish masked comparison"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Reviewed this page · Next options"}));
  expect(state.calls).toContain(50);
  expect(screen.getByText(/50 options reviewed/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Publish masked comparison"})).toBeEnabled();
  expect(state.publish).not.toHaveBeenCalled();
});

test("shows a staff review matrix without customer selection controls",async()=>{
  setup();await prepare();
  expect(screen.getByRole("button",{name:"Prepare comparison"})).toBeDisabled();
  expect(screen.queryByRole("checkbox",{name:/Choose Option/})).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox",{name:/I reviewed the approved evidence/})).toBeInTheDocument();
});

test("sends the selected structured answer path without changing the saved answer",async()=>{
  const response={country:"US",payroll:{required:false}};
  render(<PublicationControls organizationId="org" intakeId="intake" revision={2} complete requirements={[
    {stableKey:"payroll",label:"Payroll",importance:"must",response},
  ]}/>);
  fireEvent.change(screen.getByLabelText("Payroll · approved vendor field"),{target:{value:"payroll_supported"}});
  fireEvent.change(screen.getByLabelText("Payroll · answer to compare"),{target:{value:"1"}});
  fireEvent.submit(screen.getByRole("button",{name:"Prepare comparison"}).closest("form")!);
  await waitFor(()=>expect(state.prepare).toHaveBeenCalledOnce());
  expect(state.prepare.mock.calls[0][0].configuration.criteria).toEqual([
    {requirementKey:"payroll",factKey:"payroll_supported",responsePath:["payroll","required"]},
  ]);
  expect(response).toEqual({country:"US",payroll:{required:false}});
});

test("explains unsupported answers instead of silently dropping a requirement",()=>{
  render(<PublicationControls organizationId="org" intakeId="intake" revision={2} complete requirements={[
    {stableKey:"payroll",label:"Payroll",importance:"must",response:["US","CA"]},
  ]}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("needs a single text, number, or yes/no answer");
  expect(screen.getByRole("button",{name:"Prepare comparison"})).toBeDisabled();
  expect(state.prepare).not.toHaveBeenCalled();
});

test("excludes unanswered and inapplicable requirements from preparation",()=>{
  render(<PublicationControls organizationId="org" intakeId="intake" revision={2} complete requirements={[
    {stableKey:"payroll",label:"Payroll",importance:"must",response:false},
    {stableKey:"missing",label:"Unanswered",importance:"nice",response:null},
    {stableKey:"excluded",label:"Excluded",importance:"not_applicable",response:true},
  ]}/>);
  expect(screen.getByLabelText("Payroll · approved vendor field")).toBeInTheDocument();
  expect(screen.queryByLabelText(/Unanswered/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Excluded/)).not.toBeInTheDocument();
});
test("hides publication when loading the next page fails and offers retry",async()=>{
  setup();await prepare();state.error=true;
  fireEvent.click(screen.getByRole("button",{name:"Reviewed this page · Next options"}));
  expect(screen.queryByRole("button",{name:"Publish masked comparison"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Retry options"}));
  await waitFor(()=>expect(state.refetch).toHaveBeenCalledOnce());
});
