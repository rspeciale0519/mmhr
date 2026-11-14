import { expect,test } from "vitest";
import { commercialAmount,commercialPercentage,parseCommercialPercentage,parseCommercialTotal,commercialInstant,commercialTime } from "./commercial-finance-fields";
test("keeps unknown contract totals separate from an actual zero",()=>{
  expect(parseCommercialTotal(false,"0","")).toEqual({amountMinorUnits:null,currency:null});
  expect(parseCommercialTotal(false,"123","USD")).toEqual({amountMinorUnits:null,currency:"USD"});
  expect(parseCommercialTotal(true,"0","USD")).toEqual({amountMinorUnits:0,currency:"USD"});
  expect(commercialAmount(null,"USD")).toBe("Unknown");expect(commercialAmount(0,"USD")).toBe("$0.00");
});
test("shows exact microsecond effective boundaries without locale rounding",()=>{
  expect(commercialTime("2026-10-03T14:00:00.000001Z")).toBe("2026-10-03 14:00:00.000001 UTC");
  expect(commercialTime("2026-10-03T14:00:00.000001+00:00")).toBe("2026-10-03 14:00:00.000001 UTC");
  expect(commercialTime("2026-10-03T14:00:00.000001-04:00")).toBe("2026-10-03 14:00:00.000001 -04:00");
  expect(()=>commercialTime("2026-10-03T14:00:00.0000001Z")).toThrow();
});
test("uses exact currency-specific amounts without rounding or annual-price inference",()=>{
  expect(parseCommercialTotal(true,"123.45","USD").amountMinorUnits).toBe(12345);
  expect(parseCommercialTotal(true,"123","JPY").amountMinorUnits).toBe(123);
  expect(parseCommercialTotal(true,"123.456","BHD").amountMinorUnits).toBe(123456);
});
test.each([[true,"","USD"],[true,"10",""],[true,"1.1","JPY"],[true,"1.001","USD"],[true,"-1","USD"],
  [true,"9007199254740992","JPY"],[false,"","ZZZ"]] as const)("rejects invalid or unsupported money input",(known,amount,currency)=>{
  expect(()=>parseCommercialTotal(known,amount,currency)).toThrow();
});
test.each([["0",0],["0.01",1],["5.5",550],["99.99",9999],["100",10000]] as const)("preserves exact rate %s",(input,result)=>{
  expect(parseCommercialPercentage(input)).toBe(result);expect(commercialPercentage(result)).toBe(`${input}%`);
});
test.each(["","-1","100.01","1.001","1e2","01","Infinity"])("rejects invalid percentage %s",input=>{
  expect(()=>parseCommercialPercentage(input)).toThrow();
});
test("preserves UTC microsecond input and clears only an optional end",()=>{
  expect(commercialInstant("2026-10-03T12:00")).toBe("2026-10-03T12:00:00Z");
  expect(commercialInstant("2026-10-03T12:00:00.000001")).toBe("2026-10-03T12:00:00.000001Z");
  expect(commercialInstant("",true)).toBeNull();expect(()=>commercialInstant("")).toThrow();
  expect(()=>commercialInstant("2026-02-30T12:00")).toThrow();expect(()=>commercialInstant("2026-10-03T12:00:00.0000001")).toThrow();
});

