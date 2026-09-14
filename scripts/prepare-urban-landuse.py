"""Usage: python3 scripts/prepare-urban-landuse.py catalog.html primary.zip ...
Source: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L03-b-u-v3_1.html
Build compact 100 m grids; zero denotes missing coverage, never residential.
"""
import sys, re, json, zipfile, struct, gzip, base64, pathlib
out = pathlib.Path('src/data/urban-landuse')
out.mkdir(parents=True, exist_ok=True)
html = pathlib.Path(sys.argv[1]).read_text()
catalog = {}
for year, primary, datum in re.findall(r'L03-b-u-(21|16)_(\d{4})-(jgd2011|jgd)_GML.zip', html):
    if primary not in catalog or year > catalog[primary]['year']:
        catalog[primary] = {'year': year, 'datum': datum}
(out/'catalog.json').write_text(json.dumps(catalog, sort_keys=True))
grids = {}
for filename in sys.argv[2:]:
    with zipfile.ZipFile(filename) as z:
        name = next(n for n in z.namelist() if n.lower().endswith('.dbf'))
        data = z.read(name)
    count, header, size = struct.unpack_from('<IHH', data, 4)
    grid = bytearray(640000)
    primary = None
    for i in range(count):
        row = data[header+i*size:header+(i+1)*size]
        mesh = row[1:11].decode(); code = row[11:15].decode()
        if row[0] == 42 or not mesh.isdigit(): continue
        primary = mesh[:4]
        r = int(mesh[4])*100 + int(mesh[6])*10 + int(mesh[8])
        c = int(mesh[5])*100 + int(mesh[7])*10 + int(mesh[9])
        grid[r*800+c] = {'0701':1,'0702':2,'0703':3,'0704':4}.get(code, 5)
    grids[primary] = base64.b64encode(gzip.compress(bytes(grid),mtime=0)).decode()
(out/'bundled.json').write_text(json.dumps(grids,sort_keys=True))
print('catalog',len(catalog),'bundled',list(grids))
