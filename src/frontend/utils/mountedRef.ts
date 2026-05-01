// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines mounted ref lifecycle helpers so mounted-state guards stay StrictMode-safe.
 */

type MountedRef = { current: boolean };

export const setupMountedRefLifecycle = (mountedRef: MountedRef): (() => void) => {
  mountedRef.current = true;
  return (): void => {
    mountedRef.current = false;
  };
};
