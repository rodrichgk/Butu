// Bridge to the native (Rust) downloads-organizer engine. Desktop-only: every
// function here ultimately invokes a Tauri command and will throw in a plain
// browser, so callers must gate on the desktop Tauri platform first.
import { open } from "@tauri-apps/plugin-dialog";
import {
  type OrganizeConfig,
  type PlanResult,
  type ExecuteResult,
  type PlannedOp,
  type Rule,
  type RuleType,
  MEDIA_EXTENSIONS,
} from "../types/organize";

export type {
  OrganizeConfig,
  PlanResult,
  ExecuteResult,
  PlannedOp,
  Rule,
  RuleType,
} from "../types/organize";

// ─── Tauri bridge (same global-read pattern as plexApi / markerDetect) ────────

function tauriCore(): any {
  const w = window as any;
  return w.__TAURI__?.core ?? w.__TAURI_INTERNALS__;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = tauriCore();
  if (!core?.invoke) throw new Error("The organizer is only available in the desktop app.");
  return core.invoke(cmd, args) as Promise<T>;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function organizePlan(paths: string[], config: OrganizeConfig): Promise<PlanResult> {
  return invoke<PlanResult>("organize_plan", { args: { paths, config } });
}

export function organizeExecute(ops: PlannedOp[]): Promise<ExecuteResult> {
  return invoke<ExecuteResult>("organize_execute", { args: { ops } });
}

export function organizeBuildRule(
  kind: RuleType,
  name: string,
  year: string,
  fileTypes: string[],
  config: OrganizeConfig,
): Promise<Rule> {
  return invoke<Rule>("organize_build_rule", {
    args: { kind, name, year, fileTypes, tvRoot: config.tvRoot, movieRoot: config.movieRoot },
  });
}

// ─── Native pickers (tauri-plugin-dialog) ─────────────────────────────────────

/** Native folder picker. Returns the chosen directory, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title: "Pick a folder of TV episodes or movies" });
  return typeof result === "string" ? result : null;
}

/** Native multi-file picker (media files only). Returns paths, or null if cancelled. */
export async function pickFiles(): Promise<string[] | null> {
  const result = await open({
    multiple: true,
    title: "Pick media files",
    filters: [{ name: "Media", extensions: MEDIA_EXTENSIONS }],
  });
  if (!result) return null;
  return Array.isArray(result) ? result : [result];
}
