# Progresium ■

**Demo pública:** https://kyostenas.github.io/racha-app/

Pequeños pasos. Grandes rachas. Prototipo educativo de Tecnologías de Información, LAMAR.

**No sustituye a tu médico.** Solo para adultos; no es dispositivo médico ni dieta clínica. No evalúa interacciones farmacológicas ni valida padecimientos.

## Ejecutar

Node 22.22+ o 24/26 y npm. Angular 22 standalone, sin backend.

```sh
npm ci
npm start
# http://localhost:4200
npm test -- --watch=false
npm run build
npm run test:e2e
```

Para verificar PWA/offline, usa la compilación de producción, no `ng serve` en modo desarrollo. `npm run preview` sirve el build. En HTTPS o localhost se registra Angular Service Worker. Abre una vez con conexión, espera la activación del worker y recarga; después la app y el catálogo funcionan sin red. La instalación depende del navegador (Chrome: menú «Instalar app»; Safari iOS: «Agregar a inicio»).

## Qué funciona

- Onboarding de 3 pasos, consentimiento local y separado para información opcional de salud; «Tu primer día».
- Hábitos persistentes y reversibles; racha por **días consecutivos con al menos un hábito**, no por clics. Calendario de 42 días sin datos ficticios.
- Despensa, recetas curadas con fuentes, cantidades y energía de ingredientes según USDA. Solo aparecen si están todos los ingredientes y pasan exclusiones.
- Mifflin–St Jeor: estimación opcional de **energía en reposo**, no gasto total ni meta de ingesta; omitida con padecimientos/medicamentos declarados. No se modifica la alimentación por la intención de peso del onboarding.
- Once temas predeterminados (Progresium, Menta, Eléctrico, Talavera, Aguacate, Cempasúchil, Jamaica, Añil, Copal, Cacao y Alto contraste), OLED como `data-oled` independiente de `data-tema`; Mis temas con editor de cuatro colores, contraste WCAG AA, exportar/importar JSON. **Tecla T** (fuera de campos de texto) recorre todos los predeterminados y luego los temas propios.
- Tarjeta de logro PNG 1080×1080 sin datos de salud, descarga o compartir mediante acción explícita del usuario.
- Ajustes avanzados: IA apagada por defecto; local deshabilitada (Próximamente); clave propia compatible con API OpenAI. Clave guardada solo en IndexedDB, **no cifrada**: no usar en perfiles compartidos.
- Respuesta IA limitada a identificador de receta curada; se revalidan despensa y alergias. Ningún texto o ingrediente inventado se ejecuta o muestra. Solo se transmiten recetas permitidas, nunca perfil clínico ni medidas.
- Borrar todo elimina perfil, hábitos, rachas, registros, ajustes y clave. No borra copias que el usuario ya haya descargado/compartido ni historial del proveedor IA.

## Seguridad y límites

Alergias desconocidas bloquean las recetas (fail closed). La lista de alérgenos es una ayuda, no una certificación: revisar etiquetas, variantes de productos y contaminación cruzada. El prototipo no reemplaza revisión profesional, especialmente con embarazo, padecimientos, medicamentos o trastornos alimentarios. No se ha validado clínicamente.

IA externa depende de conectividad, modelo, saldo y CORS del proveedor. No hay proxy, servidor ni clave incluida. El programa no puede garantizar la retención de datos del proveedor que elijas. La clave puede leerse desde el perfil del navegador; no hay cifrado del dispositivo implementado por esta app.

Los estados crudo/cocido del catálogo son distintos. Las cantidades de recetas son ilustrativas para una porción; no se afirma nutrición personalizada. Se incluyen **300 alimentos USDA y 80 ejercicios** de free-exercise-db. Azúcares/fibra ausentes se muestran como «sin dato», nunca como cero. No se estiman calorías de ejercicio. Solo se distribuye el catálogo usado por el motor en `public/data/`, sin una copia de fuentes intermedias. La reproducción y auditoría completa se describen en [docs/CATALOGO.md](docs/CATALOGO.md). El catálogo completo puede contener alimentos sin recetas: no se generan combinaciones arbitrarias.

## Almacenamiento (IndexedDB `racha`, versión 2)

El Anexo A del documento nombra «perfil, hábitos, rachas y registros» pero no define campos. Se conservan esos nombres exactos y se añade `ajustes` para tema/IA:

| Store | Clave | Campos |
|---|---|---|
| `perfil` | `id=local` | intencion, dormirMejor, edad, estatura, peso, coeficiente, alergias, padecimientos, medicamentos, consentimiento, consentimientoSalud, despensa, creado |
| `hábitos` | id | nombre, icono |
| `rachas` | `id=local` | dias, actualizado (derivado de registros) |
| `registros` | fecha:habito | fecha local, habito, hecho |
| `ajustes` | `id=local` | tema, oled, personalizado, ia, base_url, modelo, clave, consentimientoIA |

Los esquemas Zod de `src/app/domain.ts` validan los datos al leer. Las fuentes empaquetadas en `public/data/` se validan antes de usarse. Los chips abrevian nombres largos; al tocar un ingrediente se puede consultar el mismo nombre español completo y su fuente externa; la descripción USDA inglesa no se muestra en la app. Los nutrientes se muestran con máximo un decimal, sin alterar los valores usados por el motor. No hay cookies de seguimiento, analítica ni cuentas. Fuentes tipográficas e iconos son locales.

## Pruebas y capturas

Pruebas unitarias: motor de reglas, coeficientes Mifflin, límites, alergias/alias, respuesta IA malformada, inventada y alérgica, rachas y fechas, contraste/temas/OLED, consentimiento y borrado IndexedDB. E2E Playwright en producción: historia de Ana, persistencia, fuentes, temas, OLED, tarjeta privada, borrado y offline. Capturas en `docs/capturas/`.

`npm run test:e2e` usa Chromium de Playwright; `npx playwright install chromium` instala el navegador si no está. Se puede usar `CHROMIUM_PATH` para Chromium del sistema. El puerto de pruebas es 4173 y no se publica en la red.

## Licencias

Código **MIT**. Atribuciones y licencias de datos y fuentes: [NOTICE.md](NOTICE.md). No se incluye código AGPL de wger. `docs/` describe resultados y límites de esta entrega.
