import { cleanup,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";

// Owner decision D2 hides this area at launch; src/lib/launch-surface tests cover that guard.
vi.mock("@/lib/launch-surface-guard", () => ({ requireLaunchArea: vi.fn() }));
import CommercialFinancePage from "./page";
import { AuthorizationError } from "@/server/auth/authorization";
import { commercialOrg,commercialId,commercialAgreement } from "@/components/workflow/commercial-finance-test-fixtures";
const {authorize,authority,rpc,list,detail}=vi.hoisted(()=>({authorize:vi.fn(),authority:vi.fn(),rpc:vi.fn(),list:vi.fn(),detail:vi.fn()}));
vi.mock("@/server/auth/page-guards",()=>({requireSelectedOrganizationPermission:authorize}));
vi.mock("@/server/commands/finance-document-upload",()=>({requireFinanceDocumentAuthority:authority}));
vi.mock("@/server/commands/managed-finance",()=>({getManagedFinancePage:list,getManagedFinanceDetail:detail}));
vi.mock("next/navigation",()=>({forbidden:()=>{throw new Error("forbidden");},notFound:()=>{throw new Error("not found");}}));
vi.mock("@/components/workflow/commercial-finance-client",()=>({CommercialFinanceClientWorkspace:({workspaceLabel}:{workspaceLabel:string})=><p>{workspaceLabel}</p>}));
const membership={organization_id:commercialOrg,organization_name:"Synthetic internal finance",organization_type:"internal",organization_status:"active",role_key:null};
beforeEach(()=>{authorize.mockReset().mockResolvedValue({authorization:{scope:{kind:"organization",organizationId:commercialOrg},assurance:"aal2",supabase:{rpc}}});
  authority.mockReset().mockResolvedValue({supabase:{rpc}});rpc.mockReset().mockResolvedValue({data:[membership],error:null});
  list.mockReset().mockImplementation(async input=>({...input,items:[],nextCursor:null}));detail.mockReset().mockResolvedValue(commercialAgreement());});afterEach(cleanup);
const page=(query:Record<string,string|string[]|undefined>={})=>CommercialFinancePage({searchParams:Promise.resolve(query)});
test("requires selected scoped finance permission and internal AAL2 before reading",async()=>{render(await page());expect(authorize).toHaveBeenCalledExactlyOnceWith("finance.manage");
  expect(authority).toHaveBeenCalledWith(commercialOrg,expect.any(String),expect.objectContaining({supabase:expect.objectContaining({rpc})}));
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_my_memberships");expect(list).toHaveBeenCalledWith(expect.objectContaining({organizationId:commercialOrg,view:"agreements"}),expect.any(Object));
  expect(screen.getByText("Synthetic internal finance")).toBeInTheDocument();});
test("preserves redacted workspace names without rendering an identifier",async()=>{rpc.mockResolvedValue({data:[{...membership,organization_name:null}],error:null});render(await page());
  expect(screen.getByText("Organization name restricted")).toBeInTheDocument();expect(screen.queryByText(commercialOrg)).not.toBeInTheDocument();});
test.each(["aal1",null])("denies %s assurance before finance authority or reads",async assurance=>{authorize.mockResolvedValue({authorization:{scope:{kind:"organization",organizationId:commercialOrg},assurance,supabase:{rpc}}});
  await expect(page()).rejects.toThrow("forbidden");expect(authority).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();});
test("denies platform scope without a selected authorized organization",async()=>{authorize.mockResolvedValue({authorization:{scope:{kind:"platform"},assurance:"aal2",supabase:{rpc}}});
  await expect(page()).rejects.toThrow("forbidden");expect(authority).not.toHaveBeenCalled();});
test("stops before membership reads after current authority denies a revoked session",async()=>{authority.mockRejectedValue(new AuthorizationError());await expect(page()).rejects.toThrow("not found");
  expect(rpc).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();});
test.each([{entityId:commercialId(3)},{view:"agreement"},{view:"calculation",entityId:commercialId(15),beforeVersion:"1"},{view:["agreement","contract"]},
  {view:"agreement",entityId:commercialId(3),afterId:commercialId(7)},{beforeVersion:"-1"},{unrecognized:"value"}])("rejects malformed route input %j before reads",async query=>{
  await expect(page(query)).rejects.toThrow("not found");expect(authority).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();});
test("does not read an agreement from the customer workspace",async()=>{rpc.mockResolvedValue({data:[{...membership,organization_type:"customer"}],error:null});
  await expect(page({view:"agreements"})).rejects.toThrow("not found");expect(list).not.toHaveBeenCalled();});
test("defaults the actual customer workspace to signed contracts",async()=>{rpc.mockResolvedValue({data:[{...membership,organization_type:"customer",organization_name:"Synthetic customer finance"}],error:null});
  render(await page());expect(list).toHaveBeenCalledWith(expect.objectContaining({organizationId:commercialOrg,view:"contracts"}),expect.any(Object));expect(screen.getByText("Synthetic customer finance")).toBeInTheDocument();});
test.each([{data:[]},{data:[{...membership,organization_id:commercialId(99)}]},{data:[{...membership,organization_type:"vendor"}]}])("denies missing or vendor workspace %j",async({data})=>{
  rpc.mockResolvedValue({data,error:null});await expect(page()).rejects.toThrow("not found");expect(list).not.toHaveBeenCalled();});
test("fails closed on duplicate membership response without exposing provider details",async()=>{rpc.mockResolvedValue({data:[membership,membership],error:null});
  await expect(page()).rejects.toThrow("Finance workspace could not load");expect(list).not.toHaveBeenCalled();});
test("reads exact stored target and version cursor through the public wrapper",async()=>{render(await page({view:"agreement",entityId:commercialId(3),beforeVersion:"7"}));
  expect(detail).toHaveBeenCalledWith(expect.objectContaining({organizationId:commercialOrg,entityId:commercialId(3),view:"agreement",beforeVersion:7}),expect.any(Object));expect(list).not.toHaveBeenCalled();});
