// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// NEVULA_PLAY_SIGNING';

/**
 * Local Play releases must use NEVULA_UPLOAD_* (fail closed — never silent debug key).
 * On EAS Build, Expo injects the remote upload keystore; skip the local-env requirement.
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') return mod;
    let source = mod.modResults.contents;

    const releaseGuard = `            def nevulaOnEas = System.getenv("EAS_BUILD") == "true"
            def nevulaReleaseRequested = gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }
            if (nevulaReleaseRequested && !nevulaPlaySigningReady && !nevulaOnEas) {
                throw new GradleException("Play release signing is missing. Set NEVULA_UPLOAD_STORE_FILE, NEVULA_UPLOAD_STORE_PASSWORD, NEVULA_UPLOAD_KEY_ALIAS and NEVULA_UPLOAD_KEY_PASSWORD.")
            }
            if (nevulaPlaySigningReady) {
                signingConfig signingConfigs.release
            }`;

    if (source.includes(MARKER)) {
      // Upgrade any older injected guard that does not know about EAS.
      source = source.replace(
        /def nevulaReleaseRequested = gradle\.startParameter\.taskNames\.any \{ it\.toLowerCase\(\)\.contains\("release"\) \}\s*\n\s*if \(nevulaReleaseRequested && !nevulaPlaySigningReady\) \{\s*\n\s*throw new GradleException\("Play release signing is missing\. Set NEVULA_UPLOAD_STORE_FILE, NEVULA_UPLOAD_STORE_PASSWORD, NEVULA_UPLOAD_KEY_ALIAS and NEVULA_UPLOAD_KEY_PASSWORD\."\)\s*\n\s*\}\s*\n\s*if \(nevulaPlaySigningReady\) \{\s*\n\s*signingConfig signingConfigs\.release\s*\n\s*\}/,
        releaseGuard.trim()
      );
      source = source.replace(
        /if \(!nevulaPlaySigningReady\) \{\s*\n\s*throw new GradleException\("Play release signing is missing\. Set NEVULA_UPLOAD_STORE_FILE, NEVULA_UPLOAD_STORE_PASSWORD, NEVULA_UPLOAD_KEY_ALIAS and NEVULA_UPLOAD_KEY_PASSWORD\."\)\s*\n\s*\}\s*\n\s*signingConfig signingConfigs\.release/,
        releaseGuard.trim()
      );
      mod.modResults.contents = source;
      return mod;
    }

    const signingNeedle = '    signingConfigs {\n        debug {';
    const signingReplacement = `    ${MARKER}\n    def nevulaStoreFile = System.getenv("NEVULA_UPLOAD_STORE_FILE")\n    def nevulaStorePassword = System.getenv("NEVULA_UPLOAD_STORE_PASSWORD")\n    def nevulaKeyAlias = System.getenv("NEVULA_UPLOAD_KEY_ALIAS")\n    def nevulaKeyPassword = System.getenv("NEVULA_UPLOAD_KEY_PASSWORD")\n    def nevulaPlaySigningReady = nevulaStoreFile && nevulaStorePassword && nevulaKeyAlias && nevulaKeyPassword\n\n    signingConfigs {\n        debug {`;
    if (!source.includes(signingNeedle)) {
      throw new Error('NEVULA release signing plugin could not find signingConfigs in android/app/build.gradle.');
    }
    source = source.replace(signingNeedle, signingReplacement);

    const endDebugNeedle = `            keyPassword 'android'\n        }\n    }\n    buildTypes {`;
    const endDebugReplacement = `            keyPassword 'android'\n        }\n        release {\n            if (nevulaPlaySigningReady) {\n                storeFile file(nevulaStoreFile)\n                storePassword nevulaStorePassword\n                keyAlias nevulaKeyAlias\n                keyPassword nevulaKeyPassword\n            }\n        }\n    }\n    buildTypes {`;
    if (!source.includes(endDebugNeedle)) {
      throw new Error('NEVULA release signing plugin could not extend signingConfigs.');
    }
    source = source.replace(endDebugNeedle, endDebugReplacement);

    const releaseNeedle = '            signingConfig signingConfigs.debug';
    const releaseIndex = source.lastIndexOf(releaseNeedle);
    if (releaseIndex < 0) {
      throw new Error('NEVULA release signing plugin could not replace the debug release key.');
    }
    source = source.slice(0, releaseIndex) + releaseGuard + source.slice(releaseIndex + releaseNeedle.length);
    mod.modResults.contents = source;
    return mod;
  });
};
