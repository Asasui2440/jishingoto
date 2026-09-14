/* eslint-disable @typescript-eslint/no-require-imports */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");
function load(file) {
  const mod = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function("require","module","exports",code)((name)=>{
    if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
    const base = name.startsWith("@/") ? path.resolve("src",name.slice(2)) : path.resolve(path.dirname(file),name);
    return load(fs.existsSync(base+".ts") ? base+".ts" : base+".tsx");
  },mod,mod.exports);
  return mod.exports;
}
const {WALK_SCENARIOS} = load("src/lib/walk-scenarios.ts");
const {WalkIllustration} = load("src/components/evac/WalkIllustration.tsx");
test("all 30 situations have distinct situation and action drawings, accessible descriptions, and no external image requests",()=>{
  for (const {event} of WALK_SCENARIOS) {
    const drawings = [undefined,...event.choices].map(choice=>renderToStaticMarkup(React.createElement(WalkIllustration,{event,choice})));
    assert(drawings.every(svg=>svg.includes('role="img"') && svg.includes('aria-label="')));
    assert(drawings.every(svg=>!svg.includes("<image") && !svg.includes("NaN")));
    assert.equal(new Set(drawings.map(svg=>svg.replace(/aria-label="[^"]*"/g,""))).size,4,event.id);
  }
});
if (process.env.WALK_ILLUSTRATION_QA) {
  const sharp = require("sharp");
  Promise.all([0,1,2].map(async page=>{
    const input = await Promise.all(WALK_SCENARIOS.slice(page*10,page*10+10).flatMap(({event},row)=>[undefined,...event.choices].map(async (choice,col)=>({
      input:Buffer.from(renderToStaticMarkup(React.createElement(WalkIllustration,{event,choice})).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="155" ')),
      top:row*155,left:col*280,
    }))));
    await sharp({create:{width:1120,height:1550,channels:4,background:"#fff"}}).composite(input).png().toFile(`/private/tmp/walk-illustrations-${page}.png`);
  })).catch(error=>{console.error(error);process.exitCode=1;});
}
