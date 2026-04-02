// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Configure Handlers for Vite CSS processing (Tailwind + Autoprefixer).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  plugins: [
    tailwindcss({
      base: path.resolve(__dirname),
      config: path.resolve(__dirname, 'tailwind.config.js'),
    }),
    autoprefixer(),
  ],
};
