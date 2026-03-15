// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the dom utils.test unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { describe, expect, it, vi } from 'vitest';
import { getRangeLength, resolveNodeAndOffset } from './domUtils';

// Mock DOM
const Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
const NodeFilter = { SHOW_ALL: -1 };
(global as any).Node = Node;
(global as any).NodeFilter = NodeFilter;

const createMockTextNode = (text: string) => ({
  nodeType: Node.TEXT_NODE,
  textContent: text,
  nodeName: '#text',
  childNodes: [],
  parentNode: null as any,
});

const createMockElement = (tag: string, children: any[]) => {
  const el = {
    nodeType: Node.ELEMENT_NODE,
    nodeName: tag.toUpperCase(),
    textContent: '',
    childNodes: children,
    parentNode: null as any,
  };
  children.forEach((c) => (c.parentNode = el));
  return el;
};

// Mock document for TreeWalker
(global as any).document = {
  createTreeWalker: (root: any) => {
    const nodes: any[] = [];
    const traverse = (n: any) => {
      nodes.push(n);
      n.childNodes.forEach(traverse);
    };
    traverse(root);

    let currentIndex = 0;
    return {
      nextNode: () => {
        currentIndex++;
        return currentIndex < nodes.length ? nodes[currentIndex] : null;
      },
    };
  },
};

describe('domUtils', () => {
  it('measures text nodes and BR tags accurately', () => {
    // root: <div>Hello<br>World</div>
    const root = createMockElement('DIV', [
      createMockTextNode('Hello'),
      createMockElement('BR', []),
      createMockTextNode('World'),
    ]);

    // Mock range.cloneContents to return everything except end of world.
    const mockRange = {
      cloneContents: () => {
        return createMockElement('#document-fragment', [
          createMockTextNode('Hello'),
          createMockElement('BR', []),
          createMockTextNode('W'),
        ]);
      },
    } as any;

    expect(getRangeLength(mockRange)).toBe(7); // 'Hello' (5) + '<br>' (1) + 'W' (1)
  });

  it('resolves offset back to nodes accurately', () => {
    const textHello = createMockTextNode('Hello');
    const br = createMockElement('BR', []);
    const textWorld = createMockTextNode('World');
    const root = createMockElement('DIV', [textHello, br, textWorld]);

    const p1 = resolveNodeAndOffset(root as any, 6);
    expect(p1.node).toBe(root);
    expect(p1.nodeOffset).toBe(2);

    const p2 = resolveNodeAndOffset(root as any, 7);
    expect(p2.node).toBe(textWorld);
    expect(p2.nodeOffset).toBe(1);

    const p3 = resolveNodeAndOffset(root as any, 5);
    expect(p3.node).toBe(textHello);
    expect(p3.nodeOffset).toBe(5);
  });
});
