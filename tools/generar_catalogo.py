#!/usr/bin/env python3
"""Catálogo Progresium: fuentes públicas fijadas y traducciones curadas; escribe solo en el directorio de salida solicitado."""
import hashlib, io, json, re, sys, urllib.request, zipfile
from pathlib import Path
from collections import Counter
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / "_dependencias"))
from jsonschema import Draft202012Validator
BASE = Path(__file__).resolve().parent
USDA_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"
EX_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142/dist/exercises.json"
# Cada bloque: FDC ID | nombre revisado en español | alérgenos (vacío si no se identifican).
FOODS = {
"verduras": """
169205|Alcachofa cruda
168389|Espárragos crudos
168390|Espárragos hervidos y escurridos
169961|Ejotes verdes crudos
169320|Ejotes amarillos crudos
169145|Betabel crudo
169146|Betabel hervido y escurrido
170379|Brócoli crudo
170383|Coles de Bruselas crudas
169975|Col blanca cruda
169977|Col morada cruda
170390|Col china pak choi cruda
170393|Zanahoria cruda
169986|Coliflor cruda
169988|Apio crudo
169991|Acelgas crudas
170402|Chayote crudo
170406|Berza cruda
169998|Elote amarillo crudo
168538|Elote blanco crudo
169225|Pepino sin cáscara crudo
168409|Pepino con cáscara crudo
169228|Berenjena cruda
169230|Ajo crudo
168421|Col rizada cruda
169246|Poro crudo (bulbo y parte inferior de las hojas)
169247|Lechuga romana cruda
169248|Lechuga iceberg cruda
169249|Lechuga de hoja verde cruda
168431|Lechuga de hoja roja cruda
168434|Champiñones cremini crudos
168580|Setas crudas
169255|Hongos portobello crudos
169243|Hongos portobello a la parrilla
169242|Hongos shiitake crudos
169251|Champiñones blancos crudos
168571|Nopales crudos
169388|Nopales cocidos sin sal
169260|Okra cruda
170000|Cebolla cruda
170005|Cebollita cambray cruda (bulbo y tallo)
170008|Cebolla dulce cruda
170416|Perejil fresco
170419|Chícharos verdes crudos
170010|Chícharos con vaina comestible crudos
170497|Chile verde picante crudo
170106|Chile rojo picante crudo
168576|Chile jalapeño crudo
169395|Chile serrano crudo
170427|Pimiento verde crudo
170108|Pimiento rojo crudo
169383|Pimiento amarillo crudo
170026|Papa con cáscara cruda
170030|Papa russet con cáscara horneada
168448|Calabaza de Castilla cruda
169270|Flor de calabaza cruda
169276|Rábano crudo
168462|Espinaca cruda
169291|Calabacita con cáscara cruda
169295|Calabaza butternut cruda
168482|Camote crudo
168484|Camote hervido sin cáscara
168566|Tomate verde crudo (tomatillo)
170457|Jitomate rojo crudo
170050|Jitomate rojo cocido
170068|Berros crudos
170073|Jícama cruda
""",
"frutas": """
171688|Manzana con cáscara cruda
171689|Manzana sin cáscara cruda
167793|Manzana Fuji con cáscara cruda
168202|Manzana Golden Delicious con cáscara cruda
168203|Manzana Granny Smith con cáscara cruda
171697|Chabacano crudo
173944|Plátano crudo
173946|Zarzamora cruda
171711|Mora azul cruda
171715|Carambola cruda
171719|Cereza dulce cruda
168195|Clementina cruda
171722|Arándano rojo crudo
171726|Dátil Deglet Noor
168191|Dátil Medjool
173021|Higo crudo
174673|Toronja rosa o roja cruda
174676|Toronja blanca cruda
174683|Uvas rojas o verdes crudas
173044|Guayaba cruda
168153|Kiwi verde crudo
167746|Limón amarillo sin cáscara crudo
168155|Limón verde crudo
169086|Lichi crudo
169910|Mango crudo
169092|Melón cantalupo crudo
169911|Melón verde crudo
169914|Nectarina cruda
169917|Naranja navel cruda
169916|Naranja Valencia cruda
169926|Papaya cruda
169108|Maracuyá morado crudo
169928|Durazno amarillo crudo
169118|Pera cruda
168177|Pera asiática cruda
169941|Caqui japonés crudo
169124|Piña cruda
169949|Ciruela cruda
169134|Granada cruda
167750|Tuna cruda
168165|Pasas oscuras sin semilla
168164|Pasas doradas sin semilla
167755|Frambuesa cruda
167762|Fresa cruda
169105|Mandarina cruda
167765|Sandía cruda
""",
"cereales": """
170683|Amaranto cocido
170682|Amaranto en grano crudo
170285|Cebada perlada cocida|gluten
170284|Cebada perlada cruda|gluten
170286|Trigo sarraceno crudo
170687|Harina integral de trigo sarraceno
170287|Bulgur cocido|gluten
170688|Bulgur seco|gluten
170290|Harina integral de maíz amarillo
169748|Harina integral de maíz blanco
170288|Maíz amarillo en grano seco
168920|Maíz blanco en grano seco
169697|Sémola integral de maíz amarillo
169698|Fécula de maíz
169700|Cuscús cocido|gluten
169699|Cuscús seco|gluten
169705|Avena en grano cruda|gluten
168873|Salvado de avena cocido|gluten
168872|Salvado de avena crudo|gluten
168917|Quinoa cocida
168874|Quinoa cruda
169704|Arroz integral de grano largo cocido
169703|Arroz integral de grano largo crudo
168878|Arroz blanco de grano largo enriquecido cocido
168914|Fideos de arroz cocidos
169742|Fideos de arroz secos
168910|Pasta integral cocida|gluten
169738|Pasta integral seca|gluten
168901|Pasta casera con huevo cocida|gluten,huevo
168902|Pasta casera sin huevo cocida|gluten
175036|Tortilla de maíz lista para calentar
175037|Tortilla de harina de trigo refrigerada lista para calentar|gluten
174081|Tortilla de trigo integral lista para calentar|gluten
174078|Bolillo|gluten
168013|Pan multigrano|gluten
168893|Harina integral de trigo|gluten
169722|Salvado de trigo crudo|gluten
""",
"leguminosas": """
173734|Frijol negro seco crudo
173735|Frijol negro hervido sin sal
175199|Frijol pinto seco crudo
175200|Frijol pinto hervido sin sal
173744|Frijol rojo seco crudo
175194|Frijol rojo hervido sin sal
175202|Frijol blanco seco crudo
175203|Frijol blanco hervido sin sal
172420|Lenteja seca cruda
172421|Lenteja hervida sin sal
174284|Lenteja roja seca cruda
173756|Garbanzo seco crudo
173757|Garbanzo hervido sin sal
174270|Soya seca cruda|soya
169282|Soya verde cruda|soya
172441|Soya tostada en seco|soya
172475|Tofu firme con sulfato de calcio|soya
172476|Tofu regular con sulfato de calcio|soya
172449|Tofu suave con calcio y nigari|soya
172454|Hummus casero|ajonjoli
""",
"lacteos": """
172217|Leche entera sin vitaminas A ni D añadidas|lacteos
171265|Leche entera con vitamina D añadida|lacteos
173441|Leche con 1 % de grasa sin vitaminas A ni D añadidas|lacteos
171302|Leche evaporada con 2 % de grasa y vitaminas A y D|lacteos
171284|Yogur natural entero|lacteos
170886|Yogur natural bajo en grasa|lacteos
170887|Yogur natural descremado|lacteos
171304|Yogur griego natural entero|lacteos
170894|Yogur griego natural sin grasa|lacteos
170903|Yogur griego natural bajo en grasa|lacteos
172223|Queso fresco|lacteos
173437|Queso asadero|lacteos
173438|Queso Chihuahua|lacteos
170898|Queso Cotija|lacteos
172201|Queso añejo|lacteos
173414|Queso cheddar|lacteos
172179|Queso cottage con crema|lacteos
173418|Queso crema|lacteos
171241|Queso gouda|lacteos
170845|Queso mozzarella de leche entera|lacteos
171247|Queso parmesano rallado|lacteos
171248|Queso ricotta parcialmente descremado|lacteos
171257|Crema ácida fermentada|lacteos
170857|Crema ligera para mesa|lacteos
170859|Crema para batir espesa|lacteos
""",
"huevo": """
171287|Huevo entero crudo|huevo
173424|Huevo entero cocido duro|huevo
172187|Huevo revuelto cocido|huevo
172183|Clara de huevo cruda|huevo
172184|Yema de huevo cruda|huevo
""",
"carnes": """
171052|Pollo sin piel crudo
171054|Pollo sin piel rostizado
171451|Pollo sin piel guisado
171474|Pechuga de pollo con piel cruda
171075|Pechuga de pollo con piel rostizada
171477|Pechuga de pollo sin piel rostizada
171478|Pechuga de pollo sin piel guisada
172373|Pierna de pollo con piel cruda
173612|Pierna de pollo con piel rostizada
172377|Pierna de pollo sin piel guisada
172385|Muslo de pollo con piel crudo
173625|Muslo de pollo con piel rostizado
172388|Muslo de pollo sin piel rostizado
172389|Muslo de pollo sin piel guisado
172390|Ala de pollo con piel cruda
173630|Ala de pollo con piel rostizada
172392|Ala de pollo sin piel rostizada
171480|Carne de pavo sin piel cruda
171481|Carne de pavo sin piel rostizada
167902|Carne molida de cerdo cruda
167903|Carne molida de cerdo cocida
168312|Filete de cerdo con grasa separable crudo
167905|Filete de cerdo con grasa separable horneado
168249|Filete magro de cerdo crudo
168250|Filete magro de cerdo horneado
174030|Carne molida de res cruda (90 % magra)
171794|Carne molida de res dorada en sartén (90 % magra)
171795|Pastel de carne de res horneado (90 % magra)
174031|Hamburguesa de res asada (90 % magra)
171793|Hamburguesa de res cocida en sartén (90 % magra)
""",
"pescados": """
175167|Salmón del Atlántico de cultivo crudo|pescado
175168|Salmón del Atlántico de cultivo cocido con calor seco|pescado
173686|Salmón del Atlántico silvestre crudo|pescado
171998|Salmón del Atlántico silvestre cocido con calor seco|pescado
175176|Tilapia cruda|pescado
175177|Tilapia cocida con calor seco|pescado
171955|Bacalao del Atlántico crudo|pescado
171956|Bacalao del Atlántico cocido con calor seco|pescado
173717|Trucha arcoíris de cultivo cruda|pescado
173718|Trucha arcoíris de cultivo cocida con calor seco|pescado
173709|Atún claro en agua enlatado y escurrido|pescado
173708|Atún claro en aceite enlatado y escurrido|pescado
172006|Atún aleta amarilla cocido con calor seco|pescado
175139|Sardina del Atlántico en aceite escurrida con espinas|pescado
175140|Sardina del Pacífico en salsa de jitomate escurrida con espinas|pescado
175179|Camarón crudo|mariscos
175180|Camarón cocido|mariscos
174204|Jaiba azul cruda|mariscos
174205|Jaiba azul cocida con calor húmedo|mariscos
171972|Camarón enlatado|mariscos
""",
"grasas": """
171706|Aguacate de California crudo
171707|Aguacate de Florida crudo
173573|Aceite de aguacate
172336|Aceite de canola
171412|Aceite de coco
171029|Aceite de maíz para cocinar
171413|Aceite de oliva
171016|Aceite de ajonjolí|ajonjoli
171411|Aceite de soya|soya
172338|Aceite de girasol alto en ácido oleico
171017|Aceite de girasol con menos de 60 % de ácido linoleico
171025|Aceite de girasol con aproximadamente 65 % de ácido linoleico
171314|Mantequilla clarificada (ghee)|lacteos
173412|Grasa anhidra de mantequilla|lacteos
172345|Grasa de tocino
""",
"semillas": """
170567|Almendras|frutos_secos
170162|Nuez de la India cruda|frutos_secos
170581|Avellanas|frutos_secos
170182|Nuez pecana|frutos_secos
170184|Pistaches crudos|frutos_secos
170187|Nuez de Castilla|frutos_secos
170569|Nuez de Brasil seca sin blanquear|frutos_secos
172430|Cacahuates crudos|cacahuate
170554|Chía seca
169414|Linaza
170556|Pepitas de calabaza secas sin cáscara
170557|Pepitas de calabaza tostadas sin sal
170150|Ajonjolí entero seco|ajonjoli
170562|Semillas de girasol secas sin cáscara
170169|Pulpa de coco cruda|frutos_secos
""",
"bebidas": """
173647|Agua potable de la llave
171890|Café preparado con agua de la llave
171889|Café descafeinado preparado con agua de la llave
173227|Té negro preparado con agua de la llave
171917|Té verde preparado
171910|Té verde descafeinado preparado
171941|Agua de horchata de restaurante|lacteos,frutos_secos
171942|Bebida de arroz sin azúcar
174832|Bebida de almendra sin azúcar de larga duración|frutos_secos
170174|Agua de coco natural|frutos_secos
""",
"otros": """
169640|Miel de abeja
169655|Azúcar blanca granulada
168833|Azúcar morena
169593|Cocoa en polvo sin azúcar
171320|Canela molida
171328|Orégano seco
170923|Semilla de comino
170931|Pimienta negra
173469|Vinagre de manzana
172237|Vinagre blanco destilado
"""
}

