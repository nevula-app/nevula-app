// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, randomToken, sha256 } from '@/lib/community-db';
import { authResponse, rateLimit } from '@/lib/community-auth';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) throw new Error('Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
export async function POST(request:Request){
  const authorization=request.headers.get('authorization'); const apiKey=request.headers.get('x-nevula-api-key');
  if(!authorization?.startsWith('Bearer ')||!apiKey)return Response.json({error:'App verification required.'},{status:401});
  const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{authorization,apikey:apiKey}});
  if(!userResponse.ok)return Response.json({error:'Invalid NEVULA app session.'},{status:401});
  const user=await userResponse.json() as {id?:string}; if(!user.id)return Response.json({error:'Invalid app identity.'},{status:401});
  if(!await rateLimit(`app-code:${user.id}`,5,120000))return authResponse({error:'Please wait before opening the community again.'},429);
  const keyResponse=await fetch(`${supabaseUrl}/rest/v1/personal_delete_keys?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,{headers:{authorization,apikey:apiKey}});
  const keys=keyResponse.ok?await keyResponse.json() as unknown[]:[]; if(!keys.length)return Response.json({error:'Complete NEVULA setup before joining the community.'},{status:403});
  const code=randomToken(); const database=await db();
  const suspended=await database.prepare('SELECT user_id FROM community_members WHERE user_id=? AND suspended_at IS NOT NULL').bind(user.id).first();
  if(suspended)return authResponse({error:'Community access unavailable.'},403);
  await database.prepare('DELETE FROM community_login_codes WHERE expires_at<=?').bind(Date.now()).run();
  await database.prepare(`INSERT INTO community_login_codes(code_hash,user_id,expires_at) VALUES(?,?,?)`).bind(await sha256(code),user.id,Date.now()+120000).run();
  return authResponse({code,expiresInSeconds:120});
}
