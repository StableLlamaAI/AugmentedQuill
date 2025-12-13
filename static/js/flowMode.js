import { fetchJSON } from './utils.js';
import { UI_STRINGS } from './editorConstants.js';

export class FlowMode {
  /**
   * Manages Flow mode for AI-assisted writing.
   * Provides interactive sentence suggestions to help writers overcome creative blocks
   * by offering two-choice continuations, making the writing process more engaging and efficient.
   * @param {ShellView} shellView - The parent ShellView instance.
   */
  constructor(shellView) {
    this.shellView = shellView;
    this.touchStartX = 0;
  }

  /**
   * Renders the Flow mode UI.
   */
  renderFlowUI() {
    const area = this.shellView.$refs.flowArea || this.shellView.el.querySelector('[data-ref="flowArea"]');
    const startBtn = this.shellView.el.querySelector('[data-action="flow-start"]');
    const stopBtn = this.shellView.el.querySelector('[data-action="flow-stop"]');
    const leftBox = this.shellView.$refs.flowLeft || this.shellView.el.querySelector('[data-ref="flowLeft"]');
    const rightBox = this.shellView.$refs.flowRight || this.shellView.el.querySelector('[data-ref="flowRight"]');
    const hint = this.shellView.$refs.flowHint || this.shellView.el.querySelector('[data-ref="flowHint"]');

    if (area) {
      area.style.display = this.shellView.flowActive ? '' : 'none';
    }
    if (startBtn) startBtn.style.display = this.shellView.flowActive ? 'none' : '';
    if (stopBtn) stopBtn.style.display = this.shellView.flowActive ? '' : 'none';

    const loadingText = this.shellView.flowBusy ? '<div class="aq-spinner"></div>' : '';
    if (leftBox) leftBox.innerHTML = this.shellView.flowLeft || loadingText;
    if (rightBox) rightBox.innerHTML = this.shellView.flowRight || loadingText;
    const disabled = this.shellView.flowBusy || !this.shellView.flowActive;
    ['flow-pick-left','flow-pick-right','flow-discard'].forEach(sel => {
      const btn = this.shellView.el.querySelector(`[data-action="${sel}"]`);
      if (btn) btn.disabled = disabled;
    });

    // Add touch swipe for choices
    if (leftBox && !disabled) {
      leftBox.addEventListener('touchstart', (e) => this._handleTouchStart(e));
      leftBox.addEventListener('touchend', (e) => this._handleTouchEnd(e, 'left'));
    }
    if (rightBox && !disabled) {
      rightBox.addEventListener('touchstart', (e) => this._handleTouchStart(e));
      rightBox.addEventListener('touchend', (e) => this._handleTouchEnd(e, 'right'));
    }
    if (hint) hint.style.opacity = this.shellView.flowBusy ? '0.6' : '1';
  }

  /**
   * Starts Flow mode.
   */
  async handleFlowStart() {
    if (this.shellView.activeId == null) return;
    this.shellView.flowActive = true;
    await this._flowFetchPair();
  }

  /**
   * Stops Flow mode.
   */
  handleFlowStop() {
    this.shellView.flowActive = false;
    this.shellView.flowLeft = '';
    this.shellView.flowRight = '';
  }

  /**
   * Fetches a pair of sentences for Flow mode.
   */
  async _flowFetchPair() {
    if (!this.shellView.flowActive || this.shellView.activeId == null) return;
    this.shellView.flowBusy = true;
    try {
      const payload = { chap_id: this.shellView.activeId, model_name: this.shellView.storyCurrentModel, current_text: this.shellView.content || '' };
      const data = await fetchJSON('/api/story/suggest_pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      this.shellView.flowLeft = data.left || '';
      this.shellView.flowRight = data.right || '';
    } catch (e) {
      this.shellView.flowLeft = '(error)';
      this.shellView.flowRight = '(error)';
    } finally {
      this.shellView.flowBusy = false;
    }
  }

  /**
   * Handles touch start for swipe detection.
   * @param {TouchEvent} e - The touch event.
   */
  _handleTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
  }

  /**
   * Handles touch end for swipe detection.
   * @param {TouchEvent} e - The touch event.
   * @param {string} side - 'left' or 'right'.
   */
  _handleTouchEnd(e, side) {
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - this.touchStartX;
    const threshold = 50; // Minimum swipe distance
    if (Math.abs(deltaX) > threshold) {
      if (side === 'left' && deltaX < 0) {
        // Swipe left on left box: pick left
        this._flowPick('left');
      } else if (side === 'right' && deltaX > 0) {
        // Swipe right on right box: pick right
        this._flowPick('right');
      }
    }
  }

  /**
   * Picks a flow sentence.
   * @param {string} side - 'left' or 'right'.
   */
  _flowPick(side) {
    const sentence = side === 'left' ? this.shellView.flowLeft : this.shellView.flowRight;
    if (sentence) {
      this._flowAppendSentence(sentence);
      this._flowFetchPair(); // Get new pair
    }
  }

  /**
   * Picks a sentence from Flow mode.
   * @param {string} side - 'left' or 'right'.
   */
  async _flowPick(side) {
    if (!this.shellView.flowActive || this.shellView.flowBusy) return;
    const sentence = side === 'left' ? this.shellView.flowLeft : this.shellView.flowRight;
    this._flowAppendSentence(sentence);
    // Immediately fetch next pair to keep flow
    await this._flowFetchPair();
  }

  /**
   * Discards the current pair in Flow mode.
   */
  async _flowDiscard() {
    if (!this.shellView.flowActive || this.shellView.flowBusy) return;
    this.shellView.flowLeft = '';
    this.shellView.flowRight = '';
    await this._flowFetchPair();
  }
}