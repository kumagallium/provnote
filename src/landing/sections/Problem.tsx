import { useI18n } from "../i18n";

export function Problem() {
  const { t } = useI18n();
  return (
    <section className="lp-section" id="problem">
      <h2 className="lp-h2">{t("problem.heading")}</h2>
      <p className="lp-lead">{t("problem.lead")}</p>
      <p className="lp-tagline">{t("problem.tagline")}</p>
      <p className="lp-lead" style={{ marginTop: "1.2rem" }}>
        {t("problem.body")}
      </p>
    </section>
  );
}
