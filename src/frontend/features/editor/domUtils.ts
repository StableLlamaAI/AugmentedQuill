// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the dom utils unit so this responsibility stays isolated, testable, and easy to evolve.
 */

export const getRangeLength = (range: Range): number => {
  const frag = range.cloneContents();
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_ALL);
  let len = 0;
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      len += node.textContent?.length || 0;
    } else if (node.nodeName === 'BR') {
      if (!(node as HTMLElement).classList?.contains('empty-line-hack')) {
        len += 1;
      }
    }
    node = walker.nextNode();
  }
  return len;
};

export const resolveNodeAndOffset = (
  root: HTMLElement,
  offset: number
): { node: Node; nodeOffset: number } => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let currentOffset = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      const len = currentNode.textContent?.length ?? 0;
      if (currentOffset + len >= offset) {
        return {
          node: currentNode,
          nodeOffset: Math.max(0, offset - currentOffset),
        };
      }
      currentOffset += len;
    } else if (currentNode.nodeName === 'BR') {
      if ((currentNode as HTMLElement).classList?.contains('empty-line-hack')) {
        currentNode = walker.nextNode();
        continue;
      }
      const len = 1;
      if (currentOffset + len >= offset) {
        const parent = currentNode.parentNode;
        if (parent) {
          const index = Array.from(parent.childNodes).indexOf(currentNode as ChildNode);
          return { node: parent, nodeOffset: index + 1 };
        }
      }
      currentOffset += len;
    }
    currentNode = walker.nextNode();
  }

  // If the last thing in the root is the empty line hack, place the caret *before* it,
  // not after it, otherwise the visual cursor will wrap to the invisible hack line.
  let finalNodeOffset = root.childNodes.length;
  if (finalNodeOffset > 0) {
    const lastChild = root.childNodes[finalNodeOffset - 1];
    if ((lastChild as HTMLElement).classList?.contains('empty-line-hack')) {
      finalNodeOffset -= 1;
    }
  }
  return { node: root, nodeOffset: finalNodeOffset };
};