# Traducción manual de los pasos operativos. Se omiten publicidad y estimaciones calóricas sin respaldo.
EXERCISES = """
3_4_Sit-Up|Abdominal de tres cuartos
Acuéstate boca arriba, asegura los pies y flexiona las rodillas.
Coloca las manos detrás o a los lados de la cabeza, con la espalda en el suelo.
Flexiona la cadera y la columna para acercar el torso a las rodillas.
Al llegar arriba, el torso queda perpendicular al suelo. Baja solo tres cuartas partes del recorrido.
Repite las repeticiones indicadas.

Air_Bike|Bicicleta abdominal
Acuéstate boca arriba con la zona lumbar contra el suelo y las manos junto a la cabeza. No fuerces el cuello; eleva los hombros.
Levanta las piernas con los muslos perpendiculares al suelo y las pantorrillas paralelas a él.
Pedalea lentamente: extiende la pierna derecha, acerca la rodilla izquierda y lleva el codo derecho hacia ella al exhalar.
Vuelve al inicio al inhalar.
Repite hacia el otro lado, acercando el codo izquierdo a la rodilla derecha al exhalar.
Alterna hasta completar las repeticiones indicadas por lado.

Alternate_Heel_Touchers|Toques alternos de talón
Acuéstate con las rodillas flexionadas, pies apoyados y separados unos 45–60 cm; extiende los brazos a los lados.
Eleva el torso unos 8–10 cm hacia la derecha y toca el talón derecho. Exhala y mantén un segundo.
Regresa despacio al inhalar.
Repite hacia la izquierda y vuelve al inicio. Tocar ambos talones cuenta como una repetición.
Continúa alternando hasta completar las repeticiones indicadas.

Bench_Dips|Fondos de tríceps en banco
Coloca un banco detrás de ti, transversal al cuerpo. Apoya las manos en el borde al ancho de hombros, con los brazos extendidos y las piernas al frente.
Inhala y baja flexionando los codos hasta formar un ángulo ligeramente menor de 90°. Mantén los codos cerca del cuerpo y los antebrazos hacia abajo.
Empuja con los tríceps para volver a la posición inicial.
Repite las repeticiones indicadas.

Bent-Knee_Hip_Raise|Elevación de cadera con rodillas flexionadas
Acuéstate boca arriba con los brazos a los lados.
Flexiona las rodillas unos 75° y eleva los pies unos 5 cm.
Exhala y acerca las rodillas conservando ese ángulo; gira la pelvis hacia atrás hasta despegar la cadera y dejar las rodillas sobre el pecho.
Contrae el abdomen un segundo arriba. Regresa despacio al inhalar, siempre con control.
Repite las repeticiones indicadas.

Body-Up|Extensión de tríceps desde plancha
Apóyate en puntas de los pies y antebrazos, separados al ancho de hombros. Mantén el torso recto.
Presiona las palmas contra el suelo y extiende los codos para elevar el cuerpo, sin perder la rigidez del torso.
Flexiona lentamente los codos hasta volver a apoyar los antebrazos.
Repite.

Bodyweight_Squat|Sentadilla sin peso
De pie, separa los pies al ancho de hombros. Puedes poner las manos detrás de la cabeza.
Flexiona rodillas y cadera, llevando la cadera hacia atrás.
Baja hasta la profundidad que puedas y vuelve de inmediato al inicio. Mantén cabeza y pecho elevados y dirige las rodillas hacia afuera.

Butt_Lift_Bridge|Puente de glúteos
Acuéstate boca arriba con los brazos a los lados, rodillas flexionadas y pies al ancho de hombros.
Empuja principalmente con los talones para levantar la cadera, conservando la espalda recta. Exhala y sostén un segundo arriba.
Regresa despacio al inhalar.

Chin-Up|Dominada con palmas hacia ti
Sujeta una barra de dominadas con las palmas hacia ti y las manos a una distancia menor al ancho de hombros.
Extiende los brazos, conserva el torso lo más recto posible, una ligera curva lumbar y el pecho hacia afuera.
Exhala y sube hasta que la cabeza esté a la altura de la barra. Usa los bíceps, con los codos cerca del cuerpo y sin balancear el torso; los antebrazos solo sujetan.
Contrae los bíceps un segundo. Inhala y baja despacio hasta extender los brazos.
Repite las repeticiones indicadas.

Cocoons|Encogimiento abdominal completo
Acuéstate boca arriba con las piernas rectas y los brazos extendidos detrás de la cabeza.
Acerca las rodillas al pecho y gira la pelvis para despegar los glúteos. Flexiona la columna y trae los brazos por encima de la cabeza al mismo tiempo.
Haz una pausa breve y vuelve al inicio.

Cross-Body_Crunch|Abdominal cruzado
Acuéstate boca arriba y flexiona las rodillas unos 60°.
Apoya los pies en el suelo y coloca las manos suavemente detrás de la cabeza.
Exhala y eleva el hombro y codo derechos hacia la rodilla izquierda mientras la acercas al hombro. Contrae el abdomen; no te limites a mover el codo.
Inhala al bajar y repite con el codo izquierdo y la rodilla derecha.
Continúa alternando hasta completar las repeticiones indicadas.

Crunch_-_Hands_Overhead|Abdominal con brazos extendidos sobre la cabeza
Acuéstate con la espalda apoyada y las rodillas flexionadas, con un ángulo de unos 60° entre muslos y pantorrillas.
Apoya los pies y extiende los brazos sobre la cabeza con las palmas cruzadas.
Exhala y eleva ligeramente los omóplatos. Mantén los brazos alineados con cabeza, cuello y hombros, sin adelantarlos. Sostén un segundo.
Baja lentamente al inhalar.
Repite las repeticiones indicadas.

Crunches|Abdominal corto
Acuéstate boca arriba con los pies apoyados en el suelo o en un banco y rodillas a 90°. Si usas banco, separa los pies 8–10 cm y junta las puntas.
Apoya las manos suavemente a los lados de la cabeza y mantén los codos hacia adentro. No entrelaces los dedos detrás de la cabeza.
Presiona la zona lumbar contra el suelo y empieza a elevar los hombros.
Exhala y contrae el abdomen; eleva los hombros solo unos 10 cm sin despegar la zona lumbar. Mantén un segundo y evita tomar impulso.
Inhala mientras bajas lentamente.
Repite las repeticiones indicadas.

Dead_Bug|Bicho muerto
Acuéstate boca arriba con los brazos extendidos hacia el techo.
Eleva las piernas con caderas y rodillas a 90°.
Exhala con fuerza, baja las costillas, aplana la espalda contra el suelo y gira la pelvis hacia arriba contrayendo los glúteos. Conserva esa posición.
Extiende una pierna desde cadera y rodilla hasta dejarla apenas por encima del suelo.
No cambies la posición lumbar ni de la pelvis; evita arquear la espalda.
Mantén la tensión y devuelve la pierna al inicio.
Alterna las piernas hasta completar la serie.

Elbow_to_Knee|Codo a rodilla cruzado
Acuéstate con la pierna derecha cruzada sobre la rodilla izquierda flexionada. Entrelaza las manos detrás de la cabeza y apoya los omóplatos.
Flexiona la columna y gira el torso para acercar el codo izquierdo a la rodilla derecha.
Vuelve al inicio y completa las repeticiones antes de cambiar de lado.

Flutter_Kicks|Patadas alternas boca abajo en banco
Acuéstate boca abajo en un banco plano, con la cadera en el borde, piernas rectas y pies elevados. Sujeta el borde delantero con las manos.
Contrae glúteos y parte posterior de los muslos, y alinea las piernas con la cadera.
Eleva la pierna izquierda por encima de la derecha.
Baja la izquierda mientras elevas la derecha.
Alterna como al nadar hasta completar las repeticiones por pierna. Muévete con control y respira normalmente.

Freehand_Jump_Squat|Sentadilla con salto
Cruza los brazos sobre el pecho.
Separa los pies al ancho de hombros y mantén cabeza elevada y espalda recta.
Inhala y baja en sentadilla hasta que los muslos estén paralelos al suelo o más abajo, sin encorvarte.
Exhala y salta verticalmente lo más alto posible, empujando principalmente con la parte delantera de los pies.
Al volver al suelo, baja de inmediato en sentadilla y salta otra vez.
Completa las repeticiones indicadas.

Glute_Kickback|Patada de glúteo en cuatro puntos
Apoya manos y rodillas en el suelo o tapete. Separa las manos al ancho de hombros, extiende los brazos, mira al frente y flexiona las rodillas a 90°.
Exhala y eleva la pierna derecha manteniendo la rodilla a 90°, hasta alinear el muslo con la espalda. Contrae el glúteo y sostén un segundo.
Inhala al volver al inicio y repite con la pierna izquierda.
Alterna hasta completar las repeticiones indicadas.

Incline_Push-Up|Lagartija inclinada con apoyo elevado
Colócate frente a un banco o plataforma firme. Apoya las manos en el borde, un poco más abiertas que los hombros.
Lleva los pies hacia atrás y mantén brazos y cuerpo rectos, con los brazos perpendiculares al torso. Flexiona los codos y acerca el pecho al borde.
Empuja hasta extender los brazos. Repite sin doblar el cuerpo.

Isometric_Chest_Squeezes|Presión de palmas para pecho
Sentado o de pie, flexiona los codos a 90° y junta las palmas delante del pecho, con los dedos al frente.
Presiona una mano contra la otra y contrae el pecho. Aumenta la tensión gradualmente y respira normalmente.
Mantén durante los segundos indicados.
Suelta la tensión lentamente.
Descansa el tiempo indicado y repite.

Knee_Tuck_Jump|Salto con rodillas al pecho
De pie, flexiona ligeramente las rodillas. Coloca las manos frente al pecho, palmas abajo y puntas de los dedos juntas.
Baja rápidamente un cuarto de sentadilla y salta, llevando las rodillas hacia las palmas.
Salta lo más alto posible, vuelve a extender las piernas y aterriza flexionando las rodillas para absorber el impacto.

Leg_Pull-In|Encogimiento de piernas acostado
Acuéstate en un tapete con las piernas extendidas y las palmas junto al cuerpo o debajo de los glúteos.
Exhala, flexiona las rodillas y acerca los muslos al abdomen hasta llevar las rodillas al pecho. Contrae el abdomen un segundo, con las pantorrillas paralelas al suelo.
Inhala al regresar al inicio.
Repite las repeticiones indicadas.

Oblique_Crunches_-_On_The_Floor|Abdominal lateral en el suelo
Acuéstate sobre el costado derecho, con una pierna encima de la otra y las rodillas ligeramente flexionadas.
Coloca la mano izquierda detrás de la cabeza.
Eleva el codo izquierdo al contraer el abdomen, enfocando el esfuerzo en los músculos laterales.
Sube lo que puedas, mantén un segundo y baja lentamente.
Inhala al bajar y exhala al subir.

Plank|Plancha sobre antebrazos
Colócate boca abajo, apoyando puntas de los pies y antebrazos, con los codos directamente debajo de los hombros.
Mantén el cuerpo recto y sostén la posición el mayor tiempo posible. La fuente propone elevar un brazo o una pierna para aumentar la dificultad.

Push-Up_Wide|Lagartija con manos abiertas
Adopta una plancha sobre manos y puntas de los pies, con las manos bien separadas y codos extendidos. Mantén el cuerpo recto sin dejar caer la cadera.
Inhala y flexiona los codos para bajar el pecho hacia el suelo.
Exhala y empuja con el pecho hasta extender los codos y regresar al inicio.
Haz una pausa arriba y repite las repeticiones indicadas.

Push-Ups_-_Close_Triceps_Position|Lagartija cerrada para tríceps
Apoya las manos en el suelo a una distancia menor que el ancho de hombros. Sostén el torso con los brazos extendidos.
Inhala y baja hasta que el pecho casi toque el suelo.
Exhala y empuja con tríceps y pecho hasta volver al inicio, contrayendo el pecho.
Haz una pausa de un segundo y repite las repeticiones indicadas.

Pushups|Lagartijas
Apoya las manos en el suelo, separadas unos 90 cm, y sostén el cuerpo con los brazos extendidos.
Inhala y baja hasta que el pecho casi toque el suelo.
Exhala y empuja hasta volver al inicio, contrayendo el pecho.
Haz una pausa breve arriba y repite las veces indicadas.

Reverse_Crunch|Abdominal inverso
Acuéstate boca arriba con las piernas extendidas y los brazos a los lados, palmas en el suelo. No muevas los brazos durante el ejercicio.
Eleva los muslos hasta dejarlos perpendiculares al suelo, con los pies juntos y las pantorrillas paralelas al suelo.
Inhala y acerca las piernas al torso, girando la pelvis hacia atrás y despegando la cadera hasta llevar las rodillas al pecho.
Mantén un segundo y regresa las piernas al inicio al exhalar.
Repite las repeticiones indicadas.

Russian_Twist|Giro ruso
Acuéstate con las rodillas flexionadas y los pies sujetos bajo un objeto inmóvil o por otra persona.
Eleva el torso formando una V con los muslos. Extiende los brazos al frente, perpendiculares al torso, con las manos juntas.
Exhala y gira el torso hacia la derecha hasta que los brazos queden paralelos al suelo.
Mantén un segundo y vuelve al inicio exhalando, como indica la fuente. Repite hacia el lado contrario.
Completa las repeticiones indicadas.

Wrist_Circles|Círculos de muñecas
De pie, separa los pies al ancho de hombros y extiende los brazos a los lados a la altura de hombros, formando una T, con las palmas hacia abajo.
Mantén el cuerpo quieto y gira ambas muñecas hacia adelante en círculos, como dibujándolos con las manos. Respira normalmente.
Repite las repeticiones indicadas.

Front_Leg_Raises|Balanceo frontal de pierna
Párate junto a una silla u otro soporte y sujétate con una mano.
Balancea una pierna recta hacia adelante y después hacia atrás hasta donde permita tu flexibilidad. Repite de 5 a 10 veces y cambia de pierna.

Single_Leg_Glute_Bridge|Puente de glúteo a una pierna
Acuéstate con las rodillas flexionadas y los pies apoyados.
Eleva una pierna y acerca esa rodilla al pecho.
Empuja con el talón apoyado y extiende la cadera para despegar los glúteos del suelo.
Sube lo más que puedas, haz una pausa y vuelve al inicio.

Sit-Up|Abdominal completo
Acuéstate con las rodillas flexionadas y los pies sujetos bajo un objeto inmóvil o por otra persona.
Coloca las manos detrás de la cabeza con los dedos entrelazados.
Exhala y eleva el torso formando una V con los muslos.
Mantén la contracción un segundo y baja al inhalar.
Repite las repeticiones indicadas.

Spider_Crawl|Escalador lateral tipo araña
Colócate boca abajo, apoyando manos y puntas de los pies, con pies juntos, cuerpo recto y codos flexionados a 90°.
Despega un pie, gira la pierna hacia afuera y lleva la rodilla hacia el codo lo más adelante posible.
Vuelve al inicio y repite del otro lado.

Split_Jump|Salto en desplante sin cambiar piernas
Adopta un desplante: un pie adelante, rodilla flexionada y rodilla trasera casi tocando el suelo.
Alinea la rodilla delantera con el centro del pie.
Extiende ambas piernas y salta lo más alto posible, ayudándote con los brazos.
Junta los pies en el aire y sepáralos otra vez a la posición inicial al aterrizar.
Absorbe el impacto regresando al desplante.

Star_Jump|Salto de estrella
De pie, separa los pies al ancho de hombros y mantén los brazos cerca del cuerpo.
Baja media sentadilla y salta lo más alto posible, extendiendo el cuerpo y abriendo brazos y piernas.
Al aterrizar, recoge brazos y piernas y absorbe el impacto flexionando las piernas.

Step-up_with_Knee_Raise|Subida a banco con elevación de rodilla
Párate frente a un cajón o banco de altura adecuada, con los pies juntos.
Apoya el pie izquierdo arriba y extiende esa cadera y rodilla para subir. Al llegar arriba, eleva la rodilla derecha lo más que puedas.
Invierte el movimiento para bajar y repite con la pierna contraria.

Tuck_Crunch|Abdominal corto con piernas recogidas
Acuéstate boca arriba con la espalda apoyada y brazos a los lados, palmas abajo.
Cruza un tobillo sobre el otro y eleva las piernas hasta dejar los muslos perpendiculares al suelo, con las rodillas ligeramente flexionadas y las pantorrillas paralelas al suelo.
Cruza los brazos sobre el pecho.
Exhala y eleva lentamente el torso sin despegar la zona lumbar.
Inhala al bajar despacio al inicio.
Repite las repeticiones indicadas.

Push_Up_to_Side_Plank|Lagartija con plancha lateral
Adopta una posición de lagartija sobre las puntas de los pies, con las manos apenas más abiertas que los hombros.
Flexiona los codos para hacer una lagartija, manteniendo el cuerpo recto.
Al subir, carga el peso al lado izquierdo y gira el cuerpo mientras elevas el brazo derecho hacia el techo en plancha lateral.
Vuelve a apoyar la mano, haz otra lagartija y gira al otro lado.
Alterna los lados durante 10 repeticiones o más, según la fuente.

Scissors_Jump|Salto de tijera en desplante
Adopta un desplante, con un pie adelante y la rodilla trasera casi tocando el suelo.
Alinea la rodilla delantera con el centro del pie. Extiende ambas piernas y salta, ayudándote con los brazos.
En el aire, cambia las piernas: lleva la delantera atrás y la trasera adelante.
Aterriza en desplante para absorber el impacto y repite.

90_90_Hamstring|Extensión de rodilla con cadera a 90°
Acuéstate boca arriba con una pierna extendida en el suelo.
Flexiona la otra cadera y rodilla a 90°. Puedes sostener el muslo con las manos.
Extiende esa pierna hacia arriba, haz una pausa breve y vuelve al inicio.
Repite de 10 a 20 veces y cambia de pierna.

Ankle_Circles|Círculos de tobillos
Sujétate de un objeto firme, como un soporte para sentadillas.
Eleva el pie derecho unos 5 cm y dibuja círculos amplios con el dedo gordo. Cada círculo cuenta como una repetición; respira normalmente.
Completa las repeticiones y cambia de pie.

Arm_Circles|Círculos de brazos
De pie, extiende los brazos a los lados, paralelos al suelo y perpendiculares al torso.
Haz lentamente círculos de unos 30 cm de diámetro con los brazos extendidos. Respira normalmente.
Continúa unos 10 segundos y después invierte el sentido.

Calf_Stretch_Hands_Against_Wall|Estiramiento de pantorrilla contra pared
Párate frente a una pared, a cierta distancia, con un pie más adelantado que el otro.
Inclínate y apoya las manos en la pared, alineando talón, cadera y cabeza.
Mantén el talón en el suelo de 10 a 20 segundos y cambia de lado.

Cat_Stretch|Estiramiento del gato
Apoya manos y rodillas en el suelo.
Mete el abdomen y redondea columna, zona lumbar, hombros y cuello, dejando caer la cabeza.
Mantén 15 segundos.

Childs_Pose|Postura del niño
Apoya manos y rodillas y camina con las manos hacia adelante.
Lleva los glúteos hacia los talones, dejando deslizar los brazos por el suelo para estirar la columna.
Ya sentado sobre los talones, lleva las manos junto a los pies, relájate y respira hacia la espalda. Apoya la frente en el suelo. Evita esta posición si tienes problemas de rodillas.

Chin_To_Chest_Stretch|Estiramiento de barbilla al pecho
Siéntate en el suelo.
Coloca las manos detrás de la cabeza, dedos entrelazados, pulgares hacia abajo y codos al frente. Lleva lentamente la cabeza hacia el pecho con ayuda de las manos. Mantén de 20 a 30 segundos.

Dynamic_Chest_Stretch|Apertura dinámica de pecho
De pie, junta las manos al frente con los brazos extendidos.
Sin doblar los brazos, ábrelos hacia atrás lo más posible y vuelve al frente, como una palmada exagerada. Repite de 5 a 10 veces aumentando la velocidad.

Hamstring_Stretch|Estiramiento posterior de muslo con cinta
Acuéstate boca arriba con una pierna elevada y la cadera a 90°. Deja la otra pierna apoyada en el suelo.
Pasa un cinturón, banda o cuerda por la parte delantera de la planta del pie elevado.
Tira de la cinta hasta sentir tensión en pantorrilla y parte posterior del muslo. Mantén de 10 a 30 segundos y cambia de pierna.

Hug_Knees_To_Chest|Rodillas al pecho
Acuéstate boca arriba y acerca ambas rodillas al pecho.
Sostén por debajo de las rodillas, no por encima, para no presionar las articulaciones.
Acerca lentamente las rodillas hacia los hombros para estirar también los glúteos.

Inchworm|Caminata de gusano
De pie, junta los pies. Con las piernas rectas, inclínate y apoya las manos en el suelo frente a ti.
Camina lentamente con las manos hacia adelante, alternándolas y flexionando solo la cadera, sin doblar las piernas.
Avanza hasta quedar en posición de lagartija, con el cuerpo paralelo al suelo.
Mantén las manos quietas y acerca los pies con pasos cortos de pocos centímetros.
Continúa hasta llevar los pies junto a las manos, manteniendo las piernas rectas.

Kneeling_Hip_Flexor|Estiramiento de flexor de cadera de rodillas
Arrodíllate en un tapete. Adelanta el pie derecho y apoya la planta; extiende la pierna izquierda atrás con el empeine en el suelo.
Desplaza el peso hacia adelante hasta sentir el estiramiento en la cadera. Mantén 15 segundos y cambia de lado.

On_Your_Side_Quad_Stretch|Estiramiento de cuádriceps de lado
Acuéstate sobre el costado derecho con la rodilla derecha flexionada a 90° y apoyada delante del cuerpo para estabilizarte.
Flexiona la rodilla izquierda hacia atrás y sujeta el pie con la mano izquierda. Lleva la cadera izquierda hacia adelante y empuja el pie contra la mano para estirar el flexor de cadera. Cambia de lado.

Shoulder_Circles|Círculos de hombros
Relaja los hombros y deja los brazos a los lados, o sobre el regazo si estás sentado. Gira suavemente los hombros hacia adelante, arriba, atrás y abajo.
Invierte el sentido. Puedes alternar los hombros o mover ambos a la vez.

Shoulder_Stretch|Estiramiento de hombro cruzado
Cruza el brazo izquierdo por delante del cuerpo y mantenlo recto.

Side_Neck_Stretch|Estiramiento lateral de cuello
Relaja los hombros e inclina suavemente la cabeza hacia uno de ellos.
Ayuda al estiramiento con un tirón suave en el costado de la cabeza.

Standing_Hip_Circles|Círculos de cadera de pie
Párate sobre una pierna y sujétate de un soporte vertical.
Eleva la rodilla libre a 90°.
Abre la cadera lo más posible, intentando dibujar un círculo amplio con la rodilla.
Haz varias repeticiones lentamente y cambia de lado.

Standing_Toe_Touches|Flexión de tronco de pie
Párate con espacio delante y detrás.
Flexiona la cintura con las piernas rectas y deja colgar el torso al frente, con brazos y manos relajados. Mantén de 10 a 20 segundos.

Triceps_Stretch|Estiramiento de tríceps sobre la cabeza
Lleva una mano detrás de la cabeza, sujeta el codo con la otra y tira suavemente. Mantén de 10 a 20 segundos y cambia de lado.

Superman|Superman en el suelo
Acuéstate boca abajo en el suelo o tapete, con el cuerpo recto y los brazos extendidos al frente.
Exhala y eleva a la vez brazos, piernas y pecho. Contrae la espalda baja y mantén dos segundos, como si volaras.
Inhala y baja lentamente brazos, piernas y pecho al inicio.
Repite las repeticiones indicadas en tu programa.

Bent_Over_Two-Dumbbell_Row|Remo inclinado con dos mancuernas
Sujeta una mancuerna en cada mano, palmas hacia el torso. Flexiona ligeramente las rodillas e inclina el torso casi paralelo al suelo, con espalda recta y cabeza elevada. Deja colgar los brazos.
Exhala y sube las mancuernas a los lados del cuerpo, sin mover el torso y con los codos cerca de él. Los antebrazos solo sujetan; contrae la espalda un segundo arriba.
Inhala y baja las mancuernas lentamente.
Repite las repeticiones indicadas.

Dumbbell_Alternate_Bicep_Curl|Curl alterno de bíceps con mancuernas
De pie y con el torso erguido, sujeta una mancuerna en cada mano. Mantén los codos cerca del cuerpo y las palmas hacia los muslos.
Sin mover el brazo superior, flexiona el codo derecho y gira la palma hacia adelante. Exhala y sube hasta el hombro; contrae el bíceps un segundo. Solo se mueve el antebrazo.
Inhala y baja lentamente, girando la palma otra vez hacia el muslo.
Repite con el brazo izquierdo; ambos lados cuentan como una repetición.
Continúa alternando hasta completar las repeticiones indicadas.

Dumbbell_Lunges|Desplantes con mancuernas
Párate erguido con una mancuerna en cada mano a los lados.
Da un paso de unos 60 cm con la pierna derecha. Inhala al bajar, manteniendo el torso erguido y el equilibrio. La fuente indica mantener la espinilla delantera vertical y la rodilla sin rebasar los dedos del pie.
Exhala y empuja principalmente con el talón para volver al inicio.
Completa las repeticiones y después cambia a la pierna izquierda.

Dumbbell_Shrug|Encogimiento de hombros con mancuernas
Párate erguido con una mancuerna en cada mano, palmas hacia el cuerpo y brazos extendidos a los lados.
Exhala y eleva los hombros lo más posible. Mantén un segundo. Deja los brazos rectos y no ayudes con los bíceps; solo suben y bajan los hombros.
Baja las mancuernas al inicio.
Repite las repeticiones indicadas.

Dumbbell_Squat|Sentadilla con mancuernas
Párate erguido con una mancuerna en cada mano y las palmas hacia los costados de las piernas.
Separa los pies al ancho de hombros, con las puntas ligeramente hacia afuera. Mantén la cabeza elevada y la espalda recta.
Baja lentamente flexionando las rodillas hasta que los muslos estén paralelos al suelo. La fuente indica mantener las rodillas alineadas con las puntas de los pies, sin adelantarlas.
Exhala y empuja principalmente con los talones para extender las piernas y volver al inicio.
Repite las repeticiones indicadas.

Front_Dumbbell_Raise|Elevación frontal alterna con mancuernas
De pie, mantén el torso recto y sujeta las mancuernas frente a los muslos, con brazos extendidos y palmas hacia ellos.
Sin balancear el torso, eleva la mancuerna izquierda al frente con el codo ligeramente flexionado y la palma abajo. Sube un poco más allá de la horizontal, exhala y pausa un segundo. Después inhala.
Baja lentamente la izquierda mientras elevas la derecha.
Alterna hasta completar las repeticiones por brazo.

One-Arm_Dumbbell_Row|Remo con mancuerna a un brazo
Coloca una mancuerna a cada lado de un banco plano.
Apoya la rodilla derecha en un extremo del banco y la mano derecha en el otro. Inclina el torso desde la cintura hasta dejarlo paralelo al suelo.
Sujeta la mancuerna con la mano izquierda, palma hacia el cuerpo y espalda baja recta.
Exhala y sube la mancuerna junto al pecho, con el codo cerca del cuerpo y el torso quieto. Contrae la espalda; el antebrazo solo sujeta el peso.
Inhala y baja la mancuerna en línea recta.
Completa las repeticiones indicadas.
Cambia de lado y repite con el otro brazo.

Seated_Dumbbell_Press|Press de hombros sentado con mancuernas
Siéntate en un banco con respaldo, con una mancuerna apoyada verticalmente sobre cada muslo.
Ayúdate con los muslos para subir las mancuernas, una a la vez, hasta la altura de los hombros.
Gira las muñecas para que las palmas miren al frente.
Exhala y empuja las mancuernas arriba hasta que se toquen.
Pausa un segundo e inhala al bajar lentamente al inicio.
Repite las repeticiones indicadas.

Stiff-Legged_Dumbbell_Deadlift|Peso muerto con mancuernas y piernas semirrígidas
Sujeta una mancuerna en cada mano con los brazos extendidos a los lados.
Párate con el torso recto, pies al ancho de hombros o algo más juntos y rodillas ligeramente flexionadas.
Sin cambiar la flexión de rodillas, inclina la cintura con la espalda recta y baja las mancuernas hacia los pies hasta sentir estiramiento en la parte posterior de los muslos. Exhala al bajar, como indica la fuente.
Inhala y extiende cadera y cintura para volver a erguirte.
Repite las repeticiones indicadas.

Tricep_Dumbbell_Kickback|Patada de tríceps con mancuernas
Sujeta una mancuerna por mano, palmas hacia el cuerpo. Flexiona un poco las rodillas e inclina el torso casi paralelo al suelo, con espalda recta y cabeza elevada. Mantén los brazos superiores pegados al torso y horizontales, con codos a 90° y antebrazos hacia abajo.
Exhala y extiende los codos con los tríceps, sin mover los brazos superiores; solo se mueven los antebrazos.
Pausa arriba, inhala y baja lentamente al inicio.
Repite las repeticiones indicadas.

Bicycling|Ciclismo
Siéntate en la bicicleta y ajusta el asiento a tu altura.

Bicycling_Stationary|Bicicleta fija
Siéntate en la bicicleta y ajusta el asiento a tu altura.
Selecciona modo manual o un programa; quizá debas pedalear para encenderla. Puedes ingresar edad y peso para la estimación de la máquina y ajustar la resistencia durante la sesión. Usa los sensores de pulso de los manubrios para vigilar la intensidad.

Elliptical_Trainer|Elíptica
Sube a la elíptica y elige modo manual o un programa. Si la máquina lo permite, ingresa edad y peso para su estimación y ajusta la elevación para modificar la intensidad.
Puedes usar los sensores de los manubrios para vigilar el pulso y la intensidad.

Jogging_Treadmill|Trote en caminadora
Sube a la caminadora y elige modo manual o un programa. Puedes ingresar edad y peso para la estimación de la máquina y ajustar la inclinación para modificar la intensidad.
Mantén una postura adecuada al trotar. Sujeta los pasamanos solo cuando lo necesites, por ejemplo al bajar o revisar el pulso.

Recumbent_Bike|Bicicleta fija reclinada
Siéntate en la bicicleta y ajusta el asiento a tu altura.
Selecciona modo manual o un programa; quizá debas pedalear para encenderla. Puedes ingresar edad y peso para la estimación de la máquina y cambiar la resistencia durante la sesión. Usa los sensores de pulso de los manubrios para vigilar la intensidad.

Rope_Jumping|Salto de cuerda
Sujeta un extremo de la cuerda con cada mano y colócala detrás de ti en el suelo. Gírala sobre la cabeza y al frente; cuando llegue al suelo, salta sobre ella. Busca un ritmo sostenible; puedes variar velocidad y técnica.

Rowing_Stationary|Remo en máquina
Siéntate en la máquina de remo con los talones cómodamente apoyados y las correas ajustadas. Elige un programa si corresponde. Siéntate erguido e inclínate desde la cadera.
Comienza con rodillas flexionadas cerca del pecho y torso ligeramente inclinado al frente, sin perder postura. Empuja los pedales, extiende las piernas y lleva las manos al abdomen superior, juntando los omóplatos. Usa principalmente piernas y cadera para no forzar la espalda.
Para volver, extiende los brazos, flexiona las rodillas y desplaza el cuerpo hacia adelante hasta la posición inicial.

Running_Treadmill|Carrera en caminadora
Sube a la caminadora y elige modo manual o un programa. Puedes ingresar edad y peso para la estimación de la máquina y ajustar la inclinación para modificar la intensidad.
Mantén una postura adecuada al correr. Sujeta los pasamanos solo cuando lo necesites, por ejemplo al bajar o revisar el pulso.

Trail_Running_Walking|Caminata o carrera en sendero
Usa calzado adecuado. Al bajar una pendiente, da pasos más cortos, mantén las rodillas flexionadas para reducir el impacto y disminuye la velocidad para evitar caídas.

Walking_Treadmill|Caminata en caminadora
Sube a la caminadora y elige modo manual o un programa. Puedes ingresar edad y peso para la estimación de la máquina y ajustar la inclinación para modificar la intensidad.
Camina a paso moderado o rápido, manteniendo una postura adecuada. Usa los pasamanos solo cuando sea necesario, por ejemplo al bajar o revisar el pulso.
"""

