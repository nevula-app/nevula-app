// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)), 'cloudflare:workers': fileURLToPath(new URL('./tests/workers-env.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['legal-site/tests/**/*.test.ts'], testTimeout: 15000 },
});
