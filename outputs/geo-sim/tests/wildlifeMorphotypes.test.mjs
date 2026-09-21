import assert from "node:assert/strict";
import { wildlifeMorphotypeIndex as index, wildlifeMorphotypeCount as count, UNASSIGNED_MORPHOTYPE_SPECIES as missing } from "../src/wildlifeMorphotypes.js";

assert.equal(index({id:"albatross",geometryClass:"bird"}),4);
assert.equal(index({id:"moose",geometryClass:"ungulate"}),1);
assert.equal(index({id:"zebra",geometryClass:"ungulate"}),2);
assert.equal(index({geometryClass:"ungulate",morphotypeIndex:"2"}),2);
assert.equal(index({geometryClass:"ungulate",morphotypeIndex:99}),2);
assert.equal(index({geometryClass:"bird",morphotype:"ratite"}),3);
assert.equal(count("elephant"),2);
assert.equal(index({id:"african_elephant",geometryClass:"elephant"}),1);
for (const geometryClass of ["boar","unknown","constructor","__proto__"]) {
  assert.equal(count(geometryClass),1);
  assert.equal(index({geometryClass}),0);
}
for (const value of [null,undefined,"", " ",NaN,Infinity,-1,"wrong"]) {
  missing.clear();
  assert.equal(index({id:"unassigned",geometryClass:"bird",morphotypeIndex:value}),0);
  assert.ok(missing.has("unassigned"),"invalid indices must not silently suppress diagnostics");
}
missing.clear();
assert.equal(index(null),0);
assert.equal(index(),0);
console.log("Typed morphotype selection, explicit variants, unknown classes and invalid-index diagnostics passed");
