import { beforeEach, expect, test, vi } from "vitest";
import { getReviewRequirements } from "./review-requirements";
import { getIntakeRequirementsPage } from "@/server/commands/requirement-read";
vi.mock("@/server/commands/requirement-read",async(original)=>({...await original<typeof import("@/server/commands/requirement-read")>(),getIntakeRequirementsPage:vi.fn()}));
const read=vi.mocked(getIntakeRequirementsPage);
beforeEach(()=>vi.resetAllMocks());
function item(key:string) { return { requirementId:key,organizationId:"org",intakeId:"intake",stableKey:key,label:key,importance:"must" as const,
  weight:1,response:"yes",status:"active" as const,requirementType:"custom" as const,revision:1,createdAt:"2026-09-13T00:00:00Z",updatedAt:"2026-09-13T00:00:00Z" }; }
test("collects all submitted requirements across pages",async()=>{
  read.mockResolvedValueOnce({requirements:[item("a")],nextCursor:"a"}).mockResolvedValueOnce({requirements:[item("b")],nextCursor:null});
  expect((await getReviewRequirements("org","intake",{})).requirements.map(r=>r.stableKey)).toEqual(["a","b"]);
  expect(read).toHaveBeenLastCalledWith({organizationId:"org",intakeId:"intake",afterId:"a",pageSize:50},{});
});
test("does not return partial requirements after a later-page failure",async()=>{
  read.mockResolvedValueOnce({requirements:[item("a")],nextCursor:"a"}).mockRejectedValueOnce(new Error("unavailable"));
  await expect(getReviewRequirements("org","intake",{})).rejects.toThrow("unavailable");
});
test("rejects repeated requirement keys across pages",async()=>{
  read.mockResolvedValueOnce({requirements:[item("a")],nextCursor:"a"}).mockResolvedValueOnce({requirements:[item("a")],nextCursor:null});
  await expect(getReviewRequirements("org","intake",{})).rejects.toMatchObject({code:"INVALID_RESPONSE"});
});
