export interface Language {
  code: string;
  name: string;
  nativeName: string;
  region: string;
}

export const LANGUAGES: Language[] = [
  { code: "kn-IN", name: "Kannada", nativeName: "ಕನ್ನಡ", region: "India" },
  { code: "hi-IN", name: "Hindi", nativeName: "हिन्दी", region: "India" },
  { code: "ta-IN", name: "Tamil", nativeName: "தமிழ்", region: "India" },
  { code: "te-IN", name: "Telugu", nativeName: "తెలుగు", region: "India" },
  { code: "ml-IN", name: "Malayalam", nativeName: "മലയാളം", region: "India" },
  { code: "mr-IN", name: "Marathi", nativeName: "मराठी", region: "India" },
  { code: "bn-IN", name: "Bengali", nativeName: "বাংলা", region: "India" },
  { code: "gu-IN", name: "Gujarati", nativeName: "ગુજરાતી", region: "India" },
  { code: "pa-IN", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", region: "India" },
  { code: "en-US", name: "English", nativeName: "English", region: "US" },
  { code: "en-IN", name: "English (India)", nativeName: "English", region: "India" },
  { code: "es-ES", name: "Spanish", nativeName: "Español", region: "Spain" },
  { code: "fr-FR", name: "French", nativeName: "Français", region: "France" },
  { code: "de-DE", name: "German", nativeName: "Deutsch", region: "Germany" },
  { code: "pt-BR", name: "Portuguese", nativeName: "Português", region: "Brazil" },
  { code: "zh-CN", name: "Chinese", nativeName: "中文", region: "China" },
  { code: "ja-JP", name: "Japanese", nativeName: "日本語", region: "Japan" },
  { code: "ko-KR", name: "Korean", nativeName: "한국어", region: "Korea" },
  { code: "ar-SA", name: "Arabic", nativeName: "العربية", region: "Saudi Arabia" },
  { code: "ru-RU", name: "Russian", nativeName: "Русский", region: "Russia" },
];

export function getLanguageName(code: string): string {
  const lang = LANGUAGES.find(l => l.code === code);
  return lang ? `${lang.nativeName} (${lang.name})` : code;
}

export function getLanguageByCode(code: string): Language | undefined {
  return LANGUAGES.find(l => l.code === code);
}
