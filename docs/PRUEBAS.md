# Verificación del MVP

2026-11-07 · America/Mexico_City. Desarrollo, compilación y pruebas ejecutados por SSH en la computadora de Yael.

## Resultados locales

- `npm run build`: PASS, cero errores. Permanece una advertencia del presupuesto inicial estándar de Angular (500 kB); no se aumentó el umbral para esconderla. El presupuesto de error de 1 MB no se excede.
- `npm test -- --watch=false`: **48/48 PASS**, cinco archivos de pruebas.
- `CHROMIUM_PATH=/home/benja/.local/bin/chromium npm run test:e2e`: **7/7 PASS**, Chromium headless, build de producción.
- Catálogo: **300 alimentos + 80 ejercicios**, validación original en `public/catalogo/validacion.json`, adaptación reproducible con `tools/normalizar_catalogo.py`.
- Identidad Git: autor y committer iguales, nombre de perfil GitHub de Yael, correo noreply de su cuenta; sin trailers. `npm run verify:identity` automatiza la comprobación.

## Comportamientos comprobados

1. Ana acepta privacidad, elige bajar de peso, registra los datos mínimos y tres ingredientes. El flujo rechaza falta de consentimiento y edad menor a 18. Padecimientos/medicamentos no se muestran antes de consentimiento separado.
2. «Tu primer día» empieza en cero; Plan muestra una receta real de la despensa y fuentes USDA/Mifflin/inocuidad.
3. Un hábito crea racha de un día. Dos hábitos el mismo día no crean dos días. Registros y racha sobreviven una recarga.
4. Progreso tiene 42 fechas reales. La tarjeta de logro no contiene peso ni datos clínicos y exporta PNG de 1080×1080.
5. Racha → Eléctrico conserva OLED encendido. El fondo computado es negro puro. Alto contraste ignora y deshabilita el interruptor OLED. Un tema personalizado persiste.
6. Los alérgenos declarados y desconocidos bloquean recetas; las respuestas IA inventadas no se aceptan.
7. Modo sin conexión: tras activar el service worker y recargar, Hoy y Plan funcionan con catálogo y datos locales.
8. Borrar todo devuelve al onboarding, incluso tras recargar. La prueba de IndexedDB verifica que la clave también desaparece.
9. IA compatible se prueba con proveedor **simulado**, respuesta válida y malformada/inventada. La prueba inspecciona que no se envíen medidas, medicamentos ni padecimientos. No se usó una clave real ni se generaron cargos.
10. Recuperación ante ajustes locales corruptos: aviso, borrado explícito y onboarding de nuevo.
11. Diseño responsive móvil/escritorio, radio 0 y ausencia de desbordamiento horizontal en la historia de Ana.

## Capturas

`docs/capturas/01-*` a `13-*`: onboarding, Hoy, Plan/fuentes, Progreso, Logro, Ajustes/IA y escritorio. `14-*` a `17-*`: pantallas principales en Racha OLED, encuadre móvil. `logro-exportado.png`: archivo generado por el usuario ficticio de pruebas.

## Límites que no se presentan como terminados

- No hay validación clínica, filtrado de interacciones con medicamentos ni tratamiento de enfermedades. Los alérgenos son inferidos: etiquetas y contaminación cruzada requieren revisión humana.
- Cuatro recetas originales curadas; los 300 alimentos no implican 300 recetas. No se inventan recetas para combinaciones no cubiertas.
- IA local, backend, cuentas, sincronización, comunidad y aplicaciones nativas no forman parte de este MVP.
- CORS/costos/retención de un proveedor IA real dependen de su cuenta y servicio; no se han verificado todos. La clave local no está cifrada por la app.
- Instalación nativa de la PWA en un teléfono físico y revisión con una persona no técnica quedan pendientes. El manifest, iconos y service worker sí están integrados y el modo offline se prueba en Chromium.
- Hay una advertencia de tamaño inicial de bundle; queda como optimización, no como error de compilación.

## GitHub Pages

Demo pública: https://kyostenas.github.io/racha-app/ . La prueba `CHROMIUM_PATH=/home/benja/.local/bin/chromium node tools/smoke-pages.mjs` se ejecutó contra esa URL con resultado PASS: onboarding, receta, racha, OLED y recarga sin conexión, sin errores de página. Es una sesión aislada con datos ficticios; no se usó ninguna cuenta del navegador.

CI reproduce unidades, build y E2E; después compila con base `/racha-app/` y publica vía Actions sin crear commits de despliegue.
