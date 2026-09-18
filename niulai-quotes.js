/* Independent quotes and shared, source-dated fallback snapshots. */
(() => {
  'use strict';
  const DAY=86400000,shards=16;
  const n=value=>value!==null && value!==undefined && String(value).trim()!=='' && Number.isFinite(Number(value))?Number(value):null;
  const currencyNames={CNY:'人民币',HKD:'港元',USD:'美元'};
  function symbol(stock){
    if(stock.market==='CN' && /^\d{6}$/.test(stock.code))return {沪市:'sh',深市:'sz',北交所:'bj'}[stock.exchange]+stock.code;
    if(stock.market==='HK' && /^\d{5}$/.test(stock.code))return 'hk'+stock.code;
    if(stock.market==='US' && /^[A-Z][A-Z0-9.$-]{0,20}$/.test(stock.code))return 'us'+stock.code;
    throw new Error('Unknown security identifier');
  }
  function validTime(value){
    return typeof value==='string' && /^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value) && Number.isFinite(Date.parse(value.replace(' ','T')+'Z')) && new Date(value.replace(' ','T')+'Z').toISOString().slice(0,10)===value.slice(0,10);
  }
  function matches(code,stock){
    return stock.market==='US'?code.replace(/\.(OQ|N|AM|P|Z|OB|PK)$/,'')===stock.code:code===stock.code;
  }
  function fromFields(fields,stock){
    if(!Array.isArray(fields)||fields.length<38||!matches(String(fields[2]).toUpperCase(),stock))throw new Error('Quote does not match security');
    let stamp=String(fields[30]).replace(/\//g,'-');
    if(/^\d{14}$/.test(stamp))stamp=stamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,'$1-$2-$3 $4:$5:$6');
    const price=n(fields[3]);if(price===null||price<=0||!validTime(stamp))throw new Error('No valid quote');
    let volume=n(fields[6]),amount=n(fields[37]);
    volume=volume!==null&&volume>=0?Math.round(volume*(stock.market==='CN'?100:1)):null;
    amount=amount!==null&&amount>=0?amount*(stock.market==='CN'?10000:1):null;
    if(stock.market==='CN'){
      const trade=String(fields[35]).split('/');if(trade.length===3&&n(trade[2])!==null&&+trade[2]>=0)amount=+trade[2];
    }
    const unit=fields.slice(30).find(v=>['CNY','HKD','USD'].includes(v)) || (stock.market==='CN'?'CNY':stock.market==='US'?'USD':null);
    return {id:stock.id||`${stock.market}:${stock.code}`,symbol:symbol(stock),providerSymbol:stock.market==='US'?'us'+String(fields[2]).toUpperCase():symbol(stock),price,change:n(fields[32]),volume,amount,time:stamp,
      currencyCode:unit,currency:currencyNames[unit]||'币种未提供',timezone:stock.market==='US'?'美东时间':'北京时间',decimals:Math.min(6,Math.max(2,String(fields[3]).split('.')[1]?.length||0)),delayed:stock.market==='US',delivery:'live'};
  }
  function valid(value,stock){
    return value?.id===(stock.id||`${stock.market}:${stock.code}`) && Number.isFinite(value.price) && value.price>0 && validTime(value.time) && (value.change===null||Number.isFinite(value.change)) && [value.volume,value.amount].every(v=>v===null||Number.isFinite(v)&&v>=0) && Number.isInteger(value.decimals) && value.decimals>=0 && value.decimals<=6 && typeof value.currency==='string';
  }
  async function request(url,encoding='utf-8'){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
    try {
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error('Quote source unavailable');
      const buffer=await response.arrayBuffer();if(buffer.byteLength>1500000)throw new Error('Unexpected response size');
      return new TextDecoder(encoding).decode(buffer);
    } finally {clearTimeout(timer);}
  }
  function parse(text,stock){
    const id=symbol(stock);
    for(const match of text.matchAll(/v_([A-Za-z0-9_.$-]+)="([^"\r\n]*)";/g))if(match[1]===id)return fromFields(match[2].split('~'),stock);
    throw new Error('Quote not returned');
  }
  async function live(stock){
    for(const host of ['qt.gtimg.cn','sqt.gtimg.cn']){
      try{return parse(await request(`https://${host}/q=${encodeURIComponent(symbol(stock))}`,'gb18030'),stock);}catch{}
    }
    throw new Error('No public quote');
  }
  function bucket(stock){let hash=0;for(const c of `${stock.market}:${stock.code}`)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;return hash%shards;}
  function snapshotConfig(stock){
    const part=bucket(stock),base=location.protocol==='file:'?'https://hitliujiahao.github.io/':document.baseURI;
    return {key:`quote-snapshot:v5:${part}`,config:{schema:1,ttl:DAY,maxAge:7*DAY,
      validate:d=>d?.version===1 && typeof d.generatedAt==='string' && Number.isFinite(Date.parse(d.generatedAt)) && Date.now()-Date.parse(d.generatedAt)<=7*DAY && Date.parse(d.generatedAt)<=Date.now()+60000 && d.records && typeof d.records==='object',
      fetcher:async()=>JSON.parse(await request(new URL(`data/quotes/${part}.json?v=5`,base).href))}};
  }
  function savedResult(stock,section){
    const record=section?.data?.records?.[`${stock.market}:${stock.code}`];if(!record)return {data:null,error:'网站备用数据中暂未取得有效报价',via:'snapshot',stale:false};
    const quote={id:stock.id||`${stock.market}:${stock.code}`,symbol:symbol(stock),providerSymbol:record.s,price:record.p,change:record.c,volume:record.v,amount:record.a,time:record.t,decimals:record.d,currencyCode:record.u,currency:currencyNames[record.u]||'币种未提供',timezone:stock.market==='US'?'美东时间':'北京时间',delayed:stock.market==='US',delivery:'snapshot'};
    if(!valid(quote,stock))return {data:null,error:'备用报价未通过检查',via:'snapshot',stale:false};
    const capturedAt=Date.parse(section.data.generatedAt);
    return {data:quote,via:'snapshot',fetchedAt:capturedAt,expiresAt:capturedAt+5*60000,stale:Date.now()-capturedAt>5*60000,error:'',persistent:section.persistent};
  }
  async function saved(stock,options){const {key,config}=snapshotConfig(stock);return savedResult(stock,await window.NiulaiCache.get(key,config,options));}
  function peek(stock){const {key,config}=snapshotConfig(stock);return savedResult(stock,window.NiulaiCache.peek(key,config));}
  window.NiulaiQuotes=Object.freeze({symbol,fromFields,valid,live,saved,peek});
})();
