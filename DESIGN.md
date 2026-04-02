# Design System Specification: The Cinematic Aperture

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

In a world of cluttered TV interfaces, this system treats the screen as a high-end gallery space. We are moving away from the "grid of posters" toward an editorial experience where the interface recedes, allowing the cinematography of the content to become the architecture. We break the standard TV "template" through intentional asymmetry—using large-scale Hero imagery that bleeds off-canvas—and high-contrast typography scales that prioritize legibility at a 10-foot distance while maintaining a boutique, premium feel.

## 2. Colors & Atmospheric Depth
The palette is rooted in a "Deep Night" philosophy, using charcoal and navy to provide infinite depth, allowing the "Neon Aura" focus states to vibrate with life.

*   **Primary Core:** Use `primary` (#99f7ff) and `primary_container` (#00f1fe) for active states and critical calls to action.
*   **Neutral Tones:** The base is `surface` (#0c0e13). Use `surface_container_low` for large background sections and `surface_container_highest` for elevated elements.
*   **The "No-Line" Rule:** Sectioning must never be achieved through 1px solid borders. Use background shifts (e.g., a `surface_container_low` sidebar against a `surface` background) or vertical whitespace. 
*   **Surface Hierarchy & Nesting:** Depth is achieved by "stacking" surface-container tiers. An inner information pane should use `surface_container_high` sitting atop a `surface_container_low` backdrop to create a natural, physical lift.
*   **The "Glass & Gradient" Rule:** Floating UI (overlays, sidebars) must use Glassmorphism. Apply a `surface_variant` with 60% opacity and a 20px-40px backdrop blur. 
*   **Signature Textures:** For the Hero experience, use a linear gradient transitioning from `surface_lowest` (100% alpha) to `surface_lowest` (0% alpha) to ensure metadata is legible over movie art without hard box edges.

## 3. Typography: Editorial Authority
Our typography pairs the bold authority of wide sans-serifs with the technical precision of monospaced fonts.

*   **Display & Headlines (Plus Jakarta Sans):** Used for movie titles and section headers. These should be set to `display-lg` or `headline-lg`. Use "Bold" weights to command attention.
*   **Body (Manrope):** Used for synopses and descriptions. Utilize `body-lg` for readability. Keep line lengths controlled to prevent "eye-scanning fatigue" on large displays.
*   **Technical Metadata (Space Grotesk - Mono):** Use `label-md` for year, resolution (4K), and source. This font change signals to the viewer that they are looking at "data" rather than "story," creating a sophisticated hierarchy.

## 4. Elevation & Depth
In this system, depth is a functional tool, not a decoration.

*   **The Layering Principle:** Stack `surface-container` tokens to create hierarchy. A focused card should move from `surface_container_low` to `surface_bright` to visually "pop" toward the user.
*   **Neon Aura Focus:** When an element is focused, apply an ambient shadow using the `primary` token (#99f7ff) at 15% opacity with a 40px blur. This creates a "glow" rather than a shadow, mimicking light emitting from the screen.
*   **The "Ghost Border":** For the glass effect, use a 1px inner stroke using `outline_variant` at 20% opacity. This defines the edge of the "glass" without creating a heavy visual barrier.
*   **Glassmorphism:** All sidebar and modal elements must use backdrop-blur. This allows the vibrant colors of movie posters to bleed through the UI, ensuring the interface feels integrated with the content.

## 5. Components

### Navigation Sidebar
*   **Style:** Semi-transparent `surface_container_low` with 40px backdrop blur.
*   **Width:** Narrow in collapsed state, expanding on hover/focus.
*   **Interaction:** No dividers. Use `spacing-8` between icons. Active state is indicated by a `primary` vertical "pill" on the left edge.

### Hero Carousel
*   **Layout:** Edge-to-edge art. Title metadata should be anchored to the bottom-left using `spacing-20` padding.
*   **Transitions:** Use slow, 600ms ease-in-out transforms. Avoid sudden "snapping."

### Horizontal Content Cards
*   **Rounding:** Always use `rounded-lg` (2rem / 32px) for a soft, hyper-modern feel.
*   **Sizing:** Mix sizes—use "Double-Wide" cards for featured content and "Standard Vertical" for libraries to create visual rhythm.
*   **Focus State:** Scale card by 1.05x. Apply the "Neon Aura" shadow and the 1px "Ghost Border."

### Buttons & Chips
*   **Primary Button:** `primary_container` background with `on_primary_container` text. `rounded-full`.
*   **Secondary Button:** Ghost style. 1px `outline_variant` (20% opacity) with `on_surface` text.
*   **Chips:** Use `secondary_container` with `label-md` (Space Grotesk). No borders.

## 6. Do's and Don'ts

### Do
*   **Do** use extreme whitespace (`spacing-12` or `spacing-16`) between major sections to let the UI breathe.
*   **Do** use high-contrast type scales. If a title is big, make it *massive*.
*   **Do** ensure all focused states are visible from 10 feet away using the "Neon Aura."

### Don't
*   **Don't** use 100% opaque black. Always use the deep charcoal `surface` (#0c0e13) to maintain "inkiness" without losing detail.
*   **Don't** use standard "Drop Shadows." Only use tinted, high-blur ambient glows.
*   **Don't** use dividers or lines to separate list items. Use the `spacing` scale to create clear groupings.