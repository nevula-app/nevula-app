// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const INTRO_GIF = require('../../assets/nevula-intro.gif');
const INTRO_FINAL_FRAME = require('../../assets/nevula-intro-final.png');

/** Source is landscape (960×450). Keep full logo visible — never crop. */
const SOURCE_W = 960;
const SOURCE_H = 450;
const { width: SCREEN_W } = Dimensions.get('window');
/** Fit full width so NEVULA stays whole; black letterbox merges with screen black. */
const FRAME_W = SCREEN_W;
const FRAME_H = FRAME_W * (SOURCE_H / SOURCE_W);

/** Opener: max 2s, then soft exit (GIF itself is longer). */
const PLAY_MS = 2000;
const FINAL_COVER_MS = 1750;
const FADE_OUT_MS = 280;
const BLACK_HOLD_MS = 80;
/** Source GIF starts with ~3 pure-white frames (~130ms) — black lid covers them. */
const WHITE_LEAD_MS = 180;

type Props = {
  onFinished: () => void;
};

export default function NevulaIntro({ onFinished }: Props) {
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const finalFrameOpacity = useRef(new Animated.Value(0)).current;
  const onFinishedRef = useRef(onFinished);
  const [assetsReady, setAssetsReady] = useState(false);
  const [lidOn, setLidOn] = useState(true);
  const gifOk = useRef(false);
  const finalOk = useRef(false);
  onFinishedRef.current = onFinished;

  const markReady = () => {
    if (gifOk.current && finalOk.current) setAssetsReady(true);
  };

  useEffect(() => {
    const fallback = setTimeout(() => {
      gifOk.current = true;
      finalOk.current = true;
      setAssetsReady(true);
    }, 600);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    if (!assetsReady) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onFinishedRef.current();
    };

    const lift = setTimeout(() => setLidOn(false), WHITE_LEAD_MS);
    const cover = setTimeout(() => finalFrameOpacity.setValue(1), FINAL_COVER_MS);
    const fade = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setTimeout(finish, BLACK_HOLD_MS);
      });
    }, PLAY_MS);
    const fallback = setTimeout(finish, PLAY_MS + FADE_OUT_MS + BLACK_HOLD_MS + 300);

    return () => {
      clearTimeout(lift);
      clearTimeout(cover);
      clearTimeout(fade);
      clearTimeout(fallback);
      screenOpacity.stopAnimation();
    };
  }, [assetsReady, finalFrameOpacity, screenOpacity]);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar style="light" backgroundColor="#000000" translucent={false} />
      <View style={styles.stage}>
        <Image
          source={INTRO_GIF}
          style={styles.frame}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => {
            gifOk.current = true;
            markReady();
          }}
          onError={() => {
            gifOk.current = true;
            markReady();
          }}
        />
        <Animated.Image
          source={INTRO_FINAL_FRAME}
          style={[styles.frame, styles.finalFrame, { opacity: finalFrameOpacity }]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => {
            finalOk.current = true;
            markReady();
          }}
          onError={() => {
            finalOk.current = true;
            markReady();
          }}
        />
        {lidOn ? <View style={styles.lid} pointerEvents="none" /> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: FRAME_W,
    height: FRAME_H,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
  },
  finalFrame: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  lid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 5,
  },
});
