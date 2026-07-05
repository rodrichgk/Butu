export function getActiveSection(pathname: string): string {
  // pathname might be "/", "/movies", "/en", "/en/movies"
  const parts = pathname.split("/").filter(Boolean);
  
  if (parts.length === 0) return "home";

  // If the first part is a known language code, shift it out
  if (parts[0] === "en" || parts[0] === "fr") {
    parts.shift();
  }

  if (parts.length === 0) return "home";

  return parts[0];
}

export function getLocalizedPath(pathname: string, targetLang: string): string {
  const parts = pathname.split("/").filter(Boolean);
  
  if (parts.length > 0 && (parts[0] === "en" || parts[0] === "fr")) {
    parts[0] = targetLang;
  } else {
    parts.unshift(targetLang);
  }

  return "/" + parts.join("/");
}
