// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

const { withMainActivity } = require('expo/config-plugins');

const MARKER = 'WindowManager.LayoutParams.FLAG_SECURE';

/**
 * Block screenshots, screen recordings, and the recents thumbnail
 * for the whole app. The calculator launcher alias is the same activity.
 */
module.exports = function withSecureWindow(config) {
  return withMainActivity(config, (mod) => {
    const result = mod.modResults;
    const isObject = result && typeof result === 'object' && typeof result.contents === 'string';
    let src = isObject ? result.contents : result;
    if (typeof src !== 'string' || src.includes(MARKER)) return mod;
    if (!src.includes('import android.view.WindowManager')) {
      src = src.replace(
        'import android.os.Bundle\n',
        'import android.os.Bundle\nimport android.view.WindowManager\n',
      );
    }
    const needle = 'super.onCreate(null)';
    if (!src.includes(needle)) {
      throw new Error('withSecureWindow: MainActivity onCreate anchor missing');
    }
    src = src.replace(
      needle,
      `${needle}\n    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)`,
    );
    if (isObject) mod.modResults.contents = src;
    else mod.modResults = src;
    return mod;
  });
};
