import {copyFile,mkdir} from 'node:fs/promises';
const dest=new URL('../public/offline-evac/vendor/',import.meta.url);
await mkdir(dest,{recursive:true});
for(const file of ['maplibre-gl.mjs','maplibre-gl-shared.mjs','maplibre-gl-worker.mjs','maplibre-gl.css'])await copyFile(new URL(`../node_modules/maplibre-gl/dist/${file}`,import.meta.url),new URL(file,dest));
await copyFile(new URL('../node_modules/maplibre-gl/LICENSE.txt',import.meta.url),new URL('LICENSE-maplibre.txt',dest));
console.log('オフライン用MapLibreアセットを同期しました。sw.jsのCACHEバージョンも更新してください。');
