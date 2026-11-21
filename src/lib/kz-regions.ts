// Kazakhstan delivery geography: the 17 regions (oblystar) and the 3 cities of republican
// significance, with the main cities of each region. Used by the address form (select + map
// panning, no network needed) and by the server to validate a saved address region.
//
// Sources (checked 2026-11-21):
// - Names, the 2022 reform (Abai, Jetisu and Ulytau formed 8 June 2022) and administrative
//   centres (Almaty Region -> Konaev, Jetisu -> Taldykorgan, Abai -> Semey, Ulytau -> Zhezkazgan):
//   Wikipedia "Regions of Kazakhstan" (https://en.wikipedia.org/wiki/Regions_of_Kazakhstan, ISO 3166-2:KZ
//   table and Kazakh names).
// - Every centre coordinate, and the Russian/English spellings Yandex returns (used as aliases), come
//   from the Yandex HTTP Geocoder 1.x: each city resolved inside the expected province. Region
//   centres are the province points Yandex returns, except Jetisu and North Kazakhstan, which are set
//   between their cities (Yandex returned no usable province point). Baikonur (leased to Russia) is intentionally not listed.
//
// Codes are stable slugs stored in customer_addresses.region; never rename one.

export type KzLanguage = "en" | "ru" | "kk";
export type KzRegionKind = "region" | "city";

export interface KzCity {
  code: string;
  en: string;
  ru: string;
  kk: string;
  lat: number;
  lng: number;
  /** Other spellings (Yandex en/ru variants, former names) used to match geocoder output. */
  aliases?: readonly string[];
}

export interface KzRegion {
  code: string;
  kind: KzRegionKind;
  en: string;
  ru: string;
  kk: string;
  /** Administrative centre city code (one of `cities`). */
  center: string;
  lat: number;
  lng: number;
  zoom: number;
  aliases: readonly string[];
  cities: readonly KzCity[];
}

/** Rough bounding box of Kazakhstan (with a small margin), used to validate pins and filter geocoder results. */
export const KZ_BBOX = { minLat: 40.5, maxLat: 55.5, minLng: 46.4, maxLng: 87.4 } as const;
export const KZ_DEFAULT_VIEW = { lat: 48.0, lng: 67.0, zoom: 4 } as const;
export const KZ_CITY_ZOOM = 12;

