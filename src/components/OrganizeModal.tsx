/**
 * Settings → Organize downloads (desktop only).
 *
 * Ports the standalone `medialib` tool into Butu: pick a folder of downloads →
 * preview where each file would be hardlinked into the Plex/Jellyfin library →
 * Run. Detection + linking happen natively (Rust `organize_*` commands); this is
 * the UI + a settings panel (destinations + custom rules) for parity with the
 * original Tkinter app.
 *
 * Rendered behind a DesktopTauri check on the parent — the Tauri commands it
 * calls don't exist in a browser/TV build.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useConfigStore } from "../store/useConfigStore";
import {
  organizePlan,
  organizeExecute,
  organizeBuildRule,
  type PlanResult,
  type PlannedOp,
  type ExecuteResult,
  type Rule,
  type RuleType,
  pickFolder,
  pickFiles,
} from "../services/organizeApi";
import type { OrganizeConfig } from "../types/organize";

interface Props {
  onClose: () => void;
}

type View = "start" | "preview" | "done" | "settings";

// ─── path helpers (work on forward/back slashes) ──────────────────────────────
const segments = (p: string) => p.split(/[\\/]/).filter(Boolean);
const basename = (p: string) => segments(p).pop() ?? p;
const dirname = (p: string) => {
  const s = p.split(/[\\/]/);
  s.pop();
  return s.join("/");
};

// ─── shared styles ────────────────────────────────────────────────────────────
const btnPrimary: CSSProperties = {
  background: "linear-gradient(135deg, #99f7ff 0%, #00f1fe 100%)",
  color: "#001f24",
  border: "none",
  borderRadius: 14,
  padding: "12px 22px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const btnGhost: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#cdd4e0",
  borderRadius: 12,
  padding: "10px 18px",
  fontSize: 13,
  cursor: "pointer",
};
const btnDanger: CSSProperties = {
  background: "rgba(255,80,80,0.1)",
  border: "1px solid rgba(255,80,80,0.25)",
  color: "#ff6b6b",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 12,
  cursor: "pointer",
};
const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(74,82,104,0.4)",
  borderRadius: 10,
  padding: "9px 12px",
  color: "#e0e6f0",
  fontSize: 13,
  fontFamily: "ui-monospace, 'Space Grotesk', monospace",
};
const card: CSSProperties = {
  background: "rgba(22,26,38,0.6)",
  border: "1px solid rgba(46,52,71,0.4)",
  borderRadius: 14,
  padding: 14,
};
const monoMuted: CSSProperties = {
  fontFamily: "ui-monospace, 'Space Grotesk', monospace",
  color: "#9aa3b4",
  fontSize: 12,
};

export function OrganizeModal({ onClose }: Props) {
  const config = useConfigStore((s) => s.organizeConfig);
  const setConfig = useConfigStore((s) => s.setOrganizeConfig);

  const [view, setView] = useState<View>("start");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [showLog, setShowLog] = useState(false);

  // ── scan / plan ──
  const scan = async (paths: string[]) => {
    if (!paths.length) return;
    setBusy(true);
    setStatus("Scanning…");
    try {
      const res = await organizePlan(paths, config);
      setPlan(res);
      setStatus(`Found ${res.ops.length} file(s)`);
      setView("preview");
    } catch (e: any) {
      setStatus(`Scan failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const openFolder = async () => {
    const dir = await pickFolder().catch(() => null);
    if (dir) scan([dir]);
  };
  const openFiles = async () => {
    const files = await pickFiles().catch(() => null);
    if (files && files.length) scan(files);
  };

  const run = async () => {
    if (!plan?.ops.length) return;
    setBusy(true);
    setStatus("Linking…");
    try {
      const res = await organizeExecute(plan.ops);
      setResult(res);
      setStatus(`Applied ${res.applied} · skipped ${res.skipped} · failed ${res.failed}`);
      setView("done");
    } catch (e: any) {
      setStatus(`Run failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(2,4,8,0.85)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "5vh 5vw",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 880,
          maxHeight: "90vh",
          background: "rgba(12,14,22,0.97)",
          border: "1px solid rgba(153,247,255,0.18)",
          borderRadius: 20,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          color: "#e0e6f0",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ fontFamily: "ui-monospace, monospace", color: "#99f7ff", fontSize: 11, letterSpacing: "0.15em" }}>
              ORGANIZE DOWNLOADS
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
              {view === "settings" ? "Organizer settings" : "Sort downloads into your library"}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {view !== "settings" && (
              <button onClick={() => setView("settings")} style={btnGhost} title="Destinations & rules">⚙ Settings</button>
            )}
            <button onClick={onClose} style={btnGhost}>Close</button>
          </div>
        </header>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {view === "start" && (
            <StartView config={config} busy={busy} onOpenFolder={openFolder} onOpenFiles={openFiles} />
          )}
          {view === "preview" && plan && (
            <PreviewView plan={plan} />
          )}
          {view === "done" && result && (
            <DoneView result={result} showLog={showLog} setShowLog={setShowLog} />
          )}
          {view === "settings" && (
            <SettingsPanel config={config} setConfig={setConfig} setStatus={setStatus} />
          )}
        </div>

        {/* Footer */}
        <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
          <span style={monoMuted}>{status || "Ready"}</span>
          <div style={{ display: "flex", gap: 10 }}>
            {view === "preview" && (
              <>
                <button onClick={() => setView("start")} style={btnGhost} disabled={busy}>← Back</button>
                <button onClick={run} style={{ ...btnPrimary, opacity: busy || !plan?.ops.length ? 0.5 : 1 }} disabled={busy || !plan?.ops.length}>
                  Run · {plan?.ops.length ?? 0} file(s)
                </button>
              </>
            )}
            {view === "done" && (
              <button onClick={() => { setPlan(null); setResult(null); setStatus(""); setView("start"); }} style={btnPrimary}>
                Organize another
              </button>
            )}
            {view === "settings" && (
              <button onClick={() => setView("start")} style={btnPrimary}>Done</button>
            )}
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}

