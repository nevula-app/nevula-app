// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, memberFromCookie } from '@/lib/community-db';
export async function POST(request:Request){const member=await memberFromCookie(request.headers.get('cookie'));if(!member)return Response.json({error:'Verified NEVULA membership required.'},{status:401});const input=await request.json() as {postId?:string;replyId?:string;reason?:string};const reason=input.reason?.trim()??'';if((!input.postId&&!input.replyId)||(input.postId&&input.replyId)||reason.length<3||reason.length>500)return Response.json({error:'Choose one item and provide a short reason.'},{status:400});const database=await db();const recent=await database.prepare(`SELECT count(*) n FROM community_reports WHERE reporter_id=? AND created_at>datetime('now','-1 hour')`).bind(member.user_id).first<{n:number}>();if((recent?.n??0)>=10)return Response.json({error:'Too many reports. Please try again later.'},{status:429});await database.prepare(`INSERT INTO community_reports(id,reporter_id,post_id,reply_id,reason) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(),member.user_id,input.postId??null,input.replyId??null,reason).run();return Response.json({ok:true});}
