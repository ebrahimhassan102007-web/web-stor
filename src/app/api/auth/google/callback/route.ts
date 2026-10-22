import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/lib/db";
import { makeAccountSessionCookie } from "@/lib/security/account-session";
import { configuredOrigin } from "@/lib/security/origin";
export const dynamic="force-dynamic";
const STATE="webstor_oauth_state", VERIFIER="webstor_oauth_verifier";
const userSchema=z.object({sub:z.string().min(1).max(256),email:z.string().trim().toLowerCase().email().max(254),email_verified:z.boolean(),name:z.string().trim().min(1).max(128),picture:z.string().url().max(2048).optional()});
function same(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);}
function clear(response:NextResponse,secure:boolean){const o={httpOnly:true,secure,sameSite:"lax" as const,path:"/",maxAge:0};response.cookies.set(STATE,"",o);response.cookies.set(VERIFIER,"",o);}
function fail(origin:string,code:string){const url=new URL("/login",origin);url.searchParams.set("error",code);const r=NextResponse.redirect(url);clear(r,origin.startsWith("https://"));return r;}
export async function GET(request:NextRequest){
 const origin=configuredOrigin();if(!origin)return NextResponse.json({ok:false,error:"Sign-in origin is not configured."},{status:503});
 const store=await cookies(),expected=store.get(STATE)?.value??"",verifier=store.get(VERIFIER)?.value??"",state=request.nextUrl.searchParams.get("state")??"",code=request.nextUrl.searchParams.get("code")??"";
 if(request.nextUrl.searchParams.has("error"))return fail(origin,"google_failed");
 if(!code||!state||!expected||!verifier||!same(state,expected))return fail(origin,"oauth_state");
 const clientId=process.env.GOOGLE_CLIENT_ID?.trim(),secret=process.env.GOOGLE_CLIENT_SECRET?.trim();if(!clientId||!secret)return fail(origin,"google_not_configured");
 try{
  const tokenRes=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},cache:"no-store",body:new URLSearchParams({client_id:clientId,client_secret:secret,code,code_verifier:verifier,grant_type:"authorization_code",redirect_uri:origin+"/api/auth/google/callback"})});
  if(!tokenRes.ok)return fail(origin,"google_failed");
  const token=await tokenRes.json().catch(()=>null) as {access_token?:unknown}|null;if(!token||typeof token.access_token!=="string")return fail(origin,"google_failed");
  const profileRes=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+token.access_token},cache:"no-store"});if(!profileRes.ok)return fail(origin,"google_failed");
  const parsed=userSchema.safeParse(await profileRes.json().catch(()=>null));if(!parsed.success||!parsed.data.email_verified)return fail(origin,"google_failed");
  const p=parsed.data;const [existing]=await db.select({id:users.id}).from(users).where(eq(users.googleSub,p.sub)).limit(1);
  let id:string;
  if(existing){await db.update(users).set({email:p.email,avatarUrl:p.picture??"",updatedAt:new Date()}).where(eq(users.id,existing.id));id=existing.id;}
  else {const [created]=await db.insert(users).values({googleSub:p.sub,email:p.email,name:p.name,avatarUrl:p.picture??""}).returning({id:users.id});if(!created)return fail(origin,"google_failed");id=created.id;}
  const cookie=makeAccountSessionCookie(id),response=NextResponse.redirect(new URL("/account",origin));response.cookies.set(cookie.name,cookie.value,cookie.options);clear(response,origin.startsWith("https://"));return response;
 }catch{return fail(origin,"google_failed");}
}
