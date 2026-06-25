import { motion } from "framer-motion";
import { Logo } from "./Logo";

const FEATURES = [
  {
    title: "Plex & Jellyfin",
    body: "Bring your own media server. Sign in with a QR code, password, or token — no IP addresses to hunt down.",
  },
  {
    title: "Watch anywhere",
    body: "At home or on the go. Even a library a friend shares with you streams straight through, wherever you are.",
  },
  {
    title: "Cinematic playback",
    body: "Auto-skip intros and credits, boosted dialogue so you actually hear it, and clean subtitles — built in.",
  },
  {
    title: "Every screen",
    body: "One beautiful experience across Android TV, Windows desktop, and right here on the web.",
  },
];

export function Landing({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="landing min-h-screen w-full overflow-y-auto" style={{ background: "#04060d", color: "#e0e6f0" }}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(153,247,255,0.08) 0%, transparent 60%)" }}
      />

      <div className="relative mx-auto px-6 py-16 md:py-24" style={{ maxWidth: 980 }}>
        {/* Hero */}
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <Logo size={84} glow />
          <h1 className="font-display font-black mt-5" style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)", letterSpacing: "-0.02em" }}>
            Butu
          </h1>
          <p className="font-body mt-3" style={{ fontSize: "clamp(1rem, 2.4vw, 1.35rem)", color: "rgba(224,230,240,0.7)", maxWidth: 620 }}>
            Your Plex &amp; Jellyfin libraries, in one beautiful player — at home, anywhere, and on every screen.
          </p>
          <motion.button
            onClick={onGetStarted}
            className="font-display font-bold mt-9 rounded-2xl"
            style={{
              background: "linear-gradient(135deg,#99f7ff,#00f1fe)",
              color: "#001f24",
              fontSize: "1.05rem",
              padding: "1rem 2rem",
              cursor: "pointer",
              boxShadow: "0 0 40px rgba(153,247,255,0.25)",
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            Connect your server →
          </motion.button>
          <p className="font-mono-tech mt-4 text-xs tracking-widest uppercase" style={{ color: "rgba(224,230,240,0.4)" }}>
            Free · Plex &amp; Jellyfin · No account needed
          </p>
        </motion.div>

        {/* Features */}
        <div className="grid sm:grid-cols-2 gap-4 mt-16 md:mt-24">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="rounded-2xl p-6"
              style={{ background: "rgba(16,20,30,0.7)", border: "1px solid rgba(153,247,255,0.1)" }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
            >
              <h3 className="font-display font-bold text-lg" style={{ color: "#cdeff5" }}>{f.title}</h3>
              <p className="font-body mt-2 text-sm" style={{ color: "rgba(224,230,240,0.6)", lineHeight: 1.6 }}>{f.body}</p>
            </motion.div>
          ))}
        </div>

        {/* How it works */}
        <motion.p
          className="font-body text-sm text-center mx-auto mt-16 md:mt-20"
          style={{ color: "rgba(224,230,240,0.55)", lineHeight: 1.7, maxWidth: 680 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Butu doesn&apos;t host anything — it&apos;s a player on top of <em>your own</em> Plex or Jellyfin server.
          Sign in once and your movies, shows, and shared libraries are ready. Your credentials stay on your device.
        </motion.p>

        {/* About / creator */}
        <div className="mt-20 pt-8 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="font-body text-sm" style={{ color: "rgba(224,230,240,0.5)" }}>
            Built by <span style={{ color: "#99f7ff" }}>Gabhy Rodrich</span> — Master&apos;s in Electronics &amp; Automation
          </p>
          <p className="font-mono-tech text-xs mt-2" style={{ color: "rgba(224,230,240,0.25)" }}>BUTU · v0.1.0</p>
        </div>
      </div>
    </div>
  );
}
