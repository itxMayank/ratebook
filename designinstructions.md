# Rate Book design instructions

**Read this before building or changing anything people see** (app, vendor page, admin dashboard, icons, PDFs, WhatsApp text layout).
Researched October 2026 from Apple HIG (iOS 26 / Liquid Glass), Material 3 and Material 3 Expressive, NN/g, WCAG 2.2 + APCA, Radix, Tailwind v4, Vercel Geist, Linear, Revolut, Monzo, Duolingo, PhonePe, Khatabook, OkCredit and Vyapar, plus the source code of `vaul`, `sonner` and `@material/web`. Sources are listed at the end. Values marked *(check)* came from secondary sources; confirm them before relying on them exactly.

---

## 0. How to use this file

1. **Before any UI work, read §1 (principles) and the sections for what you're touching.** Run the §12 checklist before calling the work done.
2. **Use the tokens in the code** (all colour tokens live in one `:root` block at the top of the `<style>`, plus its two dark blocks): `--bg`, `--surface`, `--surface-2`, `--fg`, `--muted`, `--line`, `--ink`/`--ink-fg`, `--accent`/`--accent-soft`, `--good`, `--danger`, `--gold`, `--r`, `--shadow`, `--f-display`, `--f-body`. Never write a new hex value in a component. If a token is missing, add it to `:root`, to both dark blocks and to every palette (`PALETTES` + `:root[data-palette=…]`).
3. **This file wins over taste.** When the user asks for something that goes against it, do what they ask, then add an "Overrides" note at the bottom so it isn't undone later.
4. **Keep it current.** When a design decision is made in a conversation (for example "no extra taps to see things on small screens"), add it to §1 or the relevant section in the same pull request.

---

## 1. Principles for this app (the rules everything else follows)

1. **Speed of the shopkeeper beats decoration.** Things done hundreds of times a day (search, + Bill, qty, Done) are instant or under 100 ms. Animation never delays a tap.
2. **On small screens, wrap or stack; never hide behind an extra tap.** If something doesn't fit at 320 px or at the largest text size, let it take another line. Don't cut it to "…" and don't move it into a menu. *(User rule, 11 Oct 2026.)*
3. **One primary action per screen or area**, dark ink pill, in the thumb zone (lower-middle). Rare or destructive actions go at the top or in a ⌄ menu.
4. **Content is never on glass.** Prices, totals and inputs sit on solid surfaces. Glass or blur, if used at all, is only for floating chrome (tab bar), with a solid fallback.
5. **Neutral with one accent.** About 90% of a screen is neutral. The accent marks the main action, the selection and focus. Status colours (green/red/gold) mean status only.
6. **Colour never carries meaning alone.** Pair it with a word or sign: "Due ₹450", "Paid", "−", ✓.
7. **Hindi is first-class.** Every string goes in both `STR.en` and `STR.hi`. Devanagari gets more line height (see §3) and is never letter-spaced. Check every layout in Hindi.
8. **Must work on iPhone (Safari 16+) and Android Chrome**, from 320 px wide up to a laptop, at all four text sizes (1 / 1.12 / 1.25 / 1.38), in light and dark, in all 5 palettes.
9. **Teach in context, not with tours.** Empty states and one-time hints instead of slides.
10. **Uncluttered.** When adding something, ask what can go. Show secondary information on demand (the tap-to-reveal profit is the model), but never hide primary information that way.

---

## 2. Layout

**Spacing.** Use a 4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Phone side gutter: 16 px.
- Card padding: 12–16 px.
- Gap between sections: 24–32 px.
- Related items sit about half as far apart as separate groups.
- Start with generous space and remove it, rather than adding space to a crowded screen.

**Touch targets.**
- Aim for **44–48 px**; WCAG 2.2's legal minimum is 24 × 24 px.
- Keep at least 8 px between neighbouring targets.
- A small-looking control (× on a bill line, a chip) keeps a 44 px hit area through padding or a `::after` hit-slop.
- Shop-app density is fine: list rows 48–56 px, chips 32–36 px tall.

**Thumb zone** (Hoober: 49% of people use one hand, about 75% of touches are by thumb, and the screen centre is the most accurate place to tap):
- Main actions go in the lower-middle area; navigation stays at the bottom. That's why search sits in the bottom dock and the total bar is pinned above the tab bar.
- Corners are hardest to reach. Don't put frequent actions in the top corners.

**Safe areas and viewport.**
- The viewport meta already has `viewport-fit=cover` + `interactive-widget=resizes-content`; keep both.
- Fixed bars: `padding-bottom: max(12px, env(safe-area-inset-bottom))`.
- Use `dvh`/`svh`, not `vh`.
- iPhone ignores `interactive-widget`, so track the keyboard with `visualViewport` (`--kb`). No `:has()` in core layout (iOS 15.4+); toggle a class from JS instead.

