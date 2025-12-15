import { UI_STRINGS } from '../constants/editorConstants.js';

export class ChapterRenderer {
  /**
   * Handles rendering of the chapter list and main view.
   * Manages UI updates for chapter navigation and content display,
   * ensuring the interface reflects the current state of the story project.
   * @param {ShellView} shellView - The parent ShellView instance.
   */
  constructor(shellView) {
    this.shellView = shellView;
  }

  /**
   * Renders the story title.
   */
  renderStoryTitle() {
    const titleInput = this.shellView.el?.querySelector('[data-ref="storyTitleInput"]');
    if (titleInput) {
      titleInput.value = this.shellView.storyTitle || '';
    }
  }

  /**
   * Renders the story summary section.
   */
  renderStorySummary() {
    const summaryInput = this.shellView.el?.querySelector('[data-ref="storySummaryInput"]');
    if (summaryInput) {
      summaryInput.value = this.shellView.storySummary || '';
    }
    const content = this.shellView.el?.querySelector('.aq-story-summary-content');
    if (content) {
      content.style.display = this.shellView.storySummaryExpanded ? 'block' : 'none';
    }
    const tagsSection = this.shellView.el?.querySelector('.aq-story-tags-section');
    if (tagsSection) {
      tagsSection.style.display = this.shellView.storySummaryExpanded ? 'block' : 'none';
    }
    const toggleBtn = this.shellView.el?.querySelector('[data-action="toggle-story-summary"]');
    if (toggleBtn) {
      toggleBtn.textContent = this.shellView.storySummaryExpanded ? '▼' : '▶';
    }
  }

  /**
   * Renders the story tags section.
   */
  renderStoryTags() {
    const tagsInput = this.shellView.el?.querySelector('[data-ref="storyTagsInput"]');
    if (tagsInput) {
      tagsInput.value = this.shellView.storyTags || '';
    }
  }

  /**
   * Renders the chapter list.
   */
  renderChapterList() {
    const list = this.shellView.el?.querySelector('[data-chapter-list]');
    if (!list) return;

    if (this.shellView.chapters.length === 0) {
      list.innerHTML = '<li class="text-stone-500 text-sm">No chapters yet</li>';
      return;
    }

    list.innerHTML = this.shellView.chapters.map(chapter => `
      <li class="flex items-center justify-between p-2 rounded hover:bg-stone-800 cursor-pointer ${chapter.id === this.shellView.activeId ? 'bg-stone-800' : ''}"
          data-chapter-id="${chapter.id}" data-action="select-chapter">
        <span class="text-stone-200 truncate">${this.escapeHtml(chapter.title || 'Untitled')}</span>
        <button class="text-stone-400 hover:text-stone-200 p-1" data-action="delete-chapter" data-chapter-id="${chapter.id}" title="Delete Chapter">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </li>
    `).join('');
    // Refresh refs
    this.shellView._scanRefs();
  }

  /**
   * Renders the main view (empty or chapter).
   */
  renderMainView() {
    const emptyView = this.shellView.el.querySelector('[data-view="empty"]');
    const chapterView = this.shellView.el.querySelector('[data-view="chapter"]');
    if (!emptyView || !chapterView) return;

    const isChapterOpen = this.shellView.activeId !== null;
    emptyView.classList.toggle('hidden', isChapterOpen);
    chapterView.classList.toggle('hidden', !isChapterOpen);

    if (isChapterOpen) {
      const activeIdEl = this.shellView.el.querySelector('[data-active-id]');
      if (activeIdEl) activeIdEl.textContent = this.shellView.activeId;
    }
  }

  /**
   * Renders the dirty state indicator.
   */
  renderDirtyState() {
    const dirtyIndicator = document.querySelector('[data-dirty-indicator]');
    if (dirtyIndicator) {
      dirtyIndicator.style.display = this.shellView.dirty ? 'inline' : 'none';
    }
    try {
      document.body?.setAttribute('data-dirty', this.shellView.dirty ? 'true' : 'false');
    } catch (_) {
      // Ignore DOM errors
    }
    this.renderSaveButton();
  }

  /**
   * Renders the save button state.
   */
  renderSaveButton() {
    const saveBtn = document.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.disabled = !this.shellView.dirty;
      saveBtn.textContent = this.shellView.dirty ? UI_STRINGS.SAVE_DIRTY : UI_STRINGS.SAVE;
    }
  }

  /**
   * Escapes HTML for safe rendering.
   * @param {string} text - The text to escape.
   * @returns {string} The escaped HTML.
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}