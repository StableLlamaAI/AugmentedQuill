// AugmentedQuill frontend script bundle
// Initializes core application components and manages global event handling.
// This centralizes component lifecycle to ensure consistent UI state across HTMX page updates,
// preventing memory leaks and maintaining reactivity in a single-page application context.

import { ModelsEditor } from './settings.js';
import { ShellView } from './editor.js';
import { registry } from './components/component.js';
import { ChatView } from './chat.js';

// Global Variables
let isSidebarOpen = false;
let isChatOpen = true;

// ========================================
// Application State
// ========================================

// Global app object to provide access to main components across the application.
// This enables cross-component communication and state sharing without tight coupling.
window.app = {
  shellView: null,
  modelsEditor: null,
  chatView: null,
  registry
};

// Handle input changes
document.addEventListener('input', function (e) {
  const target = e.target;
  if (target.id === 'brightness-slider') {
    const value = target.value;
    document.getElementById('brightness-value').textContent = value + '%';
    // Apply brightness
    const textarea = document.querySelector('[data-ref="rawEditor"]');
    if (textarea) {
      textarea.style.filter = `brightness(${value}%)`;
    }
  } else if (target.id === 'contrast-slider') {
    const value = target.value;
    document.getElementById('contrast-value').textContent = value + '%';
    const textarea = document.querySelector('[data-ref="rawEditor"]');
    if (textarea) {
      textarea.style.filter = `contrast(${value}%)`;
    }
  } else if (target.id === 'font-size-slider') {
    const value = target.value;
    document.getElementById('font-size-value').textContent = value + 'px';
    const textarea = document.querySelector('[data-ref="rawEditor"]');
    if (textarea) {
      textarea.style.fontSize = `${value}px`;
    }
  } else if (target.id === 'line-width-slider') {
    const value = target.value;
    document.getElementById('line-width-value').textContent = value + 'ch';
    const textarea = document.querySelector('[data-ref="rawEditor"]');
    if (textarea) {
      textarea.style.maxWidth = `${value}ch`;
    }
  }
});

// Handle global actions
document.addEventListener('click', function (e) {
  const action = e.target.closest('[data-action]');
  if (!action) return;

  const actionName = action.getAttribute('data-action');

  switch (actionName) {
    case 'toggle-sidebar':
      toggleSidebar();
      break;
    case 'toggle-chat':
      toggleChat();
      break;
    case 'toggle-appearance':
      toggleAppearance();
      break;
    case 'close-appearance':
      closeAppearance();
      break;
    case 'open-settings':
      openSettings();
      break;
    case 'close-settings':
      closeSettings();
      break;
    case 'save':
      if (window.app.shellView) window.app.shellView.save();
      break;
    case 'undo':
      if (window.app.shellView) window.app.shellView.undo();
      break;
    case 'redo':
      if (window.app.shellView) window.app.shellView.redo();
      break;
    case 'create-chapter':
      if (window.app.shellView) window.app.shellView.createChapter();
      break;
    case 'update-summary':
      if (window.app.shellView) window.app.shellView.updateSummary();
      break;
    case 'select-chapter':
      if (window.app.shellView) {
        const chapterId = action.getAttribute('data-chapter-id');
        window.app.shellView.chapterManager.openChapter(chapterId);
      }
      break;
    case 'delete-chapter':
      if (window.app.shellView) {
        const chapterId = action.getAttribute('data-chapter-id');
        window.app.shellView.chapterManager.deleteChapter(chapterId);
      }
      break;
  }
});

// Sidebar toggle
function toggleSidebar() {
  isSidebarOpen = !isSidebarOpen;
  updateSidebarClass();
}

function updateSidebarClass() {
  const sidebar = document.getElementById('sidebar');
  if (isSidebarOpen) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
  } else {
    sidebar.classList.remove('translate-x-0');
    sidebar.classList.add('-translate-x-full');
  }
  const overlay = document.getElementById('sidebar-overlay');
  if (isSidebarOpen) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// Chat toggle
function toggleChat() {
  isChatOpen = !isChatOpen;
  updateChatClass();
  updateChatIcon();
}

function updateChatClass() {
  const chatPanel = document.getElementById('chat-panel');
  if (isChatOpen) {
    chatPanel.classList.remove('translate-x-full');
    chatPanel.classList.add('translate-x-0');
  } else {
    chatPanel.classList.remove('translate-x-0');
    chatPanel.classList.add('translate-x-full');
  }
}

function updateChatIcon() {
  const closeIcon = document.querySelector('.chat-icon-close');
  const openIcon = document.querySelector('.chat-icon-open');
  if (isChatOpen) {
    closeIcon.classList.remove('hidden');
    openIcon.classList.add('hidden');
  } else {
    closeIcon.classList.add('hidden');
    openIcon.classList.remove('hidden');
  }
}

// Appearance panel toggle
function toggleAppearance() {
  const panel = document.getElementById('appearance-panel');
  panel.classList.toggle('hidden');
}

