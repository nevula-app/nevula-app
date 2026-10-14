// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

const ACTION_W = 88;

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pinned: boolean;
  closeSignal?: number;
  scrollLock: (locked: boolean) => void;
  onPress: () => void;
  onTogglePin: () => void;
  onConfirmDelete: () => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  dragging: boolean;
  dragOffsetY: number;
};

/**
 * Swipe right → Delete/Confirm on the LEFT (same side as the swipe underlay).
 * Swipe left → Pin on the RIGHT.
 * Long-press + move → reorder (parent applies live gap).
 */
export default function ChatListSwipeRow({
  children,
  style,
  pinned,
  closeSignal = 0,
  scrollLock,
  onPress,
  onTogglePin,
  onConfirmDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  dragging,
  dragOffsetY,
}: Props) {
  const swipeRef = useRef<Swipeable>(null);
  const [rail, setRail] = useState<'off' | 'delete' | 'deleteConfirm' | 'pin'>('off');
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragOriginY = useRef(0);
  const dragLive = useRef(false);
  const openedRef = useRef(false);

  const clearArm = () => {
    if (armTimer.current) {
      clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  };

  const dismissRail = () => {
    clearArm();
    setRail('off');
  };

  useEffect(() => {
    dismissRail();
    swipeRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  useEffect(() => () => clearArm(), []);

  const armRail = (kind: 'delete' | 'pin') => {
    clearArm();
    swipeRef.current?.close();
    armTimer.current = setTimeout(() => {
      setRail(kind);
    }, 240);
  };

  const leftActions = () => (
    <View style={[styles.underAction, styles.deleteUnder]}>
      <Text style={styles.underTxt}>DEL</Text>
    </View>
  );

  const rightActions = () => (
    <View style={[styles.underAction, styles.pinUnder]}>
      <Text style={styles.underTxt}>📌</Text>
    </View>
  );

  const deleteSide = rail === 'delete' || rail === 'deleteConfirm';

  return (
    <View
      style={[
        styles.wrap,
        dragging && styles.dragging,
        dragging && { transform: [{ translateY: dragOffsetY }], zIndex: 20, elevation: 8 },
        !dragging && dragOffsetY !== 0 && { transform: [{ translateY: dragOffsetY }] },
      ]}
      onTouchMove={(e) => {
        if (!dragLive.current) return;
        onDragMove(e.nativeEvent.pageY - dragOriginY.current);
      }}
      onTouchEnd={(e) => {
        if (!dragLive.current) return;
        dragLive.current = false;
        scrollLock(false);
        onDragEnd(e.nativeEvent.pageY - dragOriginY.current);
      }}
      onTouchCancel={() => {
        if (!dragLive.current) return;
        dragLive.current = false;
        scrollLock(false);
        onDragEnd(0);
      }}
    >
      <Swipeable
        ref={swipeRef}
        friction={2}
        overshootFriction={8}
        leftThreshold={40}
        rightThreshold={40}
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={leftActions}
        renderRightActions={rightActions}
        onSwipeableWillOpen={() => {
          openedRef.current = true;
          scrollLock(true);
        }}
        onSwipeableOpen={(direction) => {
          // direction 'left' = left actions open = user swiped RIGHT → delete
          // direction 'right' = right actions open = user swiped LEFT → pin
          scrollLock(false);
          if (direction === 'left') armRail('delete');
          else armRail('pin');
        }}
        onSwipeableClose={() => {
          openedRef.current = false;
          scrollLock(false);
        }}
        onSwipeableWillClose={() => {
          scrollLock(false);
        }}
      >
        <Pressable
          onPress={() => {
            if (rail !== 'off') {
              dismissRail();
              return;
            }
            if (openedRef.current) {
              swipeRef.current?.close();
              return;
            }
            onPress();
          }}
          onLongPress={(e) => {
            dismissRail();
            swipeRef.current?.close();
            dragOriginY.current = e.nativeEvent.pageY;
            dragLive.current = true;
            scrollLock(true);
            onDragStart();
          }}
          delayLongPress={420}
          style={[
            styles.rowPress,
            style,
            deleteSide && styles.rowPressRailLeft,
            rail === 'pin' && styles.rowPressRailRight,
          ]}
        >
          {children}
        </Pressable>
      </Swipeable>

      {rail !== 'off' ? (
        <View
          style={[styles.rail, deleteSide ? styles.railLeft : styles.railRight]}
          pointerEvents="box-none"
        >
          {rail === 'pin' ? (
            <Pressable
              onPress={() => {
                dismissRail();
                onTogglePin();
              }}
              style={[styles.railBtn, styles.pinBtn]}
            >
              <Text style={styles.railTxt}>{pinned ? 'Unpin 📌' : '📌 Pin'}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                if (rail === 'delete') {
                  setRail('deleteConfirm');
                  return;
                }
                dismissRail();
                onConfirmDelete();
              }}
              style={[styles.railBtn, styles.deleteBtn, rail === 'deleteConfirm' && styles.deleteBtnHot]}
            >
              <Text style={styles.railTxt}>{rail === 'delete' ? 'Delete' : 'Confirm'}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  dragging: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  underAction: {
    width: ACTION_W,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteUnder: { backgroundColor: 'rgba(196, 72, 72, 0.95)' },
  pinUnder: { backgroundColor: 'rgba(78, 163, 255, 0.95)' },
  underTxt: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  rowPress: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowPressRailLeft: { paddingLeft: 90 },
  rowPressRailRight: { paddingRight: 90 },
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  railLeft: { left: 6 },
  railRight: { right: 6 },
  railBtn: {
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteBtn: { backgroundColor: 'rgba(196, 72, 72, 0.95)' },
  deleteBtnHot: { backgroundColor: '#c44848' },
  pinBtn: { backgroundColor: 'rgba(78, 163, 255, 0.95)' },
  railTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
