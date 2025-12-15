import { RENDER_MODES } from '../constants/editorConstants.js';

export class ContentEditor {
  /**
   * Manages content editing functionality for the ShellView.
   * Handles switching between raw text, Markdown preview, and WYSIWYG editing modes
   * to provide flexible editing experiences while maintaining content integrity.
   * @param {ShellView} shellView - The parent ShellView instance.
   */
  constructor(shellView) {
    this.shellView = shellView;
  }

  /**
   * Renders the content in the textarea.
   */
  renderContent() {
    const textarea = this.shellView.$refs.rawEditor;
    if (textarea && textarea.value !== this.shellView.content && !this.shellView._suspendInput) {
      this.shellView._suspendInput = true;
      textarea.value = this.shellView.content;
      this.shellView._suspendInput = false;
    }
  }

  /**
   * Renders the mode buttons.
   */
  renderModeButtons() {
    // Remove active from all
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.classList.remove('bg-indigo-600', 'text-white');
      btn.classList.add('text-stone-400', 'hover:text-stone-200');
    });
    // Add active to current
    const activeBtn = document.querySelector(`[data-mode="${this.shellView.renderMode}"]`);
    if (activeBtn) {
      activeBtn.classList.remove('text-stone-400', 'hover:text-stone-200');
      activeBtn.classList.add('bg-indigo-600', 'text-white');
    }
  }

  /**
   * Renders the content width.
   */
  renderContentWidth() {
    const textarea = this.shellView.$refs.rawEditor;
    if (textarea) {
      textarea.style.maxWidth = `${this.shellView.contentWidth}ch`;
    }
  }

  /**
   * Renders the font size.
   */
  renderFontSize() {
    const textarea = this.shellView.$refs.rawEditor;
    if (textarea) {
      textarea.style.fontSize = `${this.shellView.fontSize}px`;
    }
  }

  /**
   * Renders the raw editor toolbar visibility.
   */
  renderRawEditorToolbar() {
    const toolbar = this.shellView.el.querySelector('[data-raw-toolbar]');
    const textarea = this.shellView.el.querySelector('[data-ref="rawEditor"]');
    if (!toolbar || !textarea) return;

    const show = this.shellView.renderMode === RENDER_MODES.RAW;
    toolbar.style.display = show ? 'flex' : 'none';
    textarea.style.display = show ? 'block' : 'none';
  }

  /**
   * Gets the raw editor element.
   * @returns {HTMLElement|null} The raw editor element.
   */
  getRawEl() {
    return this.shellView.renderingManager.getRawEl();
  }

  /**
   * Gets the current editor element (raw or TUI).
   * @returns {HTMLElement|null} The editor element.
   */
  getEditorEl() {
    return this.shellView.renderingManager.getEditorEl();
  }

  /**
   * Switches the render mode.
   * @param {string} mode - The new mode.
   */
  switchRender(mode) {
    this.shellView.renderingManager.switchRender(mode);
  }

  /**
   * Sets editor HTML from content.
   */
  async setEditorHtmlFromContent() {
    return this.shellView.renderingManager.setEditorHtmlFromContent();
  }

  /**
   * Scrolls the editor to the bottom.
   */
  scrollToBottom() {
    const editor = this.getEditorEl();
    if (editor) {
      if (this.shellView.renderMode === RENDER_MODES.RAW) {
        editor.scrollTop = editor.scrollHeight;
      } else if (this.shellView._tuiEl) {
        this.shellView._tuiEl.scrollTop = this.shellView._tuiEl.scrollHeight;
      }
    }
  }
}