function closeAppearance() {
  const panel = document.getElementById('appearance-panel');
  panel.classList.add('hidden');
}

// Settings dialog
function openSettings() {
  const dialog = document.getElementById('settings-dialog');
  dialog.classList.remove('hidden');
}

function closeSettings() {
  const dialog = document.getElementById('settings-dialog');
  dialog.classList.add('hidden');
}

/**
 * Initialize all components on the page
 * Scans the DOM for component markers and instantiates corresponding classes.
 * This ensures that components are only created when their UI elements exist,
 * supporting conditional rendering and dynamic content loading.
 */
function initComponents() {
  // Initialize shell view (chapter editor) if element exists
  const shellElement = document.querySelector('[data-component="shell-view"]');
  if (shellElement && !window.app.shellView) {
    window.app.shellView = new ShellView(shellElement);
    registry.register('shellView', window.app.shellView);
    window.app.shellView.init();
  }

  // Initialize settings editor if element exists
  const settingsElement = document.querySelector('[data-component="models-editor"]');
  if (settingsElement && !window.app.modelsEditor) {
    window.app.modelsEditor = new ModelsEditor(settingsElement);
    registry.register('modelsEditor', window.app.modelsEditor);
    window.app.modelsEditor.init();
  }

  // Initialize chat view if element exists
  const chatElement = document.querySelector('[data-component="chat-view"]');
  if (chatElement && !window.app.chatView) {
    window.app.chatView = new ChatView(chatElement);
    registry.register('chatView', window.app.chatView);
    window.app.chatView.init();
  }
}

// ========================================
// DOM Event Listeners
// ========================================

// Initialize components when DOM is ready
// Ensures components are set up after the page loads, preventing initialization on incomplete DOM.
document.addEventListener('DOMContentLoaded', function() {
  // Footer year updater
  const yearElement = document.getElementById('aq-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  // Initialize all components
  initComponents();

  // Update initial classes
  updateSidebarClass();
  updateChatClass();
  updateChatIcon();
});

// Re-initialize components on HTMX content swaps
// HTMX allows dynamic content loading without full page reloads; this re-scans for new components
// to maintain reactivity and prevent stale component references.
document.addEventListener('htmx:afterSwap', function (e) {
  try {
    const target = e.detail?.target || e.target;
    if (target) {
      // Re-scan for new components in swapped content
      initComponents();

      // If we swapped content into the modal, show it
      const modal = document.getElementById('aq-modal');
      if (modal && target.id === 'modal-content') {
        modal.removeAttribute('hidden');
        modal.classList.add('is-open');
      }
    }
  } catch (err) {
    console.error('Failed to reinitialize components after HTMX swap:', err);
  }
});

// Clean up components before content is swapped out
// Prevents memory leaks by destroying components when their DOM elements are about to be replaced,
// ensuring event listeners and reactive bindings are properly removed.
document.addEventListener('htmx:beforeSwap', function (e) {
  try {
    const target = e.detail?.target || e.target;
    if (target) {
      // Clean up any components in the target
      ['shellView', 'modelsEditor', 'chatView'].forEach(name => {
        const component = window.app[name];
        if (component && target.contains(component.el)) {
          component.destroy();
          window.app[name] = null;
          registry.components.delete(name);
        }
      });
    }
  } catch (err) {
    console.error('Failed to clean up components before HTMX swap:', err);
  }
});

// ========================================
// Modal Controls (Settings)
// ========================================

// Close modal and clean up associated components
// Ensures modal state is reset and components are destroyed to free resources,
// preventing interference with future modal openings.
function closeModal() {
  const modal = document.getElementById('aq-modal');
  const panel = document.getElementById('modal-content');
  if (!modal || !panel) return;
  try {
    // Destroy components inside the modal content
    ['modelsEditor'].forEach(name => {
      const component = window.app[name];
      if (component && panel.contains(component.el)) {
        component.destroy();
        window.app[name] = null;
        registry.components.delete(name);
      }
    });
  } catch (err) {
    console.warn('Modal cleanup failed:', err);
  }
  panel.innerHTML = '';
  modal.setAttribute('hidden', '');
  modal.classList.remove('is-open');
}

// Close on backdrop click and explicit close buttons
// Provides multiple ways for users to dismiss the modal, improving UX accessibility.
document.addEventListener('click', function (e) {
  const modal = document.getElementById('aq-modal');
  if (!modal || modal.hasAttribute('hidden')) return;
  const target = e.target;
  if (target.matches('.aq-modal-backdrop') || target.matches('[data-action="modal-close"]')) {
    e.preventDefault();
    closeModal();
  }
});

// Close on Escape
// Standard keyboard shortcut for modal dismissal, following web accessibility guidelines.
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('aq-modal');
    if (modal && !modal.hasAttribute('hidden')) {
      e.preventDefault();
      closeModal();
    }
  }
});

// Expose for debugging if needed
window.aqCloseModal = closeModal;
