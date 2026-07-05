import type { CSSProperties } from "react";

interface LogoProps {
  /** Cap height target in px (drives font-size). */
  size?: number;
  /** Soft cyan glow behind the mark. */
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The Butu mark — simply the letter "B" in the app's cyan, matching the cyan B
 * used for the app/taskbar icon (src-tauri/app-icon.svg).
 */
export function Logo({ size = 120, glow = false, className, style }: LogoProps) {
  return (
    <img
      src="/logo_symbol.svg"
      alt="Butu Logo"
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        userSelect: "none",
        filter: glow ? "drop-shadow(0 0 26px rgba(153,247,255,0.45))" : undefined,
        ...style,
      }}
    />
  );
}
