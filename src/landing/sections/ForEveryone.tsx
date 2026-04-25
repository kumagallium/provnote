import { useI18n } from "../i18n";

export function ForEveryone() {
  const { t } = useI18n();
  const cases: Array<{ icon: string; title: string; body: string }> = [
    { icon: "🔬", title: t("everyone.case.lab"), body: t("everyone.case.lab.body") },
    { icon: "🍳", title: t("everyone.case.maker"), body: t("everyone.case.maker.body") },
    { icon: "💻", title: t("everyone.case.engineer"), body: t("everyone.case.engineer.body") },
    { icon: "📚", title: t("everyone.case.student"), body: t("everyone.case.student.body") },
  ];

  return (
    <section className="lp-section" id="for-everyone">
      <p className="lp-eyebrow">Who it's for</p>
      <h2 className="lp-h2" style={{ marginTop: "0.5rem" }}>
        {t("everyone.heading")}
      </h2>
      <p className="lp-lead">{t("everyone.sub")}</p>

      <div className="lp-grid-4">
        {cases.map((c) => (
          <article key={c.title} className="lp-card">
            <span className="lp-card-icon" aria-hidden="true">
              {c.icon}
            </span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
