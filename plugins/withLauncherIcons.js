// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const aliases = [
  {
    $: {
      'android:name': '.MainActivityNevula',
      'android:targetActivity': '.MainActivity',
      'android:enabled': 'true',
      'android:exported': 'true',
      'android:icon': '@mipmap/ic_launcher',
      'android:roundIcon': '@mipmap/ic_launcher_round',
      'android:label': 'NEVULA',
    },
    'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }], category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }] }],
  },
  {
    $: {
      'android:name': '.MainActivityCalculator',
      'android:targetActivity': '.MainActivity',
      'android:enabled': 'false',
      'android:exported': 'true',
      'android:icon': '@drawable/calculator_icon',
      'android:roundIcon': '@drawable/calculator_icon',
      'android:label': 'Calculator',
    },
    'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }], category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }] }],
  },
];

module.exports = function withLauncherIcons(config) {
  config = withAndroidManifest(config, mod => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const activity = application.activity?.find(item => item.$?.['android:name'] === '.MainActivity');
    if (activity) activity['intent-filter'] = (activity['intent-filter'] || []).filter(filter => !filter.category?.some(item => item.$?.['android:name'] === 'android.intent.category.LAUNCHER'));
    application['activity-alias'] = [
      ...(application['activity-alias'] || []).filter(item => !['.MainActivityNevula', '.MainActivityCalculator'].includes(item.$?.['android:name'])),
      ...aliases,
    ];
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const targetDir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable-nodpi');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'assets', 'calculator-icon-inset.png'), path.join(targetDir, 'calculator_icon.png'));
    return mod;
  }]);
};
