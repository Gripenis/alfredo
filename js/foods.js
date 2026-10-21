/* Ristorante Alfredo – built-in food database.
   Values are approximate, per 100 g of the raw/as-sold food, based on typical
   values from USDA FoodData Central and Livsmedelsverket. Good enough for
   weekly trends, not for medical precision.

   Value order (19): vitA µg, vitD µg, vitE mg, vitK µg, B1 mg, B2 mg, B3 mg,
   B6 mg, folate µg, B12 µg, vitC mg, Ca mg, Fe mg, Mg mg, K mg, Zn mg,
   Se µg, I µg, P mg

   d  = density in g per ml (enables volume units like dl, msk, tsk)
   pc = standard piece weights in g (st, klyfta, skiva, burk, forp, bit,
        kula, kruka, nave = handful, klick = knob)
*/
'use strict';

const NUTRIENT_KEYS = ['vitA','vitD','vitE','vitK','b1','b2','b3','b6','folate','b12','vitC','ca','fe','mg','kalium','zn','se','iod','p'];

const NUTRIENT_META = {
  vitA:   { u: 'µg', sv: 'Vitamin A',        en: 'Vitamin A' },
  vitD:   { u: 'µg', sv: 'Vitamin D',        en: 'Vitamin D' },
  vitE:   { u: 'mg', sv: 'Vitamin E',        en: 'Vitamin E' },
  vitK:   { u: 'µg', sv: 'Vitamin K',        en: 'Vitamin K' },
  b1:     { u: 'mg', sv: 'Tiamin (B1)',      en: 'Thiamin (B1)' },
  b2:     { u: 'mg', sv: 'Riboflavin (B2)',  en: 'Riboflavin (B2)' },
  b3:     { u: 'mg', sv: 'Niacin (B3)',      en: 'Niacin (B3)' },
  b6:     { u: 'mg', sv: 'Vitamin B6',       en: 'Vitamin B6' },
  folate: { u: 'µg', sv: 'Folat',            en: 'Folate' },
  b12:    { u: 'µg', sv: 'Vitamin B12',      en: 'Vitamin B12' },
  vitC:   { u: 'mg', sv: 'Vitamin C',        en: 'Vitamin C' },
  ca:     { u: 'mg', sv: 'Kalcium',          en: 'Calcium' },
  fe:     { u: 'mg', sv: 'Järn',             en: 'Iron' },
  mg:     { u: 'mg', sv: 'Magnesium',        en: 'Magnesium' },
  kalium: { u: 'mg', sv: 'Kalium',           en: 'Potassium' },
  zn:     { u: 'mg', sv: 'Zink',             en: 'Zinc' },
  se:     { u: 'µg', sv: 'Selen',            en: 'Selenium' },
  iod:    { u: 'µg', sv: 'Jod',              en: 'Iodine' },
  p:      { u: 'mg', sv: 'Fosfor',           en: 'Phosphorus' }
};

/* Approximate daily reference values, based on Nordic Nutrition
   Recommendations 2023 (adults). Editable in the app. */
function defaultDailyTarget(key, sex, age) {
  const m = sex !== 'f';
  age = Number(age) || 30;
  switch (key) {
    case 'vitA': return m ? 800 : 700;
    case 'vitD': return age >= 75 ? 20 : 10;
    case 'vitE': return m ? 11 : 10;
    case 'vitK': return m ? 75 : 65;
    case 'b1': return m ? 1.2 : 1.0;
    case 'b2': return m ? 1.6 : 1.4;
    case 'b3': return m ? 16 : 13;
    case 'b6': return m ? 1.8 : 1.5;
    case 'folate': return 330;
    case 'b12': return 4;
    case 'vitC': return m ? 110 : 95;
    case 'ca': return age < 25 ? 1000 : 950;
    case 'fe': return m ? 9 : (age <= 50 ? 15 : 9);
    case 'mg': return m ? 350 : 300;
    case 'kalium': return 3500;
    case 'zn': return m ? 11 : 9;
    case 'se': return m ? 90 : 75;
    case 'iod': return 150;
    case 'p': return 550;
  }
  return 0;
}

const FOOD_CATS = {
  veg:     { sv: 'Grönsaker',          en: 'Vegetables' },
  herb:    { sv: 'Örter',              en: 'Herbs' },
  fruit:   { sv: 'Frukt & bär',        en: 'Fruit & berries' },
  grain:   { sv: 'Spannmål & bröd',    en: 'Grains & bread' },
  legume:  { sv: 'Baljväxter',         en: 'Legumes' },
  dairy:   { sv: 'Mejeri',             en: 'Dairy' },
  egg:     { sv: 'Ägg',                en: 'Eggs' },
  meat:    { sv: 'Kött & fågel',       en: 'Meat & poultry' },
  fish:    { sv: 'Fisk & skaldjur',    en: 'Fish & seafood' },
  fat:     { sv: 'Fett & olja',        en: 'Fats & oils' },
  nut:     { sv: 'Nötter & frön',      en: 'Nuts & seeds' },
  spice:   { sv: 'Kryddor & salt',     en: 'Spices & salt' },
  sauce:   { sv: 'Såser & smaksättare',en: 'Sauces & condiments' },
  sweet:   { sv: 'Sött & bak',         en: 'Sweet & baking' },
  drink:   { sv: 'Dryck',              en: 'Drinks' },
  other:   { sv: 'Övrigt',             en: 'Other' }
};

const FOOD_DB = [];
function F(id, sv, en, cat, d, pc, v, al) {
  const n = {};
  NUTRIENT_KEYS.forEach((k, i) => { if (v[i]) n[k] = v[i]; });
  FOOD_DB.push({ id, sv, en, cat, d: d || 0, pc: pc || {}, n, al: al || [] });
}