export const KZ_REGIONS: readonly KzRegion[] = [
  {
    code: "astana", kind: "city", en: "Astana", ru: "Астана", kk: "Астана қаласы", center: "astana", lat: 51.128201, lng: 71.430429, zoom: 11,
    aliases: ["Astana City of Republican Significance", "город республиканского значения Астана", "Nur-Sultan", "Нур-Султан", "Астана", "Astana"],
    cities: [{ code: "astana", en: "Astana", ru: "Астана", kk: "Астана", lat: 51.128201, lng: 71.430429, aliases: ["Nur-Sultan", "Нур-Султан"] }],
  },
  {
    code: "almaty", kind: "city", en: "Almaty", ru: "Алматы", kk: "Алматы қаласы", center: "almaty", lat: 43.237163, lng: 76.945645, zoom: 11,
    aliases: ["Almaty City of Republican Significance", "город республиканского значения Алматы", "Алматы", "Almaty", "Alma-Ata", "Алма-Ата"],
    cities: [{ code: "almaty", en: "Almaty", ru: "Алматы", kk: "Алматы", lat: 43.237163, lng: 76.945645, aliases: ["Alma-Ata", "Алма-Ата"] }],
  },
  {
    code: "shymkent", kind: "city", en: "Shymkent", ru: "Шымкент", kk: "Шымкент қаласы", center: "shymkent", lat: 42.315521, lng: 69.586942, zoom: 11,
    aliases: ["Shymkent City of Republican Significance", "город республиканского значения Шымкент", "Шымкент", "Shymkent", "Chimkent", "Чимкент"],
    cities: [{ code: "shymkent", en: "Shymkent", ru: "Шымкент", kk: "Шымкент", lat: 42.315521, lng: 69.586942, aliases: ["Chimkent", "Чимкент"] }],
  },
  {
    code: "abai", kind: "region", en: "Abai Region", ru: "Абайская область", kk: "Абай облысы", center: "semey", lat: 49.084555, lng: 79.821862, zoom: 6,
    aliases: ["Abay Region", "Abai", "Abay", "область Абай", "Абай"],
    cities: [
      { code: "semey", en: "Semey", ru: "Семей", kk: "Семей", lat: 50.404976, lng: 80.249235, aliases: ["Semipalatinsk", "Семипалатинск"] },
      { code: "kurchatov", en: "Kurchatov", ru: "Курчатов", kk: "Курчатов", lat: 50.756325, lng: 78.548329 },
      { code: "ayagoz", en: "Ayagoz", ru: "Аягоз", kk: "Аягөз", lat: 47.965266, lng: 80.436238 },
      { code: "shar", en: "Shar", ru: "Шар", kk: "Шар", lat: 49.584964, lng: 81.047173 },
    ],
  },
  {
    code: "akmola", kind: "region", en: "Akmola Region", ru: "Акмолинская область", kk: "Ақмола облысы", center: "kokshetau", lat: 51.785262, lng: 69.908818, zoom: 6,
    aliases: ["Akmola", "Aqmola", "Акмолинская"],
    cities: [
      { code: "kokshetau", en: "Kokshetau", ru: "Кокшетау", kk: "Көкшетау", lat: 53.285152, lng: 69.375533 },
      { code: "kosshy", en: "Kosshy", ru: "Косшы", kk: "Қосшы", lat: 50.970257, lng: 71.355375 },
      { code: "stepnogorsk", en: "Stepnogorsk", ru: "Степногорск", kk: "Степногор", lat: 52.346664, lng: 71.879802 },
      { code: "shchuchinsk", en: "Shchuchinsk", ru: "Щучинск", kk: "Щучинск", lat: 52.942096, lng: 70.21014, aliases: ["Schuchinsk"] },
      { code: "atbasar", en: "Atbasar", ru: "Атбасар", kk: "Атбасар", lat: 51.815761, lng: 68.358335 },
      { code: "makinsk", en: "Makinsk", ru: "Макинск", kk: "Макинск", lat: 52.63281, lng: 70.417677 },
    ],
  },
  {
    code: "aktobe", kind: "region", en: "Aktobe Region", ru: "Актюбинская область", kk: "Ақтөбе облысы", center: "aktobe", lat: 48.605976, lng: 58.593719, zoom: 6,
    aliases: ["Aktobe", "Aqtobe", "Актюбинская", "Актобе"],
    cities: [
      { code: "aktobe", en: "Aktobe", ru: "Актобе", kk: "Ақтөбе", lat: 50.300377, lng: 57.154555, aliases: ["Aktyubinsk", "Актюбинск"] },
      { code: "khromtau", en: "Khromtau", ru: "Хромтау", kk: "Хромтау", lat: 50.259109, lng: 58.432822 },
      { code: "kandyagash", en: "Kandyagash", ru: "Кандыагаш", kk: "Қандыағаш", lat: 49.453476, lng: 57.406874 },
      { code: "shalkar", en: "Shalkar", ru: "Шалкар", kk: "Шалқар", lat: 47.831392, lng: 59.61929 },
      { code: "alga", en: "Alga", ru: "Алга", kk: "Алға", lat: 49.89673, lng: 57.328586 },
      { code: "emba", en: "Emba", ru: "Эмба", kk: "Ембі", lat: 48.823344, lng: 58.148397, aliases: ["Yembi"] },
    ],
  },
  {
    code: "almaty-region", kind: "region", en: "Almaty Region", ru: "Алматинская область", kk: "Алматы облысы", center: "konaev", lat: 44.195539, lng: 76.213006, zoom: 7,
    aliases: ["Алматинская", "Almaty oblysy"],
    cities: [
      { code: "konaev", en: "Konaev", ru: "Конаев", kk: "Қонаев", lat: 43.854849, lng: 77.061581, aliases: ["Qonaev", "Kapchagay", "Капчагай", "Kapshagay"] },
      { code: "talgar", en: "Talgar", ru: "Талгар", kk: "Талғар", lat: 43.302819, lng: 77.239681 },
      { code: "kaskelen", en: "Kaskelen", ru: "Каскелен", kk: "Қаскелең", lat: 43.202455, lng: 76.622278 },
      { code: "esik", en: "Esik", ru: "Есик", kk: "Есік", lat: 43.352568, lng: 77.463272, aliases: ["Yesik", "Issyk", "Иссык"] },
    ],
  },
  {
    code: "atyrau", kind: "region", en: "Atyrau Region", ru: "Атырауская область", kk: "Атырау облысы", center: "atyrau", lat: 47.490698, lng: 52.093528, zoom: 6,
    aliases: ["Atyrau", "Атырауская"],
    cities: [
      { code: "atyrau", en: "Atyrau", ru: "Атырау", kk: "Атырау", lat: 47.106799, lng: 51.916874 },
      { code: "kulsary", en: "Kulsary", ru: "Кульсары", kk: "Құлсары", lat: 46.960532, lng: 54.006221 },
    ],
  },
  {
    code: "east-kazakhstan", kind: "region", en: "East Kazakhstan Region", ru: "Восточно-Казахстанская область", kk: "Шығыс Қазақстан облысы", center: "oskemen", lat: 48.772769, lng: 85.085387, zoom: 6,
    aliases: ["East Kazakhstan", "Восточно-Казахстанская", "ВКО"],
    cities: [
      { code: "oskemen", en: "Oskemen", ru: "Усть-Каменогорск", kk: "Өскемен", lat: 49.948325, lng: 82.627848, aliases: ["Ust-Kamenogorsk", "Өскемен", "Оскемен"] },
      { code: "ridder", en: "Ridder", ru: "Риддер", kk: "Риддер", lat: 50.33886, lng: 83.506329 },
      { code: "altai", en: "Altai", ru: "Алтай", kk: "Алтай", lat: 49.725218, lng: 84.273562, aliases: ["Altay", "Zyryanovsk", "Зыряновск"] },
      { code: "shemonaikha", en: "Shemonaikha", ru: "Шемонаиха", kk: "Шемонаиха", lat: 50.627624, lng: 81.916697 },
      { code: "zaysan", en: "Zaysan", ru: "Зайсан", kk: "Зайсан", lat: 47.467611, lng: 84.876376 },
    ],
  },
  {
    code: "jambyl", kind: "region", en: "Jambyl Region", ru: "Жамбылская область", kk: "Жамбыл облысы", center: "taraz", lat: 44.311975, lng: 72.138472, zoom: 6,
    aliases: ["Zhambyl Region", "Jambyl", "Zhambyl", "Жамбылская"],
    cities: [
      { code: "taraz", en: "Taraz", ru: "Тараз", kk: "Тараз", lat: 42.899664, lng: 71.392727 },
      { code: "shu", en: "Shu", ru: "Шу", kk: "Шу", lat: 43.611782, lng: 73.760237 },
      { code: "karatau", en: "Karatau", ru: "Каратау", kk: "Қаратау", lat: 43.176327, lng: 70.464983 },
      { code: "zhanatas", en: "Zhanatas", ru: "Жанатас", kk: "Жаңатас", lat: 43.55465, lng: 69.722525 },
    ],
  },
  {
    code: "jetisu", kind: "region", en: "Jetisu Region", ru: "область Жетісу", kk: "Жетісу облысы", center: "taldykorgan", lat: 45.2, lng: 79.0, zoom: 7,
    aliases: ["Zhetysu Region", "Jetisu", "Zhetysu", "Zhetisu", "область Жетысу", "Жетысу", "Жетісу"],
    cities: [
      { code: "taldykorgan", en: "Taldykorgan", ru: "Талдыкорган", kk: "Талдықорған", lat: 45.017837, lng: 78.382123 },
      { code: "tekeli", en: "Tekeli", ru: "Текели", kk: "Текелі", lat: 44.863094, lng: 78.764266 },
      { code: "zharkent", en: "Zharkent", ru: "Жаркент", kk: "Жаркент", lat: 44.169365, lng: 80.003842 },
      { code: "ushtobe", en: "Ushtobe", ru: "Уштобе", kk: "Үштөбе", lat: 45.251221, lng: 77.980827 },
      { code: "sarkand", en: "Sarkand", ru: "Сарканд", kk: "Сарқан", lat: 45.413666, lng: 79.916894, aliases: ["Sarkant"] },
    ],
  },
  {
    code: "karaganda", kind: "region", en: "Karaganda Region", ru: "Карагандинская область", kk: "Қарағанды облысы", center: "karaganda", lat: 48.787403, lng: 74.33762, zoom: 6,
    aliases: ["Karaganda", "Karagandy", "Qaragandy", "Карагандинская"],
    cities: [
      { code: "karaganda", en: "Karaganda", ru: "Караганда", kk: "Қарағанды", lat: 49.80776, lng: 73.088504, aliases: ["Karagandy", "Qaragandy"] },
      { code: "temirtau", en: "Temirtau", ru: "Темиртау", kk: "Теміртау", lat: 50.058761, lng: 72.953424 },
      { code: "balkhash", en: "Balkhash", ru: "Балхаш", kk: "Балқаш", lat: 46.843721, lng: 74.977301 },
      { code: "saran", en: "Saran", ru: "Сарань", kk: "Саран", lat: 49.801993, lng: 72.828387 },
      { code: "shakhtinsk", en: "Shakhtinsk", ru: "Шахтинск", kk: "Шахтинск", lat: 49.705868, lng: 72.594637 },
      { code: "abay", en: "Abay", ru: "Абай", kk: "Абай", lat: 49.631899, lng: 72.859245 },
      { code: "priozersk", en: "Priozersk", ru: "Приозёрск", kk: "Приозерск", lat: 46.028969, lng: 73.708027, aliases: ["Priozyorsk", "Приозерск"] },
    ],
  },
  {
    code: "kostanay", kind: "region", en: "Kostanay Region", ru: "Костанайская область", kk: "Қостанай облысы", center: "kostanay", lat: 51.602478, lng: 64.015564, zoom: 6,
    aliases: ["Kostanay", "Qostanay", "Костанайская"],
    cities: [
      { code: "kostanay", en: "Kostanay", ru: "Костанай", kk: "Қостанай", lat: 53.214496, lng: 63.6321 },
      { code: "rudny", en: "Rudny", ru: "Рудный", kk: "Рудный", lat: 52.964454, lng: 63.133419 },
      { code: "lisakovsk", en: "Lisakovsk", ru: "Лисаковск", kk: "Лисаковск", lat: 52.544221, lng: 62.492632, aliases: ["Lisakov"] },
      { code: "arkalyk", en: "Arkalyk", ru: "Аркалык", kk: "Арқалық", lat: 50.253465, lng: 66.915011 },
      { code: "zhitikara", en: "Zhitikara", ru: "Житикара", kk: "Жітіқара", lat: 52.183928, lng: 61.189833 },
    ],
  },
  {
    code: "kyzylorda", kind: "region", en: "Kyzylorda Region", ru: "Кызылординская область", kk: "Қызылорда облысы", center: "kyzylorda", lat: 44.571377, lng: 65.794938, zoom: 6,
    aliases: ["Kyzylorda", "Qyzylorda", "Кызылординская"],
    cities: [
      { code: "kyzylorda", en: "Kyzylorda", ru: "Кызылорда", kk: "Қызылорда", lat: 44.842544, lng: 65.502563 },
      { code: "aral", en: "Aral", ru: "Аральск", kk: "Арал", lat: 46.797738, lng: 61.660792, aliases: ["Aralsk", "Арал"] },
      { code: "kazaly", en: "Kazaly", ru: "Казалинск", kk: "Қазалы", lat: 45.760633, lng: 62.105836, aliases: ["Kazalinsk", "Казалы"] },
    ],
  },
  {
    code: "mangystau", kind: "region", en: "Mangystau Region", ru: "Мангистауская область", kk: "Маңғыстау облысы", center: "aktau", lat: 44.122553, lng: 53.72203, zoom: 6,
    aliases: ["Mangystau", "Mangistau", "Мангистауская"],
    cities: [
      { code: "aktau", en: "Aktau", ru: "Актау", kk: "Ақтау", lat: 43.635588, lng: 51.168245 },
      { code: "zhanaozen", en: "Zhanaozen", ru: "Жанаозен", kk: "Жаңаөзен", lat: 43.338099, lng: 52.855677 },
      { code: "fort-shevchenko", en: "Fort-Shevchenko", ru: "Форт-Шевченко", kk: "Форт-Шевченко", lat: 44.501504, lng: 50.258737 },
    ],
  },
  {
    code: "north-kazakhstan", kind: "region", en: "North Kazakhstan Region", ru: "Северо-Казахстанская область", kk: "Солтүстік Қазақстан облысы", center: "petropavl", lat: 53.8, lng: 69.4, zoom: 7,
    aliases: ["North Kazakhstan", "Северо-Казахстанская", "СКО"],
    cities: [
      { code: "petropavl", en: "Petropavl", ru: "Петропавловск", kk: "Петропавл", lat: 54.861865, lng: 69.139635, aliases: ["Petropavlovsk", "Петропавл"] },
      { code: "taiynsha", en: "Taiynsha", ru: "Тайынша", kk: "Тайынша", lat: 53.852738, lng: 69.78264, aliases: ["Tayynsha"] },
      { code: "bulaevo", en: "Bulaevo", ru: "Булаево", kk: "Булаев", lat: 54.896056, lng: 70.448157, aliases: ["Bulayev", "Bulayevo"] },
      { code: "mamlyutka", en: "Mamlyutka", ru: "Мамлютка", kk: "Мамлют", lat: 54.94112, lng: 68.546199, aliases: ["Mamlyut"] },
      { code: "sergeyevka", en: "Sergeyevka", ru: "Сергеевка", kk: "Сергеев", lat: 53.888542, lng: 67.416271 },
    ],
  },
  {
    code: "pavlodar", kind: "region", en: "Pavlodar Region", ru: "Павлодарская область", kk: "Павлодар облысы", center: "pavlodar", lat: 52.068499, lng: 76.242551, zoom: 6,
    aliases: ["Pavlodar", "Павлодарская"],
    cities: [
      { code: "pavlodar", en: "Pavlodar", ru: "Павлодар", kk: "Павлодар", lat: 52.285588, lng: 76.941081 },
      { code: "ekibastuz", en: "Ekibastuz", ru: "Экибастуз", kk: "Екібастұз", lat: 51.729692, lng: 75.326629, aliases: ["Yekibastuz"] },
      { code: "aksu", en: "Aksu", ru: "Аксу", kk: "Ақсу", lat: 52.035259, lng: 76.933868 },
    ],
  },
  {
    code: "turkistan", kind: "region", en: "Turkistan Region", ru: "Туркестанская область", kk: "Түркістан облысы", center: "turkistan", lat: 44.29477, lng: 68.676347, zoom: 6,
    aliases: ["Turkistan", "Turkestan", "Туркестанская", "South Kazakhstan Region", "Южно-Казахстанская область"],
    cities: [
      { code: "turkistan", en: "Turkistan", ru: "Туркестан", kk: "Түркістан", lat: 43.302025, lng: 68.268979, aliases: ["Turkestan"] },
      { code: "kentau", en: "Kentau", ru: "Кентау", kk: "Кентау", lat: 43.518137, lng: 68.504661 },
      { code: "saryagash", en: "Saryagash", ru: "Сарыагаш", kk: "Сарыағаш", lat: 41.451428, lng: 69.167232 },
      { code: "arys", en: "Arys", ru: "Арысь", kk: "Арыс", lat: 42.432744, lng: 68.813798 },
      { code: "lenger", en: "Lenger", ru: "Ленгер", kk: "Ленгір", lat: 42.182472, lng: 69.893169, aliases: ["Lengir"] },
      { code: "shardara", en: "Shardara", ru: "Шардара", kk: "Шардара", lat: 41.256922, lng: 67.968852 },
      { code: "zhetisay", en: "Zhetisay", ru: "Жетысай", kk: "Жетісай", lat: 40.77432, lng: 68.327442 },
    ],
  },
  {
    code: "ulytau", kind: "region", en: "Ulytau Region", ru: "область Ұлытау", kk: "Ұлытау облысы", center: "zhezkazgan", lat: 47.253611, lng: 67.723289, zoom: 6,
    aliases: ["Ulytau", "область Улытау", "Улытау", "Ұлытау"],
    cities: [
      { code: "zhezkazgan", en: "Zhezkazgan", ru: "Жезказган", kk: "Жезқазған", lat: 47.799711, lng: 67.71409, aliases: ["Jezkazgan", "Dzhezkazgan"] },
      { code: "satbayev", en: "Satbayev", ru: "Сатпаев", kk: "Сәтбаев", lat: 47.907455, lng: 67.528112, aliases: ["Satpayev", "Satbaev"] },
      { code: "karazhal", en: "Karazhal", ru: "Каражал", kk: "Қаражал", lat: 48.001042, lng: 70.785771 },
    ],
  },
  {
    code: "west-kazakhstan", kind: "region", en: "West Kazakhstan Region", ru: "Западно-Казахстанская область", kk: "Батыс Қазақстан облысы", center: "oral", lat: 49.813556, lng: 50.675456, zoom: 6,
    aliases: ["West Kazakhstan", "Западно-Казахстанская", "ЗКО"],
    cities: [
      { code: "oral", en: "Oral", ru: "Уральск", kk: "Орал", lat: 51.20403, lng: 51.370528, aliases: ["Uralsk", "Орал"] },
      { code: "aksay", en: "Aksay", ru: "Аксай", kk: "Ақсай", lat: 51.164945, lng: 53.020868, aliases: ["Aksai"] },
    ],
  },
];

