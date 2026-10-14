// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Dimensions, FlatList, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CameraType, CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { deleteVaultItem, importPhoneMedia, ingestCapture, listVaultItems, revealVaultItem, VaultItem } from '../lib/media';
import BrandMark from '../components/BrandMark';
import OrbotOnionMark from '../components/OrbotOnionMark';
import TopUnreadBadge from '../components/TopUnreadBadge';
import { BRAND_EYEBROW, HomePalette, useDisplayTheme } from '../lib/displayTheme';
import { holdAppLock, clearAppLockHold } from '../lib/appLock';
import { askDevicePermission } from '../lib/devicePermission';
import { androidStatusInset } from '../lib/statusInset';
import { subscribeInAppUnreadSnapshot } from '../lib/inAppUnread';

type Props = { onBack: () => void; onOpenMessages?: () => void };
type Mode = 'photo' | 'video';
const MAX_VIDEO_SEC = 60;

export default function CameraScreen({ onBack, onOpenMessages }: Props) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [mode, setMode] = useState<Mode>('photo');
  const [flash, setFlash] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<'menu' | 'camera' | 'gallery'>('menu');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [openItem, setOpenItem] = useState<VaultItem | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const reload = async () => setItems(await listVaultItems());
  useEffect(() => { reload().catch(() => undefined); }, []);
  useEffect(() => subscribeInAppUnreadSnapshot((snap) => setUnreadCount(snap.count)), []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openItem) { setOpenItem(null); return true; }
      if (tab !== 'menu') { setTab('menu'); return true; }
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [openItem, onBack, tab]);

  useEffect(() => {
    if (!recording) { setElapsed(0); return; }
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.min(MAX_VIDEO_SEC, Math.floor((Date.now() - started) / 1000))), 200);
    return () => clearInterval(tick);
  }, [recording]);

  useEffect(() => {
    if (tab !== 'camera' || cameraPermission?.granted || !cameraPermission) return;
    void askDevicePermission(cameraPermission, requestCameraPermission, 'Camera');
  }, [tab, cameraPermission?.granted]);

  const ensureAccess = async () => {
    const cameraOk = await askDevicePermission(cameraPermission, requestCameraPermission, 'Camera');
    if (!cameraOk) return false;
    if (mode === 'video' && !micPermission?.granted) {
      await askDevicePermission(micPermission, requestMicPermission, 'Microphone');
    }
    return true;
  };

  const takePhoto = async () => {
    if (!ready || busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.8, shutterSound: false, skipProcessing: false, exif: false });
      if (shot?.uri) { await ingestCapture(shot.uri, 'photo'); await reload(); }
    } catch (error: any) {
      Alert.alert('Photo failed', error?.message ?? 'The photo stayed in the private gallery only if capture succeeded.');
    } finally { setBusy(false); }
  };

  const toggleVideo = async () => {
    if (!ready || !cameraRef.current) return;
    if (recording) { cameraRef.current.stopRecording(); return; }
    setRecording(true);
    setBusy(true);
    const started = Date.now();
    try {
      const clip = await cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_SEC });
      const durationMs = Math.min(MAX_VIDEO_SEC * 1000, Date.now() - started);
      if (clip?.uri) { await ingestCapture(clip.uri, 'video', durationMs); await reload(); }
    } catch (error: any) {
      Alert.alert('Video failed', error?.message ?? 'Nothing was saved to the phone gallery.');
    } finally {
      setRecording(false);
      setBusy(false);
    }
  };

  const onShutter = async () => {
    if (!(await ensureAccess())) return;
    if (mode === 'photo') await takePhoto();
    else await toggleVideo();
  };

  const goGalleryBack = () => {
    if (openItem) { setOpenItem(null); return; }
    if (tab !== 'menu') { setTab('menu'); return; }
    onBack();
  };

  const gallerySwipeBack = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-28, 28])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (Math.abs(event.translationX) < 56 && Math.abs(event.velocityX) < 550) return;
          goGalleryBack();
        }),
    [openItem, tab, onBack],
  );

  const importFromPhone = async (source: 'gallery' | 'file') => {
    holdAppLock(40_000);
    try {
      if (source === 'gallery') {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.7,
          allowsEditing: false,
        });
        if (picked.canceled || !picked.assets[0]?.uri) return;
        const asset = picked.assets[0];
        setImporting(true);
        await importPhoneMedia(asset.uri, asset.fileName ?? undefined);
      } else {
        const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (picked.canceled || !picked.assets?.[0]?.uri) return;
        const asset = picked.assets[0];
        setImporting(true);
        await importPhoneMedia(asset.uri, asset.name);
      }
      await reload();
    } catch (error: any) {
      Alert.alert('Import failed', error?.message ?? 'The file was not added to the Gallery.');
    } finally {
      setImporting(false);
      clearAppLockHold();
    }
  };

  const latest = items[0];

  if (!cameraPermission) return <SafeAreaView style={s.container}/>;
  if (tab === 'menu') {
    return (
      <GestureDetector gesture={gallerySwipeBack}>
      <SafeAreaView style={s.container}>
      <Header onBack={onBack} title="Camera" styles={s} unreadCount={unreadCount} onOpenMessages={onOpenMessages}/>
      <Text style={s.menuIntro}>Every capture stays in your private NEVULA Gallery. Location, device and other identifying metadata are removed before encrypted storage.</Text>
      <View style={s.menuCards}>
        <Pressable onPress={() => setTab('camera')} style={({ pressed }) => [s.menuCard, pressed && s.menuCardPressed]}>
          <View style={s.menuGlow}/><View style={s.menuIcon}><View style={s.cameraGlyph}><View style={s.cameraTop}/><View style={s.cameraLens}/></View></View>
          <Text style={s.menuTitle}>Camera</Text><Text style={s.menuCopy}>Take a private photo or record a video.</Text><View style={s.menuBottom}><Text style={s.menuAction}>OPEN CAMERA</Text><Text style={s.menuChevron}>›</Text></View>
        </Pressable>
        <Pressable onPress={() => { reload().catch(() => undefined); setTab('gallery'); }} style={({ pressed }) => [s.menuCard, pressed && s.menuCardPressed]}>
          <View style={s.menuGlow}/>{latest?.kind === 'photo' ? <RevealedImage item={latest} style={s.menuPreview}/> : <View style={s.menuIcon}><Text style={s.galleryMenuIcon}>▦</Text></View>}
          <Text style={s.menuTitle}>Gallery</Text><Text style={s.menuCopy}>{items.length ? `${items.length} private item${items.length === 1 ? '' : 's'} stored` : 'Your private gallery is empty.'}</Text><View style={s.menuBottom}><Text style={s.menuAction}>OPEN GALLERY</Text><Text style={s.menuChevron}>›</Text></View>
        </Pressable>
      </View>
      <Pressable onPress={()=>importFromPhone('gallery')} style={s.addGallery}><Text style={s.addGalleryPlus}>+</Text><View style={s.addGalleryCopy}><Text style={s.addGalleryTitle}>Add from phone gallery</Text><Text style={s.addGalleryText}>Photos and videos are imported without metadata.</Text></View><Text style={s.menuChevron}>{'\u203A'}</Text></Pressable>
      {importing ? (
        <View style={s.importOverlay} pointerEvents="auto">
          <ActivityIndicator color="#4ea3ff" size="large" />
          <Text style={s.importOverlayTxt}>Metadata is stripped</Text>
        </View>
      ) : null}
    </SafeAreaView>
      </GestureDetector>
    );
  }
  if (tab === 'gallery') {
    return (
      <GestureDetector gesture={gallerySwipeBack}>
      <SafeAreaView style={s.container}>
      <Header onBack={() => setTab('menu')} title="Gallery" styles={s} unreadCount={unreadCount} onOpenMessages={onOpenMessages} right={<Pressable onPress={() => Alert.alert('Import into Gallery', 'Metadata is stripped from photos and videos before they enter NEVULA.', [
        { text: 'Photos & videos', onPress: () => importFromPhone('gallery') },
        { text: 'Files', onPress: () => importFromPhone('file') },
        { text: 'Cancel', style: 'cancel' },
      ])} style={s.textBtn}><Text style={s.textBtnTxt}>Import</Text></Pressable>}/>
      <Text style={s.privacy}>Private gallery — metadata stripped</Text>
      <ScrollView contentContainerStyle={s.grid} nestedScrollEnabled>
        {items.length === 0 && <Text style={s.empty}>No private photos or videos yet.</Text>}
        {items.map(item => <Pressable key={item.id} onPress={() => setOpenItem(item)} onLongPress={() => Alert.alert('Delete from Gallery?', 'This stays inside NEVULA only. It was never copied to the phone gallery.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => { await deleteVaultItem(item.id); if (openItem?.id === item.id) setOpenItem(null); reload(); } },
        ])} style={s.tile}>
          {item.kind === 'photo' ? <RevealedImage item={item} style={s.thumb}/> : <View style={s.videoThumb}><Text style={s.play}>{item.kind === 'file' ? '▣' : '▶'}</Text><Text style={s.dur}>{item.kind === 'file' ? (item.originalName ?? 'File') : formatDuration(item.durationMs)}</Text></View>}
        </Pressable>)}
      </ScrollView>
      <Viewer
        item={openItem}
        items={items}
        onClose={() => setOpenItem(null)}
        onDelete={async id => {
          const photoIds = items.filter(x => x.kind === 'photo').map(x => x.id);
          const idx = photoIds.indexOf(id);
          await deleteVaultItem(id);
          const remaining = await listVaultItems();
          setItems(remaining);
          const photos = remaining.filter(x => x.kind === 'photo');
          if (openItem?.kind === 'photo' && photos.length) {
            const nextIdx = Math.min(Math.max(idx, 0), photos.length - 1);
            setOpenItem(photos[nextIdx] ?? null);
          } else {
            setOpenItem(null);
          }
        }}
        styles={s}
      />
      {importing ? (
        <View style={s.importOverlay} pointerEvents="auto">
          <ActivityIndicator color="#4ea3ff" size="large" />
          <Text style={s.importOverlayTxt}>Metadata is stripped</Text>
        </View>
      ) : null}
    </SafeAreaView>
      </GestureDetector>
    );
  }

  return <View style={s.shoot}>
    {cameraPermission.granted ? (
      <CameraView
        ref={cameraRef}
        style={s.preview}
        facing={facing}
        mode={mode === 'photo' ? 'picture' : 'video'}
        flash={flash && mode === 'photo' ? 'on' : 'off'}
        enableTorch={flash && mode === 'video'}
        mute={false}
        onCameraReady={() => setReady(true)}
      />
    ) : (
      <View style={s.denied}><Text style={s.deniedTitle}>Camera access needed</Text><Text style={s.deniedCopy}>Photos and videos stay in the NEVULA Gallery. They are not saved to Honor Gallery or Files.</Text><Pressable onPress={ensureAccess} style={s.allow}><Text style={s.allowTxt}>Allow camera</Text></Pressable></View>
    )}
    <SafeAreaView style={s.overlay} pointerEvents="box-none">
      <View style={s.topBar}>
        <Pressable onPress={() => setTab('menu')} style={s.round}><Text style={s.roundTxt}>{'\u2039'}</Text></Pressable>
        <View style={s.topCopy}><BrandMark style={s.eyebrow} /><Text style={s.lockLabel}>PRIVATE GALLERY</Text></View>
        <TopUnreadBadge count={unreadCount} onPress={onOpenMessages} />
        <Pressable onPress={() => setFlash(value => !value)} style={[s.round, flash && s.roundOn]}><Text style={s.roundTxt}>{flash ? '✦' : '✧'}</Text></Pressable>
        <Pressable disabled={recording} onPress={() => setFacing(value => value === 'back' ? 'front' : 'back')} style={s.round}><Text style={s.roundTxt}>↺</Text></Pressable>
      </View>
      {recording && <View style={s.recPill}><View style={s.recDot}/><Text style={s.recTxt}>{formatClock(elapsed)} / 1:00</Text></View>}
      <View style={s.bottom}>
        <Pressable disabled={recording} onPress={() => setTab('gallery')} style={s.galleryHit}>
          {latest?.kind === 'photo' ? <RevealedImage item={latest} style={s.galleryThumb}/> : <View style={[s.galleryThumb, s.galleryEmpty]}><Text style={s.galleryIcon}>▣</Text></View>}
        </Pressable>
        <Pressable onPress={onShutter} disabled={!cameraPermission.granted || (busy && !recording)} style={[s.shutter, mode === 'video' && s.shutterVideo, recording && s.shutterRec]}>
          <View style={[s.shutterInner, mode === 'video' && s.shutterInnerVideo, recording && s.shutterInnerRec]}/>
        </Pressable>
        <View style={s.modeCol}>
          <Pressable disabled={recording} onPress={() => setMode('photo')}><Text style={[s.mode, mode === 'photo' && s.modeOn]}>PHOTO</Text></Pressable>
          <Pressable disabled={recording} onPress={() => setMode('video')}><Text style={[s.mode, mode === 'video' && s.modeOn]}>VIDEO</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  </View>;
}

