-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Safe one-shot for the live SQL editor: drop delivery packets that have already expired.
-- Does not delete unexpired blobs waiting for pickup.
DELETE FROM public.message_blobs WHERE expires_at <= now();
