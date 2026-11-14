#!/usr/bin/env python3
"""v0.4.4: catálogo sin distinción crudo/cocido y con ingredientes comunes en México.

Parte de la selección fijada en generar_catalogo.py (USDA SR Legacy 2018, SHA-256 verificado),
fusiona las variantes de estado de un mismo ingrediente en una sola entrada (los IDs viejos quedan
como alias para migrar despensas guardadas), agrega ingredientes mexicanos tomados de SR Legacy y
de Foundation Foods (FDC, abril 2026, SHA-256 verificado) y escribe:
  public/data/alimentos.json, src/app/alimentos-alias.ts, docs/catalogo/ampliacion_mx.json
Uso: python3 tools/ampliar_catalogo_mx.py [--sr ZIP] [--foundation ZIP]
Sin argumentos descarga los archivos oficiales. No inventa valores: si falta un nutriente queda null.
"""
import argparse, hashlib, io, json, re, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SR_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"
SR_SHA = "0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef"
FND_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip"
FND_SHA = "186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a"
ALIAS_ALERGENOS = {'gluten': 'trigo', 'lacteos': 'leche', 'frutos_secos': 'frutos secos', 'ajonjoli': 'sesamo'}

# Ingrediente canónico | nombre sin estado | IDs que se fusionan en él.
# Regla: granos, leguminosas, carnes y pescados usan el valor ya preparado (lo que se pesa al servir);
# verduras y frutas usan el valor fresco. El huevo usa el valor del huevo sin cáscara.
MERGE = """
170457|Jitomate rojo|170050
171477|Pechuga de pollo sin piel|171478
168389|Espárragos|168390
169145|Betabel|169146
169255|Hongos portobello|169243
170683|Amaranto|170682
170285|Cebada perlada|170284
168872|Salvado de avena|168873
168917|Quinoa|168874
169704|Arroz integral|169703
168914|Fideos de arroz|169742
168910|Pasta integral|169738
172441|Soya|174270
171054|Pollo sin piel|171052,171451
171075|Pechuga de pollo con piel|171474
173612|Pierna de pollo con piel|172373
173625|Muslo de pollo con piel|172385
172388|Muslo de pollo sin piel|172389
173630|Ala de pollo con piel|172390
171481|Carne de pavo sin piel|171480
167903|Carne molida de cerdo|167902
167905|Filete de cerdo con grasa|168312
168250|Filete magro de cerdo|168249
171794|Carne molida de res (90 % magra)|174030
174031|Hamburguesa de res (90 % magra)|171793
175168|Salmón de cultivo|175167
171998|Salmón silvestre|173686
175177|Tilapia (mojarra)|175176
171956|Bacalao|171955
173718|Trucha arcoíris|173717
175180|Camarón|175179
174205|Jaiba|174204
168571|Nopales|169388
173735|Frijol negro|173734
175200|Frijol pinto|175199
175194|Frijol rojo|173744
175203|Frijol blanco (alubia)|175202
172421|Lenteja|172420,174284
173757|Garbanzo|173756
168482|Camote|168484
170026|Papa|170030
171287|Huevo entero|173424,172187
169700|Cuscús|169699
170287|Bulgur|170688
170557|Pepitas de calabaza|170556
"""

# Nombres limpios para entradas que no se fusionan (se quita el estado o se simplifica).
RENAME = {
    '168878': 'Arroz blanco', '169705': 'Avena en hojuelas', '175036': 'Tortilla de maíz',
    '175037': 'Tortilla de harina de trigo', '174081': 'Tortilla de trigo integral',
    '171706': 'Aguacate (California, tipo Hass)', '171707': 'Aguacate de Florida', '172430': 'Cacahuate',
    '170554': 'Chía', '170150': 'Ajonjolí', '170162': 'Nuez de la India', '170184': 'Pistaches',
    '170569': 'Nuez de Brasil', '170562': 'Semillas de girasol', '170169': 'Coco (pulpa)',
    '170288': 'Maíz amarillo en grano', '168920': 'Maíz blanco en grano', '169282': 'Soya verde (edamame)',
    '172006': 'Atún aleta amarilla', '170000': 'Cebolla', '169975': 'Col blanca (repollo)',
    '172183': 'Clara de huevo', '172184': 'Yema de huevo', '175140': 'Sardina en salsa de jitomate',
    '175139': 'Sardina en aceite', '173709': 'Atún en agua (lata)', '173708': 'Atún en aceite (lata)',
    '171972': 'Camarón enlatado', '169246': 'Poro', '170005': 'Cebollita cambray',
    '168566': 'Tomate verde (tomatillo)', '171328': 'Orégano', '170923': 'Comino', '171320': 'Canela molida',
    '168013': 'Pan multigrano', '174078': 'Bolillo', '172223': 'Queso fresco',
    '172217': 'Leche entera', '171265': 'Leche entera con vitamina D', '173647': 'Agua potable',
}

