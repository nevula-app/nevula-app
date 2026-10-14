// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CalendarEvent,
  createEventId,
  dateKey,
  deleteCalendarEvent,
  eventOccursOn,
  loadCalendarEvents,
  prepareCalendarNotifications,
  refillUpcomingReminders,
  requestReminderPermission,
  saveCalendarEvent,
} from '../lib/calendar';
import { getNotificationPreferences } from '../lib/notificationPreferences';
import { BRAND_EYEBROW, HomePalette, useDisplayTheme } from '../lib/displayTheme';
import BrandMark from '../components/BrandMark';
import OrbotOnionMark from '../components/OrbotOnionMark';
import TopUnreadBadge from '../components/TopUnreadBadge';
import { androidStatusInset } from '../lib/statusInset';
import { subscribeInAppUnreadSnapshot } from '../lib/inAppUnread';

type Props = { onBack: () => void; onOpenMessages?: () => void };
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(leading).fill(null), ...Array.from({ length: days }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
}

export default function CalendarScreen({ onBack, onOpenMessages }: Props) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [editor, setEditor] = useState<CalendarEvent | 'new' | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => subscribeInAppUnreadSnapshot((snap) => setUnreadCount(snap.count)), []);

  useEffect(() => {
    prepareCalendarNotifications().catch(() => undefined);
    refillUpcomingReminders()
      .then(setEvents)
      .catch(() => loadCalendarEvents().then(setEvents).catch(() => Alert.alert('Calendar unavailable', 'Stored appointments could not be opened.')));
  }, []);

  const selectedEvents = useMemo(() => events.filter(event => eventOccursOn(event, selected)), [events, selected]);
  const cells = monthCells(month);
  const moveMonth = (amount: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));

  return <SafeAreaView style={s.container}>
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.iconButton}><Text style={s.back}>{'\u2039'}</Text></Pressable>
      <View style={s.headerCopy}><BrandMark style={s.eyebrow} /><Text style={s.title}>Calendar</Text></View>
      <TopUnreadBadge count={unreadCount} onPress={onOpenMessages} />
      <OrbotOnionMark compact size={18} />
      <Pressable onPress={() => setEditor('new')} style={s.addButton}><Text style={s.addText}>+</Text></Pressable>
    </View>

    <View style={s.monthCard}>
      <View style={s.monthHeader}><Pressable onPress={() => moveMonth(-1)} style={s.monthArrow}><Text style={s.arrow}>{'\u2039'}</Text></Pressable><Text style={s.monthTitle}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text><Pressable onPress={() => moveMonth(1)} style={s.monthArrow}><Text style={s.arrow}>{'\u203A'}</Text></Pressable></View>
      <View style={s.weekRow}>{WEEKDAYS.map(day => <Text key={day} style={s.weekday}>{day}</Text>)}</View>
      <View style={s.days}>{cells.map((date, index) => {
        if (!date) return <View key={`empty-${index}`} style={s.dayCell}/>;
        const active = dateKey(date) === dateKey(selected);
        const current = dateKey(date) === dateKey(today);
        const hasEvents = events.some(event => eventOccursOn(event, date));
        return <Pressable key={dateKey(date)} onPress={() => setSelected(date)} style={[s.dayCell, active && s.dayActive]}><Text style={[s.dayText, current && s.todayText, active && s.dayActiveText]}>{date.getDate()}</Text>{hasEvents && <View style={[s.dot, active && s.dotActive]}/>}</Pressable>;
      })}</View>
    </View>

    <View style={s.agendaHeader}><View><Text style={s.agendaDate}>{selected.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text><Text style={s.agendaCount}>{selectedEvents.length ? `${selectedEvents.length} appointment${selectedEvents.length === 1 ? '' : 's'}` : 'No appointments'}</Text></View><Pressable onPress={() => setEditor('new')}><Text style={s.newLink}>NEW APPOINTMENT</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.agenda}>
      {!selectedEvents.length && <Pressable onPress={() => setEditor('new')} style={s.empty}><Text style={s.emptyIcon}>+</Text><Text style={s.emptyTitle}>Nothing planned</Text><Text style={s.emptyCopy}>Tap to add an appointment or task.</Text></Pressable>}
      {selectedEvents.map(event => {
        const start = new Date(event.startsAt);
        const timeLabel = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const remLabel = event.reminderAt
          ? new Date(event.reminderAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : event.reminderMinutes !== null
            ? (event.reminderMinutes === 0 ? 'At time' : `${event.reminderMinutes}m`)
            : null;
        return <Pressable key={event.id} onPress={() => setEditor(event)} style={s.eventCard}><View style={s.eventLine}/><View style={s.timeBox}><Text style={s.eventTime}>{timeLabel}</Text>{remLabel !== null && <Text style={s.reminder}>{'\u25F7'} {remLabel}</Text>}</View><View style={s.eventBody}><Text style={s.eventTitle}>{event.title}</Text>{event.notes ? <Text numberOfLines={2} style={s.eventNotes}>{event.notes}</Text> : null}{event.repeatEveryDays && <Text style={s.repeat}>{'\u21BB'} Every {event.repeatEveryDays} days</Text>}</View><Text style={s.chevron}>{'\u203A'}</Text></Pressable>;
      })}
    </ScrollView>
    <EventEditor visible={editor !== null} event={editor === 'new' ? null : editor} selectedDate={selected} palette={p} onClose={() => setEditor(null)} onDelete={async id => { setEvents(await deleteCalendarEvent(events, id)); setEditor(null); }} onSave={async input => { setEvents(await saveCalendarEvent(events, input)); setEditor(null); }}/>
  </SafeAreaView>;
}

