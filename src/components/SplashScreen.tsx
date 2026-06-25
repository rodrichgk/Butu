import { motion } from "framer-motion";
import { useEffect } from "react";
import { Logo } from "./Logo";

const WORD = ["B", "U", "T", "U"];
// Center of the 4-letter word is between index 1 and 2 → 1.5.
const CENTER = (WORD.length - 1) / 2;

interface SplashScreenProps {
  onComplete: () => void;
  duration?: number; // ms
}

export function SplashScreen({ onComplete, duration = 4200 }: SplashScreenProps) {
  useEffect(() => {
    const t = setTimeout(onComplete, duration);
    return () => clearTimeout(t);
  }, [onComplete, duration]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
      style={{ background: "#06080d" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: "easeInOut" }}
    >
      {/* Ambient cyan glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 2 }}
        style={{
          background:
            "radial-gradient(ellipse 52% 42% at 50% 46%, rgba(153,247,255,0.12) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* The B mark: fades/scales in centered, then lifts up to make room. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.78, y: 64 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            opacity: { duration: 0.8, delay: 0.2 },
            scale: { duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] },
            y: { duration: 1.0, delay: 0.95, ease: [0.16, 1, 0.3, 1] },
          }}
        >
          <Logo size={150} glow />
        </motion.div>

        {/* "butu": each letter starts collapsed at the centre and spreads outward
            to its place — inner letters first, then the outer ones. */}
        <div className="flex items-baseline" style={{ marginTop: 26 }}>
          {WORD.map((letter, i) => {
            const offset = CENTER - i; // >0 left of centre, <0 right of centre
            return (
              <motion.span
                key={i}
                initial={{ x: offset * 220, opacity: 0, filter: "blur(7px)" }}
                animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
                transition={{
                  delay: 1.25 + Math.abs(offset) * 0.13,
                  duration: 0.7,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 500,
                  fontSize: "clamp(3.2rem, 7.5vw, 5rem)",
                  lineHeight: 1,
                  // Space on all but the last letter so the word stays centred.
                  letterSpacing: i === WORD.length - 1 ? "0em" : "1em",
                  color: "transparent",
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  backgroundImage:
                    "linear-gradient(165deg, #ffffff 15%, #c5f6ff 55%, #99f7ff 100%)",
                }}
              >
                {letter}
              </motion.span>
            );
          })}
        </div>

        {/* Hairline + tagline */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 1.9, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{
            height: 1,
            width: 200,
            marginTop: 22,
            transformOrigin: "center",
            background:
              "linear-gradient(to right, transparent, rgba(153,247,255,0.4), transparent)",
          }}
        />
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.42 }}
          transition={{ delay: 2.1, duration: 0.9 }}
          className="font-mono-tech"
          style={{ marginTop: 14, fontSize: 11, letterSpacing: "0.38em", color: "#99f7ff" }}
        >
          CINEMA · TELEVISION · SOUND
        </motion.p>
      </div>

      {/* Version tag */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.18 }}
        transition={{ delay: 2.4, duration: 1 }}
        className="absolute font-mono-tech text-white"
        style={{ bottom: 38, fontSize: 9, letterSpacing: "0.25em" }}
      >
        v0.1.0
      </motion.p>
    </motion.div>
  );
}