USDA_SHA256 = "0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef"
EX_SHA256 = "5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf"
NUTRIENTS = {"kcal":1008, "proteina_g":1003, "grasa_g":1004, "carbohidratos_g":1005,
             "fibra_g":1079, "azucares_g":2000, "sodio_mg":1093}
ALLERGENS = ["gluten","lacteos","huevo","cacahuate","frutos_secos","soya","pescado","mariscos","ajonjoli"]
MUSCLES = {"abdominals":"abdomen", "abductors":"abductores", "adductors":"aductores", "biceps":"bíceps",
           "calves":"pantorrillas", "chest":"pecho", "forearms":"antebrazos", "glutes":"glúteos",
           "hamstrings":"parte posterior de los muslos", "lats":"dorsales", "lower back":"espalda baja",
           "middle back":"espalda media", "neck":"cuello", "quadriceps":"cuádriceps", "shoulders":"hombros",
           "traps":"trapecios", "triceps":"tríceps"}
LEVELS = {"beginner":"principiante", "intermediate":"intermedio", "expert":"experto"}
CATEGORIES = {"strength":"fuerza", "stretching":"estiramientos", "cardio":"cardio", "plyometrics":"pliometría"}
EQUIPMENT = {None:"sin equipo especial", "body only":"peso corporal", "dumbbell":"mancuernas",
             "machine":"máquina", "other":"otro equipo"}
