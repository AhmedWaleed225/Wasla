/**
 * Seed list of Egyptian places used for landmark-based search.
 *
 * Coordinates are APPROXIMATE (centre of the area or entrance, ±~500 m) and
 * are meant for development and ordering results — not for navigation. Before
 * launch, verify pickup-critical points (gates, stations) on the ground or
 * against the maps provider and correct them here or in the admin console.
 */

export type SeedKind =
  | 'GOVERNORATE'
  | 'CITY'
  | 'DISTRICT'
  | 'NEIGHBORHOOD'
  | 'COMPOUND'
  | 'GATE'
  | 'LANDMARK'
  | 'UNIVERSITY'
  | 'MALL'
  | 'BUSINESS_DISTRICT'
  | 'TRANSIT';

export interface SeedPlace {
  slug: string;
  kind: SeedKind;
  en: string;
  ar: string;
  parent?: string;
  lat?: number;
  lng?: number;
  aliases?: string[];
  popularity?: number;
}

const governorates: SeedPlace[] = [
  { slug: 'cairo', kind: 'GOVERNORATE', en: 'Cairo', ar: 'القاهرة', lat: 30.0444, lng: 31.2357, popularity: 100 },
  { slug: 'giza', kind: 'GOVERNORATE', en: 'Giza', ar: 'الجيزة', lat: 30.0131, lng: 31.2089, popularity: 90 },
  { slug: 'alexandria', kind: 'GOVERNORATE', en: 'Alexandria', ar: 'الإسكندرية', lat: 31.2001, lng: 29.9187, aliases: ['Alex', 'اسكندرية', 'إسكندرية'], popularity: 85 },
  { slug: 'qalyubia', kind: 'GOVERNORATE', en: 'Qalyubia', ar: 'القليوبية', lat: 30.466, lng: 31.1848 },
  { slug: 'dakahlia', kind: 'GOVERNORATE', en: 'Dakahlia', ar: 'الدقهلية', lat: 31.0409, lng: 31.3785 },
  { slug: 'gharbia', kind: 'GOVERNORATE', en: 'Gharbia', ar: 'الغربية', lat: 30.7865, lng: 31.0004 },
  { slug: 'sharqia', kind: 'GOVERNORATE', en: 'Sharqia', ar: 'الشرقية', lat: 30.5877, lng: 31.502 },
  { slug: 'monufia', kind: 'GOVERNORATE', en: 'Monufia', ar: 'المنوفية', lat: 30.552, lng: 31.009 },
  { slug: 'beheira', kind: 'GOVERNORATE', en: 'Beheira', ar: 'البحيرة', lat: 31.0341, lng: 30.4682 },
  { slug: 'kafr-el-sheikh', kind: 'GOVERNORATE', en: 'Kafr El Sheikh', ar: 'كفر الشيخ', lat: 31.1107, lng: 30.9388 },
  { slug: 'damietta', kind: 'GOVERNORATE', en: 'Damietta', ar: 'دمياط', lat: 31.4165, lng: 31.8133 },
  { slug: 'port-said', kind: 'GOVERNORATE', en: 'Port Said', ar: 'بورسعيد', lat: 31.2653, lng: 32.3019 },
  { slug: 'ismailia', kind: 'GOVERNORATE', en: 'Ismailia', ar: 'الإسماعيلية', lat: 30.5965, lng: 32.2715 },
  { slug: 'suez', kind: 'GOVERNORATE', en: 'Suez', ar: 'السويس', lat: 29.9668, lng: 32.5498 },
  { slug: 'faiyum', kind: 'GOVERNORATE', en: 'Faiyum', ar: 'الفيوم', lat: 29.3084, lng: 30.8428 },
  { slug: 'beni-suef', kind: 'GOVERNORATE', en: 'Beni Suef', ar: 'بني سويف', lat: 29.0661, lng: 31.0994 },
  { slug: 'minya', kind: 'GOVERNORATE', en: 'Minya', ar: 'المنيا', lat: 28.1099, lng: 30.7503 },
  { slug: 'asyut', kind: 'GOVERNORATE', en: 'Asyut', ar: 'أسيوط', lat: 27.1783, lng: 31.1859 },
  { slug: 'sohag', kind: 'GOVERNORATE', en: 'Sohag', ar: 'سوهاج', lat: 26.5591, lng: 31.6957 },
  { slug: 'qena', kind: 'GOVERNORATE', en: 'Qena', ar: 'قنا', lat: 26.1551, lng: 32.716 },
  { slug: 'luxor', kind: 'GOVERNORATE', en: 'Luxor', ar: 'الأقصر', lat: 25.6872, lng: 32.6396 },
  { slug: 'aswan', kind: 'GOVERNORATE', en: 'Aswan', ar: 'أسوان', lat: 24.0889, lng: 32.8998 },
  { slug: 'red-sea', kind: 'GOVERNORATE', en: 'Red Sea', ar: 'البحر الأحمر', lat: 27.2579, lng: 33.8116 },
  { slug: 'new-valley', kind: 'GOVERNORATE', en: 'New Valley', ar: 'الوادي الجديد', lat: 25.439, lng: 30.5586 },
  { slug: 'matrouh', kind: 'GOVERNORATE', en: 'Matrouh', ar: 'مطروح', lat: 31.3543, lng: 27.2373 },
  { slug: 'north-sinai', kind: 'GOVERNORATE', en: 'North Sinai', ar: 'شمال سيناء', lat: 31.1316, lng: 33.7984 },
  { slug: 'south-sinai', kind: 'GOVERNORATE', en: 'South Sinai', ar: 'جنوب سيناء', lat: 28.2364, lng: 33.6254 },
];