function useRevealedUri(item: VaultItem | null) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!item) {
      setUri(null);
      return;
    }
    let cancelled = false;
    revealVaultItem(item)
      .then(next => { if (!cancelled) setUri(next); })
      .catch(() => { if (!cancelled) setUri(null); });
    return () => { cancelled = true; };
  }, [item?.id]);
  return uri;
}

function RevealedImage({ item, style }: { item: VaultItem; style: object }) {
  const uri = useRevealedUri(item);
  if (!uri) return <View style={style} />;
  return <Image source={{ uri }} style={style} />;
}

function RevealedPhoto({ item, styles: s }: { item: VaultItem; styles: ReturnType<typeof makeStyles> }) {
  const uri = useRevealedUri(item);
  if (!uri) return <View style={s.full} />;
  return <Image source={{ uri }} style={s.full} resizeMode="contain" />;
}

function RevealedVideo({ item, styles: s }: { item: VaultItem; styles: ReturnType<typeof makeStyles> }) {
  const uri = useRevealedUri(item);
  if (!uri) return <View style={s.full} />;
  return <VaultVideo uri={uri} styles={s} />;
}

function Header({ onBack, title, right, unreadCount = 0, onOpenMessages, styles: s }: { onBack: () => void; title: string; right?: React.ReactNode; unreadCount?: number; onOpenMessages?: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.iconButton}><Text style={s.back}>{'\u2039'}</Text></Pressable>
      <View style={s.headerCopy}><BrandMark style={s.eyebrow} /><Text style={s.title}>{title}</Text></View>
      <TopUnreadBadge count={unreadCount} onPress={onOpenMessages} />
      <OrbotOnionMark compact size={18} />
      {right}
    </View>
  );
}

