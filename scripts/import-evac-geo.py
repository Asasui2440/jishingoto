"""国土地理院の限定地域GeoJSONを取り込む。取得したJSは実行せず配列だけをJSONとして読む。"""
from pathlib import Path
from urllib.request import urlopen
import json, re, hashlib, math, datetime

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/data/evac-geo'
BASE='https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification1'
REGIONS=[
 {'id':'tokyo-bunkyo','name':'東京・文京周辺','center':{'lat':35.7186,'lng':139.7237},'xs':[14550,14551],'ys':[6448,6449]},
 {'id':'kanagawa-yokohama','name':'神奈川・横浜駅周辺','center':{'lat':35.4658,'lng':139.6223},'xs':[14546,14547],'ys':[6462,6463]},
]
def read(url):
 with urlopen(url,timeout=30) as r:return r.read()
def lat(y):return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/16384))))
def bounds(x,y):return [x/16384*360-180,lat(y+1),(x+1)/16384*360-180,lat(y)]
def pairs(value):
 if isinstance(value[0],(int,float)):yield value
 else:
  for item in value:yield from pairs(item)
def categories(name):
 result=[]
 if any(x in name for x in ['山地','崖','地すべり','切土地','農耕平坦']):result.append('slope')
 if any(x in name for x in ['低地','旧河道','後背','湿地','埋立','干拓','氾濫','砂州','砂丘','扇状地']):result.append('liquefaction')
 if any(x in name for x in ['低地','後背','湿地','埋立','干拓','氾濫']):result.append('shaking')
 return result
style=read(BASE+'/style.js').decode('utf8')
classes={}
for match in re.finditer(r'^\s*(\[\d+,"[^\n]+\]),?\s*$',style,re.M):
 try:
  row=json.loads(match.group(1))
  if len(row)==4:classes[str(row[0])]={'name':row[1],'formation':row[2],'risk':row[3],'categories':categories(row[1])}
 except json.JSONDecodeError:continue
assert len(classes)>50,'Official classification table not recognized'
OUT.mkdir(parents=True,exist_ok=True)
regions=[]
for cfg in REGIONS:
 features=[];tiles=[]
 for x in cfg['xs']:
  for y in cfg['ys']:
   url=f'{BASE}/14/{x}/{y}.geojson';raw=read(url);tile=json.loads(raw)
   assert tile['type']=='FeatureCollection' and tile['features']
   tiles.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'bounds':bounds(x,y)})
   for feature in tile['features']:
    code=str(feature.get('properties',{}).get('code',''));definition=classes.get(code)
    geom=feature.get('geometry')
    if not definition or not definition['risk'] or geom['type'] not in ['Polygon','MultiPolygon']:continue
    coords=list(pairs(geom['coordinates']))
    if not coords:continue
    bbox=[min(p[0] for p in coords),min(p[1] for p in coords),max(p[0] for p in coords),max(p[1] for p in coords)]
    digest=hashlib.sha256(json.dumps(geom,sort_keys=True).encode()).hexdigest()[:14]
    features.append({'id':f'gsi-{x}-{y}-{code}-{digest}','code':code,'classification':definition['name'],'formation':definition['formation'],'risk':definition['risk'],'categories':definition['categories'],'bbox':bbox,'geometry':geom})
   print(cfg['id'],x,y,'features',len(tile['features']),'bytes',len(raw),flush=True)
 version=hashlib.sha256(''.join(t['sha256'] for t in tiles).encode()).hexdigest()[:16]
 region={'id':cfg['id'],'name':cfg['name'],'center':cfg['center'],'bounds':[min(t['bounds'][0] for t in tiles),min(t['bounds'][1] for t in tiles),max(t['bounds'][2] for t in tiles),max(t['bounds'][3] for t in tiles)],'version':version,'downloadedAt':datetime.date.today().isoformat(),'sourceUpdatedAt':None,'featureCount':len(features),'tiles':tiles,'features':features}
 regions.append(region)
output={'source':{'name':'国土地理院：地形分類（自然地形）を加工して作成','url':'https://www.gsi.go.jp/bousaichiri/lfc_index.html','licenseUrl':'https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html'},'regions':regions}
path=OUT/'regions.json';path.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
print('Saved',path,'bytes',path.stat().st_size,'features',sum(r['featureCount'] for r in regions))