function EventEditor({ visible, event, selectedDate, palette: p, onClose, onDelete, onSave }: { visible: boolean; event: CalendarEvent | null; selectedDate: Date; palette: HomePalette; onClose: () => void; onDelete: (id: string) => Promise<void>; onSave: (event: Omit<CalendarEvent, 'notificationIds' | 'createdAt'>) => Promise<void> }) {
  const s = useMemo(() => makeStyles(p), [p]);
  const scrollRef = useRef<ScrollView>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(dateKey(selectedDate));
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderMode, setReminderMode] = useState<'minutes' | 'clock'>('minutes');
  const [reminder, setReminder] = useState('15');
  const [reminderClock, setReminderClock] = useState('08:45');
  const [repeat, setRepeat] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const start = event ? new Date(event.startsAt) : selectedDate;
    setTitle(event?.title ?? '');
    setDate(dateKey(start));
    setTime(event ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '09:00');
    setNotes(event?.notes ?? '');
    const hasRem = event ? (event.reminderMinutes !== null || event.reminderAt != null) : false;
    setReminderOn(hasRem);
    if (event?.reminderAt) {
      const rem = new Date(event.reminderAt);
      setReminderMode('clock');
      setReminderClock(`${String(rem.getHours()).padStart(2, '0')}:${String(rem.getMinutes()).padStart(2, '0')}`);
      setReminder('15');
    } else {
      setReminderMode('minutes');
      setReminder(String(event?.reminderMinutes ?? 15));
      setReminderClock('08:45');
    }
    setRepeat(String(event?.repeatEveryDays ?? 0));
  }, [visible, event?.id, selectedDate]);

  const save = async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Please enter a name for the appointment.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) { Alert.alert('Check date and time', 'Use YYYY-MM-DD and HH:MM.'); return; }
    const startsAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startsAt.getTime())) { Alert.alert('Invalid date', 'Please check the appointment date.'); return; }
    let reminderMinutes: number | null = null;
    let reminderAt: string | null = null;
    if (reminderOn) {
      if (reminderMode === 'clock') {
        if (!/^\d{2}:\d{2}$/.test(reminderClock)) { Alert.alert('Check reminder time', 'Use HH:MM.'); return; }
        const rem = new Date(`${date}T${reminderClock}:00`);
        if (Number.isNaN(rem.getTime())) { Alert.alert('Invalid reminder time', 'Please check the reminder clock.'); return; }
        reminderAt = rem.toISOString();
      } else {
        reminderMinutes = Math.max(0, Number(reminder) || 0);
      }
    }
    const repeatEveryDays = Math.max(0, Math.floor(Number(repeat) || 0));
    setSaving(true);
    try {
      const preferences = await getNotificationPreferences();
      if (reminderOn && preferences.enabled && preferences.calendarReminders && !(await requestReminderPermission())) {
        Alert.alert('Reminders disabled', 'The appointment will be saved, but Android notifications are not permitted.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => { void Linking.openSettings(); } },
        ]);
      }
      await onSave({
        id: event?.id ?? createEventId(),
        title: title.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: null,
        notes: notes.trim(),
        reminderMinutes,
        reminderAt,
        repeatEveryDays: repeatEveryDays || null,
      });
    } catch (error: any) { Alert.alert('Could not save', error?.message ?? 'Please try again.'); }
    finally { setSaving(false); }
  };

  const scrollNotesIntoView = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.editor}>
        <KeyboardAvoidingView
          style={s.editorKav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={s.editorHeader}>
            <Pressable onPress={onClose}><Text style={s.cancel}>Cancel</Text></Pressable>
            <Text style={s.editorTitle}>{event ? 'Edit appointment' : 'New appointment'}</Text>
            <Pressable disabled={saving} onPress={save}><Text style={s.done}>{saving ? 'Saving\u2026' : 'Save'}</Text></Pressable>
          </View>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.form}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <Text style={s.label}>TITLE</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Appointment or task" placeholderTextColor={p.muted} style={s.input} />
            <View style={s.formRow}>
              <View style={s.formHalf}>
                <Text style={s.label}>DATE</Text>
                <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={p.muted} style={s.input} />
              </View>
              <View style={s.formHalf}>
                <Text style={s.label}>START</Text>
                <TextInput value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={p.muted} style={s.input} />
              </View>
            </View>
            <Pressable onPress={() => setReminderOn(value => !value)} style={s.toggleRow}>
              <View style={s.toggleCopy}>
                <Text style={s.toggleTitle}>REMINDER</Text>
                <Text style={s.toggleDetail}>{reminderOn ? 'Notify for this appointment' : 'No reminder for this appointment'}</Text>
              </View>
              <View style={[s.toggle, reminderOn && s.toggleOn]}><View style={[s.toggleKnob, reminderOn && s.toggleKnobOn]}/></View>
            </Pressable>
            {reminderOn && <>
              <View style={s.modeRow}>
                <Pressable onPress={() => setReminderMode('minutes')} style={[s.modeChip, reminderMode === 'minutes' && s.modeChipOn]}><Text style={[s.modeChipTxt, reminderMode === 'minutes' && s.modeChipTxtOn]}>Minutes before</Text></Pressable>
                <Pressable onPress={() => setReminderMode('clock')} style={[s.modeChip, reminderMode === 'clock' && s.modeChipOn]}><Text style={[s.modeChipTxt, reminderMode === 'clock' && s.modeChipTxtOn]}>Exact time</Text></Pressable>
              </View>
              {reminderMode === 'minutes' ? (
                <><Text style={s.label}>MINUTES BEFORE</Text><TextInput value={reminder} onChangeText={setReminder} keyboardType="number-pad" placeholder="15" placeholderTextColor={p.muted} style={s.input}/><Text style={s.hint}>0 notifies at the appointment start.</Text></>
              ) : (
                <><Text style={s.label}>REMINDER TIME</Text><TextInput value={reminderClock} onChangeText={setReminderClock} placeholder="HH:MM" placeholderTextColor={p.muted} style={s.input}/><Text style={s.hint}>Fires at this clock time on the appointment date.</Text></>
              )}
            </>}
            <Text style={s.label}>REPEAT EVERY ... DAYS</Text>
            <TextInput value={repeat} onChangeText={setRepeat} keyboardType="number-pad" placeholder="0 = no repeat, e.g. 2, 3, 5" placeholderTextColor={p.muted} style={s.input}/>
            <Text style={s.hint}>0 means once. Any whole number is allowed.</Text>
            <Text style={s.label}>NOTES</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Details, checklist or additional notes"
              placeholderTextColor={p.muted}
              style={[s.input, s.notesInput]}
              onFocus={scrollNotesIntoView}
            />
            {event && <Pressable onPress={() => Alert.alert('Delete appointment?', 'This also removes its reminders.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDelete(event.id) }])} style={s.deleteButton}><Text style={s.deleteText}>Delete appointment</Text></Pressable>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    container:{flex:1,backgroundColor:p.bg,paddingHorizontal:18,paddingTop:androidStatusInset(12)},
    header:{height:68,flexDirection:'row',alignItems:'center',gap:8},
    headerCopy:{flex:1,marginLeft:4},
    iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,alignItems:'center',justifyContent:'center'},
    back:{color:p.text,fontSize:30,lineHeight:31},
    eyebrow:{color:BRAND_EYEBROW,fontSize:8,fontWeight:'900',letterSpacing:2},
    title:{color:p.text,fontFamily:'PlayfairDisplay-Regular',fontSize:22,letterSpacing:1.2,textTransform:'uppercase'},
    addButton:{width:42,height:42,borderRadius:14,backgroundColor:p.accent,alignItems:'center',justifyContent:'center'},
    addText:{color:'#fff',fontSize:24},
    monthCard:{borderRadius:22,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,padding:13},
    monthHeader:{height:42,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
    monthArrow:{width:38,height:36,alignItems:'center',justifyContent:'center'},
    arrow:{color:p.muted,fontSize:25},
    monthTitle:{color:p.text,fontSize:16,fontWeight:'800'},
    weekRow:{flexDirection:'row',marginTop:5},
    weekday:{width:'14.285%',textAlign:'center',color:p.muted,fontSize:8,fontWeight:'900'},
    days:{flexDirection:'row',flexWrap:'wrap',marginTop:5},
    dayCell:{width:'14.285%',height:42,alignItems:'center',justifyContent:'center',borderRadius:12},
    dayActive:{backgroundColor:p.accent},
    dayText:{color:p.muted,fontSize:12,fontWeight:'700'},
    todayText:{color:p.accent},
    dayActiveText:{color:'#fff'},
    dot:{position:'absolute',bottom:5,width:3,height:3,borderRadius:2,backgroundColor:p.accent},
    dotActive:{backgroundColor:'#fff'},
    agendaHeader:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:14,marginBottom:10},
    agendaDate:{color:p.text,fontSize:14,fontWeight:'800'},
    agendaCount:{color:p.muted,fontSize:9,marginTop:3},
    newLink:{color:p.accent,fontSize:8,fontWeight:'900',letterSpacing:.6},
    agenda:{gap:8,paddingBottom:25},
    empty:{borderRadius:18,borderWidth:1,borderStyle:'dashed',borderColor:p.border,alignItems:'center',padding:22},
    emptyIcon:{color:p.muted,fontSize:24},
    emptyTitle:{color:p.text,fontSize:12,fontWeight:'800'},
    emptyCopy:{color:p.muted,fontSize:9,marginTop:4},
    eventCard:{minHeight:76,borderRadius:17,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,flexDirection:'row',alignItems:'center',overflow:'hidden',paddingRight:13},
    eventLine:{width:3,alignSelf:'stretch',backgroundColor:p.accent},
    timeBox:{width:86,alignItems:'center',paddingHorizontal:4},
    eventTime:{color:p.text,fontSize:11,fontWeight:'800',textAlign:'center'},
    reminder:{color:p.muted,fontSize:8,marginTop:4},
    eventBody:{flex:1},
    eventTitle:{color:p.text,fontSize:12,fontWeight:'800'},
    eventNotes:{color:p.muted,fontSize:9,lineHeight:13,marginTop:3},
    repeat:{color:p.accent,fontSize:8,fontWeight:'700',marginTop:4},
    chevron:{color:p.muted,fontSize:20},
    editor:{flex:1,backgroundColor:p.bg,paddingTop:androidStatusInset(12)},
    editorKav:{flex:1},
    editorHeader:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,borderBottomWidth:1,borderBottomColor:p.border},
    editorTitle:{color:p.text,fontSize:14,fontWeight:'800'},
    cancel:{color:p.muted,fontSize:11},
    done:{color:p.accent,fontSize:11,fontWeight:'900'},
    form:{padding:20,paddingBottom:120},
    label:{color:p.muted,fontSize:8,fontWeight:'900',letterSpacing:1.2,marginTop:15,marginBottom:7},
    input:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,color:p.text,paddingHorizontal:13,paddingVertical:11},
    formRow:{flexDirection:'row',gap:10},
    formHalf:{flex:1},
    hint:{color:p.muted,fontSize:8,marginTop:6},
    modeRow:{flexDirection:'row',gap:8,marginTop:12},
    modeChip:{flex:1,minHeight:36,borderRadius:11,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center',backgroundColor:p.surface},
    modeChipOn:{borderColor:p.accent,backgroundColor:p.accentSoft},
    modeChipTxt:{color:p.muted,fontSize:10,fontWeight:'800'},
    modeChipTxtOn:{color:p.accent},
    toggleRow:{minHeight:58,flexDirection:'row',alignItems:'center',marginTop:18,borderBottomWidth:1,borderBottomColor:p.border},
    toggleCopy:{flex:1,paddingRight:12},
    toggleTitle:{color:p.muted,fontSize:8,fontWeight:'900',letterSpacing:1.2,marginBottom:4},
    toggleDetail:{color:p.muted,fontSize:9},
    toggle:{width:40,height:23,borderRadius:13,backgroundColor:p.surfaceAlt,padding:3},
    toggleOn:{backgroundColor:p.accent},
    toggleKnob:{width:17,height:17,borderRadius:9,backgroundColor:p.muted},
    toggleKnobOn:{backgroundColor:'#fff',alignSelf:'flex-end'},
    notesInput:{height:110,textAlignVertical:'top'},
    deleteButton:{height:48,borderRadius:14,borderWidth:1,borderColor:p.danger,alignItems:'center',justifyContent:'center',marginTop:28},
    deleteText:{color:p.danger,fontSize:10,fontWeight:'800'},
  });
}
