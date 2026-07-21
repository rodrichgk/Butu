import { useState, useRef, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { useConfigStore } from "../../store/useConfigStore";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useQueryClient } from "@tanstack/react-query";
import { useLibraryQuery } from "../../hooks/useLibraryQuery";
import { lazy, Suspense } from "react";
const MarkerAutoDetectModal = lazy(() => import("../MarkerAutoDetectModal").then(m => ({ default: m.MarkerAutoDetectModal })));
const OrganizeModal = lazy(() => import("../OrganizeModal").then(m => ({ default: m.OrganizeModal })));
import { usePlatformBridge, PlatformContext } from "../../hooks/usePlatformBridge";
import { useLocation, useNavigate } from "react-router-dom";
import { getLocalizedPath } from "../../utils/routeHelpers";

// Donation link (PayPal). The Support section + QR appear everywhere once this is a real URL;
// it auto-hides while it's the example.com placeholder so we can ship without one.
const DONATE_URL = "https://www.paypal.com/donate/?hosted_button_id=7YJ9V2CMFRRPW";
const DONATE_ENABLED = !DONATE_URL.includes("example.com");

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function DonateModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(4,6,13,0.8)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="rounded-3xl p-8 flex flex-col items-center"
        style={{ background: "rgba(16,20,30,0.98)", border: "1px solid rgba(153,247,255,0.15)", maxWidth: 360 }}
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display font-bold text-on_surface text-xl mb-1">Support Butu</h2>
        <p className="font-body text-on_surface_variant text-sm text-center mb-5">
          Butu is free. Scan with your phone — or open the page — to support development ❤
        </p>
        <div className="p-3 rounded-2xl" style={{ background: "#fff" }}>
          <QRCodeSVG value={DONATE_URL} size={200} bgColor="#ffffff" fgColor="#04060d" />
        </div>
        <motion.button
          onClick={() => openExternal(DONATE_URL)}
          className="mt-5 px-5 py-2.5 rounded-xl font-body text-sm font-semibold"
          style={{ background: "rgba(153,247,255,0.12)", color: "#99f7ff", border: "1px solid rgba(153,247,255,0.3)", cursor: "none" }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        >
          Open donation page
        </motion.button>
        <button onClick={onClose} className="mt-3 font-body text-sm" style={{ color: "rgba(224,230,240,0.5)", cursor: "none" }}>
          Close
        </button>
      </motion.div>
    </motion.div>
  );
}

function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-7 max-w-2xl">
      <p className="font-mono-tech text-xs tracking-[0.22em] mb-3" style={{ color: "rgba(153,247,255,0.55)" }}>{title}</p>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      data-magnetic
      data-magnetic-id={`toggle-${label}`}
      onClick={() => onChange(!value)}
      className="flex items-center justify-between p-5 rounded-xl"
      style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(46,52,71,0.3)", cursor: "pointer" }}
    >
      <div className="pr-4">
        <p className="font-display font-semibold text-on_surface text-base">{label}</p>
        <p className="font-body text-on_surface_variant text-sm mt-0.5">{sub}</p>
      </div>
      <div
        className="relative flex-shrink-0"
        style={{
          width: 46, height: 26, borderRadius: 999,
          background: value ? "linear-gradient(135deg,#99f7ff,#00f1fe)" : "rgba(255,255,255,0.08)",
          border: "1px solid " + (value ? "rgba(153,247,255,0.4)" : "rgba(255,255,255,0.1)"),
          transition: "background 0.2s",
        }}
      >
        <motion.span
          animate={{ x: value ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          style={{ position: "absolute", top: 2, width: 20, height: 20, borderRadius: "50%", background: value ? "#001f24" : "#9aa3b4" }}
        />
      </div>
    </div>
  );
}

