import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useButuStore } from "../store/useButuStore";
import { authenticateUser } from "../services/jellyfinApi";

export function JellyfinSetup() {
  const setJellyfinConfig = useButuStore((s) => s.setJellyfinConfig);

  const [serverUrl, setServerUrl] = useState("http://");
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [step, setStep]           = useState<"server" | "login">("server");

  async function handleConnect() {
    setError(null);
    setLoading(true);
    try {
      const clean = serverUrl.trim().replace(/\/$/, "");
      const res = await fetch(`${clean}/System/Info/Public`);
      if (!res.ok) throw new Error("Could not reach server");
      setStep("login");
    } catch (e) {
      setError("Could not reach that server. Check the URL and make sure Jellyfin is running.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const clean = serverUrl.trim().replace(/\/$/, "");
      const result = await authenticateUser(clean, username.trim(), password);
      setJellyfinConfig({
        serverUrl: clean,
        userId: result.userId,
        userName: result.userName,
        token: result.token,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Login failed. Check your credentials."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="w-screen h-screen flex items-center justify-center"
      style={{ background: "#000" }}
    >
      {/* Ambient background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(153,247,255,0.04) 0%, transparent 70%)",
        }}
      />

      <motion.div
        className="relative flex flex-col items-center"
        style={{ width: 460 }}
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        <div className="mb-10 text-center">
          <h1
            className="font-display font-black text-white"
            style={{ fontSize: "3.5rem", letterSpacing: "-0.03em" }}
          >
            butu
          </h1>
          <p className="font-mono-tech text-on_surface_variant text-xs mt-1 tracking-widest uppercase">
            Connect to your Jellyfin server
          </p>
        </div>

        {/* Card */}
        <div
          className="w-full rounded-3xl p-8"
          style={{
            background: "rgba(14,17,27,0.85)",
            border: "1px solid rgba(153,247,255,0.1)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 48px rgba(153,247,255,0.04)",
            backdropFilter: "blur(32px)",
          }}
        >
          <AnimatePresence mode="wait">
            {step === "server" ? (
              <motion.div
                key="server"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >
                <p className="font-display font-bold text-on_surface text-lg mb-1">
                  Server URL
                </p>
                <p className="font-body text-on_surface_variant text-sm mb-6">
                  Enter the address of your Jellyfin server
                </p>

                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  placeholder="http://192.168.1.100:8096"
                  className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-4 outline-none focus:ring-4 focus:ring-primary/40"
                  style={{
                    background: "rgba(22,26,38,0.8)",
                    color: "#e0e6f0",
                    border: "1px solid rgba(153,247,255,0.12)",
                    caretColor: "#99f7ff",
                  }}
                  autoFocus
                />

                <motion.button
                  onClick={handleConnect}
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-display font-bold text-base"
                  style={{
                    background: loading
                      ? "rgba(153,247,255,0.15)"
                      : "linear-gradient(135deg, #99f7ff 0%, #00f1fe 100%)",
                    color: loading ? "#99f7ff" : "#001f24",
                    cursor: loading ? "default" : "none",
                  }}
                  whileHover={loading ? {} : { scale: 1.02 }}
                  whileTap={loading ? {} : { scale: 0.98 }}
                >
                  {loading ? "Connecting…" : "Continue →"}
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }}
              >
                <button
                  onClick={() => { setStep("server"); setError(null); }}
                  className="focusable flex items-center gap-1.5 font-body text-sm mb-5 focus:outline-none focus:text-white"
                  style={{ color: "rgba(224,230,240,0.45)", cursor: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15,18 9,12 15,6" />
                  </svg>
                  {serverUrl.replace(/^https?:\/\//, "")}
                </button>

                <p className="font-display font-bold text-on_surface text-lg mb-1">
                  Sign in
                </p>
                <p className="font-body text-on_surface_variant text-sm mb-6">
                  Use your Jellyfin username and password
                </p>

                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="Username"
                  className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-3 outline-none focus:ring-4 focus:ring-primary/40"
                  style={{
                    background: "rgba(22,26,38,0.8)",
                    color: "#e0e6f0",
                    border: "1px solid rgba(153,247,255,0.12)",
                    caretColor: "#99f7ff",
                  }}
                  autoFocus
                />

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="Password"
                  className="focusable w-full rounded-xl px-4 py-3.5 font-mono-tech text-sm mb-5 outline-none focus:ring-4 focus:ring-primary/40"
                  style={{
                    background: "rgba(22,26,38,0.8)",
                    color: "#e0e6f0",
                    border: "1px solid rgba(153,247,255,0.12)",
                    caretColor: "#99f7ff",
                  }}
                />

                <motion.button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-display font-bold text-base"
                  style={{
                    background: loading
                      ? "rgba(153,247,255,0.15)"
                      : "linear-gradient(135deg, #99f7ff 0%, #00f1fe 100%)",
                    color: loading ? "#99f7ff" : "#001f24",
                    cursor: loading ? "default" : "none",
                  }}
                  whileHover={loading ? {} : { scale: 1.02 }}
                  whileTap={loading ? {} : { scale: 0.98 }}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                className="mt-4 font-body text-sm text-center"
                style={{ color: "#ff6b6b" }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <p className="font-body text-xs mt-6" style={{ color: "rgba(224,230,240,0.2)" }}>
          Your credentials are stored locally and never leave this device
        </p>
      </motion.div>
    </div>
  );
}
