# Catálogo estático de Progresium

Material para una PWA escolar en español de México. **300 alimentos y 80 ejercicios**. No se modificó ningún repositorio. Sin claves de API, backend, imágenes descargadas ni datos de wger.

## Archivos e integración

- `alimentos.json`: arreglo de alimentos; importar a un object store de IndexedDB con `keyPath: 'id'`.
- `ejercicios.json`: arreglo de ejercicios, con el mismo criterio de clave.
- `schema.json`: JSON Schema draft 2020-12. Su raíz valida cualquiera de los dos arreglos mediante `oneOf`; también pueden usarse `#/$defs/alimentos` y `#/$defs/ejercicios`.
- `generar_catalogo.py`: selección explícita de IDs, traducciones manuales, descarga pública, comprobación SHA-256, generación y validación.
- `validacion.json`: resultado de los controles, distribuciones y lista completa de nutrientes ausentes. No hace falta incluirlo en el bundle.
- `README.md`: este documento.

Los JSON son UTF-8, con sangría de dos espacios y salto de línea final. No se incluyen las fuentes completas, imágenes ni dependencias en el catálogo final.

## Campos de alimentos

`id`: slug estable `usda-<fdc_id>`, independiente de la traducción. `nombre`: nombre natural en español, indicando estado o preparación; `nombre_en`: descripción íntegra de USDA, sin traducir. `categoria`: uno de los 12 grupos de abajo. `por_100g`: kcal (energía), proteína, grasa, carbohidratos, fibra y azúcares en g, y sodio en mg. Los carbohidratos corresponden a **Carbohydrate, by difference**, no a carbohidratos netos. `null` significa ausente, no cero; los ceros publicados se conservan. No se calculan nutrientes faltantes ni energía a partir de macronutrientes.

`alergenos`: etiquetas de precaución dentro de este vocabulario fijo: gluten, lacteos, huevo, cacahuate, frutos_secos, soya, pescado, mariscos, ajonjoli. No equivale a una certificación de ausencia de alérgenos. `source_ref` incluye fuente, dataset, FDC ID, URL individual y licencia.

### Distribución de alimentos
- bebidas: 10
- carnes: 30
- cereales: 37
- frutas: 46
- grasas: 15
- huevo: 5
- lacteos: 25
- leguminosas: 20
- otros: 10
- pescados: 20
- semillas: 15
- verduras: 67

## Campos de ejercicios

`id`: identificador original, sin cambios. `nombre`: traducción al español; `nombre_en`: nombre original. `nivel`: principiante/intermedio/experto, traducido directamente de la fuente (esta selección no incluye expertos). `equipo`: equipo necesario en español; se aclaran bancos, barras y otros apoyos mencionados en los pasos aunque la fuente diga solo peso corporal o no declare equipo. `categoria`: fuerza, estiramientos, cardio o pliometría según la clasificación de origen, no una reclasificación clínica. `musculos_primarios` y `musculos_secundarios`: grupos traducidos. `instrucciones`: pasos operativos traducidos y resumidos sin cambiar el movimiento. Se omiten publicidad, referencias editoriales sin contexto y ejemplos calóricos genéricos no verificados; las estimaciones que haga una máquina no son mediciones clínicas. No se añade `met` porque no se verificó una correspondencia concreta con el Compendium of Physical Activities.

`imagenes_ref`: rutas relativas originales **solo como referencia**, sin descargar ni incluir imágenes ni afirmar derechos sobre ellas; la app no debe solicitarlas automáticamente. `source_ref`: fuente, identificador, URL del JSON fijada a una revisión y licencia.

Distribución: cardio: 10, estiramientos: 22, fuerza: 43, pliometría: 5. Niveles: {'intermedio': 7, 'principiante': 73}. La mayoría usa peso corporal o apoyos domésticos; se incluyen 10 ejercicios con mancuernas y 10 de cardio (varios con máquina). Se cubren abdomen, espalda, pecho, hombros, brazos, glúteos, muslos y pantorrillas. La selección tiene énfasis en abdomen y movilidad; **no es un programa de entrenamiento equilibrado ni una prescripción automática**.

## Fuentes, versiones y licencias

1. USDA Agricultural Research Service, FoodData Central, **SR Legacy, versión final abril de 2018**. Descarga oficial: https://fdc.nal.usda.gov/download-datasets ; archivo: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip. Aunque algunas fichas tienen publicación FDC de 2019, el dataset es SR Legacy 2018. Nutrientes por 100 g de porción comestible, conservados tal como aparecen en el archivo. Licencia CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . Confirmación oficial: https://fdc.nal.usda.gov/api-guide (sección Licensing).
2. yuhonas/free-exercise-db, revisión `79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142`, `dist/exercises.json`: https://raw.githubusercontent.com/yuhonas/free-exercise-db/79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142/dist/exercises.json. Repositorio: https://github.com/yuhonas/free-exercise-db . Unlicense: https://github.com/yuhonas/free-exercise-db/blob/79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142/LICENSE.md . Solo datos textuales y rutas de referencia, no imágenes ni código de terceros.

### Texto listo para NOTICE.md

> Datos de alimentos: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019, fdc.nal.usda.gov. Selección de SR Legacy (abril de 2018), datos de dominio público publicados bajo CC0 1.0 Universal. Nombres traducidos al español para Progresium. USDA no avala esta aplicación.
>
> Datos de ejercicios: yuhonas/free-exercise-db y sus colaboradores, https://github.com/yuhonas/free-exercise-db, revisión 79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142. Datos publicados bajo Unlicense (dominio público), sin garantía. Selección y traducción resumida al español para Progresium. No se incluyen imágenes. Los autores originales no avalan esta aplicación.

