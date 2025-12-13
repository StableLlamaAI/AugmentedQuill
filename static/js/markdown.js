export class MarkdownRenderer {
  /**
   * Escapes HTML special characters in a string.
   * @param {string} s - The string to escape.
   * @returns {string} The escaped HTML string.
   */
  static escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  /**
   * Converts a subset of Markdown to HTML.
   * Enables rich text display in chat messages without requiring a full Markdown library,
   * keeping the bundle size small while supporting essential formatting for AI responses.
   * Supports: code blocks, inline code, bold, italic, links, blockquotes, headings, unordered lists, paragraphs.
   * @param {string} src - The Markdown source.
   * @returns {string} The HTML output.
   */
  static toHtml(src) {
    let html = this.escapeHtml(src);
    // Code blocks ```
    html = html.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${code}</code></pre>`);
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold and italic (order matters)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Blockquotes
    html = html.replace(/(^|\n)>\s?(.*)(?=\n|$)/g, '$1<blockquote>$2</blockquote>');
    // Simple headings # .. ######
    html = html.replace(/(^|\n)######\s?([^\n]+)/g, '$1<h6>$2</h6>')
               .replace(/(^|\n)#####\s?([^\n]+)/g, '$1<h5>$2</h5>')
               .replace(/(^|\n)####\s?([^\n]+)/g, '$1<h4>$2</h4>')
               .replace(/(^|\n)###\s?([^\n]+)/g, '$1<h3>$2</h3>')
               .replace(/(^|\n)##\s?([^\n]+)/g, '$1<h2>$2</h2>')
               .replace(/(^|\n)#\s?([^\n]+)/g, '$1<h1>$2</h1>');
    // Unordered lists
    html = html.replace(/(?:^|\n)(-\s.+(?:\n-\s.+)*)/g, (m) => {
      const items = m.trim().split(/\n/).map(li => li.replace(/^-\s+/, '')).map(t => `<li>${t}</li>`).join('');
      return `\n<ul>${items}</ul>`;
    });
    // Paragraphs: convert double newlines to <p>
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = `<p>${html}</p>`;
    // Tidy multiple paragraphs
    html = html.replace(/<p><\/p>/g, '');
    return html;
  }
}