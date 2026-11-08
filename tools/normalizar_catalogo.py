"""Adapta el catálogo fuente sin alterar nutrientes ni inventar datos."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
source=root/'public/catalogo'; target=root/'public/data'
foods=json.loads((source/'alimentos.json').read_text())
exercises=json.loads((source/'ejercicios.json').read_text())
alias={'gluten':'trigo','lacteos':'leche','frutos_secos':'frutos secos','ajonjoli':'sesamo'}
short={'usda-168878':'Arroz blanco cocido','usda-171287':'Huevo entero crudo','usda-170457':'Tomate rojo crudo','usda-169705':'Avena cruda','usda-173944':'Plátano crudo','usda-171688':'Manzana con cáscara','usda-173735':'Frijoles negros cocidos','usda-171477':'Pechuga de pollo asada'}
ids=list(short)
assert len(foods)==300 and len(exercises)==80
assert set(ids).issubset({f['id'] for f in foods}), 'Falta ingrediente curado'
normalized=[]
for f in sorted(foods,key=lambda f:ids.index(f['id']) if f['id'] in ids else len(ids)):
 n=f['por_100g']
 normalized.append(dict(id=f['id'],nombre=short.get(f['id'],f['nombre']),nombreOriginal=f['nombre_en'],kcal100g=n['kcal'],proteina100g=n['proteina_g'],carbohidratos100g=n['carbohidratos_g'],grasa100g=n['grasa_g'],fibra100g=n['fibra_g'],azucares100g=n['azucares_g'],alergenos=[alias.get(a,a) for a in f['alergenos']],source_ref=f['source_ref']['url']))
# Solo círculos de brazos como ejemplo inicial; el resto se puede consultar, no es una rutina prescrita.
exercises.sort(key=lambda e: e['id']!='Arm_Circles')
normalized_ex=[dict(id=e['id'],nombre=e['nombre'],instrucciones=e['instrucciones'],source_ref=e['source_ref']['url']) for e in exercises]
for name,data in [('alimentos',normalized),('ejercicios',normalized_ex)]:
 (target/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(f'Integrados {len(normalized)} alimentos y {len(normalized_ex)} ejercicios. Nulls conservados.')
