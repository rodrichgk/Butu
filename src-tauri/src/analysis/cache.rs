use butu_markers::FingerprintCache;
use butu_markers::fingerprint::Fingerprint;
use std::path::PathBuf;
use std::fs;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// A file-backed cache for fingerprints.
pub struct FileFingerprintCache {
    cache_dir: PathBuf,
}

impl FileFingerprintCache {
    pub fn new(app_cache_dir: PathBuf) -> Self {
        let dir = app_cache_dir.join("butu_fingerprints");
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        Self { cache_dir: dir }
    }

    fn key_to_path(&self, key: &str) -> PathBuf {
        let mut hasher = DefaultHasher::new();
        key.hash(&mut hasher);
        let hash = hasher.finish();
        // The key is prefixed with v1 so older caches will just miss automatically if we change the version.
        self.cache_dir.join(format!("v1_{:016x}.json", hash))
    }
}

impl FingerprintCache for FileFingerprintCache {
    fn get(&self, key: &str) -> Option<Fingerprint> {
        let path = self.key_to_path(key);
        let data = fs::read_to_string(&path).ok()?;
        serde_json::from_str(&data).ok()
    }

    fn put(&self, key: &str, fp: &Fingerprint) {
        let path = self.key_to_path(key);
        if let Ok(data) = serde_json::to_string(fp) {
            let _ = fs::write(&path, data);
        }
    }
}