EQUIPMENT_OVERRIDES = {
 "3_4_Sit-Up":"peso corporal y apoyo firme para sujetar los pies",
 "Bench_Dips":"banco firme", "Chin-Up":"barra de dominadas", "Flutter_Kicks":"banco plano firme",
 "Incline_Push-Up":"banco o plataforma firme", "Russian_Twist":"apoyo firme para pies o ayuda de otra persona",
 "Sit-Up":"apoyo firme para pies o ayuda de otra persona", "Front_Leg_Raises":"silla o soporte firme",
 "Step-up_with_Knee_Raise":"banco o cajón firme", "Ankle_Circles":"soporte firme",
 "Calf_Stretch_Hands_Against_Wall":"pared", "Hamstring_Stretch":"cinturón, banda o cuerda",
 "Standing_Hip_Circles":"soporte firme", "One-Arm_Dumbbell_Row":"mancuerna y banco plano firme",
 "Seated_Dumbbell_Press":"mancuernas y banco con respaldo", "Bicycling":"bicicleta",
 "Bicycling_Stationary":"bicicleta fija", "Elliptical_Trainer":"máquina elíptica",
 "Jogging_Treadmill":"caminadora", "Recumbent_Bike":"bicicleta fija reclinada",
 "Rope_Jumping":"cuerda para saltar", "Rowing_Stationary":"máquina de remo",
 "Running_Treadmill":"caminadora", "Walking_Treadmill":"caminadora",
 "Trail_Running_Walking":"calzado adecuado para senderos"
}

