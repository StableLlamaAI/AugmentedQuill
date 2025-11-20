import { fetchJSON, getJSONOrEmpty } from './utils.js';
import { Component } from './component.js';

export class ChatView extends Component {
  constructor(element) {
    const initial = {
      models: [],
      selectedName: '',
      messages: [],
      inputRole: 'user',
      sending: false,
    };
    super(element, initial);
  }

  init() {
    if (!this.el) return;
    this._scanRefs();
    this._bindEvents();
    this.loadModels();
    this.render();
  }

  destroy() {
    super.destroy();
  }

  async loadModels() {
    const machine = await getJSONOrEmpty('/api/machine');
    const openai = (machine && machine.openai) || {};
    const models = Array.isArray(openai.models) ? openai.models : [];
    this.models = models;
    this.selectedName = openai.selected || (models[0]?.name || '');
    this.renderModelSelect();
  }

  _bindEvents() {
    const sel = this.$refs.modelSelect;
    if (sel) {
      sel.addEventListener('change', (e) => {
        this.selectedName = e.target.value;
      });
    }

    const roleBtn = this.$refs.roleButton;
    const roleMenu = this.$refs.roleMenu;
    if (roleBtn && roleMenu) {
      roleBtn.addEventListener('click', () => {
        const open = roleMenu.hasAttribute('hidden') ? false : true;
        if (open) roleMenu.setAttribute('hidden', ''); else roleMenu.removeAttribute('hidden');
        roleBtn.setAttribute('aria-expanded', (!open).toString());
      });
      roleMenu.querySelectorAll('button[data-role]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = btn.getAttribute('data-role');
          if (r) {
            this.inputRole = r;
            roleBtn.textContent = r + ' ▾';
          }
          roleMenu.setAttribute('hidden', '');
          roleBtn.setAttribute('aria-expanded', 'false');
        });
      });
      document.addEventListener('click', (ev) => {
        if (!this.el.contains(ev.target)) return;
        if (!roleMenu.contains(ev.target) && ev.target !== roleBtn) {
          roleMenu.setAttribute('hidden', '');
          roleBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    const sendBtn = this.$refs.send;
    if (sendBtn) sendBtn.addEventListener('click', () => this.send());
    const regenBtn = this.$refs.regenerate;
    if (regenBtn) regenBtn.addEventListener('click', () => this.regenerate());
    const delBtn = this.$refs.deleteLast;
    if (delBtn) delBtn.addEventListener('click', () => this.deleteLast());
  }

  renderModelSelect() {
    const sel = this.$refs.modelSelect;
    if (!sel) return;
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.models.length ? '-- choose --' : '(no models configured)';
    sel.appendChild(placeholder);
    this.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name + (m.remote_model ? ` → ${m.remote_model}` : (m.model ? ` → ${m.model}` : ''));
      if (m.name === this.selectedName) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  render() {
    this.renderMessages();
  }

  renderMessages() {
    const list = this.$refs.chatList;
    if (!list) return;
    list.innerHTML = '';
    if (!this.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'aq-empty';
      empty.textContent = 'No messages';
      list.appendChild(empty);
      return;
    }
    this.messages.forEach((m, idx) => {
      const wrap = document.createElement('div');
      wrap.className = `aq-bubble ${m.role}` + (idx === this.messages.length - 1 ? ' last' : '');
      const header = document.createElement('div');
      header.className = 'aq-bubble-head';
      header.textContent = m.role;
      const content = document.createElement('div');
      content.className = 'aq-bubble-body';
      content.contentEditable = 'true';
      content.spellcheck = true;
      content.innerText = m.content || '';
      content.addEventListener('input', () => {
        m.content = content.innerText;
      });

      const actions = document.createElement('div');
      actions.className = 'aq-bubble-actions';
      if (idx === this.messages.length - 1) {
        const del = document.createElement('button');
        del.className = 'aq-btn aq-btn-sm';
        del.textContent = 'Delete';
        del.addEventListener('click', () => this.deleteLast());
        actions.appendChild(del);
        if (m.role === 'assistant') {
          const regen = document.createElement('button');
          regen.className = 'aq-btn aq-btn-sm';
          regen.textContent = 'Regenerate';
          regen.addEventListener('click', () => this.regenerate());
          actions.appendChild(regen);
        }
      }

      wrap.appendChild(header);
      wrap.appendChild(content);
      if (actions.childElementCount) wrap.appendChild(actions);
      list.appendChild(wrap);
    });
    list.scrollTop = list.scrollHeight;
  }

  async send() {
    if (this.sending) return;
    const ta = this.$refs.input;
    const content = (ta?.value || '').trim();
    if (!content) return;
    const role = this.inputRole || 'user';
    this.messages = [...this.messages, { role, content }];
    if (ta) ta.value = '';
    this.renderMessages();
    await this._queryAssistant();
  }

  deleteLast() {
    if (!this.messages.length) return;
    this.messages = this.messages.slice(0, -1);
    this.renderMessages();
  }

  async regenerate() {
    // Regenerate last assistant bubble by removing it and re-querying
    if (!this.messages.length) return;
    const last = this.messages[this.messages.length - 1];
    if (last.role !== 'assistant') return;
    this.messages = this.messages.slice(0, -1);
    this.renderMessages();
    await this._queryAssistant();
  }

  async _queryAssistant() {
    if (this.sending) return;
    this.sending = true;
    try {
      const body = {
        model_name: this.selectedName || null,
        messages: this.messages.map(m => ({ role: m.role, content: m.content }))
      };
      const resp = await fetchJSON('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (resp && resp.ok && resp.message) {
        this.messages = [...this.messages, { role: resp.message.role || 'assistant', content: resp.message.content || '' }];
        this.renderMessages();
      }
    } catch (e) {
      alert(`Chat error: ${e.message || e}`);
    } finally {
      this.sending = false;
    }
  }
}

// factory used by app.js registry if needed in future
export function chatView() { return new ChatView(document.querySelector('[data-component="chat-view"]')); }
