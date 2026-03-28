// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for CollapsibleToolSection open/closed persistence.
 */

// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollapsibleToolSection } from './CollapsibleToolSection';

describe('CollapsibleToolSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps explicit open state when rerendered with defaultExpanded false', () => {
    const contentText = 'thinking details';

    const { rerender } = render(
      <CollapsibleToolSection title="Thinking Process" defaultExpanded={false}>
        <div>{contentText}</div>
      </CollapsibleToolSection>
    );

    expect(screen.queryByText(contentText)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Thinking Process/i }));
    expect(screen.getByText(contentText)).not.toBeNull();

    rerender(
      <CollapsibleToolSection title="Thinking Process" defaultExpanded={false}>
        <div>{contentText}</div>
      </CollapsibleToolSection>
    );

    expect(screen.getByText(contentText)).not.toBeNull();
  });
});
