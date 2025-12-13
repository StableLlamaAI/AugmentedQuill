import { fetchJSON } from './utils.js';
import { UI_STRINGS } from './editorConstants.js';

export class FlowMode {
  /**
   * @param {ShellView} shellView - The parent ShellView instance.
   */
  constructor(shellView) {
    this.shellView = shellView;
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

    const loadingText = this.shellView.flowBusy ? UI_STRINGS.LOADING : '';
    if (leftBox) leftBox.textContent = this.shellView.flowLeft || loadingText;
    if (rightBox) rightBox.textContent = this.shellView.flowRight || loadingText;
    const disabled = this.shellView.flowBusy || !this.shellView.flowActive;
    ['flow-pick-left','flow-pick-right','flow-discard'].forEach(sel => {
      const btn = this.shellView.el.querySelector(`[data-action="${sel}"]`);
      if (btn) btn.disabled = disabled;
    });
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
   * Appends a sentence to content.
   * @param {string} sentence - The sentence to append.
   */
  _flowAppendSentence(sentence) {
    if (!sentence) return;
    const base = this.shellView.content || '';
    let sep = '';
    if (!base) {
      sep = '';
    } else if (/\s$/.test(base)) {
      sep = '';
    } else if (/[\.\!\?]$/.test(base.trim())) {
      sep = ' ';
    } else {
      sep = ' ';
    }
    this.shellView.content = (base + sep + sentence).replace(/\s+$/,' ') ;
    this.shellView.dirty = true;
    this.shellView.chapterRenderer.renderSaveButton();
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