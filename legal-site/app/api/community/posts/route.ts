// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, memberFromCookie } from '@/lib/community-db';
import { sameOriginJson } from '@/lib/community-auth';
export async function POST(request:Request){
  if(!sameOriginJson(request))return Response.json({error:'Invalid request.'},{status:403});
  const member=await memberFromCookie(request.headers.get('cookie')); if(!member)return Response.json({error:'Open the community from the NEVULA app to post.'},{status:401});
  const body=await request.json() as {title?:string;body?:string;category?:string;nickname?:string};
  const title=body.title?.trim()??'',copy=body.body?.trim()??'';
  if(title.length<5||title.length>120||copy.length<10||copy.length>5000)return Response.json({error:'Check title and message.'},{status:400});
  const database=await db(); const recent=await database.prepare(`SELECT count(*) n FROM community_posts WHERE author_id=? AND created_at>datetime('now','-10 minutes')`).bind(member.user_id).first<{n:number}>();
  if((recent?.n??0)>=3)return Response.json({error:'Please wait before creating another post.'},{status:429});
  const id=crypto.randomUUID(); await database.prepare(`INSERT INTO community_posts(id,author_id,title,body,category) VALUES(?,?,?,?,?)`).bind(id,member.user_id,title,copy,['bug','idea','question'].includes(body.category??'')?body.category:'question').run();
  return Response.json({id});
}