const cities: SeedPlace[] = [
  // Greater Cairo — Cairo side
  { slug: 'cairo.new-cairo', kind: 'CITY', en: 'New Cairo', ar: 'القاهرة الجديدة', parent: 'cairo', lat: 30.0074, lng: 31.4913, aliases: ['Fifth Settlement', 'Tagamoa', 'التجمع', 'التجمع الخامس'], popularity: 95 },
  { slug: 'cairo.nasr-city', kind: 'DISTRICT', en: 'Nasr City', ar: 'مدينة نصر', parent: 'cairo', lat: 30.0566, lng: 31.3301, popularity: 90 },
  { slug: 'cairo.heliopolis', kind: 'DISTRICT', en: 'Heliopolis', ar: 'مصر الجديدة', parent: 'cairo', lat: 30.0911, lng: 31.3225, aliases: ['Masr El Gedida'], popularity: 85 },
  { slug: 'cairo.maadi', kind: 'DISTRICT', en: 'Maadi', ar: 'المعادي', parent: 'cairo', lat: 29.9602, lng: 31.2569, popularity: 85 },
  { slug: 'cairo.downtown', kind: 'DISTRICT', en: 'Downtown Cairo', ar: 'وسط البلد', parent: 'cairo', lat: 30.0478, lng: 31.2394, aliases: ['Wust El Balad'], popularity: 85 },
  { slug: 'cairo.zamalek', kind: 'DISTRICT', en: 'Zamalek', ar: 'الزمالك', parent: 'cairo', lat: 30.0609, lng: 31.2197 },
  { slug: 'cairo.mokattam', kind: 'DISTRICT', en: 'Mokattam', ar: 'المقطم', parent: 'cairo', lat: 30.0131, lng: 31.3036 },
  { slug: 'cairo.rehab', kind: 'CITY', en: 'El Rehab City', ar: 'مدينة الرحاب', parent: 'cairo', lat: 30.0596, lng: 31.4935, aliases: ['Rehab', 'الرحاب'], popularity: 80 },
  { slug: 'cairo.madinaty', kind: 'CITY', en: 'Madinaty', ar: 'مدينتي', parent: 'cairo', lat: 30.107, lng: 31.6389, popularity: 75 },
  { slug: 'cairo.shorouk', kind: 'CITY', en: 'El Shorouk', ar: 'الشروق', parent: 'cairo', lat: 30.1386, lng: 31.607 },
  // Greater Cairo — Giza side
  { slug: 'giza.october', kind: 'CITY', en: '6th of October City', ar: 'مدينة ٦ أكتوبر', parent: 'giza', lat: 29.9381, lng: 30.9138, aliases: ['October', '6 October', 'أكتوبر', 'اكتوبر'], popularity: 90 },
  { slug: 'giza.zayed', kind: 'CITY', en: 'Sheikh Zayed City', ar: 'مدينة الشيخ زايد', parent: 'giza', lat: 30.0444, lng: 30.976, aliases: ['Zayed', 'زايد'], popularity: 88 },
  { slug: 'giza.dokki', kind: 'DISTRICT', en: 'Dokki', ar: 'الدقي', parent: 'giza', lat: 30.0384, lng: 31.2109 },
  { slug: 'giza.mohandessin', kind: 'DISTRICT', en: 'Mohandessin', ar: 'المهندسين', parent: 'giza', lat: 30.0566, lng: 31.2003 },
  { slug: 'giza.haram', kind: 'DISTRICT', en: 'Haram', ar: 'الهرم', parent: 'giza', lat: 29.993, lng: 31.1544 },
  // Alexandria
  { slug: 'alexandria.smouha', kind: 'DISTRICT', en: 'Smouha', ar: 'سموحة', parent: 'alexandria', lat: 31.2156, lng: 29.9425 },
  { slug: 'alexandria.sidi-gaber', kind: 'DISTRICT', en: 'Sidi Gaber', ar: 'سيدي جابر', parent: 'alexandria', lat: 31.2197, lng: 29.942 },
  { slug: 'alexandria.san-stefano', kind: 'DISTRICT', en: 'San Stefano', ar: 'سان ستيفانو', parent: 'alexandria', lat: 31.2457, lng: 29.9632 },
  { slug: 'alexandria.miami', kind: 'DISTRICT', en: 'Miami', ar: 'ميامي', parent: 'alexandria', lat: 31.2687, lng: 30.0047 },
  // Delta and Canal cities
  { slug: 'dakahlia.mansoura', kind: 'CITY', en: 'Mansoura', ar: 'المنصورة', parent: 'dakahlia', lat: 31.0409, lng: 31.3785, popularity: 60 },
  { slug: 'gharbia.tanta', kind: 'CITY', en: 'Tanta', ar: 'طنطا', parent: 'gharbia', lat: 30.7865, lng: 31.0004, popularity: 60 },
  { slug: 'ismailia.city', kind: 'CITY', en: 'Ismailia City', ar: 'مدينة الإسماعيلية', parent: 'ismailia', lat: 30.5965, lng: 32.2715, popularity: 50 },
  { slug: 'suez.city', kind: 'CITY', en: 'Suez City', ar: 'مدينة السويس', parent: 'suez', lat: 29.9668, lng: 32.5498, popularity: 50 },
];