def download(url, expected):
    # No API keys, cuentas, cachés ni escrituras fuera de BASE.
    with urllib.request.urlopen(url, timeout=120) as response:
        content = response.read()
    actual = hashlib.sha256(content).hexdigest()
    if actual != expected:
        raise ValueError(f"La fuente cambió: {url}; se requiere revisar la selección y el hash.")
    return content

def dump(name, data):
    (BASE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False)+"\n", encoding="utf-8")

def text_schema():
    return {"type":"string", "minLength":1}

def strict_object(properties, required=None):
    return {"type":"object", "properties":properties, "required":list(properties) if required is None else required,
            "additionalProperties":False}

def build_schema():
    numbers = {k:{"type":["number","null"], "minimum":0} for k in NUTRIENTS}
    numbers["kcal"]={"type":"number","minimum":0}
    food_source = strict_object({
        "fuente":{"const":"USDA FoodData Central"}, "dataset":{"const":"SR Legacy (abril de 2018)"},
        "fdc_id":{"type":"integer","minimum":1},
        "url":{"type":"string","pattern":r"^https://fdc\.nal\.usda\.gov/food-details/[0-9]+/nutrients$"},
        "licencia":{"const":"CC0 1.0"}})
    ex_source = strict_object({"fuente":{"const":"free-exercise-db"}, "id_original":text_schema(),
        "url":{"const":EX_URL}, "licencia":{"const":"Unlicense"}})
    muscle_array = {"type":"array","items":{"enum":list(MUSCLES.values())},"uniqueItems":True}
    food = strict_object({
        "id":{"type":"string","pattern":"^usda-[0-9]+$"}, "nombre":text_schema(), "nombre_en":text_schema(),
        "categoria":{"enum":list(FOODS)}, "por_100g":strict_object(numbers),
        "alergenos":{"type":"array","items":{"enum":ALLERGENS},"uniqueItems":True}, "source_ref":food_source})
    exercise = strict_object({
        "id":text_schema(), "nombre":text_schema(), "nombre_en":text_schema(),
        "nivel":{"enum":list(LEVELS.values())}, "equipo":text_schema(), "categoria":{"enum":list(CATEGORIES.values())},
        "musculos_primarios":dict(muscle_array,minItems=1), "musculos_secundarios":muscle_array,
        "instrucciones":{"type":"array","minItems":1,"items":text_schema()}, "source_ref":ex_source,
        "imagenes_ref":{"type":"array","items":{"type":"string","pattern":r"^[A-Za-z0-9_./() -]+\.jpg$"}}},
        ["id","nombre","nombre_en","nivel","equipo","categoria","musculos_primarios","musculos_secundarios","instrucciones","source_ref"])
    return {"$schema":"https://json-schema.org/draft/2020-12/schema", "title":"Catálogos de Progresium",
        "description":"Valida por separado alimentos.json o ejercicios.json; también admite las referencias a $defs.",
        "oneOf":[{"$ref":"#/$defs/alimentos"},{"$ref":"#/$defs/ejercicios"}],
        "$defs":{"alimento":food,"ejercicio":exercise,
                 "alimentos":{"type":"array","minItems":1,"uniqueItems":True,"items":{"$ref":"#/$defs/alimento"}},
                 "ejercicios":{"type":"array","minItems":1,"uniqueItems":True,"items":{"$ref":"#/$defs/ejercicio"}}}}

