import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { configuredOrigin } from "@/lib/security/origin";
export const dynamic="force-dynamic";
const STATE_COOKIE="webstor_oauth_state", VERIFIER_COOKIE="webstor_oauth_verifier";
export async function GET() {
 const origin=configuredOrigin(), clientId=process.env.GOOGLE_CLIENT_ID?.trim(), secret=process.env.GOOGLE_CLIENT_SECRET?.trim();
 if(!origin||!clientId||!secret)return NextResponse.json({ok:false,error:"Google sign-in is not configured for this deployment."},{status:503,headers:{"Cache-Control":"no-store"}});
 const state=randomBytes(32).toString("base64url"), verifier=randomBytes(48).toString("base64url"), challenge=createHash("sha256").update(verifier).digest("base64url");
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 for(const [key,value] of Object.entries({client_id:clientId,redirect_uri:origin+"/api/auth/google/callback",response_type:"code",scope:"openid email profile",state,code_challenge:challenge,code_challenge_method:"S256",prompt:"select_account"}))url.searchParams.set(key,value);
 const response=NextResponse.redirect(url), options={httpOnly:true,secure:origin.startsWith("https://"),sameSite:"lax" as const,path:"/",maxAge:600};
 response.cookies.set(STATE_COOKIE,state,options);response.cookies.set(VERIFIER_COOKIE,verifier,options);return response;
}
