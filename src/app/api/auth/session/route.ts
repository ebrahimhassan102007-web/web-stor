import { NextResponse } from "next/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
export const dynamic="force-dynamic";
export async function GET(){
 try {const user=await getCurrentAccountUser();return NextResponse.json({ok:true,data:{user:user?{id:user.id,name:user.name,email:user.email}:null}},{headers:{"Cache-Control":"private, no-store"}});}
 catch{return NextResponse.json({ok:false,error:"Unable to load account session."},{status:500,headers:{"Cache-Control":"private, no-store"}});}
}