def build_foods(source):
    by_id = {x["fdcId"]:x for x in source["SRLegacyFoods"]}
    foods=[]
    for category, rows in FOODS.items():
        for row in rows.strip().splitlines():
            fields=row.split("|")
            fdc_id=int(fields[0]); source_food=by_id[fdc_id]
            amounts={x["nutrient"]["id"]:x.get("amount") for x in source_food["foodNutrients"]}
            # SR Legacy: cantidades de nutrientes por 100 g; no convertir ni imputar.
            values={key:amounts.get(nid) for key,nid in NUTRIENTS.items()}
            assert isinstance(values["kcal"], (int,float)), f"Sin kcal: {fdc_id}"
            foods.append({"id":f"usda-{fdc_id}", "nombre":fields[1], "nombre_en":source_food["description"],
                "categoria":category,"por_100g":values,"alergenos":fields[2].split(",") if len(fields)>2 else [],
                "source_ref":{"fuente":"USDA FoodData Central", "dataset":"SR Legacy (abril de 2018)",
                    "fdc_id":fdc_id,"url":f"https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients", "licencia":"CC0 1.0"}})
    return foods

def build_exercises(source):
    by_id={x["id"]:x for x in source}; exercises=[]
    for block in EXERCISES.strip().split("\n\n"):
        rows=block.splitlines(); original_id,name=rows[0].split("|",1); x=by_id[original_id]
        assert x["instructions"] and all(t.strip() for t in x["instructions"]), original_id
        exercises.append({"id":original_id,"nombre":name,"nombre_en":x["name"],"nivel":LEVELS[x["level"]],
            "equipo":EQUIPMENT_OVERRIDES.get(original_id,EQUIPMENT[x["equipment"]]), "categoria":CATEGORIES[x["category"]],
            "musculos_primarios":[MUSCLES[m] for m in x["primaryMuscles"]],
            "musculos_secundarios":[MUSCLES[m] for m in x["secondaryMuscles"]],"instrucciones":rows[1:],
            "source_ref":{"fuente":"free-exercise-db","id_original":original_id,"url":EX_URL,"licencia":"Unlicense"},
            "imagenes_ref":x["images"]})
    return exercises

