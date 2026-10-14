// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

require('react-native-gesture-handler');
require('react-native-url-polyfill/auto');
require('react-native-quick-base64');
const { install } = require('react-native-quick-crypto');
const { registerRootComponent } = require('expo');

install();

// Background inbox task must be defined before React mounts (SDK 54 compatible modules).
require('./src/lib/messageAlertBackground').defineMessageInboxBackgroundTask();

const AppModule = require('./App');
const App = AppModule.default ?? AppModule;
registerRootComponent(App);
