"use client";
import {useCallback,useEffect,useState} from "react";
import {fetchAdminPage, type AdminPage} from "@/lib/admin-collection";

export function useAdminCollection<T>(resource:string,input:{search?:string;status?:string;family?:string;category?:string}={}){
  const search=input.search??"",status=input.status??"all",family=input.family??"all",category=input.category??"all";
  const scope=JSON.stringify([resource,search,status,family,category]);
  const [paging,setPaging]=useState<{scope:string;cursor?:string;history:(string|undefined)[]}>({scope,history:[]});
  const cursor=paging.scope===scope?paging.cursor:undefined,history=paging.scope===scope?paging.history:[];
  const [revision,setRevision]=useState(0),[actionError,setError]=useState<string|null>(null);
  const key=JSON.stringify([scope,cursor,revision]);
  const [result,setResult]=useState<{key:string;page:AdminPage<T>;error:string|null}>();
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{
      setError(null);
      fetchAdminPage<T>(fetch,resource,{limit:20,cursor,search,status,family,category}).then(page=>{
        if(active)setResult({key,page,error:null});
      }).catch(reason=>{
        if(active)setResult({key,page:{items:[],nextCursor:null},error:reason instanceof Error?reason.message:"Data is unavailable"});
      });
    },150);
    return()=>{active=false;clearTimeout(timer);};
  },[resource,cursor,search,status,family,category,key]);
  const reload=useCallback(()=>setRevision(value=>value+1),[setRevision]);
  const loading=result?.key!==key,page=loading?undefined:result?.page;
  return{items:page?.items??[],loading,error:actionError??(loading?null:result?.error??null),setError,backend:result?.page.backend,reload,
    nextCursor:page?.nextCursor??null,pageNumber:history.length+1,hasPrevious:history.length>0,
    next(){if(page?.nextCursor)setPaging({scope,cursor:page.nextCursor,history:[...history,cursor]});},
    previous(){if(history.length)setPaging({scope,cursor:history.at(-1),history:history.slice(0,-1)});}};
}
