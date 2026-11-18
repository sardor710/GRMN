import { NextResponse, type NextRequest } from "next/server";
import { cmsBackend } from "./server/cms/source";
import { getCatalogService } from "./server/catalog/runtime";
import { isInvalidPublicInput } from "./server/public-input";
import { maintenanceGate } from "./server/operations/maintenance-runtime";

// Paths that never had redirect rules (the previous matcher's exclusions).
const NO_REDIRECTS = /^\/(api|admin|account|_next|images|videos|fonts|homepage|seo)(\/|$)|^\/(favicon\.ico|robots\.txt|sitemap\.xml)$/;

export async function proxy(request:NextRequest){
  // Task 23 G1: the maintenance freeze gates pages and every /api route, in both modes.
  const frozen=await maintenanceGate(request.nextUrl.pathname,request.method,request.headers);
  if(frozen)return frozen;
  if(cmsBackend()==="legacy"||NO_REDIRECTS.test(request.nextUrl.pathname))return NextResponse.next();
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
// Static assets stay outside the proxy (they are not writes); pages and /api are both gated.
export const config={matcher:["/((?!_next/static|_next/image|images|videos|fonts|homepage|seo|favicon.ico|robots.txt).*)"]};
