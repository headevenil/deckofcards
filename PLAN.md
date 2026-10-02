# JinxO Deck — implementation plan

A static, offline-capable web page that takes the 200 cards in `final.json`, shuffles them like a real
deck, and lets you flip them one by one from the top. Built for a phone lying flat on the table
between players.

## 1. Interaction model (the physical metaphor)

```
 ┌──────── stage ────────┐      Three places a card can be:
 │                       │        DECK    face-down pile (bottom-left tray)
 │     current card      │        STAGE   the face-up card everyone is playing
 │  (face up, large)     │        DISCARD face-up pile of used cards (bottom-right tray)
 │                       │
 └───────────────────────┘      Actions
 [DECK]   12 / 200   [DISCARD]    Flip    tap deck / tap stage / swipe current card away / → / Space
 [↶ undo] [⟳ rotate] [🔀 shuffle]   Undo    put the last flipped card back on top of the deck (←)
                                  Rotate  spin the current card 180° so the other sentence faces you (R)
                                  Shuffle gather everything, riffle, restart from the top (confirm first)
```

- **Flip** = the current card slides onto the discard pile, then the top card of the deck lifts,
  travels to the stage and turns face-up in the air.
- **End of deck**: the deck slot shows an empty outline ("다 뽑았어요") and a big "다시 섞기" button.
- **First visit**: the deck is shown squared up, then shuffles automatically once.

## 2. Card design (cues from the real JinxO cards)

Colours measured from the 200 snapshots (photo colours brightened to print values):

| Token | Colour | Use |
|---|---|---|
| `--yellow` | `#F6D44E` | top half, with a faint darker halftone-dot pattern |
| `--teal` | `#1E9C80` | thin stripe under the yellow half |
| `--orange` | `#EE7042` | thicker stripe above the magenta half |
| `--magenta` | `#C8166C` | bottom half, with the same dot pattern |
| `--ink` | `#1B1B1B` | text on yellow |
| white | `#FFFFFF` | text on magenta |

Layout of one face:
- Bands as on the real card: yellow ≈ 44% · teal ≈ 3% · orange ≈ 5% · magenta ≈ 48%, rounded
  corners (radius ≈ 5% of the width) and a subtle 1px paper edge.
- `sentences[0]`: centred and upright in the yellow half. `sentences[1]`: centred in the magenta half,
  **rotated 180°**. Only one is readable at a time, and the other faces the player across the table.
- The real cards are long strips (≈ 2.85 : 1). On a phone the card is drawn taller (≈ 4 : 5) so each
  half is big enough to read from across a table; the bands and proportions stay the same.
- Text: bold Korean gothic (Noto Sans KR 800 → Apple SD Gothic Neo fallback), sized to fit:
  start large and shrink in steps until the sentence fits its half in at most 3 lines (word-break: keep-all).
- Back: magenta with the yellow dot pattern, the teal/orange stripes across the middle, and a large
  ring "O" mark. No logo artwork is copied.

## 3. Data & persistence

- `cards.js` (the final card data, committed as-is) sets `window.CARDS = [...]`. A script file
  instead of `fetch` keeps the page working when opened directly as `file://`.
- State lives in `localStorage["jinxo-deck"]`:
  `{ v: 1, dataHash, order: [ids…], pos, rotated, savedAt }`
  - `order` is a shuffled permutation of the card ids; `pos` is how many cards have been flipped.
    The current card is `order[pos-1]`, the discard pile is `order[0 … pos-2]` and the deck is `order[pos …]`.
  - Saved after every action. Every read and write is wrapped in try/catch: if storage is unavailable
    the page still works and simply forgets on reload.
  - `dataHash` is a hash of the card data. If `final.json` changes, the saved order is discarded and
    the deck is shuffled fresh.
- Shuffle: Fisher–Yates with `crypto.getRandomValues` (unbiased), which is the "real" randomness.
  The riffle animation is purely visual.
- **Offline cache**: `sw.js` is a service worker that caches the app shell (cache-first, versioned
  cache name) plus `manifest.webmanifest`, so "Add to Home Screen" gives a full-screen, offline app.
  Service workers only register over http(s); on `file://` this is skipped silently.

## 4. Animation architecture (mobile first)

**Rule 1: animate only `transform` and `opacity`.** These are composited on the GPU and never trigger
layout or paint. No animating `top/left/width`, `box-shadow`, or `filter`.

- **One coordinate system**: every visible card is `position:absolute` at the same base size inside a
  full-screen `#table`. Its place is purely `transform: translate(x,y) scale(s) rotateZ(r) rotateY(f)`.
  Three slot rectangles (deck, stage, discard) are measured once, and again on resize/orientation
  change. A card's pose = { slot, extra offset, rotation, flipped }, which converts to a transform string.
  Moving a card between slots is one transform animation, i.e. the FLIP technique, without ever
  re-parenting the node.
- **Web Animations API** (`el.animate(keyframes, {duration, easing, fill:'forwards'})`) gives
  promise-based sequencing (`await anim.finished`), cancellation, and runs off the main thread for
  transform/opacity. After each animation the final transform is committed to `style` and the
  animation is cancelled, so long sessions don't pile up `fill:forwards` animations.
