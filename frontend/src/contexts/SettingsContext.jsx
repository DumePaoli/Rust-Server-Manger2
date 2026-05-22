import { createContext, useContext, useState, useEffect } from "react";

const THEMES = {
  rust:   { 50:"255 247 237", 100:"255 237 213", 200:"254 215 170", 300:"253 186 116", 400:"251 146 60",  500:"249 115 22",  600:"234 88 12",  700:"194 65 12",  800:"154 52 18",  900:"124 45 18"  },
  blue:   { 50:"239 246 255", 100:"219 234 254", 200:"191 219 254", 300:"147 197 253", 400:"96 165 250",  500:"59 130 246",  600:"37 99 235",  700:"29 78 216",   800:"30 64 175",  900:"30 58 138"  },
  green:  { 50:"240 253 244", 100:"220 252 231", 200:"187 247 208", 300:"134 239 172", 400:"74 222 128",  500:"34 197 94",   600:"22 163 74",  700:"21 128 61",   800:"22 101 52",  900:"20 83 45"   },
  purple: { 50:"245 243 255", 100:"237 233 254", 200:"221 214 254", 300:"196 181 253", 400:"167 139 250", 500:"139 92 246",  600:"124 58 237", 700:"109 40 217",  800:"91 33 182",  900:"76 29 149"  },
  red:    { 50:"254 242 242", 100:"254 226 226", 200:"254 202 202", 300:"252 165 165", 400:"248 113 113", 500:"239 68 68",   600:"220 38 38",  700:"185 28 28",   800:"153 27 27",  900:"127 29 29"  },
  yellow: { 50:"255 251 235", 100:"254 243 199", 200:"253 230 138", 300:"252 211 77",  400:"251 191 36",  500:"245 158 11",  600:"217 119 6",  700:"180 83 9",    800:"146 64 14",  900:"120 53 15"  },
};

export const THEME_META = [
  { key: "rust",   label: "Rust",   swatch: "#EA580C" },
  { key: "blue",   label: "Bleu",   swatch: "#2563EB" },
  { key: "green",  label: "Vert",   swatch: "#16A34A" },
  { key: "purple", label: "Violet", swatch: "#7C3AED" },
  { key: "red",    label: "Rouge",  swatch: "#DC2626" },
  { key: "yellow", label: "Jaune",  swatch: "#D97706" },
];

function applyTheme(key) {
  const t = THEMES[key];
  if (!t) return;
  const root = document.documentElement;
  Object.entries(t).forEach(([shade, val]) => {
    root.style.setProperty(`--accent-${shade}`, val);
  });
}

export const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [theme, _setTheme] = useState(() => localStorage.getItem("rsm_theme") || "rust");
  const [lang, _setLang]   = useState(() => localStorage.getItem("rsm_lang")  || "fr");

  useEffect(() => { applyTheme(theme); }, []);

  const setTheme = (t) => {
    _setTheme(t);
    localStorage.setItem("rsm_theme", t);
    applyTheme(t);
  };

  const setLang = (l) => {
    _setLang(l);
    localStorage.setItem("rsm_lang", l);
  };

  return (
    <SettingsContext.Provider value={{ theme, setTheme, lang, setLang }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
