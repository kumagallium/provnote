import { useI18n } from "../i18n";

export function Pillars() {
  const { t } = useI18n();
  return (
    <section className="lp-section lp-section--accent" id="how">
      <p className="lp-eyebrow">How it thinks</p>
      <h2 className="lp-h2" style={{ marginTop: "0.5rem" }}>
        {t("pillars.heading")}
      </h2>
      <p className="lp-lead">{t("pillars.sub")}</p>

      <div className="lp-pillars">
        <article className="lp-pillar">
          <span className="lp-pillar-num">01 · LINK</span>
          <h3>{t("pillar.link.title")}</h3>
          <p>{t("pillar.link.body")}</p>
        </article>
        <article className="lp-pillar">
          <span className="lp-pillar-num">02 · TRACE</span>
          <h3>{t("pillar.trace.title")}</h3>
          <p>{t("pillar.trace.body")}</p>
        </article>
        <article className="lp-pillar">
          <span className="lp-pillar-num">03 · EXTEND</span>
          <h3>{t("pillar.extend.title")}</h3>
          <p>{t("pillar.extend.body")}</p>
        </article>
      </div>
    </section>
  );
}