def validate(foods, exercises, schema):
    Draft202012Validator.check_schema(schema)
    validator=Draft202012Validator(schema)
    for name, rows, expected in [("alimentos",foods,300),("ejercicios",exercises,80)]:
        validator.validate(rows)
        assert len(rows)==expected,(name,len(rows))
        for key in ["id","nombre","nombre_en"]:
            assert len({x[key] for x in rows})==len(rows),f"Duplicados en {name}.{key}"
    assert len({x["source_ref"]["fdc_id"] for x in foods})==len(foods)
    for x in foods:
        assert x["id"]==f'usda-{x["source_ref"]["fdc_id"]}'
        assert x["source_ref"]["url"]==f'https://fdc.nal.usda.gov/food-details/{x["source_ref"]["fdc_id"]}/nutrients'
    for x in exercises:
        assert x["id"]==x["source_ref"]["id_original"]
    return {"estado":"PASS", "alimentos":len(foods), "ejercicios":len(exercises),
            "categorias_alimentos":dict(sorted(Counter(x["categoria"] for x in foods).items())),
            "categorias_ejercicios":dict(sorted(Counter(x["categoria"] for x in exercises).items())),
            "niveles_ejercicios":dict(sorted(Counter(x["nivel"] for x in exercises).items())),
            "musculos_primarios":dict(sorted(Counter(m for x in exercises for m in x["musculos_primarios"]).items())),
            "alimentos_con_faltantes":[{"id":x["id"],"nombre":x["nombre"],"campos":[k for k,v in x["por_100g"].items() if v is None]}
                                      for x in foods if any(v is None for v in x["por_100g"].values())],
            "fuentes_sha256":{"USDA_SR_Legacy":USDA_SHA256,"free-exercise-db":EX_SHA256}}

