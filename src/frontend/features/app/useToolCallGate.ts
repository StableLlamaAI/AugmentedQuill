// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Manages the tool-call limit dialog state and provides a promise-based
 * gate that pauses chat execution until the user makes a choice.
 */

import { useState } from 'react';

export type ToolCallChoice = 'stop' | 'continue' | 'unlimited';

export type ToolCallLoopDialogState = {
  count: number;
  resolver: (choice: ToolCallChoice) => void;
} | null;

export type UseToolCallGateResult = {
  toolCallLoopDialog: ToolCallLoopDialogState;
  requestToolCallLoopAccess: (count: number) => Promise<ToolCallChoice>;
};

/** Custom React hook that manages tool call gate. */
export function useToolCallGate(): UseToolCallGateResult {
  const [toolCallLoopDialog, setToolCallLoopDialog] =
    useState<ToolCallLoopDialogState>(null);

  const requestToolCallLoopAccess = (count: number): Promise<ToolCallChoice> =>
    new Promise(
      (resolve: (value: ToolCallChoice | PromiseLike<ToolCallChoice>) => void) => {
        setToolCallLoopDialog({
          count,
          resolver: (choice: ToolCallChoice) => {
            setToolCallLoopDialog(null);
            resolve(choice);
          },
        });
      }
    );

  return { toolCallLoopDialog, requestToolCallLoopAccess };
}
