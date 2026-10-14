'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { useEffect, useId, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { NAV_HREFS } from '@/lib/i18n';

export function SiteNav() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('navOpen');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('navOpen');
    };
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener('change', closeOnDesktop);
    return () => mq.removeEventListener('change', closeOnDesktop);
  }, []);

  const links = NAV_HREFS.map((link) => ({
    href: link.href,
    label: t.nav[link.key],
  }));

  return (
    <>
      <nav className="siteNavDesktop" aria-label={t.chrome.mainAria}>
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <button
        type="button"
        className="navToggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t.chrome.closeMenu : t.chrome.openMenu}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
      </button>

      {open ? (
        <div className="navDrawer isOpen" id={panelId}>
          <div className="navDrawerBackdrop" onClick={() => setOpen(false)} aria-hidden />
          <nav className="navDrawerPanel" aria-label={t.chrome.mainAria}>
            {links.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
