# Changelog

## [0.9.2] - 2026-05-07

### Added

- Added undo support for writing-model interactions with a new LLM undo tool
- Added improved story-content tools: `read_story_content` now supports reading from the end of a story
- Added a `get_project_overview` default view that shows project notes more clearly

### Changed

- Improved LLM tool integration: `call_writing_llm` now accepts sourcebook entry context, is documented as stateless, and no longer exposes filenames to tools
- Refreshed chat context automatically when the user changes entries that an LLM function call previously looked up
- Improved toolbar responsiveness and undo/redo button styling
- Optimized startup experience and main editor auto-scroll behavior
- Improved Gemma 4 handling when the model is not thinking

### Fixed

- Fixed streaming content error messaging and WRITING stream failure handling
- Fixed diff view and mutation-tag display for multi-modification chat flows
- Fixed LLM replacement behavior and update chapter/story metadata handling
- Fixed stopping chat/LLM generation, including preserving edited text when stopping CHAPTER AI
- Fixed provider API key UI disabling, and removed gating that blocked the Debug button

### Maintenance

- Removed deprecated LLM tools and unneeded internal content payloads
- Cleaned up code, addressed lint warnings, and increased allowed zip package size

## [0.9.1] - 2026-04-27

- fix the build system

## [0.9.0] - 2026-04-27

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