const REGION_BY_CODE = new Map(KZ_REGIONS.map(region => [region.code, region]));

/** Lowercase, Cyrillic ё->е, strip "region"/"область"/"city of" style words and punctuation. */
export function normalizePlaceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/city of republican significance|город республиканского значения|қаласы|облысы|oblysy|oblast|region|область|city of|town of|village of|settlement|город|поселок|посёлок|село|city/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function regionKeys(region: KzRegion): string[] {
  return [region.code, region.en, region.ru, region.kk, ...region.aliases].map(normalizePlaceName).filter(Boolean);
}
const REGION_INDEX: ReadonlyMap<string, KzRegion> = (() => {
  const index = new Map<string, KzRegion>();
  // Regions first so a city of republican significance never shadows an oblast name ("Almaty Region").
  for (const kind of ["region", "city"] as const) {
    for (const region of KZ_REGIONS.filter(item => item.kind === kind)) {
      for (const key of regionKeys(region)) if (!index.has(key)) index.set(key, region);
    }
  }
  return index;
})();

export function getKzRegion(code: string | null | undefined): KzRegion | undefined {
  return code ? REGION_BY_CODE.get(code) : undefined;
}

/**
 * Maps a region code or any known name/spelling (en/ru/kk, Yandex variants) to a region.
 * "Almaty Region" / "Алматинская область" -> almaty-region; "Almaty" / "Алматы" -> the city.
 */
