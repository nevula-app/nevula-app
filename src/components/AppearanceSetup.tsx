// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LauncherIconMode } from '../lib/launcherIcon';
import { PIN_POLICY, pinError, pinsMatch, wipePinError } from '../lib/unlock';
import PinKeypad from './PinKeypad';

export type InitialSetup = { launcherIconMode: LauncherIconMode; unlockCode?: string; wipeCode?: string; recoveryId?: string; recoveryKey?: string };
type Props = { iconOnly?: boolean; onComplete: (setup: InitialSetup) => Promise<void> };
type Step = 'appearance' | 'recovery' | 'access' | 'deletion' | 'review';
type CodeFieldName = 'unlock' | 'unlockConfirm' | 'wipe' | 'wipeConfirm';

export default function AppearanceSetup({ iconOnly = false, onComplete }: Props) {
  const [step, setStep] = useState<Step>('appearance');
  const [mode, setMode] = useState<LauncherIconMode | null>(null);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockConfirm, setUnlockConfirm] = useState('');
  const [wipeCode, setWipeCode] = useState('');
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [activeField, setActiveField] = useState<CodeFieldName>('unlock');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const progress = useMemo(() => iconOnly ? 'APP APPEARANCE' : ({ appearance: 'STEP 1 OF 4', recovery: 'IDENTITY RECOVERY', access: 'STEP 2 OF 4', deletion: 'STEP 3 OF 4', review: 'STEP 4 OF 4' } as const)[step], [iconOnly, step]);

  const chooseMode = async (nextMode: LauncherIconMode) => {
    setMode(nextMode); setError('');
    if (!iconOnly) return;
    try { setSaving(true); await onComplete({ launcherIconMode: nextMode }); }
    catch (cause: any) { setError(cause?.message ?? 'Could not change the app appearance.'); setSaving(false); }
  };
  const insertKey = (key: string) => {
    setError('');
    const apply = (value: string) => key === 'C' ? '' : key === '⌫' ? value.slice(0, -1) : value.length >= 24 ? value : `${value}${key}`;
    if (activeField === 'unlockConfirm') setUnlockConfirm(apply);
    else if (activeField === 'wipe') setWipeCode(apply);
    else if (activeField === 'wipeConfirm') setWipeConfirm(apply);
    else setUnlockCode(apply);
  };
  const nextFromAppearance = () => { if (!mode) return setError('Choose one of the two app appearances.'); setRecovering(false); setError(''); setStep('access'); };
  const startRecovery = () => { if (!mode) return setError('Choose one of the two app appearances first.'); setRecovering(true); setError(''); setStep('recovery'); };
  const continueRecovery = () => {
    if (!/^NVR(-[A-F0-9]{4}){6}$/.test(recoveryId.trim().toUpperCase()) || !/^NVRK-[A-F0-9]{64}$/.test(recoveryKey.trim().toUpperCase())) return setError('Enter the complete Recovery ID and Recovery Key.');
    setError(''); setStep('access');
  };
  const nextFromAccess = () => {
    const invalid = pinError(unlockCode); if (invalid) return setError(invalid);
    if (!pinsMatch(unlockCode, unlockConfirm)) return setError('Enter the same calculator access code twice.');
    setError(''); setActiveField('wipe'); setStep('deletion');
  };
  const nextFromDeletion = () => {
    if (!wipeCode && !wipeConfirm) { setError(''); setStep('review'); return; }
    const invalid = wipePinError(wipeCode); if (invalid) return setError(invalid);
    if (!pinsMatch(wipeCode, wipeConfirm)) return setError('Enter the same emergency wipe code twice.');
    if (pinsMatch(wipeCode, unlockCode)) return setError('The emergency wipe code must differ from the access code.');
    setError(''); setStep('review');
  };
  const finish = async () => {
    if (!mode) return;
    try { setSaving(true); setError(''); await onComplete({ launcherIconMode: mode, unlockCode, wipeCode: wipeCode || undefined, recoveryId: recovering ? recoveryId.trim().toUpperCase() : undefined, recoveryKey: recovering ? recoveryKey.trim().toUpperCase() : undefined }); }
    catch (cause: any) { setError(cause?.message ?? 'NEVULA setup could not be completed.'); setSaving(false); }
  };

  return <SafeAreaView style={s.container}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>{progress}</Text>
    {step === 'appearance' && <><Text style={s.title}>{iconOnly ? 'Choose how NEVULA appears' : 'Welcome to NEVULA'}</Text><Text style={s.copy}>Choose exactly one home-screen appearance. NEVULA remains the official app; this choice can be changed later in Settings.</Text><IconChoice mode="nevula" selected={mode === 'nevula'} disabled={saving} onPress={chooseMode}/><IconChoice mode="calculator" selected={mode === 'calculator'} disabled={saving} onPress={chooseMode}/>{!iconOnly && <><PrimaryButton label="Create new identity" disabled={!mode} onPress={nextFromAppearance}/><Pressable onPress={startRecovery} style={s.back}><Text style={s.backText}>Recover existing identity</Text></Pressable></>}</>}
    {step === 'recovery' && <><Text style={s.title}>Recover your identity</Text><Text style={s.copy}>Only your NEVULA ID returns. Contacts, messages, Gallery files, Notes, Calendar entries and previous device keys are never restored.</Text><TextInput autoCapitalize="characters" autoCorrect={false} value={recoveryId} onChangeText={value=>{setRecoveryId(value);setError('');}} placeholder="Recovery ID" placeholderTextColor="#5f6775" style={s.recoveryField}/><TextInput autoCapitalize="characters" autoCorrect={false} value={recoveryKey} onChangeText={value=>{setRecoveryKey(value);setError('');}} placeholder="Recovery Key" placeholderTextColor="#5f6775" style={s.recoveryField}/><PrimaryButton label="Continue securely" onPress={continueRecovery}/><BackButton onPress={()=>setStep('appearance')}/></>}
    {step === 'access' && <><Text style={s.title}>Protect your private space</Text><Text style={s.copy}>Create the calculator combination that opens NEVULA. {PIN_POLICY}.</Text><CodeInput label="Access code" value={unlockCode} active={activeField === 'unlock'} onPress={() => setActiveField('unlock')}/><CodeInput label="Confirm access code" value={unlockConfirm} active={activeField === 'unlockConfirm'} onPress={() => setActiveField('unlockConfirm')}/><PinKeypad onKey={insertKey} value={activeField === 'unlockConfirm' ? unlockConfirm : unlockCode}/><PrimaryButton label="Continue" onPress={nextFromAccess}/><BackButton onPress={() => setStep('appearance')}/></>}
    {step === 'deletion' && <><Text style={s.title}>Optional emergency wipe code</Text><Text style={s.copy}>Under duress: enter this separate code on the calculator and press = — NEVULA erases all local data immediately (looks like a normal calculation). This runs on the phone only and does not need a server connection. This is not the dashboard Emergency Kill button (that uses your access code + confirm). Leave empty to set later.</Text><CodeInput label="Emergency wipe code (optional)" value={wipeCode} active={activeField === 'wipe'} onPress={() => setActiveField('wipe')}/><CodeInput label="Confirm emergency wipe code" value={wipeConfirm} active={activeField === 'wipeConfirm'} onPress={() => setActiveField('wipeConfirm')}/><PinKeypad onKey={insertKey} value={activeField === 'wipeConfirm' ? wipeConfirm : wipeCode}/><PrimaryButton label={wipeCode || wipeConfirm ? 'Continue' : 'Skip for now'} onPress={nextFromDeletion}/><BackButton onPress={() => setStep('access')}/></>}
    {step === 'review' && <><Text style={s.title}>{recovering?'Recover your NEVULA identity':'Create your NEVULA identity'}</Text><Text style={s.copy}>{recovering?'Your ID will return. New device encryption keys will be generated; contacts and private content are never transferred.':'NEVULA will create your identity, Recovery ID, Recovery Key and Personal Delete Key. Save them safely outside this phone.'}</Text><View style={s.summary}><SummaryRow label="Identity" value={recovering?'Recovery':'New'}/><SummaryRow label="Home-screen appearance" value={mode === 'calculator' ? 'Calculator' : 'NEVULA'}/><SummaryRow label="Calculator access" value="Configured"/><SummaryRow label="Emergency deletion" value={wipeCode ? 'Configured' : 'Not configured'}/></View><Text style={s.warning}>Never share calculator codes, private keys or chat keys. Keep recovery credentials secret too. NEVULA support will never ask for them.</Text><PrimaryButton label={saving ? (recovering?'Recovering identity…':'Creating identity…') : 'Complete setup'} disabled={saving} onPress={() => void finish()}/><BackButton onPress={() => setStep('deletion')}/></>}
    {!!error && <Text style={s.error}>{error}</Text>}
  </ScrollView></SafeAreaView>;
}

