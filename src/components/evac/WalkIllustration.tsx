import type { HazardEvent, EvacChoice } from "@/lib/evac-content";

type Scene = "route" | "low" | "water" | "rain" | "wall" | "traffic" | "sign" | "glass" | "crack" | "sand" | "slope" | "wire" | "signal" | "quake" | "barrier" | "gate" | "stairs" | "tired" | "crowd" | "talk" | "battery" | "entrance" | "reception" | "smoke" | "emergency" | "alarm" | "tower" | "exit" | "parking" | "boxes" | "shops";
type Action = "map" | "forward" | "wait" | "back" | "side" | "call" | "shelter" | "shield" | "look" | "cross" | "ask" | "carry" | "rest" | "slow" | "follow" | "note" | "phone" | "save" | "mask" | "alone";
// Explicit artwork mapping: no label parsing and no inference from rubric scores.
const scenes: Record<number, [Scene, Action, Action, Action]> = {
  8:["low","map","forward","wait"], 9:["water","back","forward","ask"], 10:["rain","ask","forward","shelter"],
  11:["wall","back","forward","side"], 12:["traffic","back","cross","side"], 13:["sign","call","shelter","forward"],
  14:["glass","side","forward","shield"], 15:["crack","back","cross","ask"], 16:["sand","back","side","wait"],
  17:["slope","back","shield","look"], 18:["wire","back","forward","call"], 19:["signal","look","cross","follow"],
  20:["quake","shield","shelter","wait"], 21:["barrier","back","look","wait"], 22:["gate","map","forward","phone"],
  24:["stairs","map","carry","wait"], 25:["tired","rest","slow","wait"], 26:["crowd","side","follow","slow"],
  27:["talk","ask","forward","follow"], 28:["battery","note","phone","save"], 29:["entrance","map","call","follow"],
  30:["reception","ask","follow","alone"], 31:["smoke","back","mask","phone"], 32:["emergency","cross","forward","wait"],
  33:["alarm","back","mask","phone"], 34:["tower","side","shelter","shield"], 35:["exit","side","follow","wait"],
  36:["parking","look","cross","follow"], 37:["boxes","back","side","wait"], 38:["shops","back","shield","cross"],
};

