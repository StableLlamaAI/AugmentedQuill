import { UI_STRINGS } from '../constants/editorConstants.js';
import { renderTemplate } from '../utils/templateLoader.js';

export class ChapterRenderer {
  /**
   * Handles rendering of the chapter list and main view.
   * Manages UI updates for chapter navigation and content display,
   * ensuring the interface reflects the current state of the story project.
   * @param {ShellView} shellView - The parent ShellView instance.
   */
  constructor(shellView) {
    this.shellView = shellView;
    // Keep footer positioned correctly on resize
    try { window.addEventListener('resize', () => this.renderMainView()); } catch (_) {}
  }

  /**
   * Renders the story title.
   */
  renderStoryTitle() {
    const titleInput = this.shellView.el?.querySelector('[data-ref="storyTitleInput"]');
    if (titleInput) {
      titleInput.value = this.shellView.storyTitle || '';
    }
    const titleDisplay = this.shellView.el?.querySelector('[data-ref="storyTitleDisplay"]');
    if (titleDisplay) {
      titleDisplay.textContent = this.shellView.storyTitle || 'Untitled Story';
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
    const summaryDisplay = this.shellView.el?.querySelector('[data-ref="storySummaryDisplay"]');
    if (summaryDisplay) {
      summaryDisplay.textContent = this.shellView.storySummary || '';
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
    const chips = this.shellView.el?.querySelector('[data-ref="tagChips"]');
    if (chips) {
      const tags = (this.shellView.storyTags || '').split(',').map(t => t.trim()).filter(Boolean);
      if (!tags.length) {
        chips.innerHTML = '<div class="aq-empty">No tags</div>';
      } else {
        chips.innerHTML = '';
        tags.forEach(t => {
          const el = document.createElement('span');
          el.className = 'tag-chip';
          el.textContent = t;
          chips.appendChild(el);
        });
      }
    }
  }

  /**
   * Renders the chapter list.
   */
  async renderChapterList() {
    const list = this.shellView.el?.querySelector('[data-chapter-list]');
    if (!list) return;
    if (this.shellView.chapters.length === 0) {
      const tpl = await renderTemplate('chapter-empty');
      // Set atomically to avoid interleaved renders
      list.innerHTML = tpl;
      try { if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons(); } catch (_) {}
      // Refresh refs
      this.shellView._scanRefs();
      return;
    }

    // Build list HTML first, then set in one atomic update to avoid concurrent render races
    const parts = await Promise.all(this.shellView.chapters.map(async (chapter) => {
      const active = chapter.id === this.shellView.activeId;
      return await renderTemplate('chapter-item', {
        id: chapter.id,
        wrapperClass: active ? 'bg-stone-800 border-indigo-500/50 shadow-sm' : 'bg-transparent border-transparent hover:bg-stone-800',
        titleClass: active ? 'text-indigo-400' : 'text-stone-300',
        title: this.escapeHtml(chapter.title || 'Untitled Chapter'),
        summary: this.escapeHtml(chapter.summary || 'No summary available...')
      });
    }));

    list.innerHTML = parts.join('');
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

    // Show/hide the per-page suggestion footer (rendered inside chapter view)
    try {
      const suggest = this.shellView.el.querySelector('[data-ref="pageSuggest"]');
      if (suggest) {
        const editorExists = !!(this.shellView.getEditorEl());
        const show = isChapterOpen && editorExists;
        suggest.setAttribute('aria-hidden', show ? 'false' : 'true');
        if (!show) {
          const cont = suggest.querySelector('[data-ref="continuationsContainer"]');
          if (cont) cont.classList.add('hidden');
          const list = suggest.querySelector('[data-ref="continuationsList"]');
          if (list) list.innerHTML = '';
        }
      }
    } catch (_) {}
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