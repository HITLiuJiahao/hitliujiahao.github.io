/* Bounded, persistent cache. Only public, normalized data is stored. */
(() => {
  'use strict';
  const KEY='niulai.public-data.v1', VERSION=1, LIMIT=100, MAX_BYTES=2200000;
  const RETRY=60000, FORCE_COOLDOWN=30000;
  let memory={}, persistent=true;
  const pending=new Map();
  function readStore(){
    try {
      const raw=localStorage.getItem(KEY);
      if(!raw)return {};
      const parsed=JSON.parse(raw);
      return parsed.version===VERSION && parsed.entries && typeof parsed.entries==='object' && !Array.isArray(parsed.entries) ? parsed.entries : {};
    } catch(error){
      if(error.name!=='SyntaxError')persistent=false;
      return {};
    }
  }
  function entry(key){
    const disk=readStore()[key], ram=memory[key];
    if(disk && (!ram || (disk.attemptAt||0)>(ram.attemptAt||0)))memory[key]=disk;
    return memory[key];
  }
  function write(key,value){
    memory={...readStore(),...memory,[key]:value};
    const now=Date.now();
    const items=Object.entries(memory).filter(([,v])=>v && Number.isFinite(v.usedAt) && now-v.usedAt<30*86400000)
      .sort((a,b)=>b[1].usedAt-a[1].usedAt).slice(0,LIMIT);
    memory=Object.fromEntries(items);
    let serialized=JSON.stringify({version:VERSION,entries:memory});
    while(serialized.length*2>MAX_BYTES && items.length>1){items.pop();memory=Object.fromEntries(items);serialized=JSON.stringify({version:VERSION,entries:memory});}
    try {localStorage.setItem(KEY,serialized);persistent=true;}
    catch {persistent=false;}
  }
  function valid(record,config){
    try {return record && record.schema===config.schema && Number.isFinite(record.fetchedAt) && record.fetchedAt>0 && record.fetchedAt<=Date.now()+60000 && Date.now()-record.fetchedAt<=config.maxAge && config.validate(record.data);}catch{return false;}
  }
  function result(record,config,via,error=''){
    return {data:record.data,fetchedAt:record.fetchedAt,expiresAt:record.fetchedAt+config.ttl,
      stale:Date.now()-record.fetchedAt>=config.ttl,via,error,persistent};
  }
  function peek(key,config){
    const record=entry(key);
    return valid(record,config)?result(record,config,'cache'):null;
  }
  function waitFor(promise,signal){
    if(!signal)return promise;
    if(signal.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
    return new Promise((resolve,reject)=>{
      const abort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
      const cleanup=()=>signal.removeEventListener('abort',abort);
      signal.addEventListener('abort',abort,{once:true});
      promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    });
  }
  async function resolve(key,config,force){
    const previous=entry(key), now=Date.now(), usable=valid(previous,config);
    const age=usable ? now-previous.fetchedAt : Infinity;
    if(usable && !force && age<config.ttl){write(key,{...previous,usedAt:now});return result(previous,config,'cache');}
    // Failed updates retain the original fetch time; never make stale data look new.
    if(previous?.schema===config.schema && now-previous.attemptAt<(previous.failed?RETRY:force?FORCE_COOLDOWN:0)){
      if(usable)return result(previous,config,'cache',previous.failed?'更新未成功，暂用已保存数据':'');
      return {data:null,error:'暂时无法取得数据，请稍后重试',via:'cache',stale:false,persistent};
    }
    try {
      const data=await config.fetcher();
      if(!config.validate(data))throw new Error('数据格式无法识别');
      const saved={schema:config.schema,data,fetchedAt:Date.now(),attemptAt:Date.now(),usedAt:Date.now(),failed:false};
      write(key,saved);
      return result(saved,config,'network');
    } catch(error){
      const saved={...(usable?previous:{}),schema:config.schema,attemptAt:Date.now(),usedAt:Date.now(),failed:true};
      write(key,saved);
      if(usable)return result(previous,config,'cache','更新未成功，暂用已保存数据');
      return {data:null,error:'暂时无法取得数据，请稍后重试',via:'network',stale:false,persistent};
    }
  }
  function get(key,config,{force=false,signal}={}){
    if(signal?.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
    if(!pending.has(key)){
      // One request serves all callers. Cancelling one view must not cancel another.
      // Where available, a Web Lock also prevents duplicate fetches across tabs.
      const task=navigator.locks?.request ? Promise.resolve().then(()=>navigator.locks.request(`niulai:${key}`,()=>resolve(key,config,force))).catch(()=>resolve(key,config,force)) : resolve(key,config,force);
      pending.set(key,task);
      task.finally(()=>{if(pending.get(key)===task)pending.delete(key);}).catch(()=>{});
    }
    return waitFor(pending.get(key),signal);
  }
  window.NiulaiCache=Object.freeze({get,peek,info:()=>({persistent,limit:LIMIT}),policy:Object.freeze({retry:RETRY,refreshCooldown:FORCE_COOLDOWN})});
})();