// ─── Start ────────────────────────────────────────────────────────────────────
function StartView({
  config,
  busy,
  onOpenFolder,
  onOpenFiles,
}: {
  config: OrganizeConfig;
  busy: boolean;
  onOpenFolder: () => void;
  onOpenFiles: () => void;
}) {
  return (
    <>
      <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
        <p style={{ fontSize: 16, fontWeight: 700 }}>Drop a download in</p>
        <p style={{ color: "#9aa3b4", fontSize: 13, marginTop: 6, maxWidth: 560, margin: "6px auto 0" }}>
          Pick a folder of TV episodes or movies — Butu figures out what each file is and
          hardlinks it where Plex/Jellyfin can find it. Your originals stay put for seeding.
        </p>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", paddingBottom: 4 }}>
        <button onClick={onOpenFolder} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }} disabled={busy}>📁  Open a folder…</button>
        <button onClick={onOpenFiles} style={{ ...btnGhost, padding: "12px 22px" }} disabled={busy}>📄  Pick files…</button>
      </div>
      <div style={card}>
        <p style={{ fontFamily: "ui-monospace, monospace", color: "#99f7ff", fontSize: 11, letterSpacing: "0.12em", marginBottom: 8 }}>
          WHERE THINGS GO
        </p>
        <p style={monoMuted}>TV Shows  →  {config.tvRoot}</p>
        <p style={monoMuted}>Movies    →  {config.movieRoot}</p>
        <p style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>Change in Settings.</p>
      </div>
    </>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────────
