# Keyboard Shortcuts & Accessibility

AugmentedQuill is a browser-based application, so your operating system's keyboard conventions (copy/paste, tab-to-focus, arrow keys in text fields) work as expected everywhere. On top of that, a set of application shortcuts and accessibility features are built in. This page documents both, and it is the authoritative reference for what is (and is not yet) covered.

> **Legend:** `Ctrl` = `Ctrl` on Windows/Linux, `Cmd` (`⌘`) on macOS.

---

## Keyboard Shortcuts

### Global (available almost anywhere)

| Shortcut                                               | Action                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl+F` / `Cmd+F`                                     | Open the project-wide **Search and Replace** dialog. In the raw markdown editor, the browser's own in-page find takes over instead. |
| `Ctrl+Z` / `Cmd+Z`                                     | **Undo** the last editor text change.                                                                                               |
| `Ctrl+Y` / `Cmd+Y` (or `Ctrl+Shift+Z` / `Cmd+Shift+Z`) | **Redo** the last undone editor text change.                                                                                        |
| `Tab`                                                  | Move focus through buttons, links, inputs, and dialogs in document order (standard browser behavior).                               |
| `Enter` / `Space`                                      | Activate the focused button, link, or card (standard browser behavior).                                                             |

### Editor & AI Suggestions

These shortcuts apply while writing prose. Full details live in [The Writing Interface](03_writing_interface.md).

| Shortcut                   | Action                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `Ctrl+Enter` / `Cmd+Enter` | Trigger the suggestion pane at the current cursor position.    |
| `←` / `→` Arrow keys       | Cycle through the available continuation options.              |
| `↓` Arrow key              | Request a new set of suggestions (regenerate).                 |
| `↑` Arrow key              | Undo the last accepted suggestion (removes the inserted text). |
| `Escape`                   | Close the suggestion pane without inserting any text.          |

### Annotations & Scenes

| Shortcut                       | Action                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `Ctrl+Shift+A` / `Cmd+Shift+A` | Create an annotation on the currently selected text.                            |
| `Escape`                       | Close an open dialog (annotation dialog, settings, search, etc.).               |
| `Enter` / `Space`              | Activate a focused scene card or chapter/scene tree row (opens it for editing). |
| `Ctrl+Click` / `Shift+Click`   | Multi-select scenes in the narrative / pinboard views.                          |

> In any dialog, `Escape` closes it, `Tab` moves between controls, and `Enter` activates the focused control — the standard, screen-reader-friendly pattern described below.

---

## Accessibility Features

AugmentedQuill is built with accessibility in mind. The following are implemented today:

### Screen-Reader Semantics (ARIA)

- Dialog windows (Settings, Metadata Editor, Search & Replace, Sourcebook, scene editors, and more) use `role="dialog"` with descriptive `aria-label`s.
- Custom widgets announce themselves correctly:
  - `role="button"` on scene cards, chapter/scene tree rows, and other clickable cards.
  - `role="tablist"` / `role="tab"` on tabbed interfaces (e.g., the Diff view).
  - `role="list"` / `role="listitem"` for checkpoints and sourcebook lists.
  - `role="separator"`, `role="group"`, `role="region"`, and `role="presentation"` used where appropriate.
- Live status regions use `aria-live="polite"` so screen readers announce progress and state changes without interrupting (e.g., chat typing indicator, automatic sourcebook selection, metadata status).
- Alerts and toasts use `role="alert"` for important, time-sensitive messages.
- Icons and icon-only buttons carry `aria-label`s with translatable text (never raw English hardcoded in the UI).
- Expandable/collapsible sections (sidebar sections, undo menu, debug logs) expose `aria-expanded` so their state is announced.
- Form fields are associated with visible `<label>` elements (via stable IDs), so screen readers can announce field names.
- Decorative icons and canvas decorations are marked `aria-hidden="true"` so they do not clutter the accessibility tree.

### Keyboard Operability & Focus Management

- **Visible focus indicator:** every keyboard-focusable control shows a clear amber outline when focused via keyboard (`:focus-visible`). Buttons, links, inputs, textareas, selects, and custom `role="button"` elements are all covered.
- **Editor focus ring:** the CodeMirror writing editor suppresses its own outline (it manages its caret), so an explicit `:focus-visible` ring is applied to the editor surface — keyboard users always see where they are.
- **Focus trapping:** every dialog traps keyboard focus while open — `Tab` cycles inside the dialog, `Escape` closes it, and focus returns to the element that opened it afterwards. Stacked dialogs (a dialog opened on top of another) isolate their own `Escape` handling.
- **Keyboard-operable custom controls:** scene cards, chapter/scene tree rows, collapsible sections, and other non-standard widgets expose `tabindex` and respond to `Enter`/`Space`, so nothing requires a mouse.
- **Undo/redo, search, and annotation shortcuts** are global (see above), reducing the need for the mouse during writing flow.

### Motion & Reduced Motion

- The app honours the `prefers-reduced-motion` preference: animations, transitions, and smooth scrolling are effectively disabled for users who request reduced motion (a global `@media (prefers-reduced-motion: reduce)` rule).

### Visual Comfort & Themes

- Light, Mixed, and Dark design modes, plus **Brightness** and **Contrast** sliders in the Appearance popup, let you tune the UI to your eyes and environment. See [Appearance and Display](10_appearance_and_display.md).
- Editor font size and line width are adjustable for comfortable long-session reading.

### Quality Enforcement

- The frontend enforces `jsx-a11y` linting rules (accessible markup, keyboard handlers, label associations) as part of its regular lint checks — accessibility regressions are caught in CI.
- **Automated `axe` audits:** key dialogs and the Machine Settings screen are covered by `axe` scans (`vitest-axe`) that fail the test suite on any accessibility violation. Run them with `npm run test:accessibility`.
- **CSS regression tests:** the global accessibility CSS (reduced-motion block and the editor focus ring) is guarded by unit tests so the rules cannot silently regress.

---

## Known Gaps & Planned Improvements

AugmentedQuill has no official WCAG certification yet. Core flows are covered by ARIA semantics, visible keyboard focus, reduced-motion support, and automated `axe` audits (see above), but the following areas are not fully covered and are tracked as future work:

- **Complex canvas-like views** — the convergence map and pinboard are primarily pointer/mouse driven; full keyboard navigation through them is not guaranteed.
- **Color contrast** — contrast is user-adjustable via the theme and contrast slider, but WCAG AA contrast ratios are not guaranteed across all theme/parameter combinations.
- **Comprehensive shortcut coverage** — not every action has a shortcut yet; the table above is the complete, supported set.
- **Broader `axe` coverage** — the automated `axe` scans currently target key dialogs and Machine Settings; a full-browser sweep (including the main dashboard and canvas views) and a dedicated screen-reader test pipeline (NVDA, VoiceOver, JAWS) are not yet in place.

If accessibility is important to your workflow, use a modern browser with your platform's assistive technology (screen reader, magnifier, high-contrast OS theme). Report any specific barriers as a GitHub issue so they can be prioritized.

---

Browse the full manual from the [table of contents](index.md), or jump to [Troubleshooting & FAQ](13_troubleshooting.md) if you hit a problem.