function ReloadLibraryRow({ count, isLoading, onReload }: { count: number; isLoading: boolean; onReload: () => void }) {
  const [phase, setPhase] = useState<"idle" | "syncing" | "done">("idle");
  const sawLoading = useRef(false);

  useEffect(() => {
    if (phase !== "syncing") return;
    if (isLoading) { sawLoading.current = true; return; }
    if (sawLoading.current) { sawLoading.current = false; setPhase("done"); }
  }, [isLoading, phase]);

  useEffect(() => {
    if (phase === "done") {
      const t = setTimeout(() => setPhase("idle"), 1800);
      return () => clearTimeout(t);
    }
    if (phase === "syncing") {
      const t = setTimeout(() => { sawLoading.current = false; setPhase("idle"); }, 15000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const busy = phase === "syncing" || isLoading;
  const click = () => {
    if (busy) return;
    sawLoading.current = false;
    setPhase("syncing");
    onReload();
  };

  const btn =
    phase === "done"
      ? { text: "Updated", bg: "rgba(70,220,140,0.14)", fg: "#5ee0a0", bd: "rgba(70,220,140,0.35)" }
      : busy
      ? { text: "Syncing…", bg: "rgba(153,247,255,0.10)", fg: "#99f7ff", bd: "rgba(153,247,255,0.30)" }
      : { text: "Reload now", bg: "rgba(153,247,255,0.12)", fg: "#99f7ff", bd: "rgba(153,247,255,0.30)" };

  return (
    <div className="flex items-center justify-between p-6 rounded-xl"
      style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(46,52,71,0.3)" }}
    >
      <div>
        <p className="font-display font-semibold text-on_surface text-base">Reload library</p>
        <p className="font-body text-on_surface_variant text-sm mt-0.5">
          {count} items loaded · re-fetch everything from your server
        </p>
      </div>
      <motion.button
        data-magnetic
        data-magnetic-id="settings-reload"
        onClick={click}
        disabled={busy && phase !== "done"}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-body text-sm font-semibold"
        style={{ background: btn.bg, color: btn.fg, border: `1px solid ${btn.bd}`, cursor: "none" }}
        whileHover={busy ? {} : { scale: 1.03 }}
        whileTap={busy ? {} : { scale: 0.97 }}
      >
        {phase === "syncing" || isLoading ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }}
            style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%",
              border: "2px solid rgba(153,247,255,0.3)", borderTopColor: "#99f7ff" }}
          />
        ) : phase === "done" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5ee0a0" strokeWidth="3">
            <polyline points="20,6 9,17 4,12" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#99f7ff" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        )}
        {btn.text}
      </motion.button>
    </div>
  );
}

