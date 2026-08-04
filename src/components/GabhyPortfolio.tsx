import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import {
  Cpu, CircuitBoard, Wrench, Code2, Bot, GraduationCap, Mail, MapPin,
  Github, ExternalLink, Radio,
  Car, Camera, Globe, Tv, Terminal, Sparkles, Hammer, Plane, Recycle, Newspaper,
} from "lucide-react";

// ─── Personal CV / portfolio — Gabhy Rodrich KIBA ──────────────────────────
// Lives at /gabhy as a fully standalone route (see main.tsx), independent of
// the Butu media app shell — its own page, mounted before the app's i18n
// lang-prefix redirect and serverType gating ever run. Single-language (FR),
// not wired into react-i18next: this is a personal CV, not a Butu feature.
//
// Reuses Butu's own dark/cyan visual language (see tailwind.config.js) on
// purpose — it's a proven, cohesive system, not a shortcut.

const EMAIL = "kibarodrich@gmail.com";
// TODO(Gabhy): fill in your real GitHub URL if this one isn't it.
const GITHUB_URL = "https://github.com/rodrichgk";

const NAV_LINKS = [
  { id: "about", label: "À propos" },
  { id: "skills", label: "Compétences" },
  { id: "experience", label: "Expérience" },
  { id: "projects", label: "Projets" },
  { id: "education", label: "Formation" },
  { id: "contact", label: "Contact" },
];

const ROLES = [
  "Technicien en Électronique",
  "Développeur de Systèmes Embarqués",
  "Développeur Logiciel Full-Stack",
];

interface SkillCategory {
  icon: typeof Cpu;
  title: string;
  items: string[];
  accent: string;
}

const SKILL_CATEGORIES: SkillCategory[] = [
  {
    icon: CircuitBoard,
    title: "Électronique & Matériel",
    items: ["Conception de PCB (KiCad, MultiSim, Ultiboard)", "Rétro-ingénierie", "Réparation de modules automobiles (ABS, BSI, ECU)", "Lecture de schémas", "Câblage"],
    accent: "#99f7ff",
  },
  {
    icon: Cpu,
    title: "Systèmes Embarqués & Microcontrôleurs",
    items: ["Cortex M3", "PIC", "Arduino", "ESP32", "VHDL", "C / C++", "Protocoles UART, I2C, 1-Wire, USB, CAN"],
    accent: "#5fd6e8",
  },
  {
    icon: Code2,
    title: "Développement Logiciel & Web",
    items: ["TypeScript", "Next.js / React", "Rust (Tauri)", "Kotlin (Jetpack Compose)", "Python", "PHP", "Symfony"],
    accent: "#8cf7c4",
  },
  {
    icon: Bot,
    title: "Robotique & CAO",
    items: ["ROS", "Gazebo", "SolidWorks", "Impression 3D"],
    accent: "#c0a0ff",
  },
  {
    icon: Radio,
    title: "Langues",
    items: ["Français — natif", "Anglais — bilingue"],
    accent: "#ffd27a",
  },
];

interface Experience {
  period: string;
  role: string;
  company: string;
  description: string;
  current?: boolean;
}

const EXPERIENCE: Experience[] = [
  {
    period: "2024 — Présent",
    role: "Technicien Réparation Électronique Automobile",
    company: "REMAN BY ADLC",
    description: "Réparation de calculateurs, modules et systèmes électroniques de véhicules : BSI, BCM, ABS, ECU.",
    current: true,
  },
  {
    period: "2023",
    role: "Stagiaire Conception Microcontrôleur",
    company: "Safran Electronics & Defense",
    description: "Conception basée sur architecture Cortex M3, programmation VHDL et C.",
  },
  {
    period: "Stage précédent",
    role: "Technicien / Développeur",
    company: "Systel Électronique",
    description: "Programmation de cartes pour gestion de température, microcontrôleur PIC, sondes, I2C/UART.",
  },
];

interface ProjectLink {
  url: string;
  label: string;
  kind: "github" | "article";
}

interface Project {
  title: string;
  description: string;
  tags: string[];
  icon: typeof Cpu;
  image?: string;
  links?: ProjectLink[];
}

