/* eslint-disable @typescript-eslint/no-require-imports */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");
const moduleCache = new Map();
function load(file) {
  file = path.resolve(file);
  if (moduleCache.has(file)) return moduleCache.get(file).exports;
  const mod = {exports:{}};
  moduleCache.set(file, mod);
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
test("all 30 situations and shuffled choices use their existing local V2 images with accessible descriptions",()=>{
  assert.equal(WALK_SCENARIOS.length,30);
  for (const {event} of WALK_SCENARIOS) {
    const drawings = [undefined,...[...event.choices].reverse()].map(choice=>{
      const markup = renderToStaticMarkup(React.createElement(WalkIllustration,{event,choice}));
      const src = `/illustrations/evac/${event.id}/${choice?.id ?? "situation"}-v2.webp`;
      assert(markup.includes(`<img `),event.id);
      assert(markup.includes(`src="${src}"`),`${event.id}/${choice?.id}`);
      assert(fs.existsSync(path.join("public",src)),src);
      return markup;
    });
    assert(drawings.every(svg=>svg.includes('role="img"') && svg.includes('aria-label="')));
    assert(drawings.every(svg=>!svg.includes("<image") && !svg.includes("NaN")));
    assert.equal(new Set(drawings.map(svg=>svg.replace(/aria-label="[^"]*"/g,""))).size,4,event.id);
  }
});
test("practice and unknown events retain SVG instead of requesting missing assets",()=>{
  for (const id of ["wall","fall","closed","practice-flood","walk-case-23","walk-case-39"]) {
    const event = {...WALK_SCENARIOS[0].event,id};
    for (const choice of [undefined,...event.choices]) {
      const markup = renderToStaticMarkup(React.createElement(WalkIllustration,{event,choice}));
      assert(markup.startsWith("<svg"),id);
    }
  }
});
if (process.env.WALK_ILLUSTRATION_QA) {
  const sharp = require("sharp");
  Promise.all([0,1,2].map(async page=>{
    const input = await Promise.all(WALK_SCENARIOS.slice(page*10,page*10+10).flatMap(({event},row)=>[undefined,...event.choices].map(async (choice,col)=>({
      input:await sharp(path.join("public/illustrations/evac", event.id, `${choice?.id ?? "situation"}-v2.webp`)).resize(280,155,{fit:"contain"}).toBuffer(),
      top:row*155,left:col*280,
    }))));
    await sharp({create:{width:1120,height:1550,channels:4,background:"#fff"}}).composite(input).png().toFile(`/private/tmp/walk-illustrations-${page}.png`);
  })).catch(error=>{console.error(error);process.exitCode=1;});
}

test("判断の○△×は既存の優先度に従い、欠損記録は評価なしになる", () => {
  const {decisionRating} = load("src/components/evac/DecisionRating.tsx");
  const event = WALK_SCENARIOS[0].event;
  const choices = [1, 2, 3].map(priority => ({...event.choices[0], priority}));
  assert.deepEqual(choices.map(choice => decisionRating({...event, choices}, choice).symbol), ["×", "△", "○"]);
  assert.equal(decisionRating({...event, choices: choices.slice(0, 2)}, choices[1]).symbol, "○");
  assert.equal(decisionRating({...event, choices: [{...choices[0], priority: undefined}]}, choices[0]).symbol, "—");
});

test("保存するルートは迂回を含む通過記録で、GeoJSONは経度・緯度の順になる", () => {
  const {exportEvacRoute} = load("src/lib/evac-export.ts");
  const session = {mode:"mock",scenario:"earthquake",homeLabel:"出発",shelter:{name:"避難先"},startRouteId:"r",routes:[{id:"r",path:[{lat:0,lng:0},{lat:1,lng:1}]}],decisions:[],finishedAt:123,followUp:"道を確認する",walk:{index:1,steps:[{position:{lat:35,lng:139}},{position:{lat:35.1,lng:139.2}},{position:{lat:36,lng:140}}]}};
  const feature = exportEvacRoute(session).features[0];
  assert.deepEqual(feature.geometry,{type:"LineString",coordinates:[[139,35],[139.2,35.1]]});
  assert.equal(feature.properties.followUp,"道を確認する");
  assert.equal(exportEvacRoute({...session,walk:null}).features[0].properties.routeType,"選択した経路");
  assert.throws(()=>exportEvacRoute({...session,walk:null,routes:[]}),/保存できるルート/);
});
