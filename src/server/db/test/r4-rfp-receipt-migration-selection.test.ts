import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { selectRfpReceiptMigration } from "./r4-rfp-receipt-migration-selection";
import { prepareRfpReceiptMigration, type RehearsalContext } from "../r1-migration-rehearsal";

function inputs() {
  const directory=path.join(process.cwd(),"drizzle"),journal=JSON.parse(readFileSync(path.join(directory,"meta/_journal.json"),"utf8")) as {
    version:string;dialect:string;entries:{idx:number;version:string;when:number;tag:string;breakpoints:boolean}[] };
  const sql=new Map(journal.entries.map(entry=>[entry.tag,readFileSync(path.join(directory,entry.tag+".sql"),"utf8")]));
  return {journal,sql};
}
describe("Guarded RFP receipt migration selection",()=>{
  afterEach(()=>vi.unstubAllEnvs());
  test("selects the one generated expansion by reviewed semantics",()=>{
    const {journal,sql}=inputs(),selected=selectRfpReceiptMigration(JSON.stringify(journal),sql);
    expect(selected.boundary).toBeGreaterThan(journal.entries.findIndex(entry=>entry.tag==="0163_r8_task_request_evidence"));
    expect(selected.boundaryTag).toBe(journal.entries[selected.boundary]!.tag);
    expect(sql.get(selected.boundaryTag)).toContain('CREATE TABLE "mmhr_private"."rfp_receipt_confirmations"');
  });
  test("rejects missing, duplicate and unguarded expansion markers",()=>{
    const {journal,sql}=inputs(),selected=selectRfpReceiptMigration(JSON.stringify(journal),sql),tag=selected.boundaryTag,original=sql.get(tag)!;
    for(const replacement of [original.replace("CREATE FUNCTION public.mmhr_confirm_rfp_receipt","CREATE FUNCTION public.removed_receipt"),
      original+"\nCREATE FUNCTION public.mmhr_confirm_rfp_receipt(",original.replace("CREATE CONSTRAINT TRIGGER r4_receipt_projection_commit","CREATE CONSTRAINT TRIGGER unrelated_projection")]){
      const crossed=new Map(sql);crossed.set(tag,replacement);expect(()=>selectRfpReceiptMigration(JSON.stringify(journal),crossed)).toThrow();
    }
  });
  test("rejects changed journal order and omitted captured SQL",()=>{
    const {journal,sql}=inputs(),selected=selectRfpReceiptMigration(JSON.stringify(journal),sql);
    const missing=new Map(sql);missing.delete(selected.boundaryTag);expect(()=>selectRfpReceiptMigration(JSON.stringify(journal),missing)).toThrow();
    const altered=structuredClone(journal);altered.entries[0]!.idx=1;expect(()=>selectRfpReceiptMigration(JSON.stringify(altered),sql)).toThrow();
  });
  test.each(["unregistered","production","missing_opt_in"])("rejects %s context before database or migration reads",async kind=>{
    vi.stubEnv("NODE_ENV",kind==="production"?"production":"test");vi.stubEnv("R1_MIGRATION_REHEARSAL",kind==="missing_opt_in"?"":"1");
    await expect(prepareRfpReceiptMigration({} as RehearsalContext)).rejects.toThrow("An active owned RFP receipt Auth rehearsal is required");
  });
});
