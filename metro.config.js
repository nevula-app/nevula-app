// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Use the browser OpenPGP build; the Node ESM build uses import.meta/createRequire.
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

module.exports = config;
