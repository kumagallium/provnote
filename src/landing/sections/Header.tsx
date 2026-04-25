import { useI18n } from "../i18n";

export function Header() {
  const { locale, setLocale } = useI18n();

  return (
    <header className="lp-header">
      <div className="lp-header-inner">
        <a href="#top" className="lp-brand">
          <img src="/Graphium/logo.png" alt="" />
          <span>Graphium</span>
        </a>
        <nav className="lp-nav">
          <a href="#how">How</a>
          <a href="#trust">Trust</a>
          <a href="#start">Get started</a>
          <a
            href="https://github.com/kumagallium/Graphium"
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "ja" : "en")}
            aria-label="Toggle language"
          >
            {locale === "en" ? "日本語" : "English"}
          </button>
        </nav>
      </div>
    </header>
  );
}
