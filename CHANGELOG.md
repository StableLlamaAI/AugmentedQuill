# Changelog

## [0.9.0] - 2026-xx-xx

### Added

- **Search and Replace**: Full search & replace functionality including title search, relation handling, and conflict highlighting
- **Attachments**: Drag-and-drop file attachments in chat, nice confirmation dialogs
- **Scratchpad Dialog**: Dedicated dialog to show the scratchpad
- **Internationalization (i18n)**: Initial i18n setup with multiple language support
- **Gemma 4 Preset**: New model preset for Gemma 4
- **Provider Config**: Allow tweaking of Provider configuration
- **Paragraph Suggestion Modes**: Different modes for suggesting next paragraphs with regenerate button
- **Undo/Redo**: Undo/redo buttons in metadata and sourcebook editors
- **Diff View Toggle**: GUI option to toggle diff view in editor and dialog titles
- **Screenshots**: First round of documentation screenshots

### Changed

- **Accessibility**: Major accessibility improvements (focus indicators, keyboard navigation, ARIA)
- **UI Style**: Style unification, better resizeable indicators, pointer cursors on interactive elements
- **Diff Display**: Enhanced diff display, show what was changed by the LLM, better whitespace highlighting
- **Typography**: Enforced typographic quotes support in chapter and story content writing
- **Tailwind CSS**: Migrated to Tailwind CSS v4

### Fixed

- Diff view issues (whitespace highlighting, loss during mode switching, project switching)
- Project switch not changing prose
- Scratchpad display on browser reload
- White space handling and display modes
- Image display in editor
- Scroll away errors
- Sourcebook handling with undo/redo
- Story summary generation
- Metadata diff view
- Search/replace dialog and functionality
- React infinite rerender loops in Settings
- Story continuation through chatting
- Chapter requirement for short stories without chapters
- Language settings display
- EDITING tool calling detection
- Gemini 4 tool calling detection
- LLM model selection
- Rename of sourcebook entries

### Performance

- Streaming text content intake and scrolling optimized
- Reduced editor lag
- Optimized main text area handling
- Performance improvements by decoupling React updates
- React separation for sourcebook

## [v0.1.0-alpha] - 2026-03-29

- Initial public relase
