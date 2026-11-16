import {handleAdminRequest} from "../../../../../server/auth/admin-runtime.ts";

export const runtime="nodejs";
export async function GET(request:Request){
  const url=new URL(request.url);
  url.searchParams.append("facet","categories");
  return handleAdminRequest("blogs",new Request(url,request));
}