function Person({ x=65, y=92, pose="stand", color="#477bb5" }: {x?:number;y?:number;pose?:string;color?:string}) {
  return <g transform={`translate(${x} ${y})`} stroke="#344c60" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cy="44" rx="15" ry="4" fill="#344c6018" stroke="none" />
    <circle cy="-3" r="8" fill="#f4c7a0" />
    <path d="M-8 -6Q-6 -17 4 -12L8 -5" fill="#344c60" />
    <path d="M-7 8Q0 5 7 8L9 27H-9Z" fill={color} />
    <rect x="-12" y="10" width="6" height="17" rx="3" fill="#f2c45d" />
    {pose==="rest" ? <path d="M-5 27 10 29 13 40M5 27 17 29 20 40M-4 14 9 24" fill="none" /> : <>
      <path d={pose==="walk" ? "M-5 27-12 41M5 27 16 37" : "M-5 27-6 42M5 27 7 42"} fill="none" />
      <path d={pose==="shield" ? "M-6 12-13-6-4-13M7 12 15-6 4-13" : pose==="ask" ? "M-7 13-13 25M7 13 17 9 23 1" : pose==="phone" ? "M-7 13 0 21 13 12M7 13 14 19" : "M-7 13-15 24M7 13 16 23"} fill="none" />
    </>}
  </g>;
}
function Car({x=194,y=108}: {x?:number;y?:number}) {
  return <g transform={`translate(${x} ${y})`} stroke="#566778" strokeWidth="2"><path d="M0 10 7-4H32L44 10V25H-4V13Z" fill="#e7b17c"/><path d="M9 0H29L35 10H5Z" fill="#d6eef6"/><circle cx="5" cy="25" r="5" fill="#566778"/><circle cx="34" cy="25" r="5" fill="#566778"/></g>;
}
function Building({ tower=false, shop=false }: {tower?:boolean;shop?:boolean}) {
  return <g stroke="#8199a4" strokeWidth="2"><rect x="172" y={tower?8:35} width="98" height={tower?99:72} rx="3" fill="#d4e2e6"/>{[185,215,245].map(x=><path key={x} d={`M${x} 45v13m0 9v13`} stroke="#78a6bd" strokeWidth="13"/>)}<rect x="214" y="84" width="24" height="23" fill="#76939d"/>{shop ? <path d="M167 62H275L268 76H174Z" fill="#e9c376"/> : null}</g>;
}
function Paper({x=25,y=38,phone=false,off=false}: {x?:number;y?:number;phone?:boolean;off?:boolean}) {
  return <g transform={`translate(${x} ${y})`} stroke="#46637b" strokeWidth="2.5"><rect width="42" height="51" rx={phone?6:2} fill={phone?"#42627c":"#fffaf0"}/><rect x="5" y="6" width="32" height="36" rx="2" fill={off?"#708292":"#e2f1f5"}/>{!off ? <path d="M10 35 19 25 13 18 30 12M19 25 31 35" fill="none" stroke="#5681b5"/> : null}<circle cx="21" cy="46" r="1" fill="#fff"/></g>;
}
function Environment({scene}: {scene:Scene}) {
  const buildings=["sign","glass","tower","shops","entrance","reception","gate","exit","boxes"];
  return <>
    {buildings.includes(scene) ? <Building tower={scene==="tower"} shop={scene==="shops" || scene==="sign" || scene==="boxes"}/> : null}
    {["low","water","sand","rain"].includes(scene) ? <g fill="#89bfd8" stroke="#6098bd" strokeWidth="2"><path d="M120 109Q144 97 166 110T218 110 279 113V143H125Z"/><path d="M143 122q15-8 32 0m14 7q14-8 29 0m17-10q14-7 28 0" fill="none"/>{scene==="sand"? <path d="M174 115q-10-28 4-30m0 30q18-25 20-18" stroke="#b39162" strokeWidth="5" fill="none"/>:null}</g>:null}
    {scene==="low" ? <path d="M102 91 150 107 212 107" stroke="#7b8a93" strokeWidth="5" fill="none"/>:null}
    {scene==="rain" ? <g><path d="M128 33q-5-17 13-19 12-18 27 0 25-5 24 19Z" fill="#94a9bf"/>{[132,153,175,195,222].map(x=><path key={x} d={`M${x} 47l-7 18m12 10-7 18`} stroke="#82a8c7" strokeWidth="3"/>)}<path d="M13 70 40 51 77 70M21 70V109H70V70" fill="#e9dbb8" stroke="#9a886c" strokeWidth="3"/></g>:null}
    {["wall","traffic"].includes(scene) ? <g stroke="#9a9990" strokeWidth="2"><path d="M124 72 236 60 245 106 127 117Z" fill="#c9c8bd"/><path d="M125 88 240 77M126 102 243 91M151 70v17m29-20v17m30-20v16m-46 16v16m40-20v16"/><path d="m196 65-8 18 10 10-8 14" fill="none" stroke="#657581" strokeWidth="3"/></g>:null}
    {["traffic","signal","parking"].includes(scene) ? <Car/>:null}
    {["sign","shops","glass","tower"].includes(scene) ? <g fill="#e4b766" stroke="#9b8058" strokeWidth="2">{scene==="sign" || scene==="shops" ? <path d="m193 65 50 13-7 22-49-13Z"/>:null}{[152,176,211,238].map((x,i)=><path key={x} d={`m${x} ${115+i%2*10} 9-4 4 10Z`} fill="#a5c7d8"/>)}<path d="m193 78-7 14m41-1-6 13" fill="none" stroke="#849eab"/></g>:null}
    {scene==="crack" ? <path d="m156 100 17 13-16 7 25 9-6 19" fill="none" stroke="#687a83" strokeWidth="6"/>:null}
    {scene==="slope" ? <g><path d="M114 90 180 12 264 96Z" fill="#b8cab0"/><path d="m167 76 10-7 9 11-14 4m22-30 9-7 6 10-12 5m-5 51 12-6 12 12-18 4" fill="#a59d8c"/><path d="m183 80 9 11m-26-9-6 13" stroke="#968d7d" strokeWidth="2"/></g>:null}
    {scene==="wire" ? <g stroke="#5d6f79" strokeWidth="4" fill="none"><path d="M170 27V108M146 41H194M193 40Q252 47 220 110"/><path d="m213 116 8-5 5 9" strokeWidth="2"/></g>:null}
    {scene==="signal" ? <g><path d="M166 30v72" stroke="#7c939d" strokeWidth="5"/><rect x="145" y="26" width="45" height="18" rx="5" fill="#536875"/>{[154,167,180].map(x=><circle key={x} cx={x} cy="35" r="4" fill="#8798a1"/>)}<path d="M127 139h30m-19-13h30m-19-13h30" stroke="#fff" strokeWidth="6"/></g>:null}
    {scene==="quake" ? <g><Building/><path d="m161 43-7 12 8 10m122-8-7 9 6 12m-134 52 7-6 10 7" stroke="#a29784" strokeWidth="3" fill="none"/></g>:null}
    {scene==="barrier" || scene==="emergency" ? <g stroke="#927d53" strokeWidth="3"><path d="M145 85V128M247 85V128"/><rect x="135" y="85" width="122" height="16" rx="3" fill="#ecd17f"/><path d="m143 85 15 16m18-16 15 16m18-16 15 16m18-16 15 16" stroke="#f8f5e8" strokeWidth="6"/>{scene==="emergency"? <g><Car x={181} y={40}/><path d="M198 29h16v8" stroke="#c48974"/></g>:null}</g>:null}
    {scene==="gate" || scene==="entrance" ? <g stroke="#889c9f" strokeWidth="3"><path d="M152 79v40m98-40v40M153 85h98m-85 0v30m14-30v30m14-30v30m14-30v30m14-30v30m14-30v30"/><path d="M96 84h34l-9-8m9 8-9 8" stroke="#477bb5" fill="none"/></g>:null}
    {scene==="stairs" ? <g><path d="M140 120v-15h25V90h25V75h25V60h42v60Z" fill="#c9d7db" stroke="#8ca0a8" strokeWidth="2"/><path d="M27 75h21l13 34H29Z" fill="#e4b976" stroke="#627985" strokeWidth="2"/><circle cx="34" cy="115" r="6" fill="#627985"/><circle cx="58" cy="115" r="6" fill="#627985"/><path d="M15 73h12" stroke="#627985" strokeWidth="3"/></g>:null}
    {scene==="tired" ? <><path d="M184 107h54m-46 0v25m38-25v25" stroke="#b7a27e" strokeWidth="7"/><Person x={170} y={81} pose="rest" color="#a39aba"/></>:null}
    {["crowd","exit","parking"].includes(scene) ? <g>{[142,161,181].map((x,i)=><Person key={x} x={x} y={70+i%2*8} color="#9baab5"/>)}</g>:null}
    {scene==="talk" || scene==="reception" ? <><Person x={181} y={76} pose="ask" color="#91aaa0"/><path d="M148 33h76v27h-25l-10 11-3-11h-38Z" fill="#fff" stroke="#b7cbd4" strokeWidth="2"/>{scene==="reception"?<text x="167" y="52" fontSize="14" fill="#46637b">受付 →</text>:<path d="M159 43h52m-52 8h30" stroke="#91aabd" strokeWidth="3"/>}</>:null}
    {scene==="battery" ? <><Paper x={171} y={32} phone/><rect x="178" y="44" width="27" height="13" rx="2" fill="#edf2ed" stroke="#71899c" strokeWidth="2"/><rect x="181" y="47" width="5" height="7" fill="#c5a461"/><Paper x={223} y={51}/><path d="m236 106 25-27" stroke="#c5a461" strokeWidth="5"/></>:null}
    {["smoke","alarm"].includes(scene) ? <g><path d="M162 99V65l26-14v14l27-14v14h41v34Z" fill="#b1c1c6" stroke="#8398a0" strokeWidth="2"/><path d="M224 64V27h14v37" fill="#a4b6bd"/>{scene==="smoke"?<path d="M231 28q-26-4-19-19-34 8-41-8" stroke="#a3adbb" strokeWidth="19" fill="none" strokeLinecap="round"/>:<path d="M211 36q-15 14 0 28m-8-33q-22 19 0 37m43-27q13 10 0 20" stroke="#b09c76" strokeWidth="3" fill="none"/>}</g>:null}
    {scene==="boxes"? <><Car x={169} y={106}/><g fill="#d5bd97" stroke="#a58e71" strokeWidth="2"><rect x="144" y="93" width="24" height="22"/><rect x="130" y="112" width="29" height="20"/><path d="M137 116h15m-8-20v15"/></g></>:null}
  </>;
}

