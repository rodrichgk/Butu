//! Native port of the standalone `medialib` engine (engine.py).
//!
//! Pure logic: match a filename against rules -> render the target path template
//! -> hardlink (or copy across drives) into a Plex/Jellyfin-shaped library, leaving
//! the original in place for the torrent client. The config JSON schema is the
//! cross-language contract, so field names are preserved exactly (see serde
//! `rename_all = "camelCase"`).

pub mod commands;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const MEDIA_EXTS: &[&str] = &["mkv", "mp4", "avi", "m4v", "mov", "wmv"];

fn default_extensions() -> Vec<String> {
    vec!["mkv".into(), "mp4".into(), "avi".into()]
}
fn default_tv_root() -> String {
    "G:/Shows".into()
}
fn default_movie_root() -> String {
    "G:/Movies".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String, // "TV" or "MOVIE"
    #[serde(rename = "match")]
    pub r#match: String,
    pub target: String,
    #[serde(default = "default_extensions")]
    pub file_extensions: Vec<String>,
    #[serde(default)]
    pub transforms: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub constants: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simple: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub rules: Vec<Rule>,
    #[serde(default = "default_tv_root")]
    pub tv_root: String,
    #[serde(default = "default_movie_root")]
    pub movie_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedOp {
    pub source: String,
    pub target: String,
    pub rule: Rule,
    pub action: String, // "LINK" or "COPY"
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct ExecuteStats {
    pub planned: u32,
    pub applied: u32,
    pub skipped: u32,
    pub failed: u32,
}

// ---------------- transforms ----------------

fn apply_transform(name: &str, value: &str) -> String {
    match name {
        "dots-to-spaces" => value.replace('.', " "),
        "underscores-to-spaces" => value.replace('_', " "),
        "title-case" => value
            .split(' ')
            .map(|w| {
                let mut chars = w.chars();
                match chars.next() {
                    Some(first) => {
                        first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
                    }
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
        "upper" => value.to_uppercase(),
        "lower" => value.to_lowercase(),
        "trim" => value.trim().to_string(),
        _ => value.to_string(),
    }
}

fn apply_transforms(value: &str, names: &[String]) -> String {
    let mut v = value.to_string();
    for n in names {
        v = apply_transform(n, &v);
    }
    v
}

// ---------------- pattern / template ----------------

/// Translate the portable `(?<name>...)` named-group syntax used in configs into
/// Rust's `(?P<name>...)`, then compile. Mirrors engine.py `_compile_pattern`.
fn compile_pattern(pattern: &str) -> Result<Regex, regex::Error> {
    let named = Regex::new(r"\(\?<([A-Za-z][A-Za-z0-9_]*)>").unwrap();
    let translated = named.replace_all(pattern, "(?P<$1>");
    Regex::new(&translated)
}

fn render_template(template: &str, values: &HashMap<String, String>) -> String {
    let placeholder = Regex::new(r"\{([A-Za-z][A-Za-z0-9_]*)\}").unwrap();
    placeholder
        .replace_all(template, |caps: &Captures| {
            let key = &caps[1];
            values.get(key).cloned().unwrap_or_else(|| caps[0].to_string())
        })
        .to_string()
}

/// Drive letter (lowercased) before the first colon, or "" for UNC/relative paths.
/// Matches engine.py `_same_drive`.
fn drive_of(p: &str) -> String {
    match p.find(':') {
        Some(idx) => p[..idx].to_lowercase(),
        None => String::new(),
    }
}
fn same_drive(a: &str, b: &str) -> bool {
    let da = drive_of(a);
    !da.is_empty() && da == drive_of(b)
}

// ---------------- matching ----------------

fn collect_files(path: &Path, out: &mut Vec<PathBuf>) {
    if path.is_file() {
        out.push(path.to_path_buf());
    } else if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                collect_files(&entry.path(), out);
            }
        }
    }
}

fn match_file(file: &Path, compiled: &[(Rule, Regex)]) -> Option<PlannedOp> {
    let fname = file.file_name()?.to_string_lossy().to_string();
    let stem = file
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = file
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    for (rule, regex) in compiled {
        if !rule.file_extensions.iter().any(|e| e.to_lowercase() == ext) {
            continue;
        }
        let Some(caps) = regex.captures(&fname) else { continue };

        let mut values: HashMap<String, String> = HashMap::new();
        values.insert("ext".into(), ext.clone());
        values.insert("filename".into(), stem.clone());
        for gname in regex.capture_names().flatten() {
            let raw = caps.name(gname).map(|m| m.as_str()).unwrap_or("");
            let empty: Vec<String> = Vec::new();
            let transformed =
                apply_transforms(raw, rule.transforms.get(gname).unwrap_or(&empty));
            values.insert(gname.to_string(), transformed);
        }
        for (k, v) in &rule.constants {
            values.insert(k.clone(), v.clone());
        }

        let source = file.to_string_lossy().to_string();
        let target = render_template(&rule.target, &values);
        let action = if same_drive(&source, &target) { "LINK" } else { "COPY" };
        return Some(PlannedOp {
            source,
            target,
            rule: rule.clone(),
            action: action.into(),
        });
    }
    None
}

fn compile_rules(rules: &[Rule]) -> Vec<(Rule, Regex)> {
    rules
        .iter()
        .filter_map(|r| compile_pattern(&r.r#match).ok().map(|re| (r.clone(), re)))
        .collect()
}

pub fn plan_paths(paths: &[PathBuf], rules: &[Rule]) -> Vec<PlannedOp> {
    let compiled = compile_rules(rules);
    let mut ops = Vec::new();
    for p in paths {
        if !p.exists() {
            continue;
        }
        let mut files = Vec::new();
        collect_files(p, &mut files);
        for f in &files {
            if let Some(op) = match_file(f, &compiled) {
                ops.push(op);
            }
        }
    }
    ops
}

fn simple_mode(r: &Rule) -> Option<&str> {
    r.simple.as_ref()?.get("mode")?.as_str()
}

/// Smart mode: user rules + always-on catch-alls. Returns (ops, unrecognized media).
/// Mirrors engine.py `auto_plan`.
pub fn auto_plan(paths: &[PathBuf], config: &Config) -> (Vec<PlannedOp>, Vec<String>) {
    let mut rules = config.rules.clone();
    if !rules.iter().any(|r| simple_mode(r) == Some("catch-all-tv")) {
        rules.push(build_generic_tv_rule(&config.tv_root));
    }
    if !rules.iter().any(|r| simple_mode(r) == Some("catch-all-movie")) {
        rules.push(build_generic_movie_rule(&config.movie_root));
    }

    let ops = plan_paths(paths, &rules);
    let matched: HashSet<&str> = ops.iter().map(|o| o.source.as_str()).collect();

    let mut unrecognized = Vec::new();
    for p in paths {
        if !p.exists() {
            continue;
        }
        let mut files = Vec::new();
        collect_files(p, &mut files);
        for f in files {
            let ext = f
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if MEDIA_EXTS.contains(&ext.as_str()) {
                let s = f.to_string_lossy().to_string();
                if !matched.contains(s.as_str()) {
                    unrecognized.push(s);
                }
            }
        }
    }
    (ops, unrecognized)
}

// ---------------- rule builders (friendly inputs -> Rule) ----------------

fn name_to_regex(name: &str) -> String {
    let sep = r"[.\s_\-]+";
    name.split_whitespace()
        .filter(|w| !w.is_empty())
        .map(regex::escape)
        .collect::<Vec<_>>()
        .join(sep)
}

pub fn build_tv_rule(show: &str, year: &str, file_types: Vec<String>, tv_root: &str) -> Rule {
    let show = show.trim();
    let types = if file_types.is_empty() {
        vec!["mkv".into(), "mp4".into()]
    } else {
        file_types
    };
    let folder_name = if year.is_empty() {
        show.to_uppercase()
    } else {
        format!("{} ({})", show.to_uppercase(), year)
    };
    let name_re = name_to_regex(show);
    let pattern = format!(
        r"(?i)^{name_re}[.\s_\-].*?S(?<season>\d{{1,3}})E(?<episode>\d{{1,3}})"
    );
    let target = format!("{tv_root}/{folder_name}/Season {{season}}/{show} S{{season}}E{{episode}}.{{ext}}");
    Rule {
        name: show.to_string(),
        r#type: "TV".into(),
        r#match: pattern,
        target,
        file_extensions: types.clone(),
        transforms: HashMap::new(),
        constants: HashMap::new(),
        simple: Some(serde_json::json!({
            "mode": "tv-by-name", "showName": show, "year": year, "fileTypes": types
        })),
    }
}

pub fn build_movie_rule(title: &str, year: &str, file_types: Vec<String>, movie_root: &str) -> Rule {
    let title = title.trim();
    let types = if file_types.is_empty() {
        vec!["mkv".into(), "mp4".into()]
    } else {
        file_types
    };
    let name_re = name_to_regex(title);
    let (pattern, out_name) = if year.is_empty() {
        (format!(r"(?i){name_re}"), title.to_string())
    } else {
        (
            format!(r"(?i){name_re}[.\s_\-]+{year}"),
            format!("{title} ({year})"),
        )
    };
    let target = format!("{movie_root}/{out_name}/{out_name}.{{ext}}");
    Rule {
        name: if year.is_empty() {
            title.to_string()
        } else {
            format!("{title} ({year})")
        },
        r#type: "MOVIE".into(),
        r#match: pattern,
        target,
        file_extensions: types.clone(),
        transforms: HashMap::new(),
        constants: HashMap::new(),
        simple: Some(serde_json::json!({
            "mode": "movie-by-title", "title": title, "year": year, "fileTypes": types
        })),
    }
}

pub fn build_generic_tv_rule(tv_root: &str) -> Rule {
    Rule {
        name: "Any TV show (catch-all)".into(),
        r#type: "TV".into(),
        r#match: r"(?i)^(?<show>[\w.\-]+?)[.\s_\-]S(?<season>\d{1,3})E(?<episode>\d{1,3})".into(),
        target: format!("{tv_root}/{{show}}/Season {{season}}/{{show}} S{{season}}E{{episode}}.{{ext}}"),
        file_extensions: vec!["mkv".into(), "mp4".into(), "avi".into()],
        transforms: HashMap::from([(
            "show".to_string(),
            vec!["dots-to-spaces".to_string(), "title-case".to_string()],
        )]),
        constants: HashMap::new(),
        simple: Some(serde_json::json!({ "mode": "catch-all-tv" })),
    }
}

pub fn build_generic_movie_rule(movie_root: &str) -> Rule {
    Rule {
        name: "Any movie (catch-all)".into(),
        r#type: "MOVIE".into(),
        r#match: r"(?i)^(?<title>.+?)[.\s_\-](?<year>(?:19|20)\d{2})\b".into(),
        target: format!("{movie_root}/{{title}} ({{year}})/{{title}} ({{year}}).{{ext}}"),
        file_extensions: vec!["mkv".into(), "mp4".into()],
        transforms: HashMap::from([(
            "title".to_string(),
            vec!["dots-to-spaces".to_string(), "title-case".to_string()],
        )]),
        constants: HashMap::new(),
        simple: Some(serde_json::json!({ "mode": "catch-all-movie" })),
    }
}

// ---------------- execute ----------------

pub fn execute<F: FnMut(String)>(ops: &[PlannedOp], dry_run: bool, mut log: F) -> ExecuteStats {
    let mut stats = ExecuteStats::default();
    for op in ops {
        let target = Path::new(&op.target);
        if target.exists() {
            log(format!("  = skip (exists): {}", op.target));
            stats.skipped += 1;
            continue;
        }
        if dry_run {
            log(format!("  > {} [{}]  {}", op.action, op.rule.name, op.target));
            stats.planned += 1;
            continue;
        }
        let result = (|| -> std::io::Result<()> {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            if op.action == "LINK" {
                fs::hard_link(&op.source, target)?;
            } else {
                fs::copy(&op.source, target)?;
            }
            Ok(())
        })();
        match result {
            Ok(_) => {
                log(format!("  + {}  {}", op.action, op.target));
                stats.applied += 1;
            }
            Err(e) => {
                log(format!("  ! {}: {}", op.target, e));
                stats.failed += 1;
            }
        }
    }
    stats
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Config {
        Config {
            sources: vec![],
            rules: vec![],
            tv_root: "G:/Shows".into(),
            movie_root: "G:/Movies".into(),
        }
    }

    fn plan_names(names: &[&str], config: &Config) -> Vec<PlannedOp> {
        // Drive the matcher directly on filenames (no filesystem walk).
        let mut rules = config.rules.clone();
        rules.push(build_generic_tv_rule(&config.tv_root));
        rules.push(build_generic_movie_rule(&config.movie_root));
        let compiled = compile_rules(&rules);
        names
            .iter()
            .filter_map(|n| match_file(Path::new(n), &compiled))
            .collect()
    }

    #[test]
    fn catch_all_tv() {
        let ops = plan_names(&["Euphoria.S01E01.1080p.WEB.mkv"], &cfg());
        assert_eq!(ops.len(), 1);
        assert!(
            ops[0].target.contains("/Season 01/"),
            "target was {}",
            ops[0].target
        );
        assert_eq!(ops[0].rule.r#type, "TV");
    }

    #[test]
    fn catch_all_movie() {
        let ops = plan_names(&["Some.Movie.2021.2160p.mkv"], &cfg());
        assert_eq!(ops.len(), 1);
        assert_eq!(ops[0].rule.r#type, "MOVIE");
        assert!(
            ops[0].target.contains("Some Movie (2021)"),
            "target was {}",
            ops[0].target
        );
    }

    #[test]
    fn unknown_extension_ignored() {
        let ops = plan_names(&["Some.Movie.2021.nfo"], &cfg());
        assert!(ops.is_empty());
    }

    #[test]
    fn named_rule_takes_precedence() {
        let mut c = cfg();
        c.rules
            .push(build_tv_rule("Game of Thrones", "2011", vec!["mkv".into()], &c.tv_root));
        let ops = plan_names(&["Game.of.Thrones.S01E05.mkv"], &c);
        assert_eq!(ops.len(), 1);
        assert!(
            ops[0].target.contains("GAME OF THRONES (2011)"),
            "target was {}",
            ops[0].target
        );
    }

    #[test]
    fn same_drive_decides_action() {
        assert!(same_drive("G:/Downloads/x.mkv", "G:/Shows/x.mkv"));
        assert!(!same_drive("C:/Downloads/x.mkv", "G:/Shows/x.mkv"));
    }

    #[test]
    fn template_renders_known_and_keeps_unknown() {
        let mut values = HashMap::new();
        values.insert("season".to_string(), "02".to_string());
        assert_eq!(render_template("S{season}E{episode}", &values), "S02E{episode}");
    }
}
