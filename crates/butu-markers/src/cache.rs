use crate::fingerprint::Fingerprint;

pub trait FingerprintCache: Send + Sync {
    fn get(&self, key: &str) -> Option<Fingerprint>;
    fn put(&self, key: &str, fp: &Fingerprint);
}
