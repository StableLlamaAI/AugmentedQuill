// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Creates a turndown service configured for the editor's
 * Markdown-WYSIWYG roundtrip, including custom table support.
 */

import TurndownService from 'turndown';

const escapeTableCell = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

const renderTableRow = (cells: Element[]): string => {
  const cellTexts = cells.map((cell) =>
    escapeTableCell((cell.textContent || '').trim())
  );
  return `| ${cellTexts.join(' | ')} |`;
};

const renderTable = (table: Element): string => {
  const headerRows = Array.from(table.querySelectorAll('thead > tr'));
  const bodyRows = Array.from(table.querySelectorAll('tbody > tr'));
  const allRows = Array.from(table.querySelectorAll('tr'));

  const sourceHeaderRows = headerRows.length
    ? headerRows
    : allRows.length
      ? [allRows[0]]
      : [];
  const sourceBodyRows = headerRows.length ? bodyRows : allRows.slice(1);

  if (sourceHeaderRows.length === 0) return '';

  const headers = sourceHeaderRows[0];
  const headerCells = Array.from(headers.querySelectorAll('th,td'));

  const lines = [renderTableRow(headerCells)];
  lines.push(
    renderTableRow(
      headerCells.map(() => ({ textContent: '---' }) as unknown as Element)
    )
  );

  sourceBodyRows.forEach((row) => {
    const rowCells = Array.from(row.querySelectorAll('th,td'));
    lines.push(renderTableRow(rowCells));
  });

  return lines.join('\n') + '\n\n';
};

export function createEditorTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  td.addRule('softBreak', {
    filter: (node: any) =>
      node.nodeName === 'BR' && node.parentNode?.nodeName !== 'PRE',
    replacement: () => '\n',
  });

  td.addRule('tabMarker', {
    filter: (node: any) =>
      node.nodeName === 'SPAN' && node.getAttribute('data-ws-tab') === '1',
    replacement: () => '\t',
  });

  td.addRule('wsNewlineMarker', {
    filter: (node: any) =>
      node.nodeName === 'SPAN' && node.getAttribute('data-ws-nl') === '1',
    replacement: () => '',
  });

  td.addRule('wsMarker', {
    filter: (node: any) =>
      node.nodeName === 'SPAN' && node.getAttribute('data-ws-marker') === '1',
    replacement: () => ' ',
  });

  td.addRule('table', {
    filter: 'table',
    replacement: (content, node) => {
      return renderTable(node as Element);
    },
  });

  // Strikethrough: <del>, <s>, <strike> → ~~text~~
  td.addRule('strikethrough', {
    filter: ['del', 's', 'strike'] as any,
    replacement: (content: string) => `~~${content}~~`,
  });

  // Subscript: <sub> → ~text~
  td.addRule('subscript', {
    filter: 'sub' as any,
    replacement: (content: string) => `~${content}~`,
  });

  // Footnote reference: <sup class="footnote-ref"> → [^N]
  td.addRule('footnoteRef', {
    filter: (node: any) =>
      node.nodeName === 'SUP' &&
      typeof node.className === 'string' &&
      node.className.includes('footnote-ref'),
    replacement: (_content: string, node: any) => {
      const a = node.querySelector ? node.querySelector('a') : null;
      const text = a ? a.textContent || '' : node.textContent || '';
      // text is like "[1]" — extract the inner label
      const id = text.replace(/^\[|\]$/g, '').trim();
      return `[^${id}]`;
    },
  });

  // Footnote definition: <p class="footnote-def"> → [^N]: text
  td.addRule('footnoteDef', {
    filter: (node: any) =>
      node.nodeName === 'P' &&
      typeof node.className === 'string' &&
      node.className.includes('footnote-def'),
    replacement: (_content: string, node: any) => {
      const id = (node.id || '').replace('fn-', '');
      // Get text without the leading "[N] " marker and the ↩ backref
      let text = (node.textContent || '')
        .replace(/^\[\d+\]\s*/, '')
        .replace(/\u21a9$/, '')
        .trim();
      return `\n[^${id}]: ${text}\n`;
    },
  });

  // Superscript: <sup> (without footnote-ref class) → ^text^
  td.addRule('superscript', {
    filter: (node: any) =>
      node.nodeName === 'SUP' &&
      !(typeof node.className === 'string' && node.className.includes('footnote-ref')),
    replacement: (content: string) => `^${content}^`,
  });

  return td;
}