# Fuente | FDC ID | nombre | grupo | alérgenos
NEW = """
sr|169997|Cilantro|verduras|
sr|169398|Epazote|verduras|
sr|169396|Chile ancho|verduras|
sr|168579|Chile pasilla|verduras|
fnd|2747662|Chile poblano|verduras|
fnd|2747660|Chile güero|verduras|
fnd|1999634|Jitomate saladet (roma)|verduras|
fnd|790577|Cebolla morada|verduras|
sr|169274|Verdolagas|verduras|
sr|169244|Quelites (quelite cenizo)|verduras|
sr|169985|Yuca|verduras|
sr|168170|Flor de jamaica|otros|
sr|171946|Agua de jamaica sin azúcar|bebidas|
sr|169098|Jugo de naranja natural|bebidas|
sr|167763|Tamarindo|frutas|
sr|167760|Mamey|frutas|
sr|167759|Chicozapote|frutas|
sr|167761|Guanábana|frutas|
sr|173953|Chirimoya|frutas|
fnd|2710834|Mango Ataulfo|frutas|
sr|169131|Plátano macho|frutas|
sr|173753|Habas|leguminosas|
sr|172429|Alverjón (chícharo partido)|leguminosas|
sr|172438|Frijoles refritos (lata)|leguminosas|
sr|169701|Maíz pozolero|cereales|
sr|169694|Harina de maíz nixtamalizado (masa)|cereales|
sr|167525|Tostadas de maíz|cereales|
sr|167558|Totopos de maíz|cereales|
sr|169737|Pasta para sopa (fideo)|cereales|trigo
sr|174924|Pan blanco de caja|cereales|trigo
sr|172224|Queso blanco|lacteos|leche
sr|172222|Queso seco|lacteos|leche
fnd|2647441|Queso Oaxaca|lacteos|leche
sr|171269|Leche descremada|lacteos|leche
sr|171267|Leche semidescremada (2 %)|lacteos|leche
sr|168649|Bistec de res (pulpa magra)|carnes|
sr|168611|Arrachera de res|carnes|
sr|170615|Res para guisar (espaldilla magra)|carnes|
sr|167846|Maciza de cerdo (espaldilla magra)|carnes|
sr|168626|Hígado de res|carnes|
sr|175304|Cabrito|carnes|
fnd|746781|Chorizo de cerdo|carnes|
sr|167961|Chicharrón de cerdo|carnes|
sr|173864|Jamón de cerdo|carnes|
sr|168092|Jamón de pavo|carnes|
sr|171625|Salchicha de pavo|carnes|
sr|174249|Pulpo|pescados|mariscos
sr|171401|Manteca de cerdo|grasas|
sr|171009|Mayonesa|grasas|huevo
sr|170170|Coco rallado sin azúcar|semillas|frutos secos
sr|171824|Salsa verde lista|otros|
sr|174524|Salsa roja lista|otros|
sr|171319|Chile en polvo|otros|
sr|171325|Ajo en polvo|otros|
sr|170917|Laurel|otros|
"""

NOTAS = {
    'listo': 'Valores por 100 g ya preparado, como se sirve.',
    'avena': 'Valores por 100 g de hojuela antes de prepararla.',
    'huevo': 'Valores por 100 g de huevo sin cáscara.',
}

STATE = re.compile(r'\s*\b(crud[oa]s?|cocid[oa]s?( con calor (seco|húmedo))?|hervid[oa]s?( y escurrid[oa]s?)?( sin sal)?'
                   r'|rostizad[oa]s?|guisad[oa]s?|hornead[oa]s?|a la parrilla|dorada en sartén|cocida en sartén|asada'
                   r'|secos?|secas?|tostad[oa]s? en seco)\b', re.I)


def fetch(url, sha, path):
    data = Path(path).read_bytes() if path else urllib.request.urlopen(url, timeout=180).read()
    if hashlib.sha256(data).hexdigest() != sha:
        raise SystemExit(f'La fuente cambió: {url}')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return json.loads(z.read(z.namelist()[0]))