- **Few DOM nodes**: the deck shows at most 6 back-faces (offset 1.5px each for thickness) and the
  discard pile keeps at most 3 face-up nodes. Older nodes are removed. That's about 10 card nodes
  however big the deck is.
- **Shadows**: each card has a pre-blurred shadow as a `::after` pseudo-element. "Lifting" a card
  animates that layer's opacity/scale, never `box-shadow`.
- **3D on iOS Safari**: `perspective` lives on `#table`; each card is `transform-style:preserve-3d`
  with two faces using `backface-visibility:hidden` (plus `-webkit-`). Rounded corners are clipped
  on the faces, not on the card, because `overflow:hidden` on a preserve-3d element flattens it.
  The back face is pre-rotated `rotateY(180deg)`.
- **No `will-change`**: it freezes the raster scale, so a card growing from the 24% deck size would
  stay blurry. WAAPI transform animations are promoted to compositor layers automatically.

### Choreography (durations tuned for ~60fps on mid-range phones)

| Action | Steps | Total |
|---|---|---|
| **Flip** | (1) current card → discard: slide + small random tilt ±6°, 260ms ease-in. (2) top deck card lifts (shadow up, scale 1.04), 90ms. (3) travels deck → stage while `rotateY 180→0` with a slight `rotateX` tilt peaking mid-flight, 420ms `cubic-bezier(.2,.8,.2,1)`. (4) lands with a 3% overshoot settle, 120ms. Steps 1 and 2 overlap. | ≈ 600ms |
| **Undo** | Exact reverse: stage card flips face-down back onto the deck; previous discard card returns to the stage. | ≈ 550ms |
| **Rotate 180°** | `rotateZ` += 180° on the stage card, spring-like `cubic-bezier(.34,1.4,.64,1)`. | 450ms |
| **Shuffle (riffle)** | (1) stage and discard cards fly back face-down onto the deck, staggered 40ms. (2) **split**: the 6 visible backs separate into left/right halves with a slight inward tilt. (3) **riffle**: cards drop back to the centre alternately L/R with a 45ms stagger and a tiny vertical bounce. (4) repeat 2–3 once more. (5) **square up**: a little scale pulse. Light haptic tick per riffle on Android (`navigator.vibrate(8)`). | ≈ 1.6s |
| **Swipe** | The stage card follows the finger (translate plus rotation proportional to dx, max 12°). Release past 30% of the width or at >0.5 px/ms flings off in that direction to the discard pile, then the next card flips. Otherwise it springs back. | – |

- **Input during animations**: actions go into a queue that holds at most 1 pending action. A tap during a
  flip finishes the current animation immediately (`anim.finish()`), then runs the next one, so fast
  tapping still feels responsive and never desyncs the DOM from the state.
- **`prefers-reduced-motion`**: all choreography becomes 150ms opacity crossfades, and the riffle is
  replaced by a short "섞는 중…" fade.

## 5. Mobile details

- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`. Height uses `100dvh`, and
  safe-area insets (`env(safe-area-inset-*)`) pad the tray and controls.
- Touch: `touch-action:none` on the table (the app handles gestures), `manipulation` on buttons (no
  double-tap zoom delay), `overscroll-behavior:none` (no pull-to-refresh or bounce),
  `-webkit-tap-highlight-color:transparent`, `user-select:none`.
- Pointer Events with `setPointerCapture`, so one code path covers touch, mouse and pen.
- Buttons are at least 48px tall, within thumb reach at the bottom; labels are Korean with icons.
- Theming: the table is dark felt-green-grey by default (cards pop), with the same palette in light
  and dark mode because the cards themselves are fixed print colours.
- `<meta name="theme-color">` and a home-screen manifest (standalone, portrait).
- Wake Lock: `navigator.wakeLock.request('screen')` while the page is visible, so the phone doesn't
  sleep mid-game. Re-acquired on `visibilitychange`, ignored if unsupported.

- Layout: portrait phones stack header / stage / tray / buttons. Landscape and short screens
  (`max-height: 600px`) put the stage on the left and the tray and buttons in a side column. Buttons
  go icon-only through a container query when their row is under 290px.
- Re-layout uses a `ResizeObserver` on the app, and a rebuild that is needed mid-animation is deferred
  until the animation ends. Text is refit whenever a Korean font subset finishes loading.

## 6. Accessibility & keyboard

- The stage card has `aria-live="polite"` with both sentences as text, so screen readers announce each flip.
- Keys: Space/→/Enter flip, ← undo, R rotate, S shuffle. Enter and Space are left alone when a button has focus.
- Visible focus rings on buttons.

## 7. Files

```
site/
  index.html             markup, CSS, JS (single file, no build tooling)
  cards.js               the deck: window.CARDS = [...]
  sw.js                  offline cache
  manifest.webmanifest   home-screen install
  icon.svg               app icon (card back motif)
```

## 8. Verification

1. Load at 375×812 (iPhone) in the browser pane: layout, text fitting on the longest sentences
   (#32, #141, #130), and the 180° bottom sentence.
2. Flip ×5 → reload → the same card is shown, the counter matches, and the discard pile is restored.
3. Undo back to the start, flip past the end (empty-deck state), and shuffle resets.
4. Storage blocked (simulated by throwing in `localStorage`): the app still runs.
5. Reduced motion: check that crossfades are used.
6. Check that every frame animates only transform/opacity, and that the stray node count stays around 10.
