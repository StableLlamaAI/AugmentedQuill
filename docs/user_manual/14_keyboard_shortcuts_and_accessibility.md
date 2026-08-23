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

### Screen-Reader Support

- Dialog windows (Settings, Metadata Editor, Search & Replace, Sourcebook, scene editors, and more) announce their purpose to screen readers.
- Clickable custom widgets — scene cards, chapter/scene tree rows, tabbed interfaces (e.g., the Diff view), checkpoints, and sourcebook lists — announce themselves with the correct structure.
- Live areas announce progress and state changes without interrupting (e.g., the chat typing indicator, automatic sourcebook selection, and metadata status).
- Important, time-sensitive messages (alerts and toasts) are announced immediately.
- Icon-only buttons have descriptive, translatable labels (never raw English text).
- Expandable/collapsible sections (sidebar sections, undo menu, debug logs) announce whether they are open or closed.
- Form fields are linked to their visible labels so screen readers can announce field names.
- Decorative icons and canvas decorations are hidden from screen readers so they do not clutter the reading order.

### Keyboard Operability & Focus Management

- **Visible focus indicator:** every keyboard-focusable control shows a clear amber outline when focused via keyboard. Buttons, links, inputs, textareas, selects, and other interactive elements are all covered.
- **Editor focus:** the writing editor deliberately draws **no** focus ring around the prose — its blinking caret is the focus indicator, and the inline chapter title shows a subtle underline when focused. (A ring around the whole page looked like an error state, so it was removed.)
- **Focus trapping:** every dialog traps keyboard focus while open — `Tab` cycles inside the dialog, `Escape` closes it, and focus returns to the element that opened it afterwards. Stacked dialogs (a dialog opened on top of another) isolate their own `Escape` handling.
- **Keyboard-operable custom controls:** scene cards, chapter/scene tree rows, collapsible sections, and other non-standard widgets can be reached and activated with the keyboard (`Tab` to focus, `Enter`/`Space` to activate), so nothing requires a mouse.
- **Undo/redo, search, and annotation shortcuts** are global (see above), reducing the need for the mouse during writing flow.

### Motion & Reduced Motion

- The app honours your system's **Reduce Motion** setting: animations, transitions, and smooth scrolling are effectively disabled for users who request reduced motion.

### Visual Comfort & Themes

- Light, Mixed, and Dark design modes, plus **Brightness** and **Contrast** sliders in the Appearance popup, let you tune the UI to your eyes and environment. See [Appearance and Display](10_appearance_and_display.md).
- Editor font size and line width are adjustable for comfortable long-session reading.

### Quality Enforcement

Accessibility is checked automatically as part of the project's development pipeline: code-quality rules catch inaccessible markup and keyboard-handling issues, automated audits scan key dialogs and the Machine Settings screen for violations, and regression tests guard the global styling rules (reduced-motion support and the editor focus behaviour). These checks run in CI, so regressions are caught before a release.

---

## Known Gaps & Planned Improvements

AugmentedQuill has no official WCAG certification yet. Core flows are covered by screen-reader semantics, visible keyboard focus, reduced-motion support, and automated accessibility audits, but the following areas are not fully covered and are tracked as future work:

- **Complex canvas-like views** — the convergence map and pinboard are primarily pointer/mouse driven; full keyboard navigation through them is not guaranteed.
- **Color contrast** — contrast is user-adjustable via the theme and contrast slider, but WCAG AA contrast ratios are not guaranteed across all theme/parameter combinations.
- **Comprehensive shortcut coverage** — not every action has a shortcut yet; the table above is the complete, supported set.
- **Broader automated coverage** — the automated accessibility scans currently target key dialogs and Machine Settings; a full-browser sweep (including the main dashboard and canvas views) and a dedicated screen-reader test pipeline (NVDA, VoiceOver, JAWS) are not yet in place.

If accessibility is important to your workflow, use a modern browser with your platform's assistive technology (screen reader, magnifier, high-contrast OS theme). Report any specific barriers as a GitHub issue so they can be prioritized.

---

Browse the full manual from the [table of contents](index.md), or jump to [Troubleshooting & FAQ](13_troubleshooting.md) if you hit a problem.