function SettingRow({ label, meta, sub, onClick }: { label: string; meta: string; sub: string; onClick?: () => void }) {
  return (
    <motion.div
      data-magnetic
      data-magnetic-id={`settings-${label}`}
      onClick={onClick}
      className="flex items-center justify-between p-6 rounded-xl"
      style={{
        background: "rgba(22,26,38,0.7)",
        border: "1px solid rgba(46,52,71,0.3)",
        cursor: onClick ? "pointer" : "none",
      }}
      whileHover={onClick ? { background: "rgba(30,35,48,0.9)", borderColor: "rgba(153,247,255,0.15)" } : {}}
      transition={{ duration: 0.2 }}
    >
      <div>
        <p className="font-display font-semibold text-on_surface text-base">{label}</p>
        <p className="font-body text-on_surface_variant text-sm mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono-tech text-primary text-xs">{meta}</span>
        {onClick && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa3b4" strokeWidth="2">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        )}
      </div>
    </motion.div>
  );
}

export default function SettingsView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const plexConfig        = useConfigStore((s) => s.plexConfig);
  const jellyfinConfig    = useConfigStore((s) => s.jellyfinConfig);
  const serverType        = useConfigStore((s) => s.serverType);
  const setPlexConfig     = useConfigStore((s) => s.setPlexConfig);
  const setJellyfinConfig = useConfigStore((s) => s.setJellyfinConfig);
  const setServerType     = useConfigStore((s) => s.setServerType);
  const { data: storeLibrary = [] } = useLibraryQuery();
  const queryClient = useQueryClient();
  const settings          = useConfigStore((s) => s.settings);
  const updateSettings    = useConfigStore((s) => s.updateSettings);
  const clearWatchProgress = useLibraryStore((s) => s.clearWatchProgress);
  const { refetch: refreshLibrary } = useLibraryQuery();
  const { isLoading: isLoading } = useLibraryQuery();
  const [showMarkerDetect, setShowMarkerDetect] = useState(false);
  const [showOrganize, setShowOrganize] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [cleared, setCleared] = useState(false);
  const { platform } = usePlatformBridge();
  const isDesktopApp = platform === PlatformContext.DesktopTauri;

  const isDemo = serverType === "demo";
  const active = serverType === "plex" ? plexConfig : serverType === "jellyfin" ? jellyfinConfig : null;
  const serverLabel = serverType === "plex" ? "PLEX" : "JELLYFIN";

  const disconnect = () => {
    setPlexConfig(null);
    setJellyfinConfig(null);
    queryClient.removeQueries({ queryKey: ["library"] });
    setServerType(null); // → returns to the setup screen
  };

  return (
    <div className="px-4 sm:px-8 lg:px-20 pt-10 pb-20">
      <h1 className="font-display font-black text-on_surface mb-8" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
        {t("settings.title")}
      </h1>

      {(active || isDemo) && (
        <div className="mb-8 p-6 rounded-2xl max-w-2xl"
          style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(153,247,255,0.1)" }}
        >
          <p className="font-mono-tech text-xs text-on_surface_variant mb-1">{isDemo ? "GUEST MODE" : `${serverLabel} SERVER`}</p>
          {isDemo ? (
            <p className="font-display font-semibold text-on_surface">Sample content — not your library</p>
          ) : (
            <p className="font-display font-semibold text-on_surface" style={{ wordBreak: "break-all" }}>{active!.serverUrl}</p>
          )}
          <p className="font-body text-on_surface_variant text-sm mt-0.5">
            {isDemo
              ? "Freely-licensed short films, so you can try Butu before connecting a real server."
              : active!.userName ? <>Signed in as <span style={{ color: "#99f7ff" }}>{active!.userName}</span></> : "Connected"}
            {storeLibrary.length > 0 && ` · ${storeLibrary.length} items`}
          </p>
          <motion.button
            onClick={disconnect}
            className="mt-4 px-5 py-2 rounded-xl font-body text-sm"
            style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b", border: "1px solid rgba(255,80,80,0.2)", cursor: "none" }}
            whileHover={{ background: "rgba(255,80,80,0.18)" }}
            whileTap={{ scale: 0.97 }}
          >
            {isDemo ? "Exit demo" : "Disconnect"}
          </motion.button>
        </div>
      )}

      <SettingSection title={t("settings.language", "LANGUAGE").toUpperCase()}>
        <SettingRow 
          label={t("settings.english")} 
          meta={i18n.language.startsWith('en') ? "ACTIVE" : ""} 
          sub="Switch language to English" 
          onClick={() => {
            i18n.changeLanguage('en');
            navigate(getLocalizedPath(location.pathname, 'en'), { replace: true });
          }} 
        />
        <SettingRow 
          label={t("settings.french")} 
          meta={i18n.language.startsWith('fr') ? "ACTIVE" : ""} 
          sub="Changer la langue en Français" 
          onClick={() => {
            i18n.changeLanguage('fr');
            navigate(getLocalizedPath(location.pathname, 'fr'), { replace: true });
          }} 
        />
      </SettingSection>

      <SettingSection title="PLAYBACK">
        <ToggleRow label="Auto-skip intros" sub="Jump past detected intro markers automatically"
          value={settings.autoSkipIntro} onChange={(v) => updateSettings({ autoSkipIntro: v })} />
        <ToggleRow label="Auto-skip credits" sub="Jump past end-credits automatically"
          value={settings.autoSkipCredits} onChange={(v) => updateSettings({ autoSkipCredits: v })} />
        <ToggleRow label="Auto-play next episode" sub="Continue to the next episode when one ends"
          value={settings.autoPlayNext} onChange={(v) => updateSettings({ autoPlayNext: v })} />
        <ToggleRow label="Boost voices" sub="Downmix surround to stereo and lift dialogue so speech isn't drowned out by effects"
          value={settings.boostVoices} onChange={(v) => updateSettings({ boostVoices: v })} />
      </SettingSection>

      <SettingSection title="HOME SCREEN">
        <ToggleRow label="Featured hero" sub="Show the large rotating banner at the top of Home"
          value={settings.showHero} onChange={(v) => updateSettings({ showHero: v })} />
        <ToggleRow label="Continue Watching" sub="Show the resume rail on the Home screen"
          value={settings.showContinueWatching} onChange={(v) => updateSettings({ showContinueWatching: v })} />
      </SettingSection>

      <SettingSection title="LIBRARY">
        <ReloadLibraryRow count={storeLibrary.length} isLoading={isLoading} onReload={refreshLibrary} />
        <SettingRow label="Clear watch history" meta={cleared ? "CLEARED" : "RESET"}
          sub="Remove all saved playback positions and Continue Watching"
          onClick={() => { clearWatchProgress(); setCleared(true); }} />
      </SettingSection>

      {isDesktopApp && !isDemo && (
        <SettingSection title={t("settings.library_tools", "LIBRARY TOOLS").toUpperCase()}>
          <SettingRow label={t("settings.organize_label", "Organize downloads")} meta="HARDLINK"
            sub={t("settings.organize_sub", "Sort a folder of downloaded TV/movies into your Plex/Jellyfin library")}
            onClick={() => setShowOrganize(true)} />
        </SettingSection>
      )}

      <SettingSection title="COMPANION">
        {!isDemo && (
          <SettingRow label="Marker Auto-Detect" meta="INTROS + CREDITS"
            sub="Fingerprint your library and contribute markers to the Butu cloud DB"
            onClick={() => setShowMarkerDetect(true)} />
        )}
        <SettingRow label="Air Mouse" meta="COMING SOON"
          sub="Gyroscopic phone remote — coming soon" />
      </SettingSection>

      {DONATE_ENABLED && (
        <SettingSection title="SUPPORT">
          <SettingRow label="Support Butu" meta="DONATE"
            sub="Butu is free. If it's useful to you, you can support development ❤"
            onClick={() => setShowDonate(true)} />
        </SettingSection>
      )}

      <Suspense fallback={null}>
        <AnimatePresence>
          {showMarkerDetect && <MarkerAutoDetectModal onClose={() => setShowMarkerDetect(false)} />}
          {showOrganize && <OrganizeModal onClose={() => setShowOrganize(false)} />}
          {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
        </AnimatePresence>
      </Suspense>

      <div className="mt-10 max-w-2xl">
        <p className="font-mono-tech text-on_surface_variant text-xs mb-1">BUTU v{/* __APP_VERSION__ */"0.1.2"}</p>
        <p className="font-mono-tech text-on_surface_variant text-xs opacity-50">
          Crowdsourced intro/credits markers · Tauri · React
        </p>
      </div>
    </div>
  );
}
