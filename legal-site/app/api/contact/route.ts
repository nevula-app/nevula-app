// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { env } from 'cloudflare:workers';

function clean(value:unknown,max:number){return typeof value==='string'?value.trim().slice(0,max):''}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]??char))}

export async function POST(request:Request){
  const input=await request.json().catch(()=>null) as {name?:string;email?:string;subject?:string;message?:string;website?:string}|null;
  if(!input||input.website)return Response.json({ok:true});
  const name=clean(input.name,80),email=clean(input.email,160),subject=clean(input.subject,80),message=clean(input.message,5000);
  if(name.length<2||message.length<10||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:'Bitte prüfe Name, E-Mail-Adresse und Nachricht.'},{status:400});
  const apiKey=(env as unknown as {RESEND_API_KEY?:string}).RESEND_API_KEY;
  if(!apiKey)return Response.json({error:'Der E-Mail-Versand ist vorübergehend nicht verfügbar.'},{status:503});
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({from:'NEVULA Website <onboarding@resend.dev>',to:['nevula.support@proton.me'],reply_to:email,subject:`NEVULA Kontakt: ${subject||'Support-Anfrage'}`,html:`<h2>Neue NEVULA-Kontaktanfrage</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>E-Mail:</strong> ${escapeHtml(email)}</p><p><strong>Betreff:</strong> ${escapeHtml(subject)}</p><p><strong>Nachricht:</strong></p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`})});
  if(!response.ok){console.error('Resend contact delivery failed',response.status);return Response.json({error:'Die Nachricht konnte gerade nicht gesendet werden. Bitte versuche es später erneut.'},{status:502});}
  return Response.json({ok:true});
}
