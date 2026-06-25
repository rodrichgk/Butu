import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Logo } from "./Logo";

const GITHUB_URL = "https://github.com/rodrichgk/Butu";

const STEPS = [
  { n: "1", title: "Connect", body: "Sign in to your Plex or Jellyfin server with a QR code, password, or token — no IP addresses to hunt down." },
  { n: "2", title: "Your library appears", body: "Movies, shows, music, and anything shared with you load automatically, with artwork and resume points." },
  { n: "3", title: "Watch anywhere", body: "At home or on the go, on your TV, your desktop, or right here in the browser." },
];

const FEATURES = [
  { title: "Plex & Jellyfin", body: "Bring your own media server. Butu is just a beautiful player on top of it." },
  { title: "Watch off-network", body: "Even a library a friend shares with you streams through — at home or anywhere." },
  { title: "Auto-skip intros & credits", body: "Jump past the parts you don't watch, automatically, when markers are available." },
  { title: "Boost voices", body: "Dialogue lifted above the effects so you actually hear what people say." },
  { title: "Subtitles, done right", body: "Pick a language and it's burned in cleanly — no fiddling, no missing tracks." },
  { title: "Made for every screen", body: "A focus-first 10-foot UI on TV, and a tidy layout on desktop and web." },
];

const FAQ = [
  { q: "Do I need my own server?", a: "Yes. Butu plays your existing Plex or Jellyfin library — it doesn't host or provide any content itself." },
  { q: "Is it free?", a: "Completely free, and open-source. If it's useful you can support development, but you never have to." },
  { q: "Is my data safe?", a: "Your credentials stay on your device and Butu talks directly to your server. Nothing is routed through us." },
  { q: "Which devices?", a: "Android TV today, with a Windows desktop app and this web version. Android phones are on the way." },
];

function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      className={`mt-20 md:mt-28 ${className}`}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}

const cardStyle = { background: "rgba(16,20,30,0.7)", border: "1px solid rgba(153,247,255,0.1)" } as const;

export function Landing({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="landing" style={{ background: "#04060d", color: "#e0e6f0" }}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(153,247,255,0.08) 0%, transparent 60%)" }}
      />

      <div className="relative mx-auto px-5 sm:px-6 pt-16 md:pt-24 pb-20" style={{ maxWidth: 980 }}>
        {/* Hero */}
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <Logo size={84} glow />
          <h1 className="font-display font-black mt-5" style={{ fontSize: "clamp(2.5rem, 9vw, 4.5rem)", letterSpacing: "-0.02em" }}>
            Butu
          </h1>
          <p className="font-body mt-3" style={{ fontSize: "clamp(1.05rem, 4vw, 1.35rem)", color: "rgba(224,230,240,0.7)", maxWidth: 620 }}>
            Your Plex &amp; Jellyfin libraries, in one beautiful player — at home, anywhere, and on every screen.
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
            Connect your server →
          </motion.button>
          <p className="font-mono-tech mt-4 text-xs tracking-widest uppercase" style={{ color: "rgba(224,230,240,0.4)" }}>
            Free &amp; open-source · Plex &amp; Jellyfin · No account needed
          </p>
        </motion.div>

        {/* How it works */}
        <Section>
          <h2 className="font-display font-black text-center mb-10" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>How it works</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl p-6" style={cardStyle}>
                <div className="font-display font-black" style={{ fontSize: 28, color: "#99f7ff" }}>{s.n}</div>
                <h3 className="font-display font-bold text-lg mt-2" style={{ color: "#cdeff5" }}>{s.title}</h3>
                <p className="font-body mt-2 text-sm" style={{ color: "rgba(224,230,240,0.6)", lineHeight: 1.6 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Features */}
        <Section>
          <h2 className="font-display font-black text-center mb-10" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>What you get</h2>
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
          <h2 className="font-display font-black text-center mb-3" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>Get Butu</h2>
          <p className="font-body text-center text-sm mb-10" style={{ color: "rgba(224,230,240,0.55)" }}>One app, three ways to watch.</p>
          <div className="grid sm:grid-cols-3 gap-4 text-center">
            {[
              { name: "Web", note: "You're on it — just connect", live: true },
              { name: "Windows", note: "Desktop app — coming soon", live: false },
              { name: "Android TV", note: "APK — coming soon", live: false },
            ].map((p) => (
              <div key={p.name} className="rounded-2xl p-6" style={cardStyle}>
                <h3 className="font-display font-bold text-lg" style={{ color: "#cdeff5" }}>{p.name}</h3>
                <p className="font-body mt-2 text-sm" style={{ color: "rgba(224,230,240,0.55)" }}>{p.note}</p>
                {p.live ? (
                  <button onClick={onGetStarted} className="font-display font-semibold mt-4 px-5 py-2 rounded-xl"
                    style={{ background: "rgba(153,247,255,0.12)", color: "#99f7ff", border: "1px solid rgba(153,247,255,0.3)", cursor: "pointer" }}>
                    Use it now
                  </button>
                ) : (
                  <span className="font-mono-tech inline-block mt-4 px-3 py-1.5 rounded-lg text-xs tracking-wider uppercase"
                    style={{ color: "rgba(224,230,240,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    Coming soon
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* FAQ */}
        <Section>
          <h2 className="font-display font-black text-center mb-10" style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)" }}>Questions</h2>
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
          <h2 className="font-display font-black" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)" }}>Ready when you are.</h2>
          <motion.button
            onClick={onGetStarted}
            className="font-display font-bold mt-6 rounded-2xl w-full sm:w-auto"
            style={{ background: "linear-gradient(135deg,#99f7ff,#00f1fe)", color: "#001f24", fontSize: "1.05rem", padding: "1rem 2.25rem", cursor: "pointer" }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Connect your server →
          </motion.button>

          <div className="mt-16 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="font-body text-sm" style={{ color: "rgba(224,230,240,0.5)" }}>
              Built by <span style={{ color: "#99f7ff" }}>Gabhy Rodrich</span> — Master&apos;s in Electronics &amp; Automation
            </p>
            <div className="flex items-center justify-center gap-4 mt-3">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-body text-sm" style={{ color: "rgba(224,230,240,0.55)", textDecoration: "underline", cursor: "pointer" }}>
                Open-source on GitHub
              </a>
              <span className="font-mono-tech text-xs" style={{ color: "rgba(224,230,240,0.25)" }}>BUTU · v0.1.0</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
