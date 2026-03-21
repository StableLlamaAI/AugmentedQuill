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

const escapePipe = (text: string): string => text.replace(/\|/g, '\\|');

const renderTableRow = (cells: Element[]): string => {
  const cellTexts = cells.map((cell) => escapePipe((cell.textContent || '').trim()));
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

  return td;
}