La atribución se conserva por trazabilidad, aunque CC0 y Unlicense no la exijan como condición general. La licencia del código de la app se decide por separado; no cambia la procedencia de los datos.

## Reproducción y validación

Requiere Python 3.10+ y `jsonschema==4.25.1`. Para mantener todas las escrituras dentro de esta carpeta, desde ella:

```bash
mkdir -p _tmp
TMPDIR="$PWD/_tmp" PYTHONDONTWRITEBYTECODE=1 python3 -m pip install --no-cache-dir --no-compile --target "$PWD/_dependencias" jsonschema==4.25.1
PYTHONDONTWRITEBYTECODE=1 python3 generar_catalogo.py
```

Con `jsonschema` ya disponible, basta el último comando. La descarga se procesa **en memoria**: no usa API autenticada ni cachés. Primero compara hashes SHA-256 esperados; si cambian los bytes de una fuente, se detiene, no actualiza los valores a ciegas. La selección y traducción están dentro del script y no dependen de servicios de traducción. Construye ambos JSON y el esquema; después **reabre los archivos**, valida con `Draft202012Validator`, comprueba conteos, IDs/nombres únicos, referencias y energía numérica. `validacion.json` registra el resultado. Repetir con las mismas fuentes produce los mismos archivos.

SHA-256 USDA: `0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef`. SHA-256 ejercicios: `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`.

## Precauciones

- Valores por **100 g de porción comestible**, no por pieza, taza, porción habitual ni 100 ml. En bebidas no asumir que g y ml son intercambiables sin densidad. Respetar crudo/cocido, escurrido, con piel y otros estados al elegir una ficha. Las variantes crudas/cocidas son registros distintos, no duplicados.
- Son alimentos de referencia estadounidenses: no representan exactamente todas las marcas, recetas o variedades mexicanas. Bolillo, tortilla, horchata y hummus son referencias genéricas, no recetas universales. No sustituir un alimento por otro solo por similitud del nombre.
- Alérgenos derivados de la identidad del alimento de forma conservadora: avena marcada gluten por precaución de contaminación; aceites de soya y ajonjolí, lácteos clarificados y coco se marcan por precaución aunque el refinado, las proteínas residuales y las clasificaciones regulatorias varíen. Horchata se marca lacteos/frutos_secos por recetas posibles, **no por confirmación analítica**. Los panes y pastas pueden contener ingredientes adicionales que la descripción no identifica. Un arreglo vacío **no garantiza** que el alimento sea seguro. Antes de consumo, confirmar etiquetas/recetas y contaminación cruzada. No usar este catálogo como único filtro de seguridad para alergias graves.
- Los frijoles y otras leguminosas secos/crudos son referencias nutricionales; requieren preparación y cocción adecuadas, no se recomiendan para comer crudos. Lo mismo aplica a carnes, pescado y huevo crudos: no son una recomendación de consumo sin cocción.
- Las etiquetas de nivel son las de la fuente, no una evaluación individual: algunas dominadas, fondos, saltos y variantes abdominales pueden ser exigentes aunque estén marcadas como principiante. No automatizar recomendaciones por esa etiqueta. La fuente incluye criterios de rodilla y respiración discutibles o dependientes del contexto, conservados como atribución, no como consejo médico. Conviene revisión profesional antes de uso con personas reales; no prometer una rutina validada clínicamente.
- No sustituye asesoría médica, nutricional ni de entrenamiento. Evitar dolor, adaptar la actividad a la persona y buscar orientación profesional cuando corresponda.

## Nutrientes ausentes

25 alimentos tienen al menos un nutriente ausente; todos tienen kcal numéricas. Lista completa (no se imputó cero):

- `usda-169383` — Pimiento amarillo crudo: azucares_g.
- `usda-169270` — Flor de calabaza cruda: fibra_g, azucares_g.
- `usda-169916` — Naranja Valencia cruda: azucares_g.
- `usda-167750` — Tuna cruda: azucares_g.
- `usda-170683` — Amaranto cocido: azucares_g.
- `usda-170286` — Trigo sarraceno crudo: azucares_g.
- `usda-168920` — Maíz blanco en grano seco: fibra_g, azucares_g.
- `usda-169699` — Cuscús seco: azucares_g.
- `usda-169705` — Avena en grano cruda: azucares_g.
- `usda-168873` — Salvado de avena cocido: azucares_g.
- `usda-168874` — Quinoa cruda: azucares_g.
- `usda-168901` — Pasta casera con huevo cocida: fibra_g, azucares_g.
- `usda-168902` — Pasta casera sin huevo cocida: fibra_g, azucares_g.
- `usda-174284` — Lenteja roja seca cruda: azucares_g.
- `usda-169282` — Soya verde cruda: azucares_g.
- `usda-172441` — Soya tostada en seco: azucares_g.
- `usda-172475` — Tofu firme con sulfato de calcio: azucares_g.
- `usda-167902` — Carne molida de cerdo cruda: azucares_g.
- `usda-173686` — Salmón del Atlántico silvestre crudo: azucares_g.
- `usda-171998` — Salmón del Atlántico silvestre cocido con calor seco: azucares_g.
- `usda-175179` — Camarón crudo: fibra_g, azucares_g.
- `usda-175180` — Camarón cocido: fibra_g, azucares_g.
- `usda-174204` — Jaiba azul cruda: azucares_g.
- `usda-173573` — Aceite de aguacate: azucares_g.
- `usda-170554` — Chía seca: azucares_g.