def nutrients(food):
    amounts = {}
    for n in food.get('foodNutrients', []):
        nid = (n.get('nutrient') or {}).get('id')
        if nid is not None and n.get('amount') is not None:
            amounts[nid] = n['amount']
    first = lambda *ids: next((amounts[i] for i in ids if i in amounts), None)
    r = lambda v, d=2: None if v is None else round(float(v), d)
    return {
        'kcal100g': r(first(1008, 2047, 2048), 1), 'proteina100g': r(first(1003)),
        'carbohidratos100g': r(first(1005)), 'grasa100g': r(first(1004)), 'fibra100g': r(first(1079)),
        'azucares100g': r(first(2000, 1063)), 'sodio_mg100g': r(first(1093), 1),
    }


def base_selection():
    src = (ROOT / 'tools/generar_catalogo.py').read_text(encoding='utf-8')
    block = src[src.index('FOODS = {'):src.index('\n}\n', src.index('FOODS = {'))]
    rows = []
    for m in re.finditer(r'"(\w+)": """(.*?)"""', block, re.S):
        for line in m.group(2).strip().splitlines():
            f = line.split('|')
            alerg = [ALIAS_ALERGENOS.get(a, a) for a in f[2].split(',')] if len(f) > 2 and f[2] else []
            rows.append((f[0], f[1], m.group(1), alerg))
    assert len(rows) == 300
    return rows


