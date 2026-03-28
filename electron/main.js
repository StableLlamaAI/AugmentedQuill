// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the main unit so this responsibility stays isolated, testable, and easy to evolve.
 */

const { spawn } = require('child_process');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

function configureLinuxRuntime() {
  const isLinux = process.platform === 'linux';
  const isAppImage = Boolean(process.env.APPIMAGE);
  const isHeadlessSession = !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

  if (!isLinux) {
    return;
  }

  // AppImage mounts chrome-sandbox without the root ownership required by Chromium.
  // Force the safer non-SUID path so packaged builds start reliably for end users.
  if (isAppImage || process.env.CHROME_DEVEL_SANDBOX || isHeadlessSession) {
    process.env.ELECTRON_DISABLE_SANDBOX = '1';
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-setuid-sandbox');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }
}

configureLinuxRuntime();

let mainWindow;
let backendProcess;

function isExecutableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveBackendPath(executableName) {
  const developmentPath = path.join(__dirname, '..', 'dist', 'run_app', executableName);

  if (!app.isPackaged) {
    return developmentPath;
  }

  const packagedCandidates = [
    path.join(process.resourcesPath, 'backend', 'run_app', executableName),
    path.join(process.resourcesPath, 'backend', executableName),
  ];

  return packagedCandidates.find(isExecutableFile) || packagedCandidates[0];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../static/images/logo_2048.png'),
  });

  // Wait for the backend to be ready before loading the URL
  const checkBackend = setInterval(() => {
    http
      .get('http://127.0.0.1:8000', (res) => {
        if (
          res.statusCode === 200 ||
          res.statusCode === 307 ||
          res.statusCode === 308
        ) {
          clearInterval(checkBackend);
          mainWindow.loadURL('http://127.0.0.1:8000');
        }
      })
      .on('error', () => {
        // Backend not ready yet
      });
  }, 500);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startBackend() {
  const isWin = process.platform === 'win32';
  const executableName = isWin ? 'run_app.exe' : 'run_app';

  const backendPath = resolveBackendPath(executableName);

  if (!isExecutableFile(backendPath)) {
    const message = `Bundled backend executable not found: ${backendPath}`;
    console.error(message);
    dialog.showErrorBox('Backend startup failed', message);
    app.quit();
    return;
  }

  backendProcess = spawn(backendPath, [], {
    cwd: app.getPath('userData'), // Run in user data dir so data/ is saved there
    env: { ...process.env, AUGQ_USER_DATA_DIR: app.getPath('userData') },
  });

  backendProcess.on('error', (error) => {
    const message = `Failed to start bundled backend at ${backendPath}: ${error.message}`;
    console.error(message);
    dialog.showErrorBox('Backend startup failed', message);
    app.quit();
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });
}

app.on('ready', () => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
