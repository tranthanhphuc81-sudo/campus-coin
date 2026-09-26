import { Link } from "react-router-dom";

import { en } from "@/content/en";

export default function LandingPage() {
  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">{en.landing.eyebrow}</p>
          <h1 id="landing-title">{en.landing.title}</h1>
          <p className="landing-hero__description">{en.landing.description}</p>
          <div className="landing-actions">
            <Link className="btn btn-primary" to={en.routes.register}>
              {en.landing.registerAction}
            </Link>
            <Link className="landing-login" to={en.routes.login}>
              {en.landing.loginAction}
            </Link>
          </div>
        </div>
        <div className="landing-preview" aria-label={en.landing.previewLabel}>
          <div className="landing-preview__topline">
            <span className="landing-preview__dot" />
            <span className="landing-preview__dot" />
            <span className="landing-preview__dot" />
            <span className="landing-preview__label">{en.landing.previewLabel}</span>
          </div>
          <div className="landing-preview__balance">
            <span>{en.landing.previewBalanceLabel}</span>
            <strong>{en.landing.previewBalance}</strong>
          </div>
          <div className="landing-preview__chart" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="landing-preview__caption">{en.landing.previewCaption}</div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="features-title">
        <p className="landing-eyebrow">{en.landing.featuresEyebrow}</p>
        <h2 id="features-title">{en.landing.featuresTitle}</h2>
        <div className="landing-features">
          {en.landing.features.map((feature, index) => (
            <article className="landing-feature" key={feature.title}>
              <span className="landing-feature__number">0{index + 1}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-onboarding" aria-labelledby="onboarding-title">
        <div className="landing-onboarding__intro">
          <p className="landing-eyebrow">{en.landing.stepsEyebrow}</p>
          <h2 id="onboarding-title">{en.landing.stepsTitle}</h2>
        </div>
        <ol className="landing-steps">
          {en.landing.steps.map((step, index) => (
            <li className="landing-step" key={step.title}>
              <span className="landing-step__number">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <Link
                to={
                  index === 0
                    ? `${en.routes.transactions}?new=1&type=income`
                    : index === 1
                      ? en.routes.budgets
                      : `${en.routes.transactions}?new=1`
                }
              >
                {step.action}
                <span aria-hidden="true"> &rarr;</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <footer className="landing-footer">
        <Link className="brand-link" to={en.routes.home}>
          {en.appName}
        </Link>
        <span>{en.landing.footerCopyright}</span>
        <nav aria-label={en.landing.footerNavLabel}>
          <a href="#about">{en.landing.aboutTitle}</a>
          <a href="#terms">{en.landing.termsTitle}</a>
          <a href="#privacy">{en.landing.privacyTitle}</a>
          <Link to={en.routes.sitemap}>{en.sitemap.entries.sitemap.label}</Link>
        </nav>
      </footer>
      <div className="landing-legal" aria-label={en.landing.legalNavLabel}>
        <section id="about">
          <h2>{en.landing.aboutTitle}</h2>
          <p>{en.landing.aboutDescription}</p>
        </section>
        <section id="terms">
          <h2>{en.landing.termsTitle}</h2>
          <p>{en.landing.termsDescription}</p>
        </section>
        <section id="privacy">
          <h2>{en.landing.privacyTitle}</h2>
          <p>{en.landing.privacyDescription}</p>
        </section>
      </div>
    </div>
  );
}