export function resolveKzRegion(value: string | null | undefined): KzRegion | undefined {
  if (!value) return undefined;
  const direct = REGION_BY_CODE.get(value.trim());
  if (direct) return direct;
  const raw = value.toLowerCase();
  const key = normalizePlaceName(value);
  if (!key) return undefined;
  // "Almaty" names both the city and (with "region"/"область"/"облысы") the oblast.
  const mentionsOblast = /region|oblast|область|облысы|oblysy/.test(raw) && !/republican|республиканского/.test(raw);
  if (key === "алматы" || key === "almaty" || key === "алматинская") {
    return mentionsOblast || key === "алматинская" ? REGION_BY_CODE.get("almaty-region") : REGION_BY_CODE.get("almaty");
  }
  return REGION_INDEX.get(key);
}

export function kzRegionName(region: KzRegion, language: KzLanguage = "en"): string {
  return region[language];
}
export function kzCityName(city: KzCity, language: KzLanguage = "en"): string {
  return city[language];
}

/** Display label for a stored region value: a known code becomes its name; anything else is shown as stored. */
export function kzRegionLabel(value: string | null | undefined, language: KzLanguage = "en"): string {
  if (!value) return "";
  const region = REGION_BY_CODE.get(value);
  return region ? region[language] : value;
}

/** Finds a listed city of the region by any spelling. */
export function findKzCity(regionCode: string | null | undefined, name: string | null | undefined): KzCity | undefined {
  const region = getKzRegion(regionCode);
  if (!region || !name) return undefined;
  const key = normalizePlaceName(name);
  if (!key) return undefined;
  return region.cities.find(city => [city.code, city.en, city.ru, city.kk, ...(city.aliases ?? [])].some(candidate => normalizePlaceName(candidate) === key));
}

/** Finds the region whose listed city matches the name (used when the geocoder gives no province). */
export function findKzCityAnywhere(name: string | null | undefined): { region: KzRegion; city: KzCity } | undefined {
  for (const region of KZ_REGIONS) {
    const city = findKzCity(region.code, name);
    if (city) return { region, city };
  }
  return undefined;
}

export function isInsideKazakhstan(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= KZ_BBOX.minLat && lat <= KZ_BBOX.maxLat && lng >= KZ_BBOX.minLng && lng <= KZ_BBOX.maxLng;
}