**Widths and breakpoints.**
- Phones are under 1024 px (the existing split). Desktop steps are 1024 / 1280 / 1600.
- Sheets on desktop: 480–640 px wide.
- Prose: at most 65ch.

**Containers.**
- **Lists** for things of the same kind that people scan: prices, bills, ledgers, customers.
- **Cards** for mixed content: bill lines, item detail, report tiles.
- On a white sheet, separate tiles with a 1–1.5 px `--line` hairline rather than a shadow (already the rule in sheets).
- **Bento tiles** only on dashboards and the Reports hero, never on working lists.

**Bottom sheets** are the standard place for anything that isn't a full screen.
- Large top radius (24–28 px), a 36 × 5 px grabber, scrim at 32–40% black.
- Inner screens use the existing back-stack (`*-back`, `SHEET_STK`).
- Drag-to-dismiss (if added): close past **25% of the sheet's height** or above **0.4 px/ms** release speed. Otherwise snap back over 500 ms with `cubic-bezier(.32,.72,0,1)` (vaul's values). Only start a drag when the sheet's content is scrolled to the top.

**Sticky action bars.**
- One primary action, pinned above the safe area, 56–72 px tall.
- While typing, either ride on the keyboard or shrink (the slim Total · Share · Done pill is the model).

**Navigation.**
- 3–5 bottom tabs, always with **icon + label**; the active tab gets a pill or capsule.
- A floating rounded tab bar is current (iOS 26 capsule, M3 pill).
- A FAB only for one dominant create action.
- No hamburger menu as main navigation, no notched bottom app bar, no speed-dial FAB (all dated).

---

## 3. Typography

**Fonts.**
- Plus Jakarta Sans for the interface and display (`--f-display`); Mukta for Hindi (`--f-body` fallback chain includes Noto Sans Devanagari).
- At most 3 weights: 400, 600, 700 (800 only for the big total).
- Don't add another family. A monospace font is acceptable only for codes and IDs (shop code, GSTIN) if ever needed.

**Mobile type scale** (web values, in CSS px before `--fz` zoom):

| Role | Size / line-height | Weight | Use |
|---|---|---|---|
| Display | 28–32 / 1.15 | 700–800 | Total amount, lock-screen shop name, report hero figure |
| Title | 22–24 / 1.25 | 700 | Sheet titles, screen headings |
| Section | 18–20 / 1.3 | 600–700 | Card headings ("Bill items") |
| Body strong | 16 / 1.4 | 600 | Item names, button labels |
| Body | 16 / 1.5 | 400 | Normal text. **Inputs are always 16 px or larger** (otherwise iOS zooms the page when a box gets focus) |
| Secondary | 14 / 1.45 | 400–500 | Hints, sub-lines |
| Label | 13 / 1.4 | 500–600 | Chips, meta lines |
| Caption | 12 / 1.35 | 500 | Badges, timestamps. **11 px is the absolute floor** |

**Rules.**
- Letter-spacing: −0.01 to −0.02em on Latin text at 24 px and up; +0.04em on ALL-CAPS labels; **never on Devanagari**, which breaks the conjunct letters.
- Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs (Safari 17.5+; older browsers simply ignore them).
- Never fake bold or fake italic on Devanagari.

**Numbers and money.**
- Use `font-variant-numeric: tabular-nums` (class `num`) on every price, qty, total, count, and anything that rolls or lines up in columns.
- Indian grouping (12,34,567) via the existing `rs()` / `moneyText()`, or `Intl.NumberFormat('en-IN')`.
- ₹ sits right before the number with no space. Show paise only when they aren't zero (bill and item rates keep up to 3 decimals where needed).
- Short forms (₹1.2L, ₹3Cr) only on charts and badges, never on bills.

**Devanagari.**
- Body line height 1.5–1.6, headings 1.25–1.3, otherwise the vowel marks above and below the letters (matras) collide.
- At the same font size Devanagari looks about 10–15% smaller than Latin. Text marked `:lang(hi)` inside mixed lines can be set at `1.05–1.08em`.
- Mark Hindi text with `lang="hi"` (as `lineHi` and the item cards already do).
- Hindi labels run about 20–40% longer than English. Design for the Hindi length.

**Fluid type.**
- Use `clamp()` for display sizes only, keeping a `rem` part so the user's text-size setting still applies.
- Body text stays fixed. Rate Book's own text sizes come from `--fz` zoom.