function IconChoice({mode,selected,disabled,onPress}:{mode:LauncherIconMode;selected:boolean;disabled:boolean;onPress:(mode:LauncherIconMode)=>void}) { const calculator=mode==='calculator'; return <Pressable disabled={disabled} onPress={()=>void onPress(mode)} style={({pressed})=>[s.card,selected&&s.cardSelected,pressed&&s.pressed]}><Image source={calculator?require('../../assets/calculator-icon-inset.png'):require('../../assets/icon.png')} style={s.icon}/><View style={s.cardCopy}><Text style={s.cardTitle}>{calculator?'Calculator appearance':'NEVULA appearance'}</Text><Text style={s.cardDetail}>{calculator?'Neutral calculator icon and “Calculator” launcher label.':'Official NEVULA icon and NEVULA launcher label.'}</Text></View><View style={[s.radio,selected&&s.radioSelected]}/></Pressable>; }
function CodeInput({label,value,active,onPress}:{label:string;value:string;active:boolean;onPress:()=>void}) { return <Pressable onPress={onPress} style={[s.field,active&&s.fieldActive]}><Text style={value?s.fieldValue:s.fieldHint}>{value||label}</Text></Pressable>; }
function PrimaryButton({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}) { return <Pressable disabled={disabled} onPress={onPress} style={[s.primary,disabled&&s.disabled]}><Text style={s.primaryText}>{label}</Text></Pressable>; }
function BackButton({onPress}:{onPress:()=>void}) { return <Pressable onPress={onPress} style={s.back}><Text style={s.backText}>Back</Text></Pressable>; }
function SummaryRow({label,value}:{label:string;value:string}) { return <View style={s.summaryRow}><Text style={s.summaryLabel}>{label}</Text><Text style={s.summaryValue}>{value}</Text></View>; }