const PROJECTS: Project[] = [
  {
    title: "Banc de test ABS Universel & Application Braxon",
    description: "Conception du banc de test matériel (hydraulique/moteurs) et développement d'une application de diagnostic universelle pour simuler les capteurs de vitesse et tester les vannes.",
    tags: ["Rust", "Tauri", "TypeScript", "Hydraulique"],
    icon: Car,
    image: "/braxon-software.png",
    links: [
      { url: "https://github.com/rodrichgk/braxon-tauri", label: "Voir sur GitHub (app Tauri)", kind: "github" },
      { url: "https://github.com/rodrichgk/ABS_TestBox", label: "Voir sur GitHub (conception PCB)", kind: "github" },
    ],
  },
  {
    title: "Orphelia.net",
    description: "Développement d'un site web complet en Next.js et TypeScript.",
    tags: ["Next.js", "TypeScript", "Web"],
    icon: Globe,
    image: "/orphelia.net.png",
    links: [{ url: "https://github.com/rodrichgk/booking", label: "Voir sur GitHub", kind: "github" }],
  },
  {
    title: "Client Média « Butu »",
    description: "Application client Android TV pour Jellyfin/Plex, développée en Kotlin avec Jetpack Compose — UI et lecteur multimédia sur mesure.",
    tags: ["Kotlin", "Jetpack Compose", "Android TV"],
    icon: Tv,
    image: "/butu-screenshot.png",
    links: [{ url: "https://github.com/rodrichgk/Butu", label: "Voir sur GitHub", kind: "github" }],
  },
  {
    title: "Cutefish OS — Screenshot App",
    description: "Développement d'une application de capture d'écran et de son gestionnaire d'événements.",
    tags: ["C++", "Linux", "Desktop"],
    icon: Camera,
    image: "/gabhy/projects/cutefish.jpg",
    links: [
      { url: "https://github.com/rodrichgk/cutefish_os_screenshot_app", label: "Voir sur GitHub (app)", kind: "github" },
      { url: "https://github.com/rodrichgk/ScreenEventHandlerCplusplus", label: "Voir sur GitHub (gestionnaire d'événements)", kind: "github" },
    ],
  },
  {
    title: "Robotique et Simulation",
    description: "Projets intégrant ROS et Gazebo pour la simulation en robotique.",
    tags: ["ROS", "Gazebo", "Robotique"],
    icon: Bot,
    image: "/gabhy/projects/robotics.jpg",
  },
  {
    title: "Système de gobelets réutilisables — Partenariat Michelin",
    description: "Projet mené à trois pendant le DU #ICI (IUT du Creusot), en partenariat avec le site Michelin de Blanzy : conception d'un système remplaçant les gobelets plastiques souples à usage unique des distributeurs par une solution réutilisable, avec un support lavable — en anticipation de l'interdiction du plastique à usage unique entrée en vigueur en 2021. Projet couvert par la presse locale.",
    tags: ["Michelin", "Éco-conception", "DU #ICI"],
    icon: Recycle,
    links: [{ url: "https://www.lejsl.com/edition-le-creusot/2020/01/28/pour-le-recyclage-des-gobelets-plastiques-dans-les-entreprises", label: "Article — Le Journal de Saône-et-Loire", kind: "article" }],
  },
  {
    title: "Kellefabrik.org — FabLab de Dijon",
    description: "Adhérent du FabLab Kellefabrik à Dijon, développement de leur site web en Symfony et PHP (2023). Le site a fermé cette année suite à un changement d'administration.",
    tags: ["Symfony", "PHP", "FabLab"],
    icon: Hammer,
  },
  {
    title: "Drone Arduino / ESP32",
    description: "Conception et développement d'un drone à base d'Arduino et ESP32, de l'électronique de vol au firmware embarqué.",
    tags: ["Arduino", "ESP32", "C++", "Drone"],
    icon: Plane,
    image: "/drone.jpg",
    links: [{ url: "https://github.com/rodrichgk/Arduino-Based-Flight-Controller", label: "Voir sur GitHub", kind: "github" }],
  },
];

interface EducationItem {
  period: string;
  title: string;
  subtitle?: string;
}

