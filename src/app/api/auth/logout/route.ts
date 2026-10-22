import { NextRequest,NextResponse } from "next/server";
import { ACCOUNT_COOKIE } from "@/lib/security/account-session";
import { verifySameOrigin } from "@/lib/security/csrf";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 if(!verifySameOrigin(request))return NextResponse.json({ok:false,error:"Request rejected."},{status:403});
 const response=NextResponse.json({ok:true,data:{signedOut:true}},{headers:{"Cache-Control":"private, no-store"}});
 response.cookies.set(ACCOUNT_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return response;
}
