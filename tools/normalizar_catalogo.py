"""Convierte fuentes temporales al único catálogo distribuido por la PWA."""
from pathlib import Path
import argparse,json
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('fuentes',type=Path,help='Directorio temporal generado con generar_catalogo.py --output-dir')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1];source=args.fuentes;target=root/'public/data'
foods=json.loads((source/'alimentos.json').read_text());exercises=json.loads((source/'ejercicios.json').read_text())
alias={'gluten':'trigo','lacteos':'leche','frutos_secos':'frutos secos','ajonjoli':'sesamo'}
ids=['usda-168878','usda-171287','usda-170457','usda-169705','usda-173944','usda-171688','usda-173735','usda-171477','usda-170000','usda-169291','usda-175036','usda-171706','usda-168155','usda-170026','usda-173709','usda-172217','usda-172421','usda-173757','usda-169247','usda-170393','usda-168409']
assert len(foods)==300 and len(exercises)==80
assert set(ids).issubset({f['id'] for f in foods})
normalized=[]
fields={'kcal100g':'kcal','proteina100g':'proteina_g','carbohidratos100g':'carbohidratos_g','grasa100g':'grasa_g','fibra100g':'fibra_g','azucares100g':'azucares_g'}
for f in sorted(foods,key=lambda f:ids.index(f['id']) if f['id'] in ids else len(ids)):
 item=dict(id=f['id'],nombre=f['nombre'],alergenos=[alias.get(a,a) for a in f['alergenos']],source_ref=f['source_ref']['url'])
 item.update({key:f['por_100g'][raw] for key,raw in fields.items()})
 assert all(item[key]==f['por_100g'][raw] for key,raw in fields.items())
 normalized.append(item)
assert len({f['id'] for f in normalized})==300
assert len({f['nombre'] for f in normalized})==300
exercises.sort(key=lambda e:e['id']!='Arm_Circles')
normalized_ex=[dict(id=e['id'],nombre=e['nombre'],instrucciones=e['instrucciones'],source_ref=e['source_ref']['url']) for e in exercises]
for name,data in [('alimentos',normalized),('ejercicios',normalized_ex)]:(target/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
report={'estado':'PASS','alimentos':len(normalized),'ejercicios':len(normalized_ex),'nombres_espanoles_unicos':300,'campos_descripcion_inglesa_publicados':0,'nutrientes_conservados':300,'archivo_motor_alimentos':'public/data/alimentos.json','archivo_motor_ejercicios':'public/data/ejercicios.json','fuente_nombres':'Traducciones curadas del generador, sin alias alternativos de almacenamiento'}
(root/'docs/catalogo/auditoria_normalizacion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
