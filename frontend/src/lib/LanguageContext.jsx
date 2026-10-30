import { createContext, useContext, useState, useEffect } from 'react';
import { getDict } from '../data/i18n';
const LanguageContext = createContext(null);
export function LanguageProvider({ children }) {
    const [lang, setLangState] = useState(() => {
        if (typeof window === 'undefined')
            return 'id';
        return localStorage.getItem('alasdaun-lang') || 'id';
    });
    useEffect(() => {
        localStorage.setItem('alasdaun-lang', lang);
        document.documentElement.lang = lang;
    }, [lang]);
    const toggle = () => setLangState((p) => (p === 'id' ? 'en' : 'id'));
    const setLang = (l) => setLangState(l);
    return (<LanguageContext.Provider value={{ lang, dict: getDict(lang), toggle, setLang }}>
      {children}
    </LanguageContext.Provider>);
}
export function useLang() {
    const ctx = useContext(LanguageContext);
    if (!ctx)
        throw new Error('useLang must be used within LanguageProvider');
    return ctx;
}