/** The same place, with different people, tools and movement for each proposed action. */
export function WalkIllustration({event, choice, className=""}: {event:HazardEvent;choice?:EvacChoice;className?:string}) {
  const fallback: Scene = event.id === "practice-flood" ? "water" : event.kind === "wall" ? "wall" : event.kind === "fall" ? "glass" : event.kind === "closed" ? "barrier" : "route";
  const definition = scenes[Number(event.id.replace("walk-case-",""))] ?? [fallback, choice?.id === "detour" ? "back" : "side", "forward", "wait"] as const;
  const [scene, recommended, proceed, consider] = definition;
  const action = !choice ? undefined : choice.id==="go" ? proceed : choice.id==="consider" ? consider : recommended;
  const moving = action && ["back","forward","side","cross","follow","slow","alone"].includes(action);
  const x = action==="cross" ? 116 : action==="forward" || action==="mask" ? 139 : action==="shelter" ? scene==="rain" ? 42 : 227 : action==="back" ? 43 : 76;
  const pose = action==="shield" ? "shield" : action==="rest" ? "rest" : ["ask","call","look"].includes(action ?? "") ? "ask" : ["phone","save","note","map"].includes(action ?? "") ? "phone" : moving ? "walk" : "stand";
  return <svg viewBox="0 0 280 155" className={className} role="img" aria-label={choice ? `行動のイラスト：${choice.label}` : `状況のイラスト：${event.situation.split("\n")[0].replace("【想定問題】","")}`}>
    <rect width="280" height="155" rx="12" fill="#eef4f6"/>
    <path d="M0 104 280 88V155H0Z" fill="#dae3e5"/><path d="M0 137 280 118" stroke="#fff" strokeWidth="3"/>
    <Environment scene={scene}/>
    {moving ? <g stroke="#477bb5" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={action==="back" ? "M111 137H28l10-8m-10 8 10 8" : action==="side" ? "M75 141h58v-19m-7 8 7-8 7 8" : action==="cross" ? "M78 145 156 97m-12 0 12 0-4 12" : "M89 144h88l-10-7m10 7-10 7"}/>
    </g>:null}
    <Person x={x} y={action==="shelter"?57:83} pose={pose}/>
    {action==="ask" ? <><Person x={118} y={83} color="#91aaa0" pose="ask"/><path d="M75 53h54v20h-20l-8 8-2-8H75Z" fill="#fff" stroke="#a5bac5" strokeWidth="2"/><path d="M84 61h34m-34 6h20" stroke="#7e99aa" strokeWidth="2"/></>:null}
    {action==="call" ? scene==="entrance" ? <path d="M95 65q15-10 31 0m-26 6q12-7 22 0" stroke="#70899c" strokeWidth="3" fill="none"/> : <g stroke="#46637b" strokeWidth="2"><rect x={x+9} y="75" width="8" height="15" rx="2" fill="#46637b"/><path d={`M${x+8} 96 ${x+18} 89 ${x+13} 82m9-14q8 4 8 12`} fill="none"/></g> : null}
    {action==="wait" ? <g transform="translate(94 47)" stroke="#70899c" strokeWidth="2.5" fill="#fff"><circle r="14"/><path d="M0-8v9l6 4" fill="none"/></g>:null}
    {action==="look" ? <path d="M98 70q35-28 64 0M151 59l11 11-15 2" fill="none" stroke="#477bb5" strokeWidth="3" strokeDasharray="5 3"/>:null}
    {action==="follow" ? <Person x={117} y={88} pose="walk" color="#91aaa0"/>:null}
    {scene!=="tired" && (action==="rest" || action==="slow") ? <Person x={111} y={85} pose={action==="rest"?"rest":"walk"} color="#a39aba"/>:null}
    {action==="carry" ? <g transform="translate(92 83)"><Person x={25} y={-3} pose="ask"/><path d="M-12 17H17L8-6H-9Z" fill="#e4b976" stroke="#627985" strokeWidth="2"/><circle cx="-9" cy="21" r="4" fill="#627985"/><circle cx="13" cy="21" r="4" fill="#627985"/></g>:null}
    {action==="phone" || action==="save" || action==="map" || action==="note" ? <Paper x={92} y={67} phone={action==="phone" || action==="save"} off={action==="save"}/>:null}
    {action==="note" ? <path d="M104 98 132 70" stroke="#bca063" strokeWidth="5"/>:null}
    {action==="mask" ? <path d={`M${x-7} 81h14v7h-14Z`} fill="#f7fafb" stroke="#a4b5c2"/>:null}
  </svg>;
}
