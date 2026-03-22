// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Wraps the packaged Linux executable so direct AppImage launches always disable the Chromium SUID sandbox.
 */

const fs = require('fs/promises');
const path = require('path');

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const executableName = context.packager.executableName;
  const appOutDir = context.appOutDir;
  const executablePath = path.join(appOutDir, executableName);
  const realExecutablePath = path.join(appOutDir, `${executableName}-bin`);

  if (!(await fileExists(executablePath))) {
    throw new Error(`Expected packaged executable at ${executablePath}`);
  }

  if (!(await fileExists(realExecutablePath))) {
    await fs.rename(executablePath, realExecutablePath);
  } else {
    await fs.rm(executablePath, { force: true });
  }

  const wrapperScript = `#!/bin/sh
export ELECTRON_DISABLE_SANDBOX=1
exec "$(dirname "$0")/${executableName}-bin" --no-sandbox --disable-setuid-sandbox --disable-gpu-sandbox "$@"
`;

  await fs.writeFile(executablePath, wrapperScript, { mode: 0o755 });
  await fs.chmod(executablePath, 0o755);
};
