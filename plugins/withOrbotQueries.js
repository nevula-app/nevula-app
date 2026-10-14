// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Android 11+ package visibility: without these <queries>, Linking.canOpenURL('orbot://')
 * and package launches fail even when Orbot is installed.
 */
function ensureOrbotQueries(androidManifest) {
  const manifest = androidManifest.manifest;
  if (!manifest.queries) manifest.queries = [{}];
  const q = manifest.queries[0];
  if (!q.package) q.package = [];
  if (!q.intent) q.intent = [];

  const packages = new Set(
    (q.package || [])
      .map((p) => p?.$?.['android:name'])
      .filter(Boolean),
  );
  for (const name of ['org.torproject.android', 'org.torproject.android.debug']) {
    if (!packages.has(name)) {
      q.package.push({ $: { 'android:name': name } });
    }
  }

  const hasOrbotScheme = (q.intent || []).some((intent) => {
    const data = intent.data || [];
    return data.some((d) => d?.$?.['android:scheme'] === 'orbot');
  });
  if (!hasOrbotScheme) {
    q.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': 'orbot' } }],
    });
  }

  const hasMainLaunch = (q.intent || []).some((intent) => {
    const actions = intent.action || [];
    return actions.some((a) => a?.$?.['android:name'] === 'android.intent.action.MAIN');
  });
  if (!hasMainLaunch) {
    q.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
    });
  }

  return androidManifest;
}

function withOrbotQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureOrbotQueries(cfg.modResults);
    return cfg;
  });
}

module.exports = withOrbotQueries;