const places: SeedPlace[] = [
  // Business districts
  { slug: 'giza.smart-village', kind: 'BUSINESS_DISTRICT', en: 'Smart Village', ar: 'القرية الذكية', parent: 'giza.october', lat: 30.0715, lng: 31.017, aliases: ['Smart Village Cairo'], popularity: 95 },
  { slug: 'giza.smart-village.main-gate', kind: 'GATE', en: 'Smart Village — Main Gate', ar: 'القرية الذكية — البوابة الرئيسية', parent: 'giza.smart-village', lat: 30.0707, lng: 31.0204, popularity: 70 },
  { slug: 'giza.smart-village.b2', kind: 'LANDMARK', en: 'Smart Village — Building B2', ar: 'القرية الذكية — مبنى B2', parent: 'giza.smart-village', lat: 30.0721, lng: 31.0158, popularity: 70 },
  { slug: 'cairo.new-capital', kind: 'CITY', en: 'New Administrative Capital', ar: 'العاصمة الإدارية الجديدة', parent: 'cairo', lat: 30.0196, lng: 31.7595, aliases: ['New Capital', 'العاصمة الإدارية', 'العاصمة'], popularity: 70 },
  // Malls
  { slug: 'cairo.new-cairo.cfc', kind: 'MALL', en: 'Cairo Festival City Mall', ar: 'كايرو فستيفال سيتي مول', parent: 'cairo.new-cairo', lat: 30.0285, lng: 31.4087, aliases: ['CFC', 'Festival City', 'كايرو فستيفال'], popularity: 90 },
  { slug: 'cairo.new-cairo.cfc.gate-4', kind: 'GATE', en: 'Cairo Festival City — Gate 4', ar: 'كايرو فستيفال سيتي — بوابة ٤', parent: 'cairo.new-cairo.cfc', lat: 30.0293, lng: 31.4069, aliases: ['CFC Gate 4', 'IKEA entrance'], popularity: 85 },
  { slug: 'cairo.new-cairo.point-90', kind: 'MALL', en: 'Point 90 Mall', ar: 'بوينت ٩٠ مول', parent: 'cairo.new-cairo', lat: 30.0207, lng: 31.492, aliases: ['Point 90', '90th Street', 'شارع التسعين'], popularity: 80 },
  { slug: 'cairo.nasr-city.city-stars', kind: 'MALL', en: 'City Stars', ar: 'سيتي ستارز', parent: 'cairo.nasr-city', lat: 30.073, lng: 31.346, popularity: 85 },
  { slug: 'cairo.nasr-city.city-stars.gate-5', kind: 'GATE', en: 'City Stars — Gate 5', ar: 'سيتي ستارز — بوابة ٥', parent: 'cairo.nasr-city.city-stars', lat: 30.0725, lng: 31.3449, popularity: 60 },
  { slug: 'cairo.maadi.grand-mall', kind: 'MALL', en: 'Maadi Grand Mall', ar: 'معادي جراند مول', parent: 'cairo.maadi', lat: 29.9706, lng: 31.2797, popularity: 60 },
  { slug: 'giza.october.mall-of-arabia', kind: 'MALL', en: 'Mall of Arabia', ar: 'مول العرب', parent: 'giza.october', lat: 30.007, lng: 30.973, popularity: 75 },
  { slug: 'giza.october.mall-of-egypt', kind: 'MALL', en: 'Mall of Egypt', ar: 'مول مصر', parent: 'giza.october', lat: 29.9725, lng: 31.017, popularity: 70 },
  { slug: 'giza.zayed.arkan', kind: 'MALL', en: 'Arkan Plaza', ar: 'أركان بلازا', parent: 'giza.zayed', lat: 30.0247, lng: 30.9842, aliases: ['Arkan'], popularity: 60 },
  // Universities
  { slug: 'cairo.new-cairo.auc', kind: 'UNIVERSITY', en: 'American University in Cairo (AUC)', ar: 'الجامعة الأمريكية بالقاهرة', parent: 'cairo.new-cairo', lat: 30.0196, lng: 31.4997, aliases: ['AUC', 'الجامعة الأمريكية', 'الأمريكية'], popularity: 85 },
  { slug: 'cairo.new-cairo.guc', kind: 'UNIVERSITY', en: 'German University in Cairo (GUC)', ar: 'الجامعة الألمانية بالقاهرة', parent: 'cairo.new-cairo', lat: 29.9867, lng: 31.4413, aliases: ['GUC', 'الجامعة الألمانية'], popularity: 70 },
  { slug: 'giza.cairo-university', kind: 'UNIVERSITY', en: 'Cairo University', ar: 'جامعة القاهرة', parent: 'giza', lat: 30.0276, lng: 31.2101, popularity: 80 },
  { slug: 'cairo.ain-shams-university', kind: 'UNIVERSITY', en: 'Ain Shams University', ar: 'جامعة عين شمس', parent: 'cairo', lat: 30.0765, lng: 31.285, popularity: 70 },
  { slug: 'giza.zayed.nile-university', kind: 'UNIVERSITY', en: 'Nile University', ar: 'جامعة النيل', parent: 'giza.zayed', lat: 30.0119, lng: 30.9877, popularity: 55 },
  // Compounds and gates
  { slug: 'cairo.rehab.gate-13', kind: 'GATE', en: 'El Rehab — Gate 13', ar: 'الرحاب — بوابة ١٣', parent: 'cairo.rehab', lat: 30.0662, lng: 31.4998, aliases: ['Rehab Gate 13', 'بوابة ١٣'], popularity: 70 },
  { slug: 'cairo.rehab.gate-6', kind: 'GATE', en: 'El Rehab — Gate 6', ar: 'الرحاب — بوابة ٦', parent: 'cairo.rehab', lat: 30.0573, lng: 31.4869, aliases: ['Rehab Gate 6'], popularity: 60 },
  { slug: 'cairo.new-cairo.mivida', kind: 'COMPOUND', en: 'Mivida', ar: 'ميفيدا', parent: 'cairo.new-cairo', lat: 30.0127, lng: 31.5283, popularity: 55 },
  { slug: 'cairo.new-cairo.hyde-park', kind: 'COMPOUND', en: 'Hyde Park New Cairo', ar: 'هايد بارك القاهرة الجديدة', parent: 'cairo.new-cairo', lat: 30.0045, lng: 31.5085, aliases: ['Hyde Park'], popularity: 50 },
  { slug: 'giza.zayed.allegria', kind: 'COMPOUND', en: 'Allegria', ar: 'أليجريا', parent: 'giza.zayed', lat: 30.063, lng: 30.963, popularity: 55 },
  { slug: 'giza.zayed.beverly-hills', kind: 'COMPOUND', en: 'Beverly Hills', ar: 'بيفرلي هيلز', parent: 'giza.zayed', lat: 30.04, lng: 30.985, popularity: 50 },
  { slug: 'giza.october.palm-hills', kind: 'COMPOUND', en: 'Palm Hills October', ar: 'بالم هيلز أكتوبر', parent: 'giza.october', lat: 29.97, lng: 30.95, aliases: ['Palm Hills'], popularity: 55 },
  // Landmarks and transit
  { slug: 'cairo.downtown.tahrir', kind: 'LANDMARK', en: 'Tahrir Square', ar: 'ميدان التحرير', parent: 'cairo.downtown', lat: 30.0444, lng: 31.2357, aliases: ['Tahrir', 'التحرير'], popularity: 80 },
  { slug: 'cairo.downtown.ramses', kind: 'TRANSIT', en: 'Ramses Railway Station', ar: 'محطة رمسيس', parent: 'cairo.downtown', lat: 30.0626, lng: 31.2468, aliases: ['Ramses', 'Cairo Station', 'محطة مصر'], popularity: 70 },
  { slug: 'cairo.nasr-city.abbas-el-akkad', kind: 'LANDMARK', en: 'Abbas El Akkad Street', ar: 'شارع عباس العقاد', parent: 'cairo.nasr-city', lat: 30.059, lng: 31.34, aliases: ['Abbas El Akkad', 'عباس العقاد'], popularity: 70 },
  { slug: 'cairo.maadi.carrefour-ring-road', kind: 'LANDMARK', en: 'Carrefour Maadi (Ring Road)', ar: 'كارفور المعادي (الدائري)', parent: 'cairo.maadi', lat: 29.9861, lng: 31.2847, aliases: ['Carrefour Maadi'], popularity: 60 },
  { slug: 'alexandria.sidi-gaber.station', kind: 'TRANSIT', en: 'Sidi Gaber Railway Station', ar: 'محطة سيدي جابر', parent: 'alexandria.sidi-gaber', lat: 31.2185, lng: 29.9425, popularity: 65 },
  { slug: 'giza.october.juhayna-square', kind: 'LANDMARK', en: 'Juhayna Square', ar: 'ميدان جهينة', parent: 'giza.october', lat: 30.0055, lng: 30.9796, popularity: 50 },
];

/** Parents always appear before their children. */
export const SEED_PLACES: SeedPlace[] = [...governorates, ...cities, ...places];
