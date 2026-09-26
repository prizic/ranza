# Ranza Brand Assets & Guidelines

Official brand identity and logo assets for **Ranza**.

## Brand Story & Mark Concept

"Ranza" is Turkish for bunk bed. The official brand mark is drawn as an elegant, continuous single line forming the letter **R** that seamlessly transforms into a contemporary chaise / lounge / bed silhouette.

The logo embodies hospitality, restful living, fluid modern software architecture, and elevated elegance.

---

## Color Palette

| Color                    | Hex       | HSL / RGB            | Usage                                                        |
| ------------------------ | --------- | -------------------- | ------------------------------------------------------------ |
| **Ranza Emerald**        | `#236740` | `hsl(146 49% 27%)`   | Primary mark, accent elements, hero badges, dark backgrounds |
| **Ranza Charcoal Ink**   | `#33363F` | `rgb(51, 54, 63)`    | Wordmark typography, high-contrast headings on light canvas  |
| **Ranza Canvas**         | `#FFFFFF` | `rgb(255, 255, 255)` | Pure white ground                                            |
| **Ranza Inverted White** | `#FFFFFF` | `rgb(255, 255, 255)` | Monochrome mark & wordmark on emerald / dark backgrounds     |

---

## Logo Variants & Lockups

### 1. The Brand Mark (Symbol)

- **Files:** `ranza-mark.svg`, `ranza-mark-transparent.png`
- **Component:** `<BrandMark className="size-5" />`
- **Ratio:** 1:1 square viewBox (`0 0 1150 1150`)
- **Usage:** Sidebar navigation rail, mobile bottom bar, avatar / app icons, favicons, button marks.
- **Behavior:** Uses `currentColor` to effortlessly adapt to light and dark containers.

### 2. Horizontal Lockup

- **Files:** `ranza-logo-horizontal.svg`, `ranza-logo-horizontal-transparent.png`
- **Ratio:** Wide horizontal (~3.6:1, `0 0 1950 540`)
- **Structure:** Emerald continuous line mark on the left + lowercase modern sans-serif wordmark **`ranza`** on the right.
- **Usage:** Website headers, top navigation bars, marketing pages, billing invoices, letterheads.

### 3. Stacked Lockup

- **Files:** `ranza-logo-stacked.svg`, `ranza-logo-stacked-transparent.png`
- **Ratio:** Centered vertical (~1.2:1, `0 0 1170 950`)
- **Structure:** Centered line mark on top + title-case wordmark **`Ranza`** centered beneath.
- **Usage:** Sign-in splash cards, mobile welcome screens, presentation decks, launch screen badges.

---

## Code Usage

The mark is the only component, exported from `@ranza/ui`. It fills with
`currentColor`, so it takes the colour of whatever holds it:

```tsx
import { BrandMark } from "@ranza/ui";

<BrandMark className="size-5" />;
```

The lockups exist only as the SVG and PNG files above; nothing in the
applications draws one yet, and a component comes with the first screen that
does.

---

## Source Files Archived

- `ranza-mark-source.jpg`: Original 2K mark (`Green_line_forming_letter_R_2K_20260925165523.jpg`)
- `ranza-horizontal-source.jpg`: Original 2K horizontal lockup (`Minimalist_Ranza_SaaS_logo_2K_20260925170246.jpg`)
- `ranza-stacked-source.jpg`: Original 2K stacked lockup (`Ranza_logo_design_2K_20260925170249.jpg`)