def build_readme(report):
    food_counts="\n".join(f"- {k}: {v}" for k,v in report["categorias_alimentos"].items())
    exercise_counts=", ".join(f"{k}: {v}" for k,v in report["categorias_ejercicios"].items())
    missing="\n".join(f'- `{x["id"]}` — {x["nombre"]}: {", ".join(x["campos"])}.' for x in report["alimentos_con_faltantes"])
    return f"""# Catálogo estático de Progresium

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
{food_counts}

## Campos de ejercicios

`id`: identificador original, sin cambios. `nombre`: traducción al español; `nombre_en`: nombre original. `nivel`: principiante/intermedio/experto, traducido directamente de la fuente (esta selección no incluye expertos). `equipo`: equipo necesario en español; se aclaran bancos, barras y otros apoyos mencionados en los pasos aunque la fuente diga solo peso corporal o no declare equipo. `categoria`: fuerza, estiramientos, cardio o pliometría según la clasificación de origen, no una reclasificación clínica. `musculos_primarios` y `musculos_secundarios`: grupos traducidos. `instrucciones`: pasos operativos traducidos y resumidos sin cambiar el movimiento. Se omiten publicidad, referencias editoriales sin contexto y ejemplos calóricos genéricos no verificados; las estimaciones que haga una máquina no son mediciones clínicas. No se añade `met` porque no se verificó una correspondencia concreta con el Compendium of Physical Activities.

`imagenes_ref`: rutas relativas originales **solo como referencia**, sin descargar ni incluir imágenes ni afirmar derechos sobre ellas; la app no debe solicitarlas automáticamente. `source_ref`: fuente, identificador, URL del JSON fijada a una revisión y licencia.

Distribución: {exercise_counts}. Niveles: {report['niveles_ejercicios']}. La mayoría usa peso corporal o apoyos domésticos; se incluyen 10 ejercicios con mancuernas y 10 de cardio (varios con máquina). Se cubren abdomen, espalda, pecho, hombros, brazos, glúteos, muslos y pantorrillas. La selección tiene énfasis en abdomen y movilidad; **no es un programa de entrenamiento equilibrado ni una prescripción automática**.

## Fuentes, versiones y licencias

1. USDA Agricultural Research Service, FoodData Central, **SR Legacy, versión final abril de 2018**. Descarga oficial: https://fdc.nal.usda.gov/download-datasets ; archivo: {USDA_URL}. Aunque algunas fichas tienen publicación FDC de 2019, el dataset es SR Legacy 2018. Nutrientes por 100 g de porción comestible, conservados tal como aparecen en el archivo. Licencia CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . Confirmación oficial: https://fdc.nal.usda.gov/api-guide (sección Licensing).
2. yuhonas/free-exercise-db, revisión `79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142`, `dist/exercises.json`: {EX_URL}. Repositorio: https://github.com/yuhonas/free-exercise-db . Unlicense: https://github.com/yuhonas/free-exercise-db/blob/79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142/LICENSE.md . Solo datos textuales y rutas de referencia, no imágenes ni código de terceros.

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
PYTHONDONTWRITEBYTECODE=1 python3 tools/generar_catalogo.py --output-dir /tmp/racha-fuentes
```

Con `jsonschema` ya disponible, basta el último comando. La descarga se procesa **en memoria**: no usa API autenticada ni cachés. Primero compara hashes SHA-256 esperados; si cambian los bytes de una fuente, se detiene, no actualiza los valores a ciegas. La selección y traducción están dentro del script y no dependen de servicios de traducción. Construye ambos JSON y el esquema; después **reabre los archivos**, valida con `Draft202012Validator`, comprueba conteos, IDs/nombres únicos, referencias y energía numérica. `validacion.json` registra el resultado. Repetir con las mismas fuentes produce los mismos archivos.

SHA-256 USDA: `{USDA_SHA256}`. SHA-256 ejercicios: `{EX_SHA256}`.

## Precauciones

- Valores por **100 g de porción comestible**, no por pieza, taza, porción habitual ni 100 ml. En bebidas no asumir que g y ml son intercambiables sin densidad. Respetar crudo/cocido, escurrido, con piel y otros estados al elegir una ficha. Las variantes crudas/cocidas son registros distintos, no duplicados.
- Son alimentos de referencia estadounidenses: no representan exactamente todas las marcas, recetas o variedades mexicanas. Bolillo, tortilla, horchata y hummus son referencias genéricas, no recetas universales. No sustituir un alimento por otro solo por similitud del nombre.
- Alérgenos derivados de la identidad del alimento de forma conservadora: avena marcada gluten por precaución de contaminación; aceites de soya y ajonjolí, lácteos clarificados y coco se marcan por precaución aunque el refinado, las proteínas residuales y las clasificaciones regulatorias varíen. Horchata se marca lacteos/frutos_secos por recetas posibles, **no por confirmación analítica**. Los panes y pastas pueden contener ingredientes adicionales que la descripción no identifica. Un arreglo vacío **no garantiza** que el alimento sea seguro. Antes de consumo, confirmar etiquetas/recetas y contaminación cruzada. No usar este catálogo como único filtro de seguridad para alergias graves.
- Los frijoles y otras leguminosas secos/crudos son referencias nutricionales; requieren preparación y cocción adecuadas, no se recomiendan para comer crudos. Lo mismo aplica a carnes, pescado y huevo crudos: no son una recomendación de consumo sin cocción.
- Las etiquetas de nivel son las de la fuente, no una evaluación individual: algunas dominadas, fondos, saltos y variantes abdominales pueden ser exigentes aunque estén marcadas como principiante. No automatizar recomendaciones por esa etiqueta. La fuente incluye criterios de rodilla y respiración discutibles o dependientes del contexto, conservados como atribución, no como consejo médico. Conviene revisión profesional antes de uso con personas reales; no prometer una rutina validada clínicamente.
- No sustituye asesoría médica, nutricional ni de entrenamiento. Evitar dolor, adaptar la actividad a la persona y buscar orientación profesional cuando corresponda.

## Nutrientes ausentes

{len(report['alimentos_con_faltantes'])} alimentos tienen al menos un nutriente ausente; todos tienen kcal numéricas. Lista completa (no se imputó cero):

{missing}
"""

def main():
    archive=download(USDA_URL,USDA_SHA256)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        source_foods=json.loads(z.read("FoodData_Central_sr_legacy_food_json_2018-04.json"))
    source_exercises=json.loads(download(EX_URL,EX_SHA256))
    foods=build_foods(source_foods); exercises=build_exercises(source_exercises); schema=build_schema()
    # Validar antes y después de escribir para detectar errores de serialización.
    validate(foods,exercises,schema)
    dump("alimentos.json",foods); dump("ejercicios.json",exercises); dump("schema.json",schema)
    report=validate(json.loads((BASE/"alimentos.json").read_text(encoding="utf-8")),
                    json.loads((BASE/"ejercicios.json").read_text(encoding="utf-8")),
                    json.loads((BASE/"schema.json").read_text(encoding="utf-8")))
    dump("validacion.json",report)
    (BASE/"README.md").write_text(build_readme(report),encoding="utf-8")
    print(json.dumps({k:report[k] for k in ["estado","alimentos","ejercicios","categorias_alimentos","categorias_ejercicios","niveles_ejercicios"]},ensure_ascii=False,indent=2))
    print(f"Alimentos con nutrientes ausentes: {len(report['alimentos_con_faltantes'])}")

if __name__ == "__main__":
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir',type=Path,required=True,help='Directorio temporal para fuentes y validación, nunca public/')
    args=parser.parse_args()
    BASE=args.output_dir.resolve()
    BASE.mkdir(parents=True,exist_ok=True)
    main()
