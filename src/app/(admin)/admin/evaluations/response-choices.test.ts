import { expect, test } from "vitest";
import { responseChoices } from "./response-choices";
test("keeps false, zero, and blank scalar answers",()=>{
  expect(responseChoices({flag:false,count:0,text:""}).map(choice=>choice.path)).toEqual([["flag"],["count"],["text"]]);
});
test("uses exact keys without splitting dots and skips arrays and null",()=>{
  expect(responseChoices({"country.code":"US",list:[true],missing:null})).toEqual([{path:["country.code"],label:"country.code: US"}]);
});
test("does not offer paths deeper than the publication contract supports",()=>{
  expect(responseChoices({a:{b:{c:{d:{e:{f:true}}}}}})).toEqual([]);
});