def usos(f):
    n = f['nombre'].lower(); g = f['grupo']; u = set()
    has = lambda *ws: any(w in n for w in ws)
    if has('tortilla'): u |= {'base', 'tortilla'}
    if has('tostadas de maíz'): u |= {'base', 'tostada'}
    if has('totopos'): u |= {'base', 'tostada'}
    if n.startswith(('arroz', 'quinoa', 'cuscús', 'bulgur', 'cebada', 'fideos de arroz')): u |= {'base', 'grano'}
    if n.startswith(('pasta', 'maíz pozolero')): u |= {'base', 'grano'}
    if has('bolillo', 'pan multigrano', 'pan blanco'): u |= {'base', 'pan'}
    if n.split(' ')[0] in ('papa', 'camote', 'yuca', 'elote') or n.startswith('plátano macho'): u |= {'base', 'tuberculo'}
    if n.startswith(('avena en', 'amaranto', 'salvado de avena')): u |= {'cereal'}
    if g in ('carnes',): u |= {'proteina', 'carne'}
    if g == 'pescados': u |= {'proteina', 'pescado'}
    if g == 'huevo' and not has('yema'): u |= {'proteina', 'huevo'}
    if g == 'leguminosas' and not has('hummus'): u |= {'proteina', 'leguminosa'}
    if has('tofu'): u |= {'proteina'}
    if g == 'lacteos' and n.startswith('queso'):
        u |= {'queso'}
        if has('fresco', 'oaxaca', 'asadero', 'blanco', 'cottage', 'ricotta', 'panela', 'mozzarella'): u |= {'queso_fresco'}
    if g == 'lacteos' and n.startswith(('leche', 'yogur')): u |= {'lacteo'}
    if n.startswith('yogur'): u |= {'yogur'}
    if has('bebida de arroz', 'bebida de almendra'): u |= {'lacteo'}
    if g == 'verduras':
        if has('poblano', 'chile güero'): u |= {'verdura'}
        if has('chile', 'cilantro', 'epazote', 'cebolla', 'ajo', 'perejil', 'cebollita', 'poro'): u |= {'sazon'}
        elif not u & {'base'}: u |= {'verdura'}
        if has('lechuga', 'espinaca', 'acelga', 'berro', 'col ', 'col rizada', 'berza', 'quelite', 'verdolaga'): u |= {'hoja'}
        if n.startswith(('jitomate', 'tomate verde')): u |= {'salsa_base'}
    if g == 'frutas' and not u & {'base'}:
        u |= {'fruta'}
        if has('limón'): u = (u - {'fruta'}) | {'sazon'}
        if has('pasas', 'dátil', 'tamarindo'): u |= {'fruta_seca'}
    if g == 'grasas' or n.startswith('crema'): u |= {'grasa'}
    if has('aguacate') and 'aceite' not in n: u |= {'aguacate'}
    if g == 'semillas': u |= {'semilla'}
    if has('salsa verde lista', 'salsa roja lista'): u |= {'sazon', 'salsa_base'}
    if g == 'otros' and has('chile en polvo', 'ajo en polvo', 'laurel', 'orégano', 'comino', 'pimienta', 'canela'): u |= {'sazon'}
    if has('miel', 'azúcar blanca', 'azúcar morena'): u |= {'endulzante'}
    if has('embutido', 'chorizo', 'jamón', 'salchicha', 'chicharrón'): u |= {'procesado'}
    if has('añejo', 'cotija', 'parmesano', 'cheddar', 'gouda', 'chihuahua', 'queso seco'): u |= {'queso_madurado'}
    if g == 'bebidas': u |= {'bebida'}
    return sorted(u)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--sr'); ap.add_argument('--foundation')
    a = ap.parse_args()
    sr = {x['fdcId']: x for x in fetch(SR_URL, SR_SHA, a.sr)['SRLegacyFoods'] if x}
    fnd = {x['fdcId']: x for x in fetch(FND_URL, FND_SHA, a.foundation)['FoundationFoods'] if x}

    base = base_selection()
    merges = {}
    alias = {}
    for line in MERGE.strip().splitlines():
        cid, name, olds = line.split('|')
        merges[cid] = name
        for o in olds.split(','):
            alias[f'usda-{o}'] = f'usda-{cid}'
    out = []
    for fid, nombre, grupo, alerg in base:
        key = f'usda-{fid}'
        if key in alias:
            continue
        name = merges.get(fid) or RENAME.get(fid) or re.sub(r'\s+', ' ', STATE.sub('', nombre)).strip(' ,')
        f = {'id': key, 'nombre': name, 'alergenos': alerg,
             'source_ref': f'https://fdc.nal.usda.gov/food-details/{fid}/nutrients', 'grupo': grupo}
        f.update(nutrients(sr[int(fid)]))
        out.append(f)
    added = []
    for line in NEW.strip().splitlines():
        src, fid, name, grupo, alerg = line.split('|')
        food = (sr if src == 'sr' else fnd)[int(fid)]
        f = {'id': f'usda-{fid}', 'nombre': name, 'alergenos': [x for x in alerg.split(',') if x],
             'source_ref': f'https://fdc.nal.usda.gov/food-details/{fid}/nutrients', 'grupo': grupo}
        f.update(nutrients(food))
        assert f['kcal100g'] is not None, fid
        out.append(f); added.append({'id': f['id'], 'nombre': name, 'fuente': 'SR Legacy 2018' if src == 'sr' else 'Foundation Foods 2026-04', 'descripcion_usda': food['description']})
    for f in out:
        num = f['id'].split('-')[1]
        prepared = re.search(r'cooked|roasted|braised|broiled|grilled|boiled|baked|pan-fried|canned', (sr.get(int(num)) or fnd.get(int(num)) or {}).get('description', ''), re.I)
        if f['id'] == 'usda-169705': f['nota'] = NOTAS['avena']
        elif f['grupo'] == 'huevo': f['nota'] = NOTAS['huevo']
        elif prepared and f['grupo'] in ('cereales', 'leguminosas', 'carnes', 'pescados'): f['nota'] = NOTAS['listo']
        f['usos'] = usos(f)
    ids = [f['id'] for f in out]; names = [f['nombre'] for f in out]
    assert len(set(ids)) == len(ids), 'IDs duplicados'
    dup = sorted({n for n in names if names.count(n) > 1})
    assert not dup, dup
    bad = [n for n in names if re.search(r'\b(crud|cocid|hervid)', n, re.I)]
    assert not bad, bad
    assert all(v in ids for v in alias.values())
    order = {'usda-168878': 0, 'usda-171287': 1, 'usda-170457': 2}
    out.sort(key=lambda f: order.get(f['id'], 3))
    (ROOT / 'public/data/alimentos.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    ts = ['// Generado por tools/ampliar_catalogo_mx.py. IDs crudo/cocido de v0.4.3 → ingrediente único de v0.4.4.',
          'export const FOOD_ALIASES: Readonly<Record<string, string>> = {']
    ts += [f"  '{k}': '{v}'," for k, v in sorted(alias.items())]
    ts += ['};', '']
    (ROOT / 'src/app/alimentos-alias.ts').write_text('\n'.join(ts), encoding='utf-8')
    report = {'estado': 'PASS', 'entradas_v043': 300, 'ids_fusionados_como_alias': len(alias),
              'ingredientes_v043_sin_duplicados_de_estado': 300 - len(alias), 'agregados_mexicanos': len(added),
              'ingredientes_v044': len(out),
              'fuentes': {'SR Legacy 2018 (CC0)': SR_SHA, 'Foundation Foods 2026-04-30 (CC0)': FND_SHA},
              'regla_estado': 'Granos, leguminosas, carnes y pescados con valor ya preparado; verduras y frutas frescas.',
              'agregados': added, 'alias': alias}
    (ROOT / 'docs/catalogo/ampliacion_mx.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('agregados', 'alias')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
