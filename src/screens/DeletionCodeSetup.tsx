// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_DELETION_URL } from '../lib/accountDeletion';

type Props = {
  deletionCode: string;
  nevulaId: string;
  onConfirmed: () => Promise<void>;
};

export default function DeletionCodeSetup({ deletionCode, nevulaId, onConfirmed }: Props) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(deletionCode);
    setCopied(true);
  };

  const confirm = async () => {
    setSaving(true);
    try { await onConfirmed(); } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.card}>
        <Text style={s.eyebrow}>ACCOUNT SAFETY</Text>
        <Text style={s.title}>Save your deletion code</Text>
        <Text style={s.copy}>You’ll need it to delete your account if you lose access to this device. Never share it with anyone.</Text>
        <Text style={s.label}>NEVULA ID</Text>
        <Text selectable style={s.nevulaId}>{nevulaId}</Text>
        <Text style={s.label}>DELETION CODE</Text>
        <Text selectable style={s.code}>{deletionCode}</Text>
        <Pressable onPress={copy} style={s.copyButton}><Text style={s.copyButtonText}>{copied ? 'Copied' : 'Copy deletion code'}</Text></Pressable>
        <Text style={s.urlLabel}>Delete online account:</Text>
        <Text selectable style={s.url}>{ACCOUNT_DELETION_URL}</Text>
        <Text style={s.warning}>Never enter your calculator PIN, emergency wipe code, or private encryption key on that page.</Text>
        <Pressable disabled={saving} onPress={confirm} style={s.continueButton}><Text style={s.continueText}>{saving ? 'Saving…' : 'I saved my deletion code'}</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#05070c',justifyContent:'center',padding:22},
  card:{borderWidth:1,borderColor:'#1d4e91',backgroundColor:'#07111f',borderRadius:26,padding:22},
  eyebrow:{color:'#4d8fe9',fontSize:9,fontWeight:'900',letterSpacing:1.4},
  title:{color:'#f7f8fb',fontSize:27,fontWeight:'800',marginTop:8},
  copy:{color:'#8b9ab0',fontSize:13,lineHeight:20,marginTop:9,marginBottom:20},
  label:{color:'#526b8d',fontSize:8,fontWeight:'900',letterSpacing:1.2,marginTop:14},
  nevulaId:{color:'#dbe9fb',fontSize:17,fontWeight:'700',letterSpacing:1.2,marginTop:7},
  code:{color:'#8bc7ff',fontSize:20,fontWeight:'800',letterSpacing:1.5,marginTop:8},
  copyButton:{borderWidth:1,borderColor:'#2c69b8',borderRadius:13,paddingVertical:12,alignItems:'center',marginTop:14},
  copyButtonText:{color:'#91bdf7',fontSize:11,fontWeight:'800'},
  urlLabel:{color:'#78879b',fontSize:10,marginTop:20},
  url:{color:'#5da0ff',fontSize:11,marginTop:4},
  warning:{color:'#9a7b7b',fontSize:10,lineHeight:15,marginTop:13},
  continueButton:{backgroundColor:'#2878ff',borderRadius:14,paddingVertical:14,alignItems:'center',marginTop:22},
  continueText:{color:'#fff',fontWeight:'800'},
});