function Viewer({
  item,
  items,
  onClose,
  onDelete,
  styles: s,
}: {
  item: VaultItem | null;
  items: VaultItem[];
  onClose: () => void;
  onDelete: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const width = Dimensions.get('window').width;
  const photos = useMemo(() => items.filter(x => x.kind === 'photo'), [items]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<VaultItem>>(null);

  useEffect(() => {
    if (!item || item.kind !== 'photo') return;
    const i = photos.findIndex(p => p.id === item.id);
    setIndex(i >= 0 ? i : 0);
  }, [item?.id, photos]);

  if (!item) return null;

  const current = item.kind === 'photo' ? (photos[index] ?? item) : item;
  const meta =
    current.kind === 'video' ? 'Private video'
      : current.kind === 'file' ? 'Private file'
        : 'Private photo';

  const confirmDelete = () => {
    Alert.alert(
      'Delete from Gallery?',
      'Removed only from NEVULA. No copy exists in the phone gallery.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(current.id) },
      ],
    );
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={s.viewer}>
        <SafeAreaView style={s.viewerBar}>
          <Pressable onPress={onClose} style={s.iconButton}>
            <Text style={s.back}>{'\u2039'}</Text>
          </Pressable>
          <Text style={s.viewerMeta}>{meta}</Text>
          <Pressable onPress={confirmDelete} style={s.deleteBtn} hitSlop={8}>
            <Text style={s.deleteTxt}>Delete</Text>
          </Pressable>
        </SafeAreaView>
        {item.kind === 'photo' ? (
          <FlatList
            ref={listRef}
            style={s.viewerPager}
            data={photos}
            keyExtractor={x => x.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.max(0, photos.findIndex(p => p.id === item.id))}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={e => {
              const next = Math.round(e.nativeEvent.contentOffset.x / width);
              setIndex(next);
            }}
            renderItem={({ item: photo }) => (
              <View style={[s.viewerPage, { width }]}>
                <RevealedPhoto item={photo} styles={s} />
              </View>
            )}
          />
        ) : item.kind === 'video' ? (
          <RevealedVideo item={item} styles={s} />
        ) : (
          <View style={s.fileViewer}>
            <Text style={s.fileViewerName}>{item.originalName ?? 'File'}</Text>
            <Text style={s.fileViewerCopy}>Stored in the NEVULA Gallery only.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

function VaultVideo({ uri, styles: s }: { uri: string; styles: ReturnType<typeof makeStyles> }) {
  const player = useVideoPlayer(uri, next => { next.loop = false; next.play(); });
  return <VideoView player={player} style={s.full} nativeControls contentFit="contain" allowsPictureInPicture={false} fullscreenOptions={{ enable: false }}/>;
}

function formatDuration(ms?: number) {
  const sec = Math.max(1, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function formatClock(sec: number) {
  return `0:${String(Math.min(MAX_VIDEO_SEC, sec)).padStart(2, '0')}`;
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    container:{flex:1,backgroundColor:p.bg,paddingHorizontal:16,paddingTop:androidStatusInset(12)},
    menuIntro:{color:p.muted,fontSize:11,lineHeight:17,marginTop:4,marginBottom:18,maxWidth:330},
    menuCards:{flexDirection:'row',gap:11},
    menuCard:{flex:1,minHeight:230,borderRadius:22,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,padding:15,overflow:'hidden'},
    menuCardPressed:{opacity:.72,transform:[{scale:.99}]},
    menuGlow:{position:'absolute',width:150,height:150,borderRadius:75,backgroundColor:p.accent,opacity:.09,right:-55,top:-60},
    menuIcon:{width:52,height:52,borderRadius:17,borderWidth:1,borderColor:p.border,backgroundColor:p.accentSoft,alignItems:'center',justifyContent:'center'},
    menuPreview:{width:52,height:52,borderRadius:17,borderWidth:1,borderColor:p.border},
    cameraGlyph:{width:28,height:21,borderWidth:1.7,borderColor:p.text,borderRadius:4,alignItems:'center',justifyContent:'center'},
    cameraTop:{position:'absolute',top:-5,width:11,height:5,borderTopLeftRadius:2,borderTopRightRadius:2,backgroundColor:p.text},
    cameraLens:{width:10,height:10,borderRadius:5,borderWidth:1.7,borderColor:p.text},
    galleryMenuIcon:{color:p.text,fontSize:25},
    menuTitle:{color:p.text,fontFamily:'PlayfairDisplay-Regular',fontSize:16,textTransform:'uppercase',letterSpacing:1,marginTop:22},
    menuCopy:{color:p.muted,fontSize:10,lineHeight:15,marginTop:7},
    menuBottom:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:'auto'},
    menuAction:{color:p.accent,fontSize:8,fontWeight:'900',letterSpacing:.7},
    menuChevron:{color:p.muted,fontSize:21},
    addGallery:{minHeight:66,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,marginTop:14,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:12},
    addGalleryPlus:{color:p.text,fontSize:25,fontWeight:'300'},
    addGalleryCopy:{flex:1},
    addGalleryTitle:{color:p.text,fontSize:11,fontWeight:'900'},
    addGalleryText:{color:p.muted,fontSize:9,lineHeight:13,marginTop:3},
    shoot:{flex:1,backgroundColor:'#000'},
    preview:{flex:1},
    overlay:{position:'absolute',left:0,right:0,top:0,bottom:0,justifyContent:'space-between',paddingTop:androidStatusInset(8)||8},
    topBar:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:8},
    topCopy:{flex:1},
    eyebrow:{color:BRAND_EYEBROW,fontSize:8,fontWeight:'900',letterSpacing:2},
    lockLabel:{color:'#d7e4f5',fontSize:11,fontWeight:'800'},
    round:{width:42,height:42,borderRadius:21,backgroundColor:'rgba(8,14,22,0.72)',alignItems:'center',justifyContent:'center'},
    roundOn:{backgroundColor:'rgba(23,104,232,0.9)'},
    roundTxt:{color:'#fff',fontSize:20},
    recPill:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(120,16,28,0.88)',borderRadius:16,paddingHorizontal:12,paddingVertical:6},
    recDot:{width:8,height:8,borderRadius:4,backgroundColor:'#ff4d4d'},
    recTxt:{color:'#fff',fontWeight:'800',letterSpacing:1},
    bottom:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:22,paddingBottom:28},
    galleryHit:{width:54,height:54,borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:'#8bb4e6'},
    galleryThumb:{width:54,height:54,backgroundColor:'#111'},
    galleryEmpty:{alignItems:'center',justifyContent:'center'},
    galleryIcon:{color:'#9db6d1',fontSize:16},
    shutter:{width:78,height:78,borderRadius:39,borderWidth:4,borderColor:'#fff',alignItems:'center',justifyContent:'center'},
    shutterVideo:{borderColor:'#ff7a7a'},
    shutterRec:{borderColor:'#ff5a5a'},
    shutterInner:{width:60,height:60,borderRadius:30,backgroundColor:'#fff'},
    shutterInnerVideo:{backgroundColor:'#ff3b3b'},
    shutterInnerRec:{width:28,height:28,borderRadius:6,backgroundColor:'#ff3b3b'},
    modeCol:{width:54,alignItems:'flex-end',gap:8},
    mode:{color:'#8b97a6',fontSize:10,fontWeight:'900'},
    modeOn:{color:'#fff'},
    header:{flexDirection:'row',alignItems:'center',marginBottom:10,gap:8},
    iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center',backgroundColor:p.surface},
    back:{color:p.text,fontSize:30,lineHeight:31},
    headerCopy:{flex:1},
    title:{color:p.text,fontFamily:'PlayfairDisplay-Regular',fontSize:22,letterSpacing:1.2,textTransform:'uppercase'},
    textBtn:{paddingHorizontal:10,paddingVertical:8},
    textBtnTxt:{color:p.accent,fontWeight:'800'},
    privacy:{color:p.muted,fontSize:11,marginBottom:12},
    importOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(5,7,10,0.72)',alignItems:'center',justifyContent:'center',gap:14,zIndex:40},
    importOverlayTxt:{color:'#9ec7ff',fontSize:14,fontWeight:'700'},
    importRow:{flexDirection:'row',gap:8,marginBottom:12},
    importBtn:{flex:1,height:40,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,alignItems:'center',justifyContent:'center'},
    importTxt:{color:p.accent,fontSize:10,fontWeight:'800'},
    grid:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingBottom:40},
    tile:{width:'31.5%',aspectRatio:1,borderRadius:12,overflow:'hidden',backgroundColor:p.surfaceAlt},
    thumb:{width:'100%',height:'100%'},
    videoThumb:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:p.surface},
    play:{color:'#fff',fontSize:22},
    dur:{color:p.muted,fontSize:10,marginTop:4},
    empty:{color:p.muted,paddingTop:48,textAlign:'center',width:'100%'},
    denied:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:10},
    deniedTitle:{color:'#e8edf4',fontSize:18,fontWeight:'800'},
    deniedCopy:{color:'#8b97a6',textAlign:'center',lineHeight:20},
    allow:{marginTop:10,backgroundColor:p.accent,borderRadius:14,paddingHorizontal:18,paddingVertical:12},
    allowTxt:{color:'#fff',fontWeight:'800'},
    viewer:{flex:1,backgroundColor:'#000'},
    viewerBar:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingTop:androidStatusInset(8)||8},
    viewerMeta:{flex:1,color:'#d7e4f5',textAlign:'center',fontWeight:'700'},
    deleteBtn:{paddingHorizontal:10,paddingVertical:10,minWidth:64,alignItems:'flex-end'},
    deleteTxt:{color:'#e24b4b',fontSize:15,fontWeight:'800'},
    viewerPager:{flex:1},
    viewerPage:{flex:1},
    full:{flex:1,width:'100%'},
    fileViewer:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:10,backgroundColor:'#000'},
    fileViewerName:{color:'#e8edf4',fontSize:16,fontWeight:'800',textAlign:'center'},
    fileViewerCopy:{color:'#8b97a6',textAlign:'center',lineHeight:20},
  });
}
