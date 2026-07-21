import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";

const GITHUB_URL = "https://github.com/rodrichgk/Butu";

function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      className={`mt-14 md:mt-20 ${className}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}

const cardStyle = { background: "rgba(16,20,30,0.7)", border: "1px solid rgba(153,247,255,0.1)" } as const;

export function Landing({ onGetStarted, onTryDemo }: { onGetStarted: () => void; onTryDemo: () => void }) {
  const { t } = useTranslation();
  
  const STEPS = t('landing.steps', { returnObjects: true }) as any[];
  const FEATURES = t('landing.features', { returnObjects: true }) as any[];
  const FAQ = t('landing.faq', { returnObjects: true }) as any[];
  const PLATFORMS = t('landing.platforms', { returnObjects: true }) as any[];
  
  return (
    <div className="landing" style={{ background: "#04060d", color: "#e0e6f0" }}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(153,247,255,0.08) 0%, transparent 60%)" }}
      />

      <div className="relative mx-auto px-5 sm:px-6 pt-10 md:pt-14 pb-20" style={{ maxWidth: 980 }}>
        {/* Hero */}
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <Logo size={132} glow />
          <h1 className="font-display font-black mt-5" style={{ fontSize: "clamp(2.5rem, 9vw, 4.5rem)", letterSpacing: "-0.02em" }}>
            Butu
          </h1>
          <p className="font-body mt-3" style={{ fontSize: "clamp(1.05rem, 4vw, 1.35rem)", color: "rgba(224,230,240,0.7)", maxWidth: 620 }}>
            {t('landing.title')}
          </p>
          <motion.button
            onClick={onGetStarted}
            className="font-display font-bold mt-9 rounded-2xl w-full sm:w-auto"
            style={{
              background: "linear-gradient(135deg,#99f7ff,#00f1fe)",
              color: "#001f24",
              fontSize: "1.05rem",
              padding: "1rem 2rem",
              cursor: "pointer",
              boxShadow: "0 0 40px rgba(153,247,255,0.25)",
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {t('landing.cta')}
          </motion.button>
          <button
            onClick={onTryDemo}
            className="font-body mt-4 text-sm"
            style={{ color: "rgba(153,247,255,0.8)", textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}
          >
            {t('landing.try_demo')}
          </button>
          <p className="font-mono-tech mt-4 text-xs tracking-widest uppercase" style={{ color: "rgba(224,230,240,0.4)" }}>
            {t('landing.subtitle')}
          </p>
        </motion.div>

        {/* How it works */}
        <Section>
          <h2 className="font-display font-black text-center mb-10" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>{t('landing.how_it_works')}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((s, idx) => (
              <div key={idx} className="rounded-2xl p-6" style={cardStyle}>
                <div className="font-display font-black" style={{ fontSize: 28, color: "#99f7ff" }}>{idx + 1}</div>
                <h3 className="font-display font-bold text-lg mt-2" style={{ color: "#cdeff5" }}>{s.title}</h3>
                <p className="font-body mt-2 text-sm" style={{ color: "rgba(224,230,240,0.6)", lineHeight: 1.6 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Features */}
        <Section>
          <h2 className="font-display font-black text-center mb-10" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>{t('landing.what_you_get')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl p-6" style={cardStyle}>
                <h3 className="font-display font-bold text-base" style={{ color: "#cdeff5" }}>{f.title}</h3>
                <p className="font-body mt-2 text-sm" style={{ color: "rgba(224,230,240,0.6)", lineHeight: 1.6 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Platforms */}
        <Section>
          <h2 className="font-display font-black text-center mb-3" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>{t('landing.get_butu')}</h2>
          <p className="font-body text-center text-sm mb-10" style={{ color: "rgba(224,230,240,0.55)" }}>{t('landing.get_butu_subtitle')}</p>
          <div className="grid sm:grid-cols-3 gap-4 text-center">
            {PLATFORMS.map((p, idx) => {
              const live = idx === 0;
              return (
                <div key={p.name} className="rounded-2xl p-6" style={cardStyle}>
                  <h3 className="font-display font-bold text-lg" style={{ color: "#cdeff5" }}>{p.name}</h3>
                  <p className="font-body mt-2 text-sm" style={{ color: "rgba(224,230,240,0.55)" }}>{p.note}</p>
                  {live ? (
                    <button onClick={onGetStarted} className="font-display font-semibold mt-4 px-5 py-2 rounded-xl"
                      style={{ background: "rgba(153,247,255,0.12)", color: "#99f7ff", border: "1px solid rgba(153,247,255,0.3)", cursor: "pointer" }}>
                      {t('landing.use_it_now')}
                    </button>
                  ) : p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" className="font-display font-semibold inline-block mt-4 px-5 py-2 rounded-xl"
                      style={{ background: "rgba(153,247,255,0.12)", color: "#99f7ff", border: "1px solid rgba(153,247,255,0.3)", cursor: "pointer", textDecoration: "none" }}>
                      {t('landing.download')}
                    </a>
                  ) : (
                    <span className="font-mono-tech inline-block mt-4 px-3 py-1.5 rounded-lg text-xs tracking-wider uppercase"
                      style={{ color: "rgba(224,230,240,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {t('landing.coming_soon')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* FAQ */}
        <Section>
          <h2 className="font-display font-black text-center mb-10" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>{t('landing.questions')}</h2>
          <div className="grid gap-3" style={{ maxWidth: 720, margin: "0 auto" }}>
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl p-5" style={cardStyle}>
                <h3 className="font-display font-semibold" style={{ color: "#e0e6f0" }}>{item.q}</h3>
                <p className="font-body mt-1.5 text-sm" style={{ color: "rgba(224,230,240,0.6)", lineHeight: 1.6 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Final CTA + about */}
        <Section className="text-center">
          <h2 className="font-display font-black" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)" }}>{t('landing.ready')}</h2>
          <motion.button
            onClick={onGetStarted}
            className="font-display font-bold mt-6 rounded-2xl w-full sm:w-auto"
            style={{ background: "linear-gradient(135deg,#99f7ff,#00f1fe)", color: "#001f24", fontSize: "1.05rem", padding: "1rem 2.25rem", cursor: "pointer" }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {t('landing.cta')}
          </motion.button>
          <div>
            <button
              onClick={onTryDemo}
              className="font-body mt-5 text-sm"
              style={{ color: "rgba(153,247,255,0.8)", textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}
            >
              {t('landing.try_demo')}
            </button>
          </div>

          <div className="mt-16 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="font-body text-sm" style={{ color: "rgba(224,230,240,0.5)" }}>
              {t('landing.built_by')} <span style={{ color: "#99f7ff" }}>Gabhy Rodrich</span> — {t('landing.master')}
            </p>
            <div className="flex items-center justify-center gap-4 mt-3">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-body text-sm" style={{ color: "rgba(224,230,240,0.55)", textDecoration: "underline", cursor: "pointer" }}>
                {t('landing.opensource')}
              </a>
              <span className="font-mono-tech text-xs" style={{ color: "rgba(224,230,240,0.25)" }}>BUTU · v{__APP_VERSION__}</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
