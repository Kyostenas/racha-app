# Catálogo único de Racha

La PWA distribuye solo `public/data/alimentos.json` (300 alimentos) y `public/data/ejercicios.json` (80 ejercicios), además de recetas y tokens que usan la interfaz y el motor. No hay una segunda copia en `public/catalogo/` ni en el precache.

## Nombres y valores

Cada alimento tiene un único `nombre` canónico en español, tomado directamente de la traducción curada. El chip se deriva de ese mismo nombre con `shortFoodName`; el detalle muestra el nombre completo, no una variante con otro término. Jitomate rojo y tomate verde/tomatillo se mantienen como alimentos diferentes. Las dos variantes de aceite de girasol conservan su diferencia de ácido linoleico también en el chip. No se incluye `nombreOriginal`, `nombre_en` ni una descripción USDA inglesa en el catálogo distribuido. El enlace `source_ref` permite consultar la ficha original externa.

Los nutrientes por 100 g, sus estados crudo/cocido y los identificadores USDA no cambian. Ausencias se conservan como null y se muestran como «sin dato». No hay MET ni cálculo de calorías quemadas por ejercicio. Las etiquetas de alérgenos son precauciones inferidas, no certificaciones.

## Auditoría y procedencia

`docs/catalogo/auditoria_normalizacion.json`: revisión de los 300 nombres y conservación de nutrientes frente a la fuente. `docs/catalogo/validacion_fuente.json` y `schema_fuente.json`: metadatos de la selección original. `README_fuente.md`: documento original de procedencia, no instrucciones de integración de la PWA actual. Estos documentos no se publican ni se cachean en la app. Atribuciones en NOTICE.md.

`npm run build && npm run validate:catalog` verifica todos los IDs, nombres españoles únicos, chips sin colisiones, ausencia de campos ingleses, nutrientes válidos, referencias USDA y una sola copia de cada catálogo en el manifest de precache. El E2E inspecciona también la caché real y recarga Hoy y Plan sin red.

## Reproducir desde las fuentes públicas fijadas

Las fuentes intermedias se generan fuera de `public/`, en una carpeta temporal. No se vuelven a copiar al bundle.

```sh
python3 -m venv /tmp/racha-catalogo-env
/tmp/racha-catalogo-env/bin/pip install jsonschema==4.25.1
fuentes=$(mktemp -d)
/tmp/racha-catalogo-env/bin/python tools/generar_catalogo.py --output-dir "$fuentes"
python3 tools/normalizar_catalogo.py "$fuentes"
npm run build
npm run validate:catalog
```

El generador comprueba los SHA-256 de USDA SR Legacy y free-exercise-db antes de seleccionar y traducir. El normalizador mantiene exactamente los nutrientes originales y produce únicamente los JSON que usa el motor. No necesita claves, cuentas ni backend.
