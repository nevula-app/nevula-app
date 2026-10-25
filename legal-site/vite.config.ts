// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import tailwindcss from '@tailwindcss/postcss';
import { cloudflare } from '@cloudflare/vite-plugin';
import vinext from 'vinext';
import { defineConfig, loadEnv } from 'vite';

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(({ mode }) => {
  // See the root .env.example; local website settings belong in legal-site/.env.local.
  const settings = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const localBindingConfig = {
    name: settings.NEVULA_SITE_WORKER_NAME || 'community-site',
    main: 'vinext/server/fetch-handler',
    d1_databases: [{
      binding: 'DB',
      database_name: settings.NEVULA_SITE_D1_DATABASE_NAME || 'community-db',
      // A placeholder for local development, never the production database ID.
      database_id: settings.NEVULA_SITE_D1_DATABASE_ID || '00000000-0000-0000-0000-000000000000',
    }],
    r2_buckets: settings.NEVULA_SITE_R2_BUCKET_NAME
      ? [{ binding: 'R2', bucket_name: settings.NEVULA_SITE_R2_BUCKET_NAME }]
      : [],
  };

  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