const EDUCATION: EducationItem[] = [
  { period: "2023 — 2024", title: "Master 1 EEA" },
  { period: "2022 — 2023", title: "Licence 3 SPI Électronique", subtitle: "UFR Dijon" },
  { period: "2020 — 2022", title: "DUT Génie Électrique et Informatique Industrielle", subtitle: "IUT du Creusot" },
  { period: "2019 — 2020", title: "DU #ICI", subtitle: "IUT du Creusot — Projet de conception d'une hydrolienne de rivière" },
  { period: "2018 — 2019", title: "Baccalauréat S", subtitle: "Lycée d'Excellence de Mbounda, Brazzaville" },
];

const cardStyle = { 
  background: "linear-gradient(145deg, rgba(16,20,30,0.85) 0%, rgba(12,14,20,0.95) 100%)", 
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(153,247,255,0.1)",
  boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.2)"
} as const;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Real `prefers-reduced-motion` support — not `utils/platform.ts`'s
// `reducedMotion`, which despite the name only checks isAndroid and has
// nothing to do with this accessibility preference. Gates the page's
// continuous/looping animations (blob pulses, glow-breathe, auto-cycling
// role text, the bouncing scroll hint); one-shot reveal-on-scroll fades are
// small enough to leave alone.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// ─── Reveal-on-scroll wrapper ───────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <Reveal className="mb-10 md:mb-14 text-center">
      <p className="font-mono-tech text-xs tracking-[0.3em] uppercase mb-3" style={{ color: "#5fd6e8" }}>{eyebrow}</p>
      <h2 className="font-display font-black" style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.75rem)", color: "#e0e6f0" }}>{title}</h2>
    </Reveal>
  );
}

// ─── Image with graceful fallback ──────────────────────────────────────────
// The user hasn't dropped real photos into public/gabhy/ yet — rather than a
// broken-image icon, fall back to a themed placeholder that looks intentional.
// Swapping in the real file later needs zero code changes.
function SmartImage({ src, alt, fallback, className, imgClassName, style }: {
  src?: string; alt: string; fallback: ReactNode; className?: string; imgClassName?: string; style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  // No src at all (e.g. a project with no available screenshot) skips the
  // <img> entirely rather than relying on browsers' inconsistent handling of
  // an empty src attribute to fire onError. `style` (the aspect-ratio) is
  // applied identically in both branches so the card never lays out at zero
  // height then jumps once the image loads.
  if (!src || failed) {
    return <div className={className} style={style}>{fallback}</div>;
  }
  return (
    <div className={className} style={style}>
      <img src={src} alt={alt} className={imgClassName} onError={() => setFailed(true)} loading="lazy" />
    </div>
  );
}

// No fallback avatar on purpose — a "GK" letter-tile where a photo should be
// reads as a broken/unfinished site, not a design choice. While no real
// photo exists at /gabhy/profile.jpg this renders nothing at all (not even
// the glow ring); once the file is added it fades in on its own, no code
// changes needed.
function ProfilePhoto() {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const reducedMotion = usePrefersReducedMotion();
  if (status === "error") return null;
  return (
    <motion.div
      className="relative w-28 h-28 md:w-36 md:h-36 mb-7"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: status === "loaded" ? 1 : 0, scale: status === "loaded" ? 1 : 0.85 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ pointerEvents: status === "loaded" ? undefined : "none" }}
    >
      <div className={`absolute -inset-2 rounded-full ${reducedMotion ? "" : "animate-glow-breathe"}`} style={{ border: "1px solid rgba(153,247,255,0.25)" }} />
      <div className="relative w-full h-full rounded-full overflow-hidden">
        <img
          src="/gabhy/profile.jpg"
          alt="Portrait de Gabhy Rodrich KIBA"
          className="w-full h-full object-cover"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      </div>
    </motion.div>
  );
}