function PreviewView({ plan }: { plan: PlanResult }) {
  const groups = useMemo(() => {
    const map = new Map<string, { kind: string; folder: string; ops: PlannedOp[] }>();
    for (const op of plan.ops) {
      const folder = op.rule.type === "TV" ? dirname(dirname(op.target)) : dirname(op.target);
      const kind = op.rule.type === "TV" ? "📺" : "🎬";
      const key = `${kind}|${folder}`;
      if (!map.has(key)) map.set(key, { kind, folder, ops: [] });
      map.get(key)!.ops.push(op);
    }
    return [...map.values()].sort((a, b) => a.folder.localeCompare(b.folder));
  }, [plan]);

  if (!plan.ops.length && !plan.unrecognized.length) {
    return <p style={{ color: "#9aa3b4", textAlign: "center", padding: 24 }}>No recognizable media files in what you picked.</p>;
  }

  return (
    <>
      <p style={monoMuted}>
        Files will be hardlinked into your library. Originals stay put for the torrent client.
      </p>
      {groups.map((g) => (
        <div key={g.kind + g.folder} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <p style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {g.kind}  {basename(g.folder)}
            </p>
            <span style={{ ...monoMuted, flexShrink: 0 }}>{g.ops.length} file(s)</span>
          </div>
          <p style={{ ...monoMuted, marginTop: 6 }}>
            {basename(g.ops[0].source)} → {basename(g.ops[0].target)}
            <span style={{ color: g.ops[0].action === "COPY" ? "#ffb454" : "#5ee0a0", marginLeft: 8 }}>[{g.ops[0].action}]</span>
          </p>
          {g.ops.length > 1 && <p style={{ ...monoMuted, opacity: 0.7 }}>…and {g.ops.length - 1} more</p>}
        </div>
      ))}
      {plan.unrecognized.length > 0 && (
        <div style={{ ...card, border: "1px solid rgba(255,180,84,0.25)" }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#ffb454" }}>
            ⚠ {plan.unrecognized.length} file(s) I couldn't identify
          </p>
          {plan.unrecognized.slice(0, 6).map((f) => (
            <p key={f} style={monoMuted}>{basename(f)}</p>
          ))}
          {plan.unrecognized.length > 6 && <p style={{ ...monoMuted, opacity: 0.7 }}>…and {plan.unrecognized.length - 6} more</p>}
        </div>
      )}
    </>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────
function DoneView({
  result,
  showLog,
  setShowLog,
}: {
  result: ExecuteResult;
  showLog: boolean;
  setShowLog: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <p style={{ fontSize: 30 }}>✓</p>
        <p style={{ fontSize: 18, fontWeight: 800, color: "#5ee0a0" }}>All done</p>
        <p style={{ color: "#9aa3b4", fontSize: 13, marginTop: 6 }}>
          {result.applied} organized
          {result.skipped ? ` · ${result.skipped} already existed` : ""}
          {result.failed ? ` · ${result.failed} failed` : ""}
        </p>
      </div>
      {result.log.length > 0 && (
        <button onClick={() => setShowLog(!showLog)} style={{ ...btnGhost, alignSelf: "center" }}>
          {showLog ? "Hide log" : "Show log"}
        </button>
      )}
      {showLog && (
        <pre style={{ ...card, ...monoMuted, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {result.log.join("\n")}
        </pre>
      )}
    </div>
  );
}

// ─── Settings panel (destinations + rules + raw JSON) ─────────────────────────
function SettingsPanel({
  config,
  setConfig,
  setStatus,
}: {
  config: OrganizeConfig;
  setConfig: (c: OrganizeConfig) => void;
  setStatus: (s: string) => void;
}) {
  const [tvRoot, setTvRoot] = useState(config.tvRoot);
  const [movieRoot, setMovieRoot] = useState(config.movieRoot);
  const [rules, setRules] = useState<Rule[]>(config.rules);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const persist = (next: Partial<OrganizeConfig>) => {
    const merged: OrganizeConfig = { ...config, tvRoot, movieRoot, rules, ...next };
    setConfig(merged);
  };

  const chooseDir = async (set: (v: string) => void) => {
    const dir = await pickFolder().catch(() => null);
    if (dir) set(dir);
  };

  const removeRule = (i: number) => {
    const next = rules.filter((_, idx) => idx !== i);
    setRules(next);
    persist({ rules: next });
  };

  const openJson = () => {
    setJsonText(JSON.stringify({ tvRoot, movieRoot, rules }, null, 2));
    setShowJson(true);
  };
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const next: OrganizeConfig = {
        sources: config.sources,
        tvRoot: parsed.tvRoot ?? tvRoot,
        movieRoot: parsed.movieRoot ?? movieRoot,
        rules: Array.isArray(parsed.rules) ? parsed.rules : rules,
      };
      setTvRoot(next.tvRoot);
      setMovieRoot(next.movieRoot);
      setRules(next.rules);
      setConfig(next);
      setShowJson(false);
      setStatus("Config updated");
    } catch (e: any) {
      setStatus(`Invalid JSON: ${e?.message ?? e}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Destinations */}
      <section>
        <p style={{ fontFamily: "ui-monospace, monospace", color: "#99f7ff", fontSize: 11, letterSpacing: "0.12em", marginBottom: 10 }}>
          LIBRARY DESTINATIONS
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 90, fontSize: 13, color: "#9aa3b4" }}>TV Shows →</span>
          <input style={inputStyle} value={tvRoot} onChange={(e) => setTvRoot(e.target.value)} onBlur={() => persist({})} />
          <button style={btnGhost} onClick={() => chooseDir((v) => { setTvRoot(v); setConfig({ ...config, tvRoot: v, movieRoot, rules }); })}>Choose…</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 90, fontSize: 13, color: "#9aa3b4" }}>Movies →</span>
          <input style={inputStyle} value={movieRoot} onChange={(e) => setMovieRoot(e.target.value)} onBlur={() => persist({})} />
          <button style={btnGhost} onClick={() => chooseDir((v) => { setMovieRoot(v); setConfig({ ...config, tvRoot, movieRoot: v, rules }); })}>Choose…</button>
        </div>
      </section>

      {/* Rules */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontFamily: "ui-monospace, monospace", color: "#99f7ff", fontSize: 11, letterSpacing: "0.12em" }}>RULES</p>
          <button style={{ ...btnGhost, padding: "6px 12px" }} onClick={showJson ? () => setShowJson(false) : openJson}>
            {showJson ? "Hide JSON" : "Edit raw JSON…"}
          </button>
        </div>
        <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 10 }}>
          Catch-all detection always runs. Add a rule to force a specific show/movie into a named,
          year-stamped folder (e.g. “Game of Thrones (2011)”).
        </p>

        {showJson ? (
          <>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              style={{ ...inputStyle, width: "100%", minHeight: 240, resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button style={btnGhost} onClick={() => setShowJson(false)}>Cancel</button>
              <button style={btnPrimary} onClick={applyJson}>Apply JSON</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rules.length === 0 && <p style={monoMuted}>No custom rules — catch-all detection handles everything.</p>}
              {rules.map((r, i) => (
                <div key={i} style={{ ...card, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.type === "TV" ? "📺" : "🎬"}  {r.name}
                  </span>
                  <button style={btnDanger} onClick={() => removeRule(i)}>Remove</button>
                </div>
              ))}
            </div>
            <AddRuleForm
              config={config}
              onAdd={(rule) => { const next = [...rules, rule]; setRules(next); persist({ rules: next }); }}
              setStatus={setStatus}
            />
          </>
        )}
      </section>
    </div>
  );
}

// ─── Friendly add-rule form ───────────────────────────────────────────────────
function AddRuleForm({
  config,
  onAdd,
  setStatus,
}: {
  config: OrganizeConfig;
  onAdd: (rule: Rule) => void;
  setStatus: (s: string) => void;
}) {
  const [kind, setKind] = useState<RuleType>("TV");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [types, setTypes] = useState<Record<string, boolean>>({ mkv: true, mp4: false, avi: false });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (kind === "MOVIE" && !year.trim()) {
      setStatus("Movies need a year for the folder name.");
      return;
    }
    const fileTypes = Object.entries(types).filter(([, v]) => v).map(([k]) => k);
    setBusy(true);
    try {
      const rule = await organizeBuildRule(kind, trimmed, year.trim(), fileTypes.length ? fileTypes : ["mkv"], config);
      onAdd(rule);
      setName("");
      setYear("");
      setStatus(`Added rule: ${rule.name}`);
    } catch (e: any) {
      setStatus(`Couldn't add rule: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {(["TV", "MOVIE"] as RuleType[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            style={{
              ...btnGhost,
              padding: "6px 14px",
              ...(kind === k ? { background: "rgba(153,247,255,0.12)", borderColor: "rgba(153,247,255,0.35)", color: "#99f7ff" } : {}),
            }}
          >
            {k === "TV" ? "📺 Show" : "🎬 Movie"}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={inputStyle} placeholder={kind === "TV" ? "Show name" : "Movie title"} value={name} onChange={(e) => setName(e.target.value)} />
        <input style={{ ...inputStyle, flex: "0 0 96px" }} placeholder={kind === "MOVIE" ? "Year (req.)" : "Year (opt.)"} value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 12, color: "#9aa3b4" }}>File types:</span>
        {Object.keys(types).map((ext) => (
          <label key={ext} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={types[ext]} onChange={(e) => setTypes({ ...types, [ext]: e.target.checked })} />
            {ext}
          </label>
        ))}
        <button onClick={add} style={{ ...btnPrimary, padding: "8px 18px", marginLeft: "auto", opacity: busy ? 0.5 : 1 }} disabled={busy}>
          Add rule
        </button>
      </div>
    </div>
  );
}
