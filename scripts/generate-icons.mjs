import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "public/figma/icons";
// Icons whose own colour must follow the surrounding text colour (state changes,
// dark/light headers). Everything else keeps the exact colours Figma exported.
const RECOLOR = {
  // ステータスバー：暗い画面では白抜きにしたい
  "status-signal-dark": "fill", "status-wifi-dark": "fill", "status-battery-dark": "fill",
  "status-signal-light": "fill", "status-wifi-light": "fill", "status-battery-light": "fill",
  "dot-blue": "fill", "dot-gray": "fill",
  // 置かれる面の色に合わせて濃さを変えるもの。
  // Figma の書き出しは色が焼き込まれているが、黄色は明るいので
  // 「黄の上／白地の上」で文字色を変えないと読めなくなる。
  "chevron-right": "stroke", "volume-2": "stroke",
  "arrow-right": "stroke", "arrow-right-2": "stroke", "arrow-right-circle": "stroke",
  "camera-blue": "stroke", "camera-white": "stroke",
  "check-circle-white": "stroke", "check-circle-white-2": "stroke",
  "check-circle-teal": "stroke", "check-small": "stroke",
  "eye-off": "stroke", "hand-grab": "stroke", "mouse-pointer": "stroke",
  "lightbulb-blue": "stroke", "logo-circle-x": "stroke",
  "plus-circle": "stroke", "refresh-cw": "stroke",
  "x-circle-blue": "stroke", "x-circle-dark": "stroke",
};

const pascal = (s) => s.replace(/(^|[-_])([a-z0-9])/g, (_, __, c) => c.toUpperCase());

// SVG attribute -> JSX prop. Only the attributes these Figma exports actually use.
const PROP = {
  "fill-rule": "fillRule", "clip-rule": "clipRule", "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin",
  "stroke-miterlimit": "strokeMiterlimit", "stop-color": "stopColor",
  "stop-opacity": "stopOpacity", "fill-opacity": "fillOpacity",
  "stroke-opacity": "strokeOpacity", "clip-path": "clipPath",
  "color-interpolation-filters": "colorInterpolationFilters",
  "flood-opacity": "floodOpacity", "flood-color": "floodColor",
  "stroke-dasharray": "strokeDasharray", "xmlns:xlink": "xmlnsXlink",
  "xlink:href": "xlinkHref", "gradientUnits": "gradientUnits",
};

const out = [];
const names = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".svg")).sort()) {
  const name = file.replace(/\.svg$/, "");
  let svg = readFileSync(join(DIR, file), "utf8").trim();

  const open = svg.match(/^<svg\b([^>]*)>/);
  const viewBox = open[1].match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  let body = svg.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();

  // Figma prefixes every filter/gradient/clip id with a shared counter, so two
  // inlined icons on one page would collide. Namespace them per icon.
  const ids = [...body.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    .filter((id) => body.includes(`url(#${id})`) || body.includes(`#${id}"`));
  for (const id of ids) {
    const scoped = `${name}__${id}`;
    body = body.replaceAll(`id="${id}"`, `id="${scoped}"`)
               .replaceAll(`url(#${id})`, `url(#${scoped})`)
               .replaceAll(`"#${id}"`, `"#${scoped}"`);
  }

  const mode = RECOLOR[name];
  if (mode) body = body.replace(new RegExp(`${mode}="(#[0-9A-Fa-f]{3,8})"`, "g"), `${mode}="currentColor"`);

  // Attribute names -> JSX props, and self-close void-ish tags.
  body = body.replace(/([a-zA-Z-]+:?[a-zA-Z-]*)=/g, (m, attr) => (PROP[attr] ? `${PROP[attr]}=` : m));
  body = body.replace(/\bstyle="[^"]*"/g, "");

  names.push(name);
  out.push(
    `export function ${pascal(name)}Icon(props: IconProps) {\n` +
    `  return (\n    <svg viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>\n` +
    body.split("\n").map((l) => (l.trim() ? "      " + l.trim() : "")).filter(Boolean).join("\n") +
    `\n    </svg>\n  );\n}\n`,
  );
}

const header = `// AUTO-GENERATED from the SVGs exported from Figma (public/figma/icons).
// Regenerate with: node scripts/generate-icons.mjs
// The vector data is Figma's, untouched; only ids are namespaced and a few icons
// have their own colour swapped for currentColor so they can follow their container.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

`;

writeFileSync("src/components/icons.tsx", header + out.join("\n"));
console.log(`generated ${names.length} icons`);
