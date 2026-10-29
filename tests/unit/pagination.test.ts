import {describe,it,expect} from "vitest";import {parsePagination} from "../../src/utils/pagination";
describe("parsePagination",()=>{it("uses defaults",()=>expect(parsePagination({})).toEqual({limit:20,offset:0}));it("caps limit and clamps offset",()=>expect(parsePagination({limit:500,offset:-4})).toEqual({limit:50,offset:0}))});
