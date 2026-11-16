import { NextResponse, type NextRequest } from "next/server";
import { cmsBackend } from "./server/cms/source";
import { getCatalogService } from "./server/catalog/runtime";
import { isInvalidPublicInput } from "./server/public-input";

export async function proxy(request:NextRequest){
  if(cmsBackend()==="legacy")return NextResponse.next();
  let path:string;
  try{path=decodeURI(request.nextUrl.pathname);}catch{return NextResponse.next();}
  try{
    const rule=await getCatalogService().getRedirect(path);
    if(!rule)return NextResponse.next();
    return NextResponse.redirect(new URL(rule.targetPath,request.url),{status:rule.statusCode,headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(isInvalidPublicInput(error))return NextResponse.next();
    return new NextResponse("Content temporarily unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
export const config={matcher:["/((?!api|admin|account|_next|images|videos|fonts|homepage|seo|favicon.ico|robots.txt|sitemap.xml).*)"]};