function RoleCycler() {
  const [idx, setIdx] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (reducedMotion) return; // idx stays 0 — shows the first role, static
    const t = setInterval(() => setIdx((i) => (i + 1) % ROLES.length), 2800);
    return () => clearInterval(t);
  }, [reducedMotion]);
  return (
    <div className="h-7 md:h-8 flex items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="font-mono-tech text-sm md:text-base tracking-wide"
          style={{ color: "#5fd6e8" }}
        >
          {ROLES[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// Faint animated circuit-trace backdrop for the hero — pure inline SVG, no
// external asset, cheap to render, reinforces the electronics theme.
function CircuitBackdrop() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full"
      style={{ opacity: 0.12 }}
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="circuit" width="120" height="120" patternUnits="userSpaceOnUse">
          <path d="M10 10 H60 V60 H110 M60 60 V110" fill="none" stroke="#99f7ff" strokeWidth="1" />
          <circle cx="10" cy="10" r="3" fill="#99f7ff" />
          <circle cx="60" cy="60" r="3" fill="#99f7ff" />
          <circle cx="110" cy="110" r="3" fill="#99f7ff" />
        </pattern>
      </defs>
      <rect width="800" height="600" fill="url(#circuit)" />
    </svg>
  );
}

export function GabhyPortfolio() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Gabhy Rodrich KIBA — Technicien Électronique & Développeur Logiciel";
    return () => { document.title = previousTitle; };
  }, []);

  // The rest of Butu locks #root/body to a fixed-height, non-scrolling shell
  // and hides the OS cursor for its own custom TV-style cursor — this page
  // needs neither (see the .gabhy-scroll rules in index.css).
  useEffect(() => {
    document.body.classList.add("gabhy-scroll");
    return () => document.body.classList.remove("gabhy-scroll");
  }, []);

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  const [navSolid, setNavSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const reducedMotion = usePrefersReducedMotion();

  return (
    <div style={{ background: "#04060d", color: "#e0e6f0", minHeight: "100vh" }}>
      {/* ── Top nav ──
          Nav links only show from `lg:` up — at `md` (tablet/iPad-portrait,
          768px) six French labels + logo + CTA button don't actually fit the
          available width and would overflow/wrap. Below `lg:` a horizontally
          scrollable pill row takes over instead (also used on phones). */}
      <motion.nav
        className="fixed top-0 inset-x-0 z-40 transition-colors duration-300"
        style={{
          background: navSolid ? "rgba(4,6,13,0.85)" : "transparent",
          backdropFilter: navSolid ? "blur(16px)" : "none",
          paddingTop: "env(safe-area-inset-top)",
        }}
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Faint always-on accent line instead of a flat border — reads as a
            powered-on circuit trace rather than a stock nav divider. */}
        <div className="absolute bottom-0 inset-x-0 h-px" style={{
          background: "linear-gradient(90deg, transparent, rgba(153,247,255,0.35) 20%, rgba(153,247,255,0.35) 80%, transparent)",
          opacity: navSolid ? 1 : 0.4,
          transition: "opacity 0.3s",
        }} />

        <div className="mx-auto flex items-center justify-between px-4 sm:px-8 py-3.5" style={{ maxWidth: 1180 }}>
          <button
            onClick={() => scrollToId("hero")}
            className="flex items-center gap-2.5 font-display font-black text-sm tracking-wide shrink-0"
            style={{ color: "#e0e6f0", cursor: "pointer", background: "none", border: "none" }}
          >
            <span className="relative flex items-center justify-center w-8 h-8" style={{
              background: "linear-gradient(135deg, rgba(153,247,255,0.2), rgba(153,247,255,0.05))",
              border: "1px solid rgba(153,247,255,0.3)", color: "#99f7ff",
              clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
            }}>
              <Terminal size={15} />
            </span>
            GRK
            <span className={`w-1.5 h-1.5 rounded-full ${reducedMotion ? "" : "animate-glow-breathe"}`} style={{ background: "#8cf7c4" }} />
          </button>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollToId(l.id)}
                className="group relative font-body text-sm px-3.5 py-2.5"
                style={{ color: "rgba(224,230,240,0.65)", cursor: "pointer", background: "none", border: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#99f7ff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(224,230,240,0.65)")}
              >
                {l.label}
                <span
                  className="absolute left-3.5 right-3.5 bottom-1.5 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{ background: "#99f7ff" }}
                />
              </button>
            ))}
          </div>

          <a
            href={`mailto:${EMAIL}`}
            className="font-display font-semibold text-xs sm:text-sm px-3.5 sm:px-4 py-2.5 rounded-xl whitespace-nowrap shrink-0"
            style={{ background: "linear-gradient(135deg,#99f7ff,#00f1fe)", color: "#001f24" }}
          >
            Me contacter
          </a>
        </div>
        {/* Tablet + phone anchor row — real pill buttons (not bare text) so
            each one is a comfortable tap target, not just a thin text line. */}
        <div className="lg:hidden flex gap-2 overflow-x-auto px-4 pb-3 -mt-0.5" style={{ scrollbarWidth: "none" }}>
          {NAV_LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollToId(l.id)}
              className="font-mono-tech text-[11px] tracking-widest uppercase whitespace-nowrap px-3.5 py-2.5 rounded-full shrink-0"
              style={{
                color: "rgba(224,230,240,0.6)",
                background: "rgba(153,247,255,0.05)",
                border: "1px solid rgba(153,247,255,0.12)",
                cursor: "pointer",
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </motion.nav>

      {/* ── HERO ── */}
      <section id="hero" ref={heroRef} className="relative flex flex-col items-center justify-center text-center px-5 overflow-hidden" style={{ minHeight: "100vh" }}>
        <CircuitBackdrop />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 35%, rgba(153,247,255,0.10) 0%, transparent 65%)" }} />
        <motion.div
          className="pointer-events-none absolute rounded-full"
          style={{ width: 480, height: 480, top: "10%", left: "-10%", background: "radial-gradient(circle, rgba(153,247,255,0.12) 0%, transparent 70%)", filter: "blur(40px)" }}
          animate={reducedMotion ? undefined : { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute rounded-full"
          style={{ width: 420, height: 420, bottom: "5%", right: "-8%", background: "radial-gradient(circle, rgba(140,247,196,0.10) 0%, transparent 70%)", filter: "blur(40px)" }}
          animate={reducedMotion ? undefined : { scale: [1.1, 1, 1.1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <motion.div
          className="pointer-events-none absolute rounded-full"
          style={{ width: 500, height: 500, top: "20%", right: "-15%", background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)", filter: "blur(50px)" }}
          animate={reducedMotion ? undefined : { scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="relative flex flex-col items-center">
          <ProfilePhoto />

          <motion.p
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
            className="font-mono-tech text-xs tracking-[0.35em] uppercase mb-4"
            style={{ color: "rgba(153,247,255,0.7)" }}
          >
            Portfolio
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="font-display font-black"
            style={{ fontSize: "clamp(2.4rem, 8vw, 4.2rem)", letterSpacing: "-0.02em", lineHeight: 1.05 }}
          >
            Gabhy Rodrich <span style={{ color: "#99f7ff", textShadow: "0 0 40px rgba(153,247,255,0.5)" }}>KIBA</span>
          </motion.h1>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.35 }} className="mt-4">
            <RoleCycler />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.45 }}
            className="font-body mt-6 max-w-xl"
            style={{ fontSize: "clamp(1rem, 2.4vw, 1.15rem)", color: "rgba(224,230,240,0.65)", lineHeight: 1.65 }}
          >
            Passionné par la conception de cartes, les systèmes embarqués et le développement d'applications
            (Web, Desktop, Mobile). De la conception 3D à l'architecture logicielle.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.55 }}
            className="flex flex-col sm:flex-row items-center gap-3.5 mt-9 w-full sm:w-auto"
          >
            <motion.button
              onClick={() => scrollToId("projects")}
              className="relative w-full sm:w-auto font-display font-bold rounded-2xl overflow-hidden group"
              style={{ background: "linear-gradient(135deg,#99f7ff,#00f1fe)", color: "#001f24", fontSize: "1rem", padding: "0.95rem 2rem", cursor: "pointer", boxShadow: "0 0 40px rgba(153,247,255,0.3)" }}
              whileHover={{ scale: 1.03, boxShadow: "0 0 50px rgba(153,247,255,0.5)" }} whileTap={{ scale: 0.97 }}
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" style={{ pointerEvents: "none" }} />
              Voir mes projets
            </motion.button>
            <motion.button
              onClick={() => scrollToId("contact")}
              className="w-full sm:w-auto font-display font-bold rounded-2xl"
              style={{ background: "rgba(153,247,255,0.04)", backdropFilter: "blur(12px)", color: "#99f7ff", fontSize: "1rem", padding: "0.95rem 2rem", cursor: "pointer", border: "1px solid rgba(153,247,255,0.2)" }}
              whileHover={{ scale: 1.03, background: "rgba(153,247,255,0.1)", borderColor: "rgba(153,247,255,0.4)" }} whileTap={{ scale: 0.97 }}
            >
              Me contacter
            </motion.button>
          </motion.div>
        </motion.div>

      </section>

      {/* ── ABOUT ── */}
      <section id="about" className="relative px-5 sm:px-8 py-20 md:py-28 scroll-mt-24 lg:scroll-mt-18">
        <div className="mx-auto" style={{ maxWidth: 900 }}>
          <SectionHeading eyebrow="Qui suis-je" title="À propos" />
          <Reveal delay={0.1}>
            <div className="rounded-3xl p-8 md:p-10" style={cardStyle}>
              <p className="font-body" style={{ fontSize: "clamp(1.05rem, 2.2vw, 1.2rem)", color: "rgba(224,230,240,0.8)", lineHeight: 1.75 }}>
                Basé à <span style={{ color: "#99f7ff" }}>Marseille</span>, technicien polyvalent de 25 ans.
                J'allie une forte expertise en <strong style={{ color: "#e0e6f0" }}>ingénierie matérielle</strong> (réparation,
                rétro-ingénierie, conception de PCB) avec des compétences avancées en{" "}
                <strong style={{ color: "#e0e6f0" }}>développement logiciel moderne</strong>. Que ce soit pour prototyper
                des pièces en 3D, programmer un microcontrôleur ou développer des applications full-stack,
                j'aime construire des solutions de A à Z.
              </p>
              <div className="flex flex-wrap gap-3 mt-7">
                {["25 ans", "Marseille (13005)", "Hardware + Software"].map((tag) => (
                  <span key={tag} className="font-mono-tech text-xs tracking-wide px-3.5 py-1.5 rounded-full" style={{ background: "rgba(153,247,255,0.08)", color: "#5fd6e8", border: "1px solid rgba(153,247,255,0.15)" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SKILLS ── */}
      <section id="skills" className="relative px-5 sm:px-8 py-20 md:py-28 scroll-mt-24 lg:scroll-mt-18" style={{ background: "rgba(153,247,255,0.02)" }}>
        <div className="mx-auto" style={{ maxWidth: 1180 }}>
          <SectionHeading eyebrow="Boîte à outils" title="Compétences" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SKILL_CATEGORIES.map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <Reveal key={cat.title} delay={idx * 0.08} className={idx === SKILL_CATEGORIES.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""}>
                  <motion.div 
                    className="h-full rounded-3xl p-6 md:p-7" 
                    style={cardStyle}
                    whileHover={{ y: -6, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.1), 0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(153,247,255,0.25)" }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl mb-5" style={{ background: `${cat.accent}18`, border: `1px solid ${cat.accent}40`, color: cat.accent }}>
                      <Icon size={22} />
                    </div>
                    <h3 className="font-display font-bold text-lg mb-4" style={{ color: "#e0e6f0" }}>{cat.title}</h3>
                    <ul className="flex flex-col gap-2.5">
                      {cat.items.map((item) => (
                        <li key={item} className="font-body text-sm flex items-start gap-2.5" style={{ color: "rgba(224,230,240,0.65)", lineHeight: 1.5 }}>
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cat.accent }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── EXPERIENCE ── */}
      <section id="experience" className="relative px-5 sm:px-8 py-20 md:py-28 scroll-mt-24 lg:scroll-mt-18">
        <div className="mx-auto" style={{ maxWidth: 820 }}>
          <SectionHeading eyebrow="Parcours" title="Expériences professionnelles" />
          <div className="relative">
            <div className="absolute left-[15px] md:left-[19px] top-2 bottom-2 w-px" style={{ background: "linear-gradient(to bottom, rgba(153,247,255,0.4), rgba(153,247,255,0.05))" }} />
            <div className="flex flex-col gap-8">
              {EXPERIENCE.map((exp, idx) => (
                <Reveal key={exp.role} delay={idx * 0.1}>
                  <div className="relative flex gap-5 md:gap-6 pl-0">
                    <div className="relative shrink-0 flex items-start pt-1.5">
                      <div
                        className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center z-10"
                        style={{
                          background: exp.current ? "linear-gradient(135deg,#99f7ff,#00f1fe)" : "rgba(22,26,38,0.9)",
                          border: exp.current ? "none" : "1px solid rgba(153,247,255,0.3)",
                          boxShadow: exp.current ? "0 0 24px rgba(153,247,255,0.4)" : "none",
                        }}
                      >
                        <Wrench size={14} color={exp.current ? "#001f24" : "#99f7ff"} />
                      </div>
                    </div>
                    <motion.div 
                      className="flex-1 rounded-2xl p-5 md:p-6" 
                      style={cardStyle}
                      whileHover={{ x: 6, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.1), 0 15px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(153,247,255,0.2)" }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="flex flex-wrap items-center gap-2.5 mb-2">
                        <span className="font-mono-tech text-xs tracking-wide px-2.5 py-1 rounded-md" style={{ background: "rgba(153,247,255,0.1)", color: "#5fd6e8" }}>
                          {exp.period}
                        </span>
                        {exp.current && (
                          <span className="font-mono-tech text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full" style={{ color: "#8cf7c4", border: "1px solid rgba(140,247,196,0.35)" }}>
                            Actuel
                          </span>
                        )}
                      </div>
                      <h3 className="font-display font-bold text-base md:text-lg" style={{ color: "#e0e6f0" }}>{exp.role}</h3>
                      <p className="font-body text-sm font-semibold mt-0.5" style={{ color: "#99f7ff" }}>{exp.company}</p>
                      <p className="font-body text-sm mt-2.5" style={{ color: "rgba(224,230,240,0.6)", lineHeight: 1.6 }}>{exp.description}</p>
                    </motion.div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PROJECTS ── */}
      <section id="projects" className="relative px-5 sm:px-8 py-20 md:py-28 scroll-mt-24 lg:scroll-mt-18" style={{ background: "rgba(153,247,255,0.02)" }}>
        <div className="mx-auto" style={{ maxWidth: 1180 }}>
          <SectionHeading eyebrow="Réalisations" title="Projets phares" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PROJECTS.map((project, idx) => {
              const Icon = project.icon;
              return (
                <Reveal key={project.title} delay={idx * 0.08} className={idx === 0 ? "sm:col-span-2 lg:col-span-1" : ""}>
                  <motion.div
                    className="group h-full flex flex-col rounded-3xl overflow-hidden cursor-default"
                    style={cardStyle}
                    whileHover={{ y: -6, boxShadow: "0 20px 50px rgba(0,0,0,0.35), 0 0 0 1px rgba(153,247,255,0.3)" }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <SmartImage
                      src={project.image}
                      alt={project.title}
                      className="relative w-full overflow-hidden"
                      style={{ aspectRatio: "16/10" }}
                      imgClassName="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      fallback={
                        <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(153,247,255,0.08), rgba(153,247,255,0.02))" }}>
                          <Icon size={40} color="#5fd6e8" strokeWidth={1.4} />
                        </div>
                      }
                    />
                    <div className="flex flex-col flex-1 p-6">
                      <h3 className="font-display font-bold text-base md:text-lg mb-2" style={{ color: "#e0e6f0" }}>{project.title}</h3>
                      <p className="font-body text-sm flex-1" style={{ color: "rgba(224,230,240,0.6)", lineHeight: 1.6 }}>{project.description}</p>
                      <div className="flex flex-wrap gap-2 mt-5">
                        {project.tags.map((tag) => (
                          <span key={tag} className="font-mono-tech text-[10px] tracking-wide px-2.5 py-1 rounded-md" style={{ background: "rgba(153,247,255,0.08)", color: "#99f7ff" }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      {project.links && project.links.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-5 pt-4" style={{ borderTop: "1px solid rgba(153,247,255,0.1)" }}>
                          {project.links.map((link) => {
                            const LinkIcon = link.kind === "github" ? Github : Newspaper;
                            return (
                              <a
                                key={link.url}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                // The whole row is the <a> — full label text, icon, and the
                                // padding around them are all one click target, with a hover
                                // background so the clickable area is visually obvious too.
                                className="flex items-center gap-2.5 font-body text-xs rounded-lg -mx-2 px-2 py-2.5 transition-colors"
                                style={{ color: "#5fd6e8" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(153,247,255,0.08)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                <LinkIcon size={14} style={{ flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>{link.label}</span>
                                <ExternalLink size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── EDUCATION ── */}
      <section id="education" className="relative px-5 sm:px-8 py-20 md:py-28 scroll-mt-24 lg:scroll-mt-18">
        <div className="mx-auto" style={{ maxWidth: 820 }}>
          <SectionHeading eyebrow="Diplômes" title="Formation" />
          <div className="flex flex-col gap-3.5">
            {EDUCATION.map((ed, idx) => (
              <Reveal key={ed.title} delay={idx * 0.07}>
                <motion.div 
                  className="flex items-center gap-4 md:gap-5 rounded-2xl p-5" 
                  style={cardStyle}
                  whileHover={{ scale: 1.02, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.1), 0 15px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(153,247,255,0.2)" }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="shrink-0 flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-xl" style={{ background: "rgba(153,247,255,0.08)", border: "1px solid rgba(153,247,255,0.2)", color: "#99f7ff" }}>
                    <GraduationCap size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono-tech text-xs tracking-wide mb-0.5" style={{ color: "#5fd6e8" }}>{ed.period}</p>
                    <h3 className="font-display font-bold text-sm md:text-base" style={{ color: "#e0e6f0" }}>{ed.title}</h3>
                    {ed.subtitle && <p className="font-body text-xs md:text-sm mt-0.5" style={{ color: "rgba(224,230,240,0.55)" }}>{ed.subtitle}</p>}
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="relative px-5 sm:px-8 py-20 md:py-32 overflow-hidden scroll-mt-24 lg:scroll-mt-18">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(153,247,255,0.08) 0%, transparent 70%)" }} />
        <div className="relative mx-auto text-center" style={{ maxWidth: 640 }}>
          <Reveal>
            <Sparkles size={26} color="#99f7ff" className="mx-auto mb-5" />
            <h2 className="font-display font-black mb-4" style={{ fontSize: "clamp(1.8rem, 5vw, 2.75rem)" }}>
              Discutons de votre projet
            </h2>
            <p className="font-body mb-10" style={{ color: "rgba(224,230,240,0.6)", fontSize: "1.05rem", lineHeight: 1.6 }}>
              Ouvert aux opportunités mêlant hardware et software — n'hésitez pas à me contacter.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-10">
              <motion.a
                href={`mailto:${EMAIL}`}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 font-display font-bold rounded-2xl"
                style={{ background: "linear-gradient(135deg,#99f7ff,#00f1fe)", color: "#001f24", fontSize: "1rem", padding: "0.95rem 2rem", boxShadow: "0 0 40px rgba(153,247,255,0.25)" }}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              >
                <Mail size={18} />
                {EMAIL}
              </motion.a>
            </div>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="flex items-center justify-center gap-3 mb-10">
              <p className="font-mono-tech text-sm flex items-center gap-2" style={{ color: "rgba(224,230,240,0.55)" }}>
                <MapPin size={15} color="#5fd6e8" />
                Marseille (13005), France
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <SocialLink href={GITHUB_URL} label="GitHub" icon={Github} />
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="px-5 py-8 text-center" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        <p className="font-mono-tech text-xs" style={{ color: "rgba(224,230,240,0.25)" }}>
          Gabhy Rodrich KIBA · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

function SocialLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Github }) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 font-body text-sm px-5 py-3 rounded-xl"
      style={{ background: "rgba(153,247,255,0.06)", border: "1px solid rgba(153,247,255,0.15)", color: "rgba(224,230,240,0.8)" }}
      whileHover={{ scale: 1.04, borderColor: "rgba(153,247,255,0.4)", color: "#99f7ff" }}
      whileTap={{ scale: 0.97 }}
    >
      <Icon size={17} />
      {label}
      <ExternalLink size={13} style={{ opacity: 0.5 }} />
    </motion.a>
  );
}
