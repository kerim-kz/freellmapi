// Платформаның тұрақты анықтамалықтары: бөлімдер, материал түрлері, емтихандар, өңірлер.

export const FAMILIES = {
  mech: { name: 'Механика', css: 'f-mech' },
  therm: { name: 'Жылу', css: 'f-therm' },
  em: { name: 'Электромагнетизм', css: 'f-em' },
  wave: { name: 'Тербеліс және оптика', css: 'f-wave' },
  modern: { name: 'Қазіргі физика', css: 'f-modern' },
  astro: { name: 'Астрономия', css: 'f-astro' },
};

export const SECTIONS = [
  { k: 'kin', no: 1, sym: 'Кн', name: 'Кинематика', fam: 'mech', grades: '7–10' },
  { k: 'dyn', no: 2, sym: 'Дн', name: 'Динамика', fam: 'mech', grades: '7–10' },
  { k: 'cons', no: 3, sym: 'Сз', name: 'Сақталу заңдары', fam: 'mech', grades: '7–10' },
  { k: 'stat', no: 4, sym: 'Ст', name: 'Статика және гидростатика', fam: 'mech', grades: '7–10' },
  { k: 'mkt', no: 5, sym: 'Мк', name: 'Молекулалық физика', fam: 'therm', grades: '8–10' },
  { k: 'thermo', no: 6, sym: 'Тд', name: 'Термодинамика', fam: 'therm', grades: '8–10' },
  { k: 'estat', no: 7, sym: 'Эс', name: 'Электростатика', fam: 'em', grades: '8–10' },
  { k: 'dc', no: 8, sym: 'Тт', name: 'Тұрақты ток', fam: 'em', grades: '8–10' },
  { k: 'mag', no: 9, sym: 'Мг', name: 'Магнит өрісі', fam: 'em', grades: '8–11' },
  { k: 'emi', no: 10, sym: 'Эи', name: 'Индукция және айнымалы ток', fam: 'em', grades: '11' },
  { k: 'osc', no: 11, sym: 'Тб', name: 'Тербелістер мен толқындар', fam: 'wave', grades: '9–11' },
  { k: 'opt', no: 12, sym: 'Оп', name: 'Оптика', fam: 'wave', grades: '8–11' },
  { k: 'quant', no: 13, sym: 'Кв', name: 'Кванттық физика және салыстырмалылық', fam: 'modern', grades: '11' },
  { k: 'nuc', no: 14, sym: 'Яд', name: 'Атом және ядро физикасы', fam: 'modern', grades: '9–11' },
  { k: 'astro', no: 15, sym: 'Ас', name: 'Астрономия', fam: 'astro', grades: '9–11' },
];
export const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.k, s]));
export const sectionName = (k) => (SECTION[k] ? SECTION[k].name : '');

export const GRADES = [7, 8, 9, 10, 11];

export const MATERIAL_TYPES = [
  { k: 'textbook', name: 'Оқу құралы', fmt: 'pdf', label: 'PDF' },
  { k: 'ppt', name: 'Презентация', fmt: 'ppt', label: 'PPT' },
  { k: 'kmzh', name: 'ҚМЖ', fmt: 'doc', label: 'DOC' },
  { k: 'lab', name: 'Зертханалық жұмыс', fmt: 'lab', label: 'LAB' },
  { k: 'test', name: 'Тест, БЖБ, ТЖБ', fmt: 'xls', label: 'TEST' },
  { k: 'olymp', name: 'Олимпиадалық есептер', fmt: 'olymp', label: 'OLY' },
  { k: 'other', name: 'Басқа', fmt: 'oth', label: 'FILE' },
];
export const MATERIAL_TYPE = Object.fromEntries(MATERIAL_TYPES.map((t) => [t.k, t]));

export const EXAMS = [
  {
    k: 'pisa', name: 'PISA', full: 'Programme for International Student Assessment', who: '15 жастағы оқушылар',
    desc: 'Халықаралық зерттеу. Жаратылыстану сауаттылығы бойынша оқушы өмірлік жағдаятты талдап, құбылысты ғылыми түсіндіреді, зерттеуді жоспарлап бағалайды және деректерді түсіндіреді.',
    facts: ['Тапсырма мәтін, кесте немесе графиктен тұратын контекстке құрылады', 'Үш құзыреттілік: құбылыстарды ғылыми түсіндіру, зерттеуді жоспарлау және бағалау, деректер мен дәлелдерді түсіндіру', 'Жауапты жаттап алу емес, ойлау тәсілі бағаланады'],
  },
  {
    k: 'bbzhm', name: 'ББЖМ', full: 'Білім алушылардың білім жетістіктерін мониторингі', who: '9-сынып',
    desc: 'Ұлттық мониторинг. Жаратылыстану бағытындағы функционалдық сауаттылықты және негізгі мектеп бағдарламасының меңгерілуін тексереді.',
    facts: ['Тапсырмалар 7–9-сынып физикасының мазмұнына сүйенеді', 'Көбі өмірлік жағдаятқа құрылған', 'Нәтиже мектеп пен өңір деңгейінде талданады'],
  },
  {
    k: 'ubt', name: 'ҰБТ', full: 'Ұлттық бірыңғай тестілеу', who: '11-сынып түлектері',
    desc: 'Бейіндік пән ретіндегі физика. Бір дұрыс жауапты, контекстік және бірнеше дұрыс жауапты тапсырмаларға дайындық.',
    facts: ['Бірнеше дұрыс жауапты тапсырмада барлық жауап дұрыс болса — 2 балл, бір қате болса — 1 балл', 'Тапсырмалар 7–11-сынып бағдарламасын қамтиды', 'Ресми форматты Ұлттық тестілеу орталығының сайтынан тексеріңіз'],
  },
];
export const EXAM = Object.fromEntries(EXAMS.map((e) => [e.k, e]));

export const REGIONS = [
  'Астана қаласы', 'Алматы қаласы', 'Шымкент қаласы',
  'Абай облысы', 'Ақмола облысы', 'Ақтөбе облысы', 'Алматы облысы', 'Атырау облысы',
  'Батыс Қазақстан облысы', 'Жамбыл облысы', 'Жетісу облысы', 'Қарағанды облысы',
  'Қостанай облысы', 'Қызылорда облысы', 'Маңғыстау облысы', 'Павлодар облысы',
  'Солтүстік Қазақстан облысы', 'Түркістан облысы', 'Ұлытау облысы', 'Шығыс Қазақстан облысы',
];

export const ROLE_NAME = { admin: 'Әкімші', teacher: 'Мұғалім', student: 'Оқушы' };

export const ALLOWED_EXT = ['pdf', 'ppt', 'pptx', 'pps', 'ppsx', 'doc', 'docx', 'xls', 'xlsx', 'odt', 'odp', 'ods', 'zip', 'png', 'jpg', 'jpeg'];
