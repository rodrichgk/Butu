// Shared types for the downloads organizer — mirror the Rust DTOs in
// src-tauri/src/organize. Kept free of any Tauri imports so the store (loaded on
// every platform) can use them without pulling in the desktop-only dialog plugin.

export type RuleType = "TV" | "MOVIE";

export interface Rule {
  name: string;
  type: RuleType;
  match: string;
  target: string;
  fileExtensions: string[];
  transforms: Record<string, string[]>;
  constants: Record<string, string>;
  simple?: Record<string, unknown> | null;
}

export interface OrganizeConfig {
  sources: string[];
  rules: Rule[];
  tvRoot: string;
  movieRoot: string;
}

export interface PlannedOp {
  source: string;
  target: string;
  rule: Rule;
  action: "LINK" | "COPY";
}

export interface PlanResult {
  ops: PlannedOp[];
  unrecognized: string[];
}

export interface ExecuteResult {
  planned: number;
  applied: number;
  skipped: number;
  failed: number;
  log: string[];
}

export const DEFAULT_ORGANIZE_CONFIG: OrganizeConfig = {
  sources: [],
  rules: [],
  tvRoot: "G:/Shows",
  movieRoot: "G:/Movies",
};

export const MEDIA_EXTENSIONS = ["mkv", "mp4", "avi", "m4v", "mov", "wmv"];