const s=StyleSheet.create({container:{flex:1,backgroundColor:'#05070c'},content:{flexGrow:1,paddingHorizontal:24,paddingVertical:34,justifyContent:'center'},eyebrow:{color:'#4d8fe9',fontSize:10,fontWeight:'900',letterSpacing:1.8,marginBottom:12},title:{color:'#f6f8fb',fontSize:28,lineHeight:34,fontWeight:'800'},copy:{color:'#8491a4',fontSize:13,lineHeight:20,marginTop:9,marginBottom:22},card:{minHeight:88,borderRadius:18,borderWidth:1,borderColor:'#24405f',backgroundColor:'#08111e',padding:11,flexDirection:'row',alignItems:'center',marginBottom:11},cardSelected:{borderColor:'#3987f7',backgroundColor:'#0a1a2f'},pressed:{opacity:.72},icon:{width:62,height:62,borderRadius:15,marginRight:13},cardCopy:{flex:1},cardTitle:{color:'#f2f6fb',fontSize:14,fontWeight:'800'},cardDetail:{color:'#71839c',fontSize:10,lineHeight:15,marginTop:4},radio:{width:18,height:18,borderRadius:9,borderWidth:1,borderColor:'#536174',marginLeft:8},radioSelected:{borderWidth:5,borderColor:'#4d91ef'},field:{backgroundColor:'#06090e',borderWidth:1,borderColor:'#252c39',borderRadius:14,paddingHorizontal:14,paddingVertical:12,marginBottom:8,minHeight:46,justifyContent:'center'},fieldActive:{borderColor:'#4d8fe9'},fieldValue:{color:'#f5f7fa',fontSize:17,letterSpacing:.8},fieldHint:{color:'#5f6775',fontSize:13},recoveryField:{backgroundColor:'#06090e',borderWidth:1,borderColor:'#284363',borderRadius:14,paddingHorizontal:14,paddingVertical:13,marginBottom:9,color:'#f5f7fa',fontSize:13},primary:{backgroundColor:'#2878ff',borderRadius:13,paddingVertical:14,alignItems:'center',marginTop:5},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.42},back:{height:40,alignItems:'center',justifyContent:'center'},backText:{color:'#8f9aaa',fontWeight:'700'},summary:{borderWidth:1,borderColor:'#1d3049',borderRadius:16,backgroundColor:'#07111f',paddingHorizontal:14},summaryRow:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#16253a'},summaryLabel:{color:'#718098',fontSize:11},summaryValue:{color:'#d6e5f9',fontSize:11,fontWeight:'800'},warning:{color:'#c99643',fontSize:11,lineHeight:17,marginVertical:18},error:{color:'#ff7180',fontSize:11,lineHeight:16,textAlign:'center',marginTop:9}});
