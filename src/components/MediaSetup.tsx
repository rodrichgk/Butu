import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useButuStore } from "../store/useButuStore";
import {
  plexSignIn,
  verifyPlexServer,
  createPlexPin,
  pollPlexPin,
  plexPinAuthUrl,
  fetchPlexResources,
  pickPlexConnection,
  type PlexServer,
} from "../services/plexApi";
import { authenticateUser } from "../services/jellyfinApi";
import { Logo } from "./Logo";
import { useTranslation } from "react-i18next";

type Phase = "login" | "discovering" | "select" | "manual";
type Mode = "qr" | "password" | "token";
type Backend = "plex" | "jellyfin";

const POLL_MS = 2000;
const PIN_TIMEOUT_MS = 15 * 60 * 1000;

const inputStyle = {
  background: "rgba(22,26,38,0.8)",
  color: "#e0e6f0",
  border: "1px solid rgba(153,247,255,0.12)",
  caretColor: "#99f7ff",
} as const;

export function MediaSetup() {
  const setPlexConfig = useButuStore((s) => s.setPlexConfig);
  const setJellyfinConfig = useButuStore((s) => s.setJellyfinConfig);
  const setServerType = useButuStore((s) => s.setServerType);
  const { t } = useTranslation();

  const [backend, setBackend] = useState<Backend>("plex");
  const [phase, setPhase] = useState<Phase>("login");
  const [mode, setMode] = useState<Mode>("qr");

  // Jellyfin login fields
  const [jfUrl, setJfUrl] = useState("http://192.168.1.53:8096");
  const [jfUser, setJfUser] = useState("");
  const [jfPass, setJfPass] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [pin, setPin] = useState<{ id: number; code: string; url: string } | null>(null);

  const [accountToken, setAccountToken] = useState<string | null>(null);
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("http://192.168.1.53:32400");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const save = useCallback((serverUrl: string, token: string, userName?: string) => {
    setPlexConfig({ serverUrl: serverUrl.replace(/\/$/, ""), token, userName });
    setServerType("plex"); // unmounts this screen
  }, [setPlexConfig, setServerType]);

  // A login mode produced an account token → discover the account's servers.
  const onToken = useCallback((tok: string) => {
    stopPolling();
    setAccountToken(tok);
    setError(null);
    setPhase("discovering");
  }, [stopPolling]);

  // Discovery
  useEffect(() => {
    if (phase !== "discovering" || !accountToken) return;
    let cancelled = false;
    (async () => {
      const found = await fetchPlexResources(accountToken).catch(() => [] as PlexServer[]);
      if (cancelled) return;
      setServers(found);
      setPhase(found.length > 0 ? "select" : "manual");
      if (found.length === 0) setError(t('setup.no_servers_found'));
    })();
    return () => { cancelled = true; };
  }, [phase, accountToken]);

  // ── PIN flow ──
  const startPin = useCallback(async () => {
    stopPolling();
    setError(null);
    setPin(null);
    try {
      const p = await createPlexPin();
      setPin({ id: p.id, code: p.code, url: plexPinAuthUrl(p.code) });
    } catch (e: any) {
      setError(`${t('setup.plex_tv_unreachable')}: ${e?.message ?? "error"}`);
    }
  }, [stopPolling]);

  useEffect(() => {
    if (phase === "login" && backend === "plex" && mode === "qr" && !pin) startPin();
  }, [phase, backend, mode, pin, startPin]);

  useEffect(() => {
    if (phase !== "login" || backend !== "plex" || mode !== "qr" || !pin) return;
    const deadline = Date.now() + PIN_TIMEOUT_MS;
    pollRef.current = window.setInterval(async () => {
      if (Date.now() > deadline) { stopPolling(); setPin(null); setError(t('setup.code_expired')); return; }
      const tok = await pollPlexPin(pin.id).catch(() => null);
      if (tok) { stopPolling(); onToken(tok); }
    }, POLL_MS);
    return stopPolling;
  }, [phase, backend, mode, pin, onToken, stopPolling]);

  async function handlePassword() {
    if (!username.trim() || !password) { setError(t('setup.username_password_required')); return; }
    setLoading(true); setError(null);
    try {
      const { token } = await plexSignIn(username.trim(), password);
      onToken(token);
    } catch (e: any) {
      setError(e?.message ?? t('setup.login_failed_credentials'));
    } finally { setLoading(false); }
  }

  async function pickServer(server: PlexServer) {
    setConnecting(server.clientIdentifier);
    setError(null);
    const uri = await pickPlexConnection(server);
    setConnecting(null);
    if (uri) save(uri, server.accessToken, server.name);
    else setError(t('setup.couldnt_reach_server', { name: server.name }));
  }

  async function handleManual() {
    if (!accountToken) return;
    const url = manualUrl.trim().replace(/\/$/, "");
    setLoading(true); setError(null);
    try {
      await verifyPlexServer(url, accountToken);
      save(url, accountToken);
    } catch {
      setError(t('setup.couldnt_reach_manual'));
    } finally { setLoading(false); }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    stopPolling(); setError(null); setPin(null); setMode(next);
  }
  function startOver() {
    stopPolling(); setError(null); setPin(null); setAccountToken(null); setServers([]); setPhase("login");
  }
  function switchBackend(next: Backend) {
    if (next === backend) return;
    stopPolling(); setError(null); setPin(null); setPhase("login"); setBackend(next);
  }

  // Jellyfin connects straight to the entered server (no plex.tv-style discovery).
  async function handleJellyfin() {
    const url = jfUrl.trim().replace(/\/$/, "");
    if (!url || !jfUser.trim()) { setError(t('setup.server_address_required')); return; }
    setLoading(true); setError(null);
    try {
      const { token, userId, userName } = await authenticateUser(url, jfUser.trim(), jfPass);
      setJellyfinConfig({ serverUrl: url, userName, userId, token });
      setServerType("jellyfin"); // unmounts this screen
    } catch (e: any) {
      setError(e?.message ?? t('setup.jellyfin_login_failed'));
    } finally { setLoading(false); }
  }

  const subtitle =
    phase === "login" ? (backend === "plex" ? t('setup.sign_in_plex') : t('setup.sign_in_jellyfin')) :
    phase === "discovering" ? t('setup.finding_servers') :
    phase === "select" ? t('setup.choose_server') : t('setup.enter_address');

  return (
    <div className="media-setup w-screen h-screen flex items-center justify-center" style={{ background: "#04060d" }}>
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 28%, rgba(153,247,255,0.05) 0%, transparent 70%)" }} />

      <motion.div className="relative flex flex-col items-center" style={{ width: 460 }}
        initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
        <div className="mb-9 flex flex-col items-center gap-3">
          <Logo size={56} glow />
          <p className="font-mono-tech text-[11px] mt-1 tracking-[0.3em] uppercase" style={{ color: "rgba(224,230,240,0.5)" }}>
            {subtitle}
          </p>
        </div>

        <div className="w-full rounded-3xl p-8" style={{ background: "rgba(12,16,26,0.88)", border: "1px solid rgba(153,247,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 48px rgba(153,247,255,0.04)" }}>
          <AnimatePresence mode="wait">
            {/* ── LOGIN ── */}
            {phase === "login" && (
              <motion.div key="login" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                <div className="flex gap-1.5 mb-5">
                  {(["plex", "jellyfin"] as Backend[]).map((b) => (
                    <button key={b} onClick={() => switchBackend(b)} className="flex-1 py-2 rounded-lg font-display font-semibold text-xs"
                      style={{ background: backend === b ? "rgba(153,247,255,0.12)" : "transparent", color: backend === b ? "#cdeff5" : "#6b7585", border: "1px solid " + (backend === b ? "rgba(153,247,255,0.3)" : "rgba(255,255,255,0.06)"), cursor: "none" }}>
                      {b === "plex" ? "Plex" : "Jellyfin"}
                    </button>
                  ))}
                </div>

                {backend === "plex" ? (
                <>
                <div className="flex gap-1.5 mb-6">
                  {([["qr", "QR"], ["password", t('setup.password')], ["token", t('setup.token')]] as [Mode, string][]).map(([m, label]) => (
                    <button key={m} onClick={() => switchMode(m)} className="flex-1 py-2 rounded-lg font-display font-semibold text-xs"
                      style={{ background: mode === m ? "rgba(153,247,255,0.12)" : "transparent", color: mode === m ? "#cdeff5" : "#6b7585", border: "1px solid " + (mode === m ? "rgba(153,247,255,0.3)" : "rgba(255,255,255,0.06)"), cursor: "none" }}>
                      {label}
                    </button>
                  ))}
                </div>

                {mode === "qr" && (
                  <div className="flex flex-col items-center text-center">
                    <p className="font-body text-sm mb-5" style={{ color: "rgba(224,230,240,0.6)" }}>
                      {t('setup.go_to_plex_link')}
                    </p>
                    {pin ? (
                      <>
                        <div style={{ background: "#fff", padding: 12, borderRadius: 14 }}>
                          <QRCodeSVG value={pin.url} size={148} bgColor="#ffffff" fgColor="#04060d" />
                        </div>
                        <div className="font-mono-tech mt-5 mb-1" style={{ fontSize: 34, letterSpacing: "0.4em", color: "#99f7ff", textShadow: "0 0 20px rgba(153,247,255,0.4)" }}>{pin.code}</div>
                        <a href={pin.url} target="_blank" rel="noreferrer" className="font-body text-xs" style={{ color: "rgba(224,230,240,0.4)", textDecoration: "underline" }}>{t('setup.open_plex_link')}</a>
                        <p className="font-mono-tech text-[11px] mt-4 tracking-widest uppercase" style={{ color: "#5fd6e8" }}>{t('setup.waiting_to_link')}</p>
                      </>
                    ) : (
                      <p className="font-body text-sm py-8" style={{ color: "#6b7585" }}>{t('setup.generating_code')}</p>
                    )}
                    <button onClick={startPin} className="font-body text-xs mt-3" style={{ color: "rgba(224,230,240,0.35)", cursor: "none" }}>{t('setup.generate_new_code')}</button>
                  </div>
                )}

                {mode === "password" && (
                  <div>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handlePassword()} placeholder={t('setup.plex_tv_username')} autoFocus
                      className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-3 outline-none focus:ring-4 focus:ring-primary/40" style={inputStyle} />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handlePassword()} placeholder={t('setup.password')}
                      className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-5 outline-none focus:ring-4 focus:ring-primary/40" style={inputStyle} />
                    <PrimaryButton onClick={handlePassword} loading={loading} label={loading ? t('setup.signing_in') : t('setup.sign_in')} />
                  </div>
                )}

                {mode === "token" && (
                  <div>
                    <p className="font-body text-sm mb-4" style={{ color: "rgba(224,230,240,0.6)" }}>{t('setup.paste_plex_token')}</p>
                    <input type="text" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tokenInput.trim() && onToken(tokenInput.trim())} placeholder={t('setup.plex_token_placeholder')} autoFocus
                      className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-5 outline-none focus:ring-4 focus:ring-primary/40" style={inputStyle} />
                    <PrimaryButton onClick={() => (tokenInput.trim() ? onToken(tokenInput.trim()) : setError(t('setup.paste_your_plex_token')))} loading={false} label={t('setup.continue')} />
                  </div>
                )}
                </>
                ) : (
                  <div>
                    <p className="font-body text-sm mb-4" style={{ color: "rgba(224,230,240,0.6)" }}>{t('setup.sign_in_jellyfin_desc')}</p>
                    <input type="url" value={jfUrl} onChange={(e) => setJfUrl(e.target.value)} placeholder="http://192.168.1.53:8096"
                      className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-3 outline-none focus:ring-4 focus:ring-primary/40" style={inputStyle} />
                    <input type="text" value={jfUser} onChange={(e) => setJfUser(e.target.value)} placeholder={t('setup.username')} autoFocus
                      className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-3 outline-none focus:ring-4 focus:ring-primary/40" style={inputStyle} />
                    <input type="password" value={jfPass} onChange={(e) => setJfPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleJellyfin()} placeholder={t('setup.password')}
                      className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-5 outline-none focus:ring-4 focus:ring-primary/40" style={inputStyle} />
                    <PrimaryButton onClick={handleJellyfin} loading={loading} label={loading ? t('setup.signing_in') : t('setup.sign_in')} />
                  </div>
                )}
              </motion.div>
            )}

            {/* ── DISCOVERING ── */}
            {phase === "discovering" && (
              <motion.div key="disc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-10 gap-4">
                <Spinner />
                <p className="font-body text-sm" style={{ color: "rgba(224,230,240,0.6)" }}>{t('setup.finding_servers_loading')}</p>
              </motion.div>
            )}

            {/* ── SELECT ── */}
            {phase === "select" && (
              <motion.div key="select" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                <div className="flex flex-col gap-2 mb-5" style={{ maxHeight: "46vh", overflowY: "auto" }}>
                  {servers.map((s) => {
                    const busy = connecting === s.clientIdentifier;
                    return (
                      <button key={s.clientIdentifier} onClick={() => !connecting && pickServer(s)} disabled={!!connecting}
                        className="flex items-center gap-3 text-left rounded-xl px-4 py-3.5"
                        style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(153,247,255,0.1)", cursor: "none", opacity: connecting && !busy ? 0.4 : 1 }}>
                        <div className="flex-1">
                          <div className="font-display font-semibold text-sm" style={{ color: "#e0e6f0" }}>{s.name}</div>
                          <div className="font-mono-tech text-[10px] tracking-wider uppercase mt-0.5" style={{ color: s.owned ? "#5fd6e8" : "#c0a0ff" }}>
                            {s.owned ? t('setup.your_server') : t('setup.shared_with_you')}
                          </div>
                        </div>
                        {busy ? <Spinner small /> : <span style={{ color: "#5fd6e8", fontSize: 18 }}>→</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between font-body text-xs" style={{ color: "rgba(224,230,240,0.35)" }}>
                  <button onClick={() => setPhase("manual")} style={{ cursor: "none" }}>{t('setup.enter_manually')}</button>
                  <button onClick={startOver} style={{ cursor: "none" }}>{t('setup.start_over')}</button>
                </div>
              </motion.div>
            )}

            {/* ── MANUAL ── */}
            {phase === "manual" && (
              <motion.div key="manual" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                <p className="font-body text-sm mb-4" style={{ color: "rgba(224,230,240,0.6)" }}>{t('setup.plex_address_desc')}</p>
                <input type="url" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleManual()} placeholder="http://192.168.1.53:32400" autoFocus
                  className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-5 outline-none focus:ring-4 focus:ring-primary/40" style={inputStyle} />
                <PrimaryButton onClick={handleManual} loading={loading} label={loading ? t('setup.connecting') : t('setup.connect')} />
                <div className="flex justify-between font-body text-xs mt-4" style={{ color: "rgba(224,230,240,0.35)" }}>
                  {servers.length > 0 ? <button onClick={() => setPhase("select")} style={{ cursor: "none" }}>{t('setup.back_to_servers')}</button> : <span />}
                  <button onClick={startOver} style={{ cursor: "none" }}>{t('setup.start_over')}</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.p className="mt-4 font-body text-sm text-center" style={{ color: "#ff6b6b" }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.p>
            )}
          </AnimatePresence>
        </div>

        <p className="font-body text-xs mt-6" style={{ color: "rgba(224,230,240,0.2)" }}>
          {t('setup.credentials_stored_locally')}
        </p>
      </motion.div>
    </div>
  );
}

function PrimaryButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <motion.button onClick={onClick} disabled={loading} className="w-full py-4 rounded-xl font-display font-bold text-base"
      style={{ background: loading ? "rgba(153,247,255,0.15)" : "linear-gradient(135deg, #99f7ff 0%, #00f1fe 100%)", color: loading ? "#99f7ff" : "#001f24", cursor: loading ? "default" : "none" }}
      whileHover={loading ? {} : { scale: 1.02 }} whileTap={loading ? {} : { scale: 0.98 }}>
      {label}
    </motion.button>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const s = small ? 16 : 28;
  return (
    <motion.div style={{ width: s, height: s, borderRadius: "50%", border: `2px solid rgba(153,247,255,0.2)`, borderTopColor: "#99f7ff" }}
      animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
  );
}
