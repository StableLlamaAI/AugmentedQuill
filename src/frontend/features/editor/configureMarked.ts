// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Configures marked globally with extensions for subscript, superscript,
 * and footnotes so all rendering contexts (Visual mode, MD preview, MarkdownView)
 * stay consistent. Call configureMarked() once before any marked.parse() call.
 * GFM strikethrough (~~text~~) and fenced code blocks are built-in to marked.
 */

// @ts-ignore
import { marked } from 'marked';

type MarkedToken = { id?: string; text: string };

let configured = false;

/** Helper for marked. */
export function configureMarked(): void {
  if (configured) return;
  configured = true;

  // Footnote inline reference: [^label] → <sup class="footnote-ref">…</sup>
  // Must be registered before subscript so [^…] is consumed first.
  const footnoteRefExtension = {
    name: 'footnoteRef',
    level: 'inline' as const,
    /** Helper for the requested value. */
    start(src: string): number {
      return src.indexOf('[^');
    },
    /** Helper for the requested value. */
    tokenizer(src: string): { type: string; raw: string; id: string } | undefined {
      // Match [^label] but NOT [^label]: (that is a definition)
      const match = /^\[\^([^\]\n]+?)\](?!\s*:)/.exec(src);
      if (match) {
        return { type: 'footnoteRef', raw: match[0], id: match[1] };
      }
      return undefined;
    },
    /** Helper for the requested value. */
    renderer(token: MarkedToken): string {
      return `<sup class="footnote-ref" id="fnref-${token.id}"><a href="#fn-${token.id}">[${token.id}]</a></sup>`;
    },
  };

  // Footnote definition block: [^label]: text → styled paragraph
  const footnoteDefExtension = {
    name: 'footnoteDef',
    level: 'block' as const,
    /** Helper for the requested value. */
    start(src: string): number {
      return src.search(/^\[\^/m);
    },
    /** Helper for the requested value. */
    tokenizer(
      src: string
    ): { type: string; raw: string; id: string; text: string } | undefined {
      const match = /^\[\^([^\]\n]+?)\]:\s+([^\n]+)/.exec(src);
      if (match) {
        return { type: 'footnoteDef', raw: match[0], id: match[1], text: match[2] };
      }
      return undefined;
    },
    /** Helper for the requested value. */
    renderer(token: MarkedToken): string {
      return `<p class="footnote-def" id="fn-${token.id}"><sup>[${token.id}]</sup>\u00a0${token.text} <a href="#fnref-${token.id}" class="footnote-backref">\u21a9</a></p>\n`;
    },
  };

  // Subscript: ~text~ → <sub>text</sub>
  // Only matches single ~ (not ~~, which is GFM strikethrough).
  const subscriptExtension = {
    name: 'subscript',
    level: 'inline' as const,
    /** Helper for the requested value. */
    start(src: string): number {
      return src.indexOf('~');
    },
    /** Helper for the requested value. */
    tokenizer(src: string): { type: string; raw: string; text: string } | undefined {
      // Single ~ not preceded/followed by another ~
      const match = /^~(?!~)([^~\n]+?)~(?!~)/.exec(src);
      if (match) {
        return { type: 'subscript', raw: match[0], text: match[1] };
      }
      return undefined;
    },
    /** Helper for the requested value. */
    renderer(token: MarkedToken): string {
      return `<sub>${token.text}</sub>`;
    },
  };

  // Superscript: ^text^ → <sup>text</sup>
  // Must not conflict with footnote refs ([^…]).
  const superscriptExtension = {
    name: 'superscript',
    level: 'inline' as const,
    /** Helper for the requested value. */
    start(src: string): number {
      // Exclude [^ (footnote ref starting with bracket)
      const idx = src.indexOf('^');
      return idx;
    },
    /** Helper for the requested value. */
    tokenizer(src: string): { type: string; raw: string; text: string } | undefined {
      // ^ not preceded by [ (that would be [^…] footnote ref already consumed above)
      const match = /^\^([^^+\n]+?)\^/.exec(src);
      if (match) {
        return { type: 'superscript', raw: match[0], text: match[1] };
      }
      return undefined;
    },
    /** Helper for the requested value. */
    renderer(token: MarkedToken): string {
      return `<sup>${token.text}</sup>`;
    },
  };

  marked.use({
    gfm: true,
    extensions: [
      footnoteRefExtension,
      footnoteDefExtension,
      subscriptExtension,
      superscriptExtension,
    ],
  });
}