/*            id            sv                         en                      cat     d     pieces                    A     D     E     K      B1    B2    B3    B6    Fol  B12  C     Ca    Fe    Mg   K     Zn    Se   I    P  */
// Vegetables
F('onion',     'Gul lök',             'Onion',                'veg', 0, {st:150},              [0,0,.02,.4,.046,.027,.12,.12,19,0,7.4,23,.21,10,146,.17,.5,1,29], ['lök','onion','yellow onion']);
F('redonion',  'Rödlök',              'Red onion',            'veg', 0, {st:120},              [0,0,.02,.4,.046,.027,.12,.12,19,0,7.4,23,.21,10,146,.17,.5,1,29]);
F('garlic',    'Vitlök',              'Garlic',               'veg', 0, {klyfta:5, st:50},     [0,0,.08,1.7,.2,.11,.7,1.24,3,0,31,181,1.7,25,401,1.16,14.2,1,153], ['vitlöksklyfta','garlic clove']);
F('shallot',   'Schalottenlök',       'Shallot',              'veg', 0, {st:30},               [1,0,.04,.8,.06,.02,.2,.35,34,0,8,37,1.2,21,334,.4,1.2,0,60]);
F('leek',      'Purjolök',            'Leek',                 'veg', 0, {st:200},              [83,0,.92,47,.06,.03,.4,.23,64,0,12,59,2.1,28,180,.12,1,0,35]);
F('springonion','Salladslök / vårlök','Spring onion',         'veg', 0, {st:15},               [50,0,.55,207,.055,.08,.53,.06,64,0,18.8,72,1.48,20,276,.39,.6,0,37], ['salladslök','vårlök','scallion']);
F('carrot',    'Morot',               'Carrot',               'veg', 0, {st:70},               [835,0,.66,13.2,.066,.058,.98,.14,19,0,5.9,33,.3,12,320,.24,.1,2,35], ['morötter']);
F('potato',    'Potatis',             'Potato',               'veg', 0, {st:100},              [0,0,.01,2,.08,.03,1.05,.3,15,0,19.7,12,.8,23,425,.3,.3,3,57]);
F('sweetpotato','Sötpotatis',         'Sweet potato',         'veg', 0, {st:250},              [709,0,.26,1.8,.08,.06,.56,.21,11,0,2.4,30,.6,25,337,.3,.6,0,47]);
F('tomato',    'Tomat',               'Tomato',               'veg', 0, {st:120},              [42,0,.54,7.9,.037,.019,.59,.08,15,0,13.7,10,.27,11,237,.17,0,0,24]);
F('cherrytomato','Körsbärstomater',   'Cherry tomatoes',      'veg', 0, {st:15, nave:80},      [42,0,.54,7.9,.037,.019,.59,.08,15,0,13.7,10,.27,11,237,.17,0,0,24]);
F('cannedtomato','Krossade tomater',  'Crushed tomatoes',     'veg', 1.05, {burk:400, forp:500},[9,0,1.25,2.6,.07,.05,.73,.11,8,0,9,33,1,11,191,.14,.7,0,19], ['krossade','passerade tomater','canned tomatoes','passata']);
F('tomatopaste','Tomatpuré',          'Tomato paste',         'veg', 1.1, {},                  [75,0,4.3,11.4,.06,.15,3.1,.22,12,0,22,36,3,42,1014,.6,5.3,0,83], ['tomatpure']);
F('bellpepper','Paprika',             'Bell pepper',          'veg', 0, {st:150},              [157,0,1.58,4.9,.054,.085,.98,.29,46,0,128,7,.43,12,211,.25,.1,0,26], ['röd paprika','bell pepper']);
F('cucumber',  'Gurka',               'Cucumber',             'veg', 0, {st:300},              [5,0,.03,16.4,.027,.033,.1,.04,7,0,2.8,16,.28,13,147,.2,.3,0,24]);
F('zucchini',  'Zucchini',            'Zucchini',             'veg', 0, {st:250},              [10,0,.12,4.3,.045,.094,.45,.16,24,0,17.9,16,.37,18,261,.32,.2,0,38], ['squash','courgette']);
F('eggplant',  'Aubergine',           'Eggplant',             'veg', 0, {st:300},              [1,0,.3,3.5,.039,.037,.65,.08,22,0,2.2,9,.23,14,229,.16,.3,0,24]);
F('broccoli',  'Broccoli',            'Broccoli',             'veg', 0, {st:400},              [31,0,.78,101.6,.071,.117,.64,.18,63,0,89.2,47,.73,21,316,.41,2.5,0,66]);
F('cauliflower','Blomkål',            'Cauliflower',          'veg', 0, {st:600},              [0,0,.08,15.5,.05,.06,.5,.18,57,0,48.2,22,.42,15,299,.27,.6,0,44]);
F('spinach',   'Spenat',              'Spinach',              'veg', 0, {nave:25},             [469,0,2.03,482.9,.078,.189,.72,.2,194,0,28.1,99,2.71,79,558,.53,1,2,49], ['babyspenat']);
F('kale',      'Grönkål',             'Kale',                 'veg', 0, {nave:25},             [241,0,.66,389.6,.11,.35,1.2,.15,62,0,93,254,1.6,33,348,.39,.9,0,55]);
F('cabbage',   'Vitkål',              'Cabbage',              'veg', 0, {st:1000},             [5,0,.15,76,.061,.04,.23,.12,43,0,36.6,40,.47,12,170,.18,.3,0,26], ['kål']);
F('lettuce',   'Sallad (isberg)',     'Lettuce',              'veg', 0, {st:500, nave:30},     [25,0,.18,24,.04,.025,.12,.04,29,0,2.8,18,.41,7,141,.15,.1,0,20], ['isbergssallad','romansallad','sallad']);
F('arugula',   'Ruccola',             'Arugula',              'veg', 0, {nave:20, forp:65},    [119,0,.43,108.6,.044,.086,.31,.07,97,0,15,160,1.46,47,369,.47,.3,0,52], ['rucola','rocket']);
F('mushroom',  'Champinjoner',        'Mushrooms',            'veg', 0, {st:20, forp:250},     [0,.2,.01,0,.081,.402,3.6,.1,17,.04,2.1,3,.5,9,318,.52,9.3,0,86], ['svamp','champinjon']);
F('corn',      'Majs',                'Sweet corn',           'veg', .65, {burk:285},          [9,0,.07,.3,.155,.055,1.77,.09,42,0,6.8,2,.52,37,270,.46,.6,0,89], ['majskorn']);
F('peas',      'Gröna ärtor',         'Green peas',           'veg', .6, {},                   [38,0,.13,24.8,.27,.13,2.09,.17,65,0,40,25,1.47,33,244,1.24,1.8,0,108], ['ärter','ärtor']);
F('greenbeans','Haricots verts',      'Green beans',          'veg', 0, {nave:50},             [35,0,.41,43,.08,.1,.73,.14,33,0,12.2,37,1,25,211,.24,.6,0,38], ['bönor gröna','sugar snaps','sockerärtor']);
F('celery',    'Blekselleri',         'Celery',               'veg', 0, {st:40},               [22,0,.27,29.3,.021,.057,.32,.07,36,0,3.1,40,.2,11,260,.13,.4,0,24], ['selleri','stjälkselleri']);
F('beetroot',  'Rödbetor',            'Beetroot',             'veg', 0, {st:120},              [2,0,.04,.2,.031,.04,.33,.07,109,0,4.9,16,.8,23,325,.35,.7,0,40], ['rödbeta']);
F('avocado',   'Avokado',             'Avocado',              'veg', 0, {st:150},              [7,0,2.07,21,.067,.13,1.74,.26,81,0,10,12,.55,29,485,.64,.4,0,52]);
F('ginger',    'Ingefära (färsk)',    'Ginger (fresh)',       'veg', .6, {bit:10},             [0,0,.26,.1,.025,.034,.75,.16,11,0,5,16,.6,43,415,.34,.7,0,34], ['ingefära','ginger']);
F('chili',     'Chili (färsk)',       'Chili (fresh)',        'veg', 0, {st:15},               [48,0,.69,14,.07,.09,1.24,.5,23,0,144,14,1,23,322,.26,.5,0,43], ['chilipeppar','jalapeño']);
F('bokchoy',   'Pak choi',            'Bok choy',             'veg', 0, {st:150},              [223,0,.09,45.5,.04,.07,.5,.19,66,0,45,105,.8,19,252,.19,.5,0,37], ['pak choy']);
F('beansprouts','Böngroddar',         'Bean sprouts',         'veg', 0, {nave:50, forp:200},   [1,0,.1,33,.084,.124,.75,.09,61,0,13.2,13,.91,21,149,.41,.6,0,54]);
F('olives',    'Oliver',              'Olives',               'veg', .6, {st:4, nave:40},      [20,0,3.8,1.4,0,0,.04,.01,0,0,0,52,.49,11,42,.04,.9,0,4]);
// Herbs
F('basil',     'Basilika (färsk)',    'Basil (fresh)',        'herb', .2, {nave:10, kruka:30}, [264,0,.8,414.8,.034,.076,.9,.16,68,0,18,177,3.17,64,295,.81,.3,0,56], ['basilika','basil']);
F('parsley',   'Persilja (färsk)',    'Parsley (fresh)',      'herb', .25,{nave:15, kruka:30}, [421,0,.75,1640,.086,.098,1.31,.09,152,0,133,138,6.2,50,554,1.07,.1,0,58], ['persilja','bladpersilja']);
F('coriander', 'Koriander (färsk)',   'Coriander (fresh)',    'herb', .2, {nave:10, kruka:30}, [337,0,2.5,310,.067,.162,1.11,.15,62,0,27,67,1.77,26,521,.5,.9,0,48], ['koriander','cilantro']);
F('dill',      'Dill (färsk)',        'Dill (fresh)',         'herb', .2, {nave:10, kruka:30}, [386,0,0,0,.058,.296,1.57,.19,150,0,85,208,6.6,55,738,.91,0,0,66], ['dill']);
F('chives',    'Gräslök',             'Chives',               'herb', .2, {nave:10, kruka:30}, [218,0,.21,212.7,.078,.115,.65,.14,105,0,58.1,92,1.6,42,296,.56,.9,0,58]);
F('mint',      'Mynta (färsk)',       'Mint (fresh)',         'herb', .2, {nave:10, kruka:30}, [212,0,0,0,.082,.266,1.71,.13,114,0,31.8,243,5.08,80,569,1.11,.4,0,73], ['mynta']);
// Fruit & berries
F('lemon',     'Citron',              'Lemon',                'fruit', 0, {st:110},            [1,0,.15,0,.04,.02,.1,.08,11,0,53,26,.6,8,138,.06,.4,0,16]);
F('lemonjuice','Citronsaft',          'Lemon juice',          'fruit', 1.03,{st:40},           [1,0,.15,.1,.024,.015,.09,.05,20,0,38.7,6,.08,6,103,.05,.1,0,8], ['pressad citron']);
F('lime',      'Lime',                'Lime',                 'fruit', 0, {st:65},             [2,0,.22,.6,.03,.02,.2,.04,8,0,29.1,33,.6,6,102,.11,.4,0,18], ['limesaft']);
F('apple',     'Äpple',               'Apple',                'fruit', 0, {st:150},            [3,0,.18,2.2,.017,.026,.09,.04,3,0,4.6,6,.12,5,107,.04,0,0,11]);
F('banana',    'Banan',               'Banana',               'fruit', 0, {st:120},            [3,0,.1,.5,.031,.073,.67,.37,20,0,8.7,5,.26,27,358,.15,1,0,22]);
F('orange',    'Apelsin',             'Orange',               'fruit', 0, {st:150},            [11,0,.18,0,.087,.04,.28,.06,30,0,53.2,40,.1,10,181,.07,.5,0,14]);
F('blueberries','Blåbär',             'Blueberries',          'fruit', .6, {nave:50},          [3,0,.57,19.3,.037,.041,.42,.05,6,0,9.7,6,.28,6,77,.16,.1,0,12]);
F('strawberries','Jordgubbar',        'Strawberries',         'fruit', .6, {st:15},            [1,0,.29,2.2,.024,.022,.39,.05,24,0,58.8,16,.41,13,153,.14,.4,0,24]);
F('raspberries','Hallon',             'Raspberries',          'fruit', .55,{nave:50},          [2,0,.87,7.8,.032,.038,.6,.06,21,0,26.2,25,.69,22,151,.42,.2,0,29]);
F('mango',     'Mango',               'Mango',                'fruit', 0, {st:300},            [54,0,.9,4.2,.028,.038,.67,.12,43,0,36.4,11,.16,10,168,.09,.6,0,14]);
F('pineapple', 'Ananas',              'Pineapple',            'fruit', 0, {st:900, burk:340},  [3,0,.02,.7,.079,.032,.5,.11,18,0,47.8,13,.29,12,109,.12,.1,0,8]);
F('raisins',   'Russin',              'Raisins',              'fruit', .6, {nave:30},          [0,0,.12,3.5,.106,.125,.77,.17,5,0,2.3,50,1.88,32,749,.22,.6,0,101]);
// Grains & bread
F('flour',     'Vetemjöl',            'Wheat flour',          'grain', .6, {},                 [0,0,.06,.3,.12,.04,1.25,.04,26,0,0,15,1.17,22,107,.7,8,0,108], ['mjöl','flour','all-purpose flour']);
F('wholeflour','Fullkornsvetemjöl',   'Whole wheat flour',    'grain', .55,{},                 [0,0,.71,1.9,.5,.17,5,.4,44,0,0,34,3.6,137,363,2.6,10,0,357], ['grahamsmjöl','dinkelmjöl']);
F('rice',      'Ris (vitt, okokt)',   'White rice (uncooked)','grain', .85,{},                 [0,0,.11,.1,.07,.05,1.6,.16,8,0,0,28,.8,25,115,1.1,15,0,115], ['ris','jasminris','basmatiris','arborioris','risottoris','rice']);
F('brownrice', 'Fullkornsris (okokt)','Brown rice (uncooked)','grain', .85,{},                 [0,0,.59,1.9,.4,.09,5.1,.5,20,0,0,23,1.47,143,223,2,23,0,333], ['råris']);
F('pasta',     'Pasta (torr)',        'Pasta (dry)',          'grain', 0, {},                  [0,0,.11,.1,.09,.06,1.7,.14,18,0,0,21,1.3,53,223,1.4,15,0,189], ['spaghetti','penne','tagliatelle','makaroner','fusilli','rigatoni','linguine','lasagneplattor']);
F('wholepasta','Fullkornspasta',      'Whole wheat pasta',    'grain', 0, {},                  [0,0,.5,1.5,.5,.1,5,.2,44,0,0,40,3.6,143,215,2.4,20,0,258]);
F('freshpasta','Färsk pasta (med ägg)','Fresh egg pasta',     'grain', 0, {},                  [40,.3,.3,.1,.2,.15,1.5,.1,30,.2,0,20,1.5,30,150,1,25,8,150]);
F('eggnoodles','Äggnudlar (torra)',   'Egg noodles (dry)',    'grain', 0, {},                  [14,0,.3,0,.2,.1,2,.2,30,.1,0,35,2,50,230,1.6,30,0,200], ['nudlar','noodles']);
F('ricenoodles','Risnudlar (torra)',  'Rice noodles (dry)',   'grain', 0, {},                  [0,0,0,0,.03,.02,.2,.1,3,0,0,18,.7,12,30,.7,5,0,99]);
F('oats',      'Havregryn',           'Rolled oats',          'grain', .35,{},                 [0,0,.42,2,.46,.155,1.1,.1,32,0,0,52,4.3,138,362,3.6,28.9,0,410], ['havre','oats']);
F('couscous',  'Couscous (torr)',     'Couscous (dry)',       'grain', .7, {},                 [0,0,.06,.1,.16,.08,3.5,.11,20,0,0,24,1.08,44,166,.83,27.5,0,170]);
F('bulgur',    'Bulgur (torr)',       'Bulgur (dry)',         'grain', .7, {},                 [0,0,.06,1.9,.23,.12,5.1,.34,27,0,0,35,2.46,164,410,1.93,2.3,0,300]);
F('quinoa',    'Quinoa (torr)',       'Quinoa (dry)',         'grain', .8, {},                 [1,0,2.44,0,.36,.32,1.52,.49,184,0,0,47,4.57,197,563,3.1,8.5,0,457]);
F('bread',     'Bröd (vitt)',         'White bread',          'grain', 0, {skiva:30, st:70},   [0,0,.2,.2,.2,.1,2,.08,40,0,0,40,1.2,25,120,.7,10,5,100], ['vitt bröd','baguette','ciabatta','hamburgerbröd','surdegsbröd']);
F('wholebread','Fullkornsbröd',       'Whole grain bread',    'grain', 0, {skiva:35},          [0,0,.4,1.9,.3,.12,4,.2,42,0,0,60,2.4,76,250,1.8,15,5,200], ['rågbröd','knäckebröd']);
F('breadcrumbs','Ströbröd',           'Breadcrumbs',          'grain', .45,{},                 [0,0,.1,0,.2,.1,2,.1,30,0,0,70,1.8,40,190,1.2,10,0,150], ['panko']);
F('tortilla',  'Tortillabröd',        'Tortilla',             'grain', 0, {st:40},             [0,0,.1,0,.2,.1,2.5,.05,30,0,0,100,2.5,25,130,.6,10,0,130], ['wraps','tortillas']);
F('polenta',   'Polenta / majsmjöl',  'Polenta / cornmeal',   'grain', .65,{},                 [11,0,.4,.3,.25,.08,1.9,.18,25,0,0,6,.9,32,140,.66,7,0,85], ['majsmjöl','polenta']);
F('starch',    'Maizena / potatismjöl','Cornstarch',          'grain', .6, {},                 [0,0,0,0,0,0,0,0,0,0,0,2,.47,3,3,.06,2.8,0,13], ['maizena','majsstärkelse','potatismjöl']);
// Legumes
F('chickpeas', 'Kikärtor (kokta)',    'Chickpeas (cooked)',   'legume', .65,{burk:230},        [1,0,.35,4,.116,.063,.53,.14,172,0,1.3,49,2.89,48,291,1.53,3.7,0,168], ['kikärter','chickpeas']);
F('redlentils','Röda linser (torra)', 'Red lentils (dry)',    'legume', .85,{},                [2,0,.49,5,.5,.11,1.5,.4,204,0,1.7,48,7.4,59,580,3.6,8,0,294], ['linser','lentils']);
F('blackbeans','Svarta bönor (kokta)','Black beans (cooked)', 'legume', .65,{burk:230},        [0,0,.87,3.3,.244,.059,.51,.07,149,0,0,27,2.1,70,355,1.12,1.2,0,140]);
F('kidneybeans','Kidneybönor (kokta)','Kidney beans (cooked)','legume', .65,{burk:230},        [0,0,.03,8.4,.16,.058,.58,.12,130,0,1.2,35,2.22,42,403,1,1.2,0,142], ['röda bönor']);
F('whitebeans','Vita bönor (kokta)',  'White beans (cooked)', 'legume', .65,{burk:230},        [0,0,.94,3.5,.118,.046,.14,.13,81,0,0,90,3.7,63,561,1.38,1.3,0,113], ['cannellinibönor','butterbeans','smörbönor']);
F('tofu',      'Tofu',                'Tofu',                 'legume', 0, {forp:400},         [0,0,.01,2,.081,.052,.2,.05,15,0,0,350,5.36,30,121,.8,8.9,0,97]);
F('edamame',   'Edamame',             'Edamame',              'legume', .6, {},                [9,0,.68,26.7,.2,.155,.92,.1,311,0,6.1,63,2.27,64,436,1.37,.8,0,169], ['sojabönor']);
F('peanutbutter','Jordnötssmör',      'Peanut butter',        'legume', 1.05,{},               [0,0,9,.3,.15,.19,13.1,.44,87,0,0,49,1.7,168,558,2.8,4.1,0,339]);
// Dairy
F('milk',      'Mjölk (3 %)',         'Whole milk',           'dairy', 1.03,{},                [33,1,.07,.3,.04,.17,.1,.04,5,.45,1,120,.03,11,150,.4,2,15,90], ['standardmjölk','mjölk','milk']);
F('lowmilk',   'Mellanmjölk (1,5 %)', 'Semi-skimmed milk',    'dairy', 1.03,{},                [45,1,.04,.1,.04,.17,.1,.04,5,.45,1,120,.03,11,155,.4,2,15,92], ['lättmjölk']);
F('cream',     'Vispgrädde (36 %)',   'Whipping cream',       'dairy', 1.0, {},                [350,.6,.9,3.2,.02,.16,.04,.03,4,.2,.6,70,.03,7,95,.2,.5,8,60], ['grädde','cream','heavy cream']);
F('cookcream', 'Matlagningsgrädde',   'Cooking cream',        'dairy', 1.0, {},                [150,.3,.4,1.5,.03,.15,.1,.04,5,.3,1,95,.05,9,120,.3,1.5,10,80], ['matgrädde']);
F('cremefraiche','Crème fraiche',     'Crème fraîche',        'dairy', 1.0, {},                [330,.3,.9,3,.02,.15,.07,.02,8,.25,.9,80,.1,8,100,.3,.5,8,70], ['creme fraiche']);
F('sourcream', 'Gräddfil',            'Sour cream',           'dairy', 1.0, {},                [120,.1,.3,1,.03,.18,.1,.04,10,.3,1,110,.05,11,150,.4,2,12,90]);
F('yoghurt',   'Yoghurt naturell',    'Plain yoghurt',        'dairy', 1.03,{},                [30,.1,.06,.2,.03,.18,.1,.05,12,.4,.5,125,.05,12,160,.6,2.2,15,100], ['yoghurt','fil','filmjölk']);
F('greekyog',  'Turkisk/grekisk yoghurt','Greek yoghurt',     'dairy', 1.05,{},                [90,.1,.2,0,.03,.2,.1,.05,7,.5,0,120,.1,11,140,.5,3,12,120], ['grekisk yoghurt','turkisk yoghurt']);
F('quark',     'Kvarg',               'Quark',                'dairy', 1.05,{},                [5,0,0,0,.03,.25,.1,.05,12,.6,0,100,.1,11,140,.5,4,12,160]);
F('butter',    'Smör',                'Butter',               'fat',   .95, {klick:10},        [684,.6,2.3,7,.005,.034,.04,.003,3,.17,0,24,.02,2,24,.09,1,4,24], ['butter']);
F('margarine', 'Margarin / bregott', 'Margarine / spread',   'fat',   .95, {klick:10},        [800,10,8,50,0,0,0,0,0,0,0,10,0,1,20,0,.3,0,10], ['bregott','flytande margarin']);
F('parmesan',  'Parmesan',            'Parmesan',             'dairy', .4,  {},                [207,.5,.22,1.7,.04,.33,.27,.09,7,1.2,0,1184,.82,44,92,2.75,22.5,40,694], ['parmigiano','grana padano','pecorino']);
F('mozzarella','Mozzarella',          'Mozzarella',           'dairy', 0,   {kula:125},        [179,.4,.19,2.3,.03,.28,.1,.04,7,2.3,0,505,.44,20,76,2.92,17,20,354], ['burrata']);
F('hardcheese','Hårdost (t.ex. präst)','Hard cheese',         'dairy', .4,  {skiva:10},        [280,.3,.5,2.5,.03,.35,.1,.08,10,1.5,0,750,.2,30,80,4,12,30,500], ['ost','prästost','grevé','herrgård','västerbotten']);
F('cheddar',   'Cheddar',             'Cheddar',              'dairy', .4,  {skiva:10},        [265,.6,.71,2.4,.03,.43,.06,.07,27,1.1,0,710,.14,27,76,3.64,28.5,30,455], ['riven ost']);
F('feta',      'Fetaost',             'Feta cheese',          'dairy', 0,   {forp:150},        [125,.4,.18,1.8,.15,.84,.99,.42,32,1.69,0,493,.65,19,62,2.88,15,20,337], ['feta','salladsost']);
F('halloumi',  'Halloumi',            'Halloumi',             'dairy', 0,   {forp:200},        [200,.2,.3,0,.03,.3,.1,.05,10,1.2,0,700,.3,30,100,3,10,20,450]);
F('creamcheese','Färskost',           'Cream cheese',         'dairy', 1.0, {},                [308,.2,.86,2.1,.02,.13,.1,.06,9,.22,0,97,.11,9,132,.5,8.6,10,107], ['philadelphia','cream cheese','mascarpone']);
F('ricotta',   'Ricotta',             'Ricotta',              'dairy', 1.0, {},                [120,.2,.1,1.1,.01,.19,.1,.04,12,.34,0,207,.38,11,105,1.16,14.5,15,158], ['keso','cottage cheese']);
// Eggs
F('egg',       'Ägg',                 'Egg',                  'egg', 0, {st:50},               [160,2,1.05,.3,.04,.46,.08,.17,47,.89,0,56,1.75,12,138,1.29,30.7,30,198], ['ägg','egg','eggs']);
F('eggyolk',   'Äggula',              'Egg yolk',             'egg', 0, {st:17},               [381,5.4,2.58,.7,.18,.53,.02,.35,146,1.95,0,129,2.73,5,109,2.3,56,90,390], ['äggulor']);
F('eggwhite',  'Äggvita',             'Egg white',            'egg', 0, {st:33},               [0,0,0,0,.004,.44,.1,.005,4,.09,0,7,.08,11,163,.03,20,3,15], ['äggvitor']);
// Meat & poultry
F('beefmince', 'Nötfärs',             'Ground beef',          'meat', 0, {forp:500},           [0,.3,.2,1.5,.04,.15,5,.36,6,2.2,0,12,2.3,20,300,4.8,15,1,190], ['köttfärs','ground beef']);
F('mixmince',  'Blandfärs',           'Mixed mince',          'meat', 0, {forp:500},           [2,.4,.2,1,.25,.18,4.8,.35,5,1.6,0,12,1.6,20,300,3.6,14,1,180]);
F('porkmince', 'Fläskfärs',           'Ground pork',          'meat', 0, {forp:500},           [2,.5,.2,0,.7,.2,4.3,.35,5,.7,0,15,1,20,290,2.4,15,1,180]);
F('lambmince', 'Lammfärs',            'Ground lamb',          'meat', 0, {forp:500},           [0,.1,.2,0,.11,.2,6,.13,18,2.3,0,16,1.6,21,270,3.4,19,1,190]);
F('beef',      'Nötkött (biff/entrecôte)','Beef steak',       'meat', 0, {st:200},             [0,.1,.3,1.5,.07,.15,5.7,.55,6,2,0,12,2.2,22,330,4.5,22,1,200], ['biff','entrecote','ryggbiff','oxfilé','högrev','grytbitar']);
F('pork',      'Fläskkött (filé/kotlett)','Pork (tenderloin/chop)','meat', 0, {st:150},        [2,.5,.2,0,.95,.25,6,.6,2,.5,0,6,.9,26,400,1.9,30,1,230], ['fläskfilé','fläskkotlett','karré','fläskytterfilé']);
F('bacon',     'Bacon',               'Bacon',                'meat', 0, {skiva:15, forp:140}, [11,.5,.3,0,.3,.1,4,.2,1,.7,0,6,.5,12,200,1.2,20,1,140], ['sidfläsk','pancetta','guanciale']);
F('chorizo',   'Chorizo / salami',    'Chorizo / salami',     'meat', 0, {skiva:5, st:70},     [10,.3,.2,0,.6,.3,5,.5,2,2,0,10,1.6,18,400,3.4,21,1,280], ['salami','chorizo']);
F('ham',       'Skinka (kokt/rökt)',  'Ham',                  'meat', 0, {skiva:15},           [0,.5,.2,0,.6,.2,4,.35,3,.5,0,8,.8,20,300,2,20,1,230], ['skinka','kokt skinka']);
F('prosciutto','Lufttorkad skinka',   'Prosciutto',           'meat', 0, {skiva:15, forp:70},  [0,.5,.2,0,.8,.2,5,.4,2,.7,0,12,1.2,20,400,2.3,25,1,220], ['prosciutto','parmaskinka','serranoskinka']);
F('sausage',   'Korv (t.ex. falukorv)','Sausage',             'meat', 0, {st:70},              [0,.2,.2,0,.15,.1,2,.1,3,.6,0,20,.9,12,160,1.5,7,1,120], ['falukorv','prinskorv','grillkorv','korv','salsiccia']);
F('chicken',   'Kycklingfilé',        'Chicken breast',       'meat', 0, {st:150},             [9,.1,.2,.3,.07,.1,11,.6,4,.2,0,5,.4,28,370,.7,22,1,210], ['kyckling','kycklingbröst','chicken']);
F('chickenthigh','Kycklinglårfilé',   'Chicken thigh',        'meat', 0, {st:100},             [14,.2,.2,2,.1,.2,6,.4,6,.5,0,8,.8,23,270,1.8,21,1,190], ['kycklinglår']);
F('chickenliver','Kycklinglever',     'Chicken liver',        'meat', 0, {},                   [3296,.2,.7,0,.3,1.78,9.7,.85,588,16.6,17.9,8,9,19,230,2.7,54.6,1,297], ['lever']);
// Fish & seafood
F('salmon',    'Lax',                 'Salmon',               'fish', 0, {bit:125},            [12,11,3.6,.5,.21,.16,8.7,.64,26,3.2,3.9,9,.34,27,360,.36,24,10,240], ['laxfilé','salmon']);
F('cod',       'Torsk / sej',         'Cod / pollock',        'fish', 0, {bit:125},            [12,1,.6,.1,.08,.07,2,.25,7,.9,1,16,.38,32,410,.45,33,150,200], ['torsk','sej','kolja','vit fisk','cod']);
F('shrimp',    'Räkor (skalade)',     'Shrimp (peeled)',      'fish', 0, {},                   [0,.1,1.3,0,.03,.01,2,.1,19,1.1,0,64,.5,22,113,1.3,33,30,214], ['räkor','scampi','shrimp','prawns']);
F('tuna',      'Tonfisk (konserv)',   'Canned tuna',          'fish', 0, {burk:120},           [6,1.2,.33,.1,.03,.07,10,.33,4,2.5,0,11,1,27,237,.6,70,15,217], ['tonfisk']);
F('mackerel',  'Makrill',             'Mackerel',             'fish', 0, {bit:125, burk:125},  [50,16,1.5,5,.18,.3,9,.4,1,8.7,.4,12,1.6,76,314,.6,44,50,217], ['makrill']);
F('herring',   'Sill (inlagd)',       'Pickled herring',      'fish', 0, {burk:200},           [20,7,1,2,.04,.14,3.3,.17,2,4.3,0,77,1.2,8,69,.5,35,30,89], ['sill','strömming']);
F('mussels',   'Blåmusslor',          'Mussels',              'fish', 0, {},                   [48,0,.55,.1,.16,.21,1.6,.05,42,12,8,26,3.95,34,320,1.6,44.8,100,197], ['musslor']);
// Fats & oils
F('oliveoil',  'Olivolja',            'Olive oil',            'fat', .92, {},                  [0,0,14.35,60.2,0,0,0,0,0,0,0,1,.56,0,1,0,0,0,0], ['olivolja','olive oil','extra virgin']);
F('rapeseedoil','Rapsolja',           'Rapeseed oil',         'fat', .92, {},                  [0,0,17.5,71.3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], ['matolja','olja','neutral olja','canola']);
F('sesameoil', 'Sesamolja',           'Sesame oil',           'fat', .92, {},                  [0,0,1.4,13.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
F('coconutmilk','Kokosmjölk',         'Coconut milk',         'fat', 1.0, {burk:400},          [0,0,.15,.1,.03,0,.76,.03,16,0,2.8,16,1.6,37,220,.67,6.2,0,100], ['kokosgrädde']);
F('mayo',      'Majonnäs',            'Mayonnaise',           'sauce', .95,{},                 [20,0,3,24,0,0,0,0,0,0,0,8,.2,1,20,0,2,0,20], ['aioli']);
// Nuts & seeds
F('almonds',   'Mandlar',             'Almonds',              'nut', .6, {nave:30},            [0,0,25.6,0,.205,1.14,3.6,.14,44,0,0,269,3.7,270,733,3.1,4.1,0,481], ['mandel']);
F('walnuts',   'Valnötter',           'Walnuts',              'nut', .45,{nave:30},            [1,0,.7,2.7,.34,.15,1.1,.54,98,0,1.3,98,2.9,158,441,3.1,4.9,0,346]);
F('cashews',   'Cashewnötter',        'Cashews',              'nut', .55,{nave:30},            [0,0,.9,34.1,.42,.06,1.06,.42,25,0,.5,37,6.7,292,660,5.8,19.9,0,593], ['cashew']);
F('peanuts',   'Jordnötter',          'Peanuts',              'nut', .6, {nave:30},            [0,0,8.3,0,.64,.135,12,.35,240,0,0,92,4.6,168,705,3.3,7.2,0,376]);
F('pinenuts',  'Pinjenötter',         'Pine nuts',            'nut', .6, {nave:30},            [1,0,9.3,53.9,.36,.23,4.4,.09,34,0,.8,16,5.5,251,597,6.45,.7,0,575], ['pinjekärnor']);
F('sesame',    'Sesamfrön',           'Sesame seeds',         'nut', .6, {},                   [0,0,.25,0,.79,.25,4.5,.79,97,0,0,975,14.6,351,468,7.8,34.4,0,629], ['sesam']);
F('sunflower', 'Solroskärnor',        'Sunflower seeds',      'nut', .55,{nave:30},            [3,0,35.2,0,1.48,.36,8.3,1.35,227,0,1.4,78,5.25,325,645,5,53,0,660]);
F('pumpkinseeds','Pumpakärnor',       'Pumpkin seeds',        'nut', .55,{nave:30},            [1,0,2.2,7.3,.27,.15,5,.14,58,0,1.9,46,8.8,592,809,7.8,9.4,0,1233], ['pumpafrön']);
F('chia',      'Chiafrön',            'Chia seeds',           'nut', .65,{},                   [2,0,.5,0,.62,.17,8.8,0,49,0,1.6,631,7.7,335,407,4.6,55.2,0,860]);
F('flax',      'Linfrön',             'Flaxseeds',            'nut', .65,{},                   [0,0,.3,4.3,1.64,.16,3.1,.47,87,0,.6,255,5.7,392,813,4.3,25.4,0,642]);
F('tahini',    'Tahini',              'Tahini',               'nut', 1.0,{},                   [0,0,.25,0,1.22,.47,5.5,.15,98,0,0,426,8.95,95,414,4.6,34,0,732], ['sesampasta']);
// Spices & salt (vague amounts of these never mark nutrients as covered)
F('salt',      'Salt (jodberikat)',   'Salt (iodized)',       'spice', 1.2, {},                [0,0,0,0,0,0,0,0,0,0,0,24,.3,1,8,0,0,5000,0], ['salt','bordssalt']);
F('seasalt',   'Flingsalt / havssalt (ej jod)','Sea salt (not iodized)','spice', .9,{},         [0,0,0,0,0,0,0,0,0,0,0,24,.3,1,8,0,0,0,0], ['flingsalt','havssalt','maldon']);
F('pepper',    'Svartpeppar',         'Black pepper',         'spice', .45,{},                 [27,0,1.04,163.7,.1,.18,1.14,.29,17,0,0,443,9.7,171,1329,1.19,4.9,0,158], ['peppar','pepper','vitpeppar']);
F('paprikapowder','Paprikapulver',    'Paprika powder',       'spice', .45,{},                 [2463,0,29.1,80.3,.33,1.23,10.1,2.14,49,0,.9,229,21.1,178,2280,4.3,6.3,0,314], ['rökt paprika','paprika pulver']);
F('cumin',     'Spiskummin',          'Cumin',                'spice', .4, {},                 [64,0,3.3,5.4,.63,.33,4.6,.44,10,0,7.7,931,66.4,366,1788,4.8,5.2,0,499], ['kummin']);
F('turmeric',  'Gurkmeja',            'Turmeric',             'spice', .5, {},                 [0,0,4.4,13.4,.06,.15,1.35,.11,20,0,.7,168,55,208,2080,4.5,6.2,0,299]);
F('cinnamon',  'Kanel',               'Cinnamon',             'spice', .45,{st:3},             [15,0,2.3,31.2,.02,.04,1.33,.16,6,0,3.8,1002,8.3,60,431,1.83,3.1,0,64], ['kanelstång']);
F('oregano',   'Oregano (torkad)',    'Oregano (dried)',      'spice', .2, {},                 [85,0,18.3,621.7,.18,.53,4.64,1.04,237,0,2.3,1597,36.8,270,1260,2.69,4.5,0,148], ['oregano']);
F('thyme',     'Timjan (torkad)',     'Thyme (dried)',        'spice', .2, {},                 [190,0,7.5,1714.5,.51,.4,4.94,.55,274,0,50,1890,123.6,220,814,6.18,4.6,0,201], ['timjan']);
F('driedbasil','Basilika (torkad)',   'Basil (dried)',        'spice', .2, {},                 [744,0,10.7,1714.5,.08,1.2,4.9,1.34,310,0,.8,2240,89.8,711,2630,7.1,3,0,274]);
F('chiliflakes','Chiliflakes',        'Chili flakes',         'spice', .4, {},                 [2081,0,38.1,80.3,.33,.92,8.7,2.45,28,0,.7,148,17.3,152,1950,2.48,8.8,0,300], ['chilipulver','cayennepeppar','sambal oelek']);
F('curry',     'Currypulver',         'Curry powder',         'spice', .45,{},                 [3,0,25,99.8,.25,.28,3.3,.1,51,0,.7,525,19.1,255,1170,4.7,40.3,0,367], ['curry','garam masala','currypasta']);
F('nutmeg',    'Muskot',              'Nutmeg',               'spice', .45,{},                 [5,0,.25,0,.35,.06,1.3,.16,76,0,3,184,3,183,350,2.15,1.6,0,213], ['muskotnöt']);
F('bayleaf',   'Lagerblad',           'Bay leaf',             'spice', .1, {st:.2},            [309,0,0,0,.01,.42,2,1.74,180,0,46.5,834,43,120,529,3.7,2.8,0,113]);
F('stock',     'Buljong / fond',      'Stock cube / bouillon','spice', 1.0,{st:10},            [0,0,0,0,0,0,.4,0,0,0,0,10,.2,5,40,0,1,0,20], ['buljongtärning','fond','kycklingbuljong','grönsaksbuljong','hönsbuljong']);
F('bakingpowder','Bakpulver',         'Baking powder',        'spice', .9, {},                 [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], ['bikarbonat']);
F('vanilla',   'Vaniljsocker',        'Vanilla sugar',        'spice', .6, {},                 [0,0,0,0,0,0,0,0,0,0,0,1,0,0,2,0,0,0,0], ['vanilj','vaniljextrakt']);
// Sauces & condiments
F('soy',       'Soja (japansk)',      'Soy sauce',            'sauce', 1.15,{},                [0,0,0,0,.06,.15,3.4,.2,18,0,0,33,1.45,43,435,.4,1,0,166], ['sojasås','soy sauce','tamari']);
F('fishsauce', 'Fisksås',             'Fish sauce',           'sauce', 1.2, {},                [0,0,0,0,.01,.06,2.3,.4,51,.5,0,43,.78,175,288,.2,5,0,7]);
F('oystersauce','Ostronsås',          'Oyster sauce',         'sauce', 1.2, {},                [0,0,0,0,0,0,1.5,0,0,0,0,32,.2,4,54,.1,1,0,22], ['hoisinsås']);
F('mustard',   'Senap (dijon)',       'Mustard (dijon)',      'sauce', 1.05,{},                [5,0,.4,1.8,.01,.05,.6,.07,7,0,0,58,1.6,48,152,.6,33.5,0,108], ['dijonsenap','senap']);
F('ketchup',   'Ketchup',             'Ketchup',              'sauce', 1.15,{},                [25,0,1.5,3,.01,.05,1.4,.16,9,0,4,15,.35,13,280,.17,.7,0,26]);
F('balsamic',  'Balsamvinäger',       'Balsamic vinegar',     'sauce', 1.05,{},                [0,0,0,0,0,0,0,0,0,0,0,27,.7,12,112,.1,1.2,0,19], ['balsamico']);
F('vinegar',   'Vinäger / ättika',    'Vinegar',              'sauce', 1.0, {},                [0,0,0,0,0,0,0,0,0,0,0,6,.45,5,39,0,.5,0,4], ['vitvinsvinäger','rödvinsvinäger','risvinäger','ättika']);
F('pesto',     'Pesto',               'Pesto',                'sauce', 1.0, {},                [120,0,5,100,.03,.1,.5,.1,20,.2,2,300,1.3,40,200,1,5,10,200]);
F('honey',     'Honung',              'Honey',                'sweet', 1.4, {},                [0,0,0,0,0,.04,.12,.02,2,0,.5,6,.42,2,52,.22,.8,0,4]);
F('sugar',     'Socker',              'Sugar',                'sweet', .85, {},                [0,0,0,0,0,0,0,0,0,0,0,1,0,0,2,0,0,0,0], ['strösocker','florsocker','sirap']);
F('brownsugar','Farinsocker',         'Brown sugar',          'sweet', .8, {},                 [0,0,0,0,0,0,.1,0,0,0,0,83,.7,9,133,.03,1.2,0,4], ['muscovado','rårörsocker']);
F('cocoa',     'Kakao',               'Cocoa powder',         'sweet', .45,{},                 [0,0,.1,2.5,.08,.24,2.2,.12,32,0,0,128,13.9,499,1524,6.8,14.3,0,734]);
F('darkchoc',  'Mörk choklad (70 %)', 'Dark chocolate (70%)', 'sweet', 0, {bit:10},            [2,0,.6,7.3,.03,.08,1.05,.04,0,0,0,73,11.9,228,715,3.3,6.8,0,308], ['choklad','mörk choklad']);
F('yeast',     'Jäst (färsk)',        'Fresh yeast',          'sweet', 0, {forp:50},           [0,0,0,0,1.1,1.7,11,.6,800,0,0,30,3.5,54,600,10,7.9,0,400], ['jäst']);
// Drinks
F('whitewine', 'Vitt vin',            'White wine',           'drink', 1.0, {},                [0,0,0,0,0,0,.1,.05,0,0,0,9,.27,10,71,.12,.1,0,18], ['vin']);
F('redwine',   'Rött vin',            'Red wine',             'drink', 1.0, {},                [0,0,0,0,0,.03,.22,.06,1,0,0,8,.46,12,127,.14,.2,0,23]);
F('oatdrink',  'Havredryck (berikad)','Oat drink (fortified)','drink', 1.03,{},                [0,1.5,.2,0,0,.21,0,0,0,.38,0,120,.1,5,100,.1,0,22,60], ['havremjölk','oatly','växtdryck']);
F('water',     'Vatten',              'Water',                'drink', 1.0, {},                [0,0,0,0,0,0,0,0,0,0,0,2,0,1,0,0,0,0,0], ['kokande vatten']);