**Font loading.**
- Keep the non-blocking stylesheet (`media="print" onload`) and `display=swap`.
- Load only the weights and subsets in use.
- If layout shift on font swap becomes visible, add a fallback `@font-face` with `size-adjust` / `ascent-override` (Capsize/Fontaine numbers).

---

## 4. Colour

**Palette rules.**
- The base is cool off-white `--bg` (#F1F2F4) with white `--surface`, near-black **ink** primary buttons (`--ink` #16171A) and one accent, **Iris** (`--accent` #4F46E5; dark mode #A5A6FF; soft #EEEEFF / #25264D). This matches the 2025–26 direction (Linear, Vercel, Revolut). Iris was chosen over teal (too close to the green for "Paid" and the WhatsApp button) and ocean blue (generic). Keep it.
- New palettes should be built in **OKLCH**:
  - fix the hue;
  - step lightness over about 11 shades (98, 95, 90, 82, 72, 62, 54, 46, 38, 30, 22%);
  - let chroma peak in the middle shades;
  - give neutrals a tiny chroma (0.005–0.015) in the brand hue.
- Write the hex value first and the `oklch()` value after it, so older browsers fall back.
- Radix 12-step roles, for mapping a palette to tokens: 1–2 page backgrounds · 3–5 component background (rest / hover / pressed) · 6–8 borders (subtle / UI + focus / hover) · 9–10 solid fill (+ hover) · 11–12 text (low / high contrast).

**Semantic tokens** (components use only these):
- Surfaces: `--bg`, `--surface`, `--surface-2`.
- Text and lines: `--fg`, `--muted`, `--line`, `--fieldline`.
- Primary and accent: `--ink`/`--ink-fg`/`--ink-soft`, `--accent`/`--accent-fg`/`--accent-soft`.
- Status: `--good`, `--danger`, `--gold`.
- Add-to-bill states: `--addbg`/`--addfg`, `--inbg`/`--infg`.
- Floating bars and toasts in dark mode: `--nav-*`, `--toast-*`.
- If a new role is needed (`--warning`, `--info`, `--scrim`, `--focus`), add it everywhere at once.

**Dark mode.**
- No pure black for surfaces. Use about #121316–#1D1B1A (L 16–20%).
- Show elevation with **lighter** surfaces (2–4% L per level), not shadows.
- Text is off-white (#F2EEEA, L 93–96%), not #fff.
- Borders: white at 8–12%, or `--line`.
- Accents get lighter and slightly less saturated (`--accent` #A5A6FF in dark).
- Coloured themes switch the tab bar and toasts to neutral grey in dark mode (`--nav-*`), with only the active item in colour.

**Contrast.**
- **WCAG 2.2 AA is the floor:**
  - body text 4.5:1;
  - large text (24 px, or 18.7 px bold) 3:1;
  - UI borders, focus rings and meaningful icons 3:1.
- **APCA target** (design to it): body Lc 75+ (90 preferred), other text Lc 60, large/bold Lc 45, placeholder/disabled Lc 30, dividers Lc 15. APCA catches light-on-dark cases where WCAG 2 is too lenient. Check `--muted` in dark mode.
- Existing rule: buttons ≥ 5:1 and soft buttons ≥ 5.2:1 in every theme and mode (that's why Saffron uses #A14B07).

**Money colours** (Indian ledger convention):
- **Green = money in / paid / "you'll get"**; **red = money out / due / "you'll give"**; gold = test or warning.
- Always pair the colour with the word (Due, Paid, Credit, Udhaar) or a sign.
- On light backgrounds use deep shades (`--good` #2D7A4D, `--danger` #B3261E) so text passes 4.5:1.
- Status goes in soft tinted pills; solid colour is only for the single most important figure.

**Dated, don't use:** neumorphism, gradient meshes behind text, full-screen glassmorphism, pure-black dark mode, palettes built in HSL with uneven brightness, CRED-style neon on black (a brand look, not right for a tool).

---

## 5. Elements

**Buttons.**
- Primary: solid ink pill, 48–52 px tall on phones, one per area.
- Secondary: soft or tonal fill (`--surface-2` or `--ink-soft`), or an outline.
- Tertiary: text only.
- Destructive: red only at the confirm step; elsewhere a neutral button with a red label.
- Compact 40 px, small 32 px (keeping a bigger hit area).
- States:
  - pressed: `scale(.97)` and a darker fill;
  - disabled: 40% opacity + `aria-disabled`;
  - loading: spinner inside the button, which keeps its width (`btnBusy()`).
- Icon-only buttons need an `aria-label` and a visible tooltip on desktop.

**Inputs.**
- 44–48 px tall, 16 px text, **label above or a clear chip label; never a placeholder as the only label**.
- Border: 1 px `--fieldline`, turning `--ink` on focus.
- Error: red outline + icon + message below (`.need`).
- Use the right `inputmode` (`decimal`, `tel`, `numeric`) and `enterkeyhint`.
- Money boxes use the `money` class (Indian commas while typing). Number boxes are centred (the existing rule).

**Chips.** 32–36 px tall, 12 px side padding, full radius.
- Selected: filled ink, plus a weight change or check mark. Not colour alone.
- Filters sit in one horizontally scrolling row on phones.

**Segmented controls.**
- 2–5 equal options, 36–40 px tall, raised thumb on a `--surface-2` track.
- More than 5 options: use a sheet or list instead.

**Toasts.**
- One at a time, 2.8–4 s, `role="status"`, with an optional single action (Undo, 5 s bar = `vSnack`).
- **Never the only place important information appears.** An error the user has to act on stays inline.
- Taps pass through toasts (`pointer-events:none`) unless the toast has an action.

**Empty states.**
- Icon or small illustration, one line (8 words or fewer) saying what goes here, and **one primary button** ("Find an item", "Add your first item").
- A search with no results is a different message: "Did you mean…", or a clear-filters option.
- Optionally a "Try a sample bill" link for first-time users.

**Skeletons.**
- Match the real layout with `--surface-2` blocks and a 1.2–1.5 s shimmer.
- Show them only after about 300 ms of waiting. Under reduced motion they're static or slowly pulsing.

**Badges.**
- Counts: at least 18 px, full radius, 11–12 px bold tabular numbers, cap at "99+".
- Status: tinted pill 20–24 px tall (Due, Paid later, Edited, TEST).

**Icons.**
- Inline SVG on a 24 px grid, stroke 2 (1.75 for a lighter look at 24 px), `currentColor`, round caps and joins, in the Lucide style.
- Sizes: 20 inline, 24 for navigation and buttons, 16 only next to small text.
- Outline for inactive, filled for the active tab.
- **One icon style across the app.** Don't mix in emoji as UI icons in new work (old 🔒/⚠ markers may stay).

**Radius scale** (tokens `--r-xs` 6 · `--r-sm` 10 · `--r-md` 14 · `--r` 20 · `--r-xl` 28 · `--r-full` 999).
- 6 (small inner) · 10 (inputs inside cards) · 14 (thumbs, small cards) · 20 (`--r`, cards) · 28 (sheets) · 999 (pills).
- **Nested radii are concentric:** inner radius = outer radius − padding (iOS 26 rule).

**Shadows.**
- Two levels only: cards use `--shadow`; sheets and popovers use `0 8px 24px rgb(0 0 0/.12)`, tinted to the background hue.
- No shadows on tiles inside a sheet, and no shadows in dark mode (use lighter surfaces).

**Glass (`backdrop-filter`).**
- Only on the floating tab bar or toasts: `blur(16–24px) saturate(1.4)` over a background at least 75% opaque.
- Provide a solid fallback with `@supports not (backdrop-filter: blur(1px))` and `@media (prefers-reduced-transparency: reduce)`.
- At most 2 glass elements on screen (blur is costly on budget Android).

---

## 6. Motion

**What to animate.**
- Only `transform` and `opacity` (plus `clip-path` for reveals).
- Never animate `height`, `top` or `box-shadow`. Use `grid-template-rows: 0fr↔1fr` for small folds (already used in Reports), FLIP for moves, and an opacity fade on a pseudo-element for shadows.
- Add `will-change` just before the motion and remove it afterwards.
- Time animations by elapsed time (`performance.now()`). Plan for 60 fps on iPhone and up to 120 on Android.

**Duration and easing table** (exits run at 60–75% of the entry time and use an accelerating curve):

| Interaction | Enter / press | Exit / release | Easing |
|---|---|---|---|
| Press feedback | 80–120 ms to scale .97 (.98–.99 for big cards) | 150–200 ms | `cubic-bezier(.23,1,.32,1)` |
| Toggle / chip / segment | 100–150 ms | same | M3 standard `cubic-bezier(.2,0,0,1)` |
| Menu / popover | 150–200 ms, scale from .95 (never 0), origin at the trigger | 100–150 ms | ease-out in / `cubic-bezier(.3,0,1,1)` out |
| Dialog | 200–250 ms | 150 ms | `cubic-bezier(.05,.7,.1,1)` in / `cubic-bezier(.3,0,.8,.15)` out |
| Bottom sheet | 500 ms | about 300 ms or follow the finger's speed | `cubic-bezier(.32,.72,0,1)` |
| Screen change | 250–350 ms | 200–250 ms | ease-out |
| Toast | 400 ms | 200 ms | ease |
| List insert / remove | 200–300 ms (rows 0fr→1fr + fade + 4–8 px rise) | 150–200 ms | ease-out / ease-in |
| Number roll (`tweenNum`) | 400–800 ms, scaled to the size of the change; skip changes under 2% | — | strong ease-out + tabular-nums |
| Success moment | 300–600 ms, once, never blocking | — | `--spring-pop` |

**Motion tokens to add to `:root`.** Write a `cubic-bezier` line first, then `linear()` on the next line. Older Safari (before 17.2) drops the `linear()` line and keeps the first.
```css
--ease-out: cubic-bezier(.23,1,.32,1);
--ease-std: cubic-bezier(.2,0,0,1);
--ease-emph-in: cubic-bezier(.05,.7,.1,1);
--ease-emph-out: cubic-bezier(.3,0,.8,.15);
--ease-sheet: cubic-bezier(.32,.72,0,1);
/* springs as linear(): M3 standard (no overshoot, 210 ms) */
--spring-std: linear(0, 0.016 3.5%, 0.038 5.5%, 0.074 8%, 0.155 12.5%, 0.44 26%, 0.572 33%, 0.646 37.5%, 0.704 41.5%, 0.804 50%, 0.882 59.5%, 0.939 70.5%, 0.973 82%, 0.995 99.5%, 1);
/* M3 Expressive default (1.5% overshoot, 370 ms): sheets and hero elements */
--spring-expr: linear(0, 0.006 1.5%, 0.021 3%, 0.054 5%, 0.097 7%, 0.19 10.5%, 0.532 22%, 0.623 25.5%, 0.704 29%, 0.764 32%, 0.824 35.5%, 0.873 39%, 0.912 42.5%, 0.95 47%, 0.977 51.5%, 0.997 56.5%, 1.009 62%, 1.015 76%, 1.005 99.5%, 1);
/* pop (9.5% overshoot, 320 ms): badge bump, success tick */
--spring-pop: linear(0, 0.009 1.5%, 0.033 3%, 0.071 4.5%, 0.118 6%, 0.235 9%, 0.525 15.5%, 0.652 18.5%, 0.766 21.5%, 0.848 24%, 0.917 26.5%, 0.973 29%, 1.017 31.5%, 1.055 34.5%, 1.087 39%, 1.094 44.5%, 1.081 50%, 1.021 65%, 1 73.5%, 0.991 86.5%, 0.995 99.5%, 1);
```
Spring reference values:
- M3 standard spatial: damping 0.9, stiffness 700 (fast 1400, slow 300).
- M3 Expressive spatial: 0.8 / 380 (fast 0.6 / 800).
- Apple: `.snappy` bounce about 0.15, `.bouncy` about 0.3, duration 0.5 s.
- Converting: stiffness = (2π / duration)², damping = 1 − bounce.

**Patterns.**
- **Use transitions, not keyframes, for state changes.** A transition reverses from wherever it is when interrupted; a keyframe animation restarts and jumps. Test by tapping fast and on a slow phone.
- **Stagger** 20–50 ms per item, first 6–8 items only, whole group within about 300 ms. Only when something first appears, never on every search keystroke or re-render.
- **Things done hundreds of times a day** (typing in search, + Bill, qty ±) get press feedback only. No entrance animations.
- **Shared element / View Transitions:** `document.startViewTransition()` if present, else change instantly. 250–350 ms. Name only a few elements.
- **Flights** (`flyToBill`): fine because short and once per tap. Under reduced motion, only pulse the badge.
- **Haptics:** Android `navigator.vibrate(10–15)` for a selection tick, 20–30 for a confirm, `[30,60,30]` for an error. iPhone has no Vibration API, so haptics are a bonus and always come with a visual cue.
- **Optimistic UI:** show the change at once, show a quiet "sending…" after about 1 s, and on failure roll back with a toast offering Retry. Never be optimistic about totals the server recalculates.

**Loading.**
- Nothing for the first ~300 ms. Once shown, a loader stays at least 400–600 ms so it doesn't flash.
- Skeletons for content (300 ms to 3 s), a spinner inside the button for actions, a progress bar with text after ~10 s.
- The thin top bar (`#topbar`) is for background sync.

**Reduced motion** (`prefers-reduced-motion: reduce`, already respected; keep it that way):
- **Keep:** fades ≤ 200 ms, colour or outline state changes, focus rings, spinners (slowed down), haptics.
- **Replace:** slides with a cross-fade; remove scale entrances, spring overshoot, parallax and flights (badge pulse instead); number roll jumps to the final value; shimmer becomes static.
- Write motion inside `@media (prefers-reduced-motion: no-preference)`, or set JS durations to 0 while still running completion callbacks. Never a blanket `* { animation: none !important }`.

**Browser support** (keep fallbacks):

| Feature | Chrome / Android | iOS Safari | Fallback |
|---|---|---|---|
| `linear()` | 113 | 17.2 | cubic-bezier line first |
| `@starting-style` | 117 | 17.5 | add the class one frame after insert |
| View Transitions (same page) | 111 | 18.0 | instant change |
| Scroll-driven animation | 115 | 26 | IntersectionObserver |
| `:has()` | 105 | 15.4 | JS class |
| `backdrop-filter` | 76 | `-webkit-` before 18 | solid background |
| `navigator.vibrate` | yes | no | visual cue |

Lottie and Rive add hundreds of KB. In this no-build PWA use CSS, SVG and the Web Animations API only.

---

## 7. Welcome, first run and sign-in

**Evidence:**
- NN/g tested swipe-through tutorials with 70 users: they **didn't help** (task success 91% for readers against 94% for skippers, and readers found the tasks harder).
- Duolingo moved sign-up after the first lesson: about +20% daily active users.
- Monzo redesigned sign-up as one step per screen: 9% → 40% completion.

**For Rate Book** (a shared shop tool where sign-in has to come first):
1. **The sign-in is the welcome screen.** Calm, one task per screen:
   - shop name and logo mark;
   - language tiles **English / हिंदी**, each written in its own script, as the first choice for a new phone;
   - then name, then PIN (numeric keypad, auto-check at the PIN length).
   - No marketing carousel. If slides are ever added: at most 3, Skip on every slide, headline 8 words or fewer, body 20 words or fewer.
2. **The goal is the first real bill within about 60 seconds** (OkCredit/Khatabook model: verify → language → first entry). After the first sign-in, empty screens show one call to action ("Add your first item", "Find an item") and optionally "Try a sample bill" in test mode.
3. **Teach a feature when it first becomes relevant:** a one-time hint at the moment of use, dismissed on first use and never shown again (keep a flag per hint in `ls`). No coach-mark overlays covering the interface.
4. **Permissions** (notifications, microphone, camera, fingerprint):
   - ask only when the feature is used;
   - show a pre-prompt first (one sentence of benefit + **Allow** / **Not now**);
   - "Not now" never triggers the browser dialog;
   - never call `Notification.requestPermission()` on load.
5. **Primary button in the bottom third.** The keyboard opens with the right `inputmode`. Show progress dots only if there are more than 3 steps.
6. **Shop-specific copy:** "Namaste, {name}" greeting, and the shop's name more prominent than "Rate Book" once a phone belongs to a shop.

**Splash and launch.**
- Manifest `background_color` and the `theme-color` meta must match the first painted screen (the lock screen background) exactly, so there's no flash.
- First paint under 1 s on a mid-range Android. No artificial delay.
- A brand moment (if any) is 600–800 ms, **only on first install or cold start, never on resume or unlock**, and only while real loading happens. Best version: the splash mark shrinks into its place on the lock screen over 300–400 ms (`--ease-emph-in`) while the content fades up with a 50–80 ms stagger. Under reduced motion it's static, or a 150 ms fade.

---

## 8. Logo and app icon

**Direction for 2025–26:**
- One bold symbol with one accent colour.
- Geometric lettermarks or simple shapes built on a grid.
- Identities designed to move (LogoLounge 2026: "everything is on the move").
- Gradients only between neighbouring hues (20–40° apart), with a solid white symbol on top.
- No text, photos or fine detail inside icons.

**Ideas for Rate Book:** a lettermark (R, or Devanagari र) or a ledger/price-tag with ₹, in ink on a warm background or white on the accent. It must:
- read at **16 px** (favicon), 29–48 px (home screen, settings) and 512 px;
- still work as a **single colour**, for Android themed icons and the iOS tinted / clear appearances (the system strips the colour and keeps only the shape).

**Files and sizes:**
- `favicon.ico` 32 px (`sizes="32x32"`) and `icon.svg`. The SVG favicon can switch for dark mode with an internal `<style>@media (prefers-color-scheme:dark){…}</style>`.
- `apple-touch-icon.png` **180 × 180**, opaque, about 20 px padding, no rounded corners baked in.
- Manifest icons:
  - 192 and 512 PNG with `"purpose":"any"`;
  - **separate** 192 and 512 PNG with `"purpose":"maskable"`. Never combine them as `"any maskable"`.
  - At least one 512 px icon is required for Chrome's splash screen.
- **Maskable safe zone:** everything important inside a centred circle 80% of the width across (a 410 px circle on 512 px). A square logo can be at most 56% of the width (about 290 px on 512). The background fills the whole square, with no transparency. Test in Chrome DevTools → Application → Manifest → "Show only the minimum safe area", or at maskable.app.
- **Android adaptive icon (if ever wrapped as an app):** 108 dp layers, a 66 dp safe zone, foreground + background + **monochrome** layers.
- **iOS 26 native (if ever):** Icon Composer, a 1024 px square canvas with flat vector layers; the system adds the glass. A home-screen PWA on iPhone uses the flat `apple-touch-icon`.

**Logo animation (for splash or first run):**
- Stroke draw-on: SVG `stroke-dashoffset`, 400–600 ms, then the fill fades in over 150–200 ms (≤ 800 ms total).
- Or a mask reveal with `clip-path`, 300–500 ms.
- Or scale .8 → 1 with `--spring-expr`, 350–500 ms.
- Always end on a still, fully readable frame. Play once. Respect reduced motion.

---

## 9. Patterns from current apps worth reusing

- **Linear:** no tours. Teaches one power feature (the command menu); for Rate Book that's search and the wand. Calm near-monochrome interface with a single accent.
- **Revolut and Monzo:** one input per screen, big headline, button above the keyboard, measure where people drop out and remove steps.
- **Duolingo:** value before account, personality through small moments, not long animations.
- **Khatabook, OkCredit and Vyapar:** first ledger entry within about 60 s, language choice early, green/red money with words, WhatsApp as the default way to share.
- **PhonePe 3.0 (2025):** a cleaner, unified system, with expressive colour only on hero surfaces.
- **iOS 26:**
  - floating capsule tab bar;
  - search at the bottom;
  - concentric radii;
  - glass for controls only;
  - iOS 26.1 added a less transparent ("tinted") option after legibility complaints, so assume people want solid backgrounds.
- **Material 3 Expressive:** spring motion, bolder headings, shape morphs on press. A floating toolbar for page actions; don't stack a toolbar on top of the navigation bar.

---

## 10. Already in place and current (keep it)

- Warm off-white background.
- Ink primary pills with one accent.
- Plus Jakarta + Mukta.
- Floating pill tab bar.
- Bottom search dock with an option to put it at the top.
- Hairlines inside sheets.
- `tabular-nums` and en-IN grouping.
- Rolling numbers in Reports.
- Skeletons and a delayed top bar.
- Five palettes, contrast-checked.
- Auto / Light / Dark appearance.
- Text sizes through `--fz`.
- Reduced motion respected.
- Toasts that let taps pass through.
- `visualViewport` keyboard handling for iPhone.

## 11. Known gaps (do these when touching the area)

- [x] Motion tokens `--ease-out/std/in/spring/sheet` in `:root`; all CSS curves use them (11 Oct 2026). The `linear()` springs in §6 are optional extras.
- [ ] Delay every loader by about 300 ms and keep it up at least 500 ms.
- [ ] Check APCA contrast for `--muted` on `--surface-2` in dark mode, in every palette.
- [x] Devanagari line height 1.5 on `lang="hi"` text and on the body in Hindi (11 Oct 2026).
- [x] Small controls (bill-line ×, stepper ±, "+ Bill" on Prices, card stepper) have a 44 px hit area through `::after` hit-slop (11 Oct 2026).
- [x] Icons: maskable 192/512, monochrome, SVG favicon, one master artwork (11 Oct 2026). Still open: `theme-color` metas per colour scheme (set at runtime by `applyTheme` today).
- [x] Corner scale tokens `--r-xs/sm/md/r/xl/full` (11 Oct 2026).
- [x] Line icons (`IC.*`) instead of emoji (11 Oct 2026).
- [ ] Shadows: ~39 different values; move to `--shadow` / `--shadow-lg` (+ focus rings) as screens are touched.
- [ ] Font sizes: put them on the §3 scale as screens are touched (none under 11 px on screen now).
- [ ] Reports split bar (`.rph-seg`) still animates width.
- [ ] Permission pre-prompts before notifications, microphone and camera.
- [x] EN | हि switch on the lock / sign-in screen, plus the app mark (11 Oct 2026).

---

## 12. Checklist before calling UI work done

1. **Sizes:** 320, 360, 390, 412 px and a laptop (1280). No horizontal scroll and nothing cut to "…" that matters (§1.2).
2. **Text size:** Normal and Largest (1.38). Everything readable, and buttons still reachable.
3. **Language:** English and Hindi. Hindi labels fit and Devanagari isn't clipped.
4. **Appearance:** light and dark, and at least Ink plus one coloured palette.
5. **iPhone:** keyboard behaviour (the `visualViewport` path), 16 px inputs, no `:has()` or newer JS in critical paths. Run `tests/ios.test.js`.
6. **Touch:** targets ≥ 44 px (24 minimum), 8 px apart; primary action in the thumb zone.
7. **Contrast:** text 4.5:1, UI parts 3:1; colour never alone.
8. **Motion:** transform and opacity only, interruptible, reduced-motion path checked, nothing slows repeated actions.
9. **States:** empty, loading (skeleton after ~300 ms), error (inline), offline, a very long name or amount (e.g. ₹17,52,013), test mode.
10. **Screenshots** before and after, sent to the user. Add or update a Playwright test (`tests/*.test.js`) and run `node tests/run-all.js`.

---

## Sources

- **Apple:**
  - HIG on [onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [launching](https://developer.apple.com/design/human-interface-guidelines/launching), [motion](https://developer-mdn.apple.com/design/human-interface-guidelines/foundations/motion) and [reduced motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria);
  - WWDC25 sessions [220](https://developer.apple.com/videos/play/wwdc2025/220) and [284](https://developer.apple.com/videos/play/wwdc2025/284), [WWDC23 springs](https://wwdcnotes.com/notes/wwdc23/10158);
  - iOS 26.1 glass option ([TidBITS](https://tidbits.com/2025/10/21/ios-26-1-to-add-optional-opacity-to-liquid-glass/)).
- **Google:**
  - [Android adaptive icons](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive), [SplashScreen](https://developer.android.com/reference/androidx/core/splashscreen/SplashScreen);
  - [Compose MotionScheme](https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme), `@material/web` 2.5.0 motion tokens, [M3 tone-based surfaces](https://material.io/blog/tone-based-surface-color-m3), [M3 Expressive toolbars](https://9to5google.com/2025/05/18/material-3-expressive-toolbars/);
  - web.dev [maskable icons](https://web.dev/articles/maskable-icon), Lighthouse [splash screen](https://developer.chrome.com/docs/lighthouse/pwa/splash-screen), [`linear()` easing](https://developer.chrome.com/docs/css-ui/css-linear-easing-function), [View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions), [`text-wrap: balance`](https://developer.chrome.com/docs/css-ui/css-text-wrap-balance), [font fallbacks](https://developer.chrome.com/blog/framework-tools-font-fallback).
- **Research:**
  - NN/g on [mobile tutorials](https://www.nngroup.com/articles/mobile-tutorials/), [response times](https://nngroup.com/articles/response-times-3-important-limits) and [empty states](https://nngroup.com/articles/empty-state-interface-design);
  - Hoober, [how people hold phones](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php);
  - [Viget on skeleton screens](https://viget.com/articles/a-bone-to-pick-with-skeleton-screens).
- **Accessibility:** WCAG 2.2 [target size](https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html) and [timing](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html), [APCA](https://github.com/Myndex/apca-introduction).
- **Design systems:** [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette), [Tailwind v4 OKLCH](https://stevekinney.com/courses/tailwind/oklch-colors), [Vercel Geist](https://vercel.com/geist), [Lucide](https://lucide.dev), [Linear redesign](https://linear.app/changelog/2024-03-20-new-linear-ui).
- **Motion:** [Motion springs](https://motion.dev/dom/spring), [Josh Comeau on `linear()`](https://joshwcomeau.com/animation/linear-timing-function), `vaul` 1.1.2 and `sonner` 2.0.8 source.
- **Products:** [Duolingo onboarding](https://goodux.appcues.com/blog/duolingo-user-onboarding), [Monzo sign-up](https://monzo.com/blog/how-we-cut-time-to-sign-up-for-monzo-us-from-17-minutes-to-4-minutes), [Revolut](https://raw.studio/blog/how-revolut-uses-4-onboarding-ux-tactics/), [OkCredit](https://okcredit.in/faq), [PhonePe 2025](https://yourstory.com/2025/04/phonepe-reimagining-financial-empowerment), [Airbnb 2025](https://news.airbnb.com/product-releases/airbnb-2025-summer-release/).
- **Logo and icon trends:** [LogoLounge 2026 trend report](https://thedieline.com/logoloung-releases-its-2026-trend-report-and-everything-is-on-the-move/).

## Overrides (user decisions that differ from the above)

- **Brand accent is Iris, not maroon** (Mayank, 11 Oct 2026: "maroon does not look that good, there should be a fresh colour"). Maroon stays only as an optional theme in Settings.
- **Grey text `--muted` is #5F636B** (was #6E727A, which measured 4.2:1 on grey backgrounds).
