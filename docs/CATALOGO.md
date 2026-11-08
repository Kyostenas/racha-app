# Catálogo

El seed inicial conserva 8 alimentos del JSON oficial USDA SR Legacy de abril de 2018. Ningún nutriente se estima: valores ausentes son null. Los IDs son `usda-FDCID` y cada fila conserva la URL FDC. La avena se marca conservadoramente como trigo por riesgo de contaminación con gluten; no certifica ausencia/presencia de alérgenos en productos.

Las recetas usan IDs del seed para que sus estados de cocción sean estables. El catálogo ampliado se integra sin sustituir esos datos. Las fuentes e instrucciones de ejercicios se mantienen con su licencia.

## Catálogo ampliado integrado

300 alimentos y 80 ejercicios. Archivos originales en `public/catalogo/`, con esquema, atribuciones y validación. El script `tools/normalizar_catalogo.py` adapta campos a los esquemas de la app sin imputar nutrientes; `tools/generar_catalogo.py` conserva la reproducción original de selección y traducción. Para regenerar fuentes completas, ejecutar este último desde una carpeta temporal con jsonschema instalado y copiar solo los archivos finales.

Los ocho primeros ingredientes usan nombres abreviados para la demo, conservando IDs y estado de preparación. El resto mantiene la traducción completa. Gluten/lácteos/frutos_secos/ajonjolí se normalizan a trigo/leche/frutos secos/sésamo solo en etiquetas internas del motor. Ausentes: «sin dato». No se incluye MET ni gasto energético por ejercicio.
