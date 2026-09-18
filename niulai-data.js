/* Read-only Tencent public data; calculations are local, with no model service. */
(() => {
  'use strict';
  const PROXY='https://proxy.finance.qq.com/ifzqgtimg/', DAY=86400000;
  const finite=value=>value!==null && value!=='' && value!==undefined && Number.isFinite(Number(value));
  const number=value=>finite(value)?Number(value):null;
  const clean=value=>String(value??'').replace(/\\u([a-f0-9]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))).replace(/\\\//g,'/').replace(/<[^>]*>/g,'').trim();
  const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function symbol(stock){
    if(stock.market==='CN' && /^\d{6}$/.test(stock.code))return (stock.exchange==='沪市'?'sh':stock.exchange==='深市'?'sz':'bj')+stock.code;
    if(stock.market==='HK' && /^\d{5}$/.test(stock.code))return 'hk'+stock.code;
    if(stock.market==='US' && /^[A-Z][A-Z0-9.\-]{0,12}$/.test(stock.code)){
      const suffix={Nasdaq:'OQ',NYSE:'N','NYSE American':'AM'}[stock.exchange];
      return suffix?'us'+stock.code+'.'+suffix:null;
    }
    return null;
  }
  async function json(url){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('Source unavailable');
      const text=await response.text();
      if(text.length>1500000)throw new Error('Unexpected response size');
      const data=JSON.parse(text);
      if(Number(data.code)!==0 || !data.data)throw new Error('Source unavailable');
      return data.data;
    } finally {clearTimeout(timer);}
  }
  function parseMarket(data,id,stock){
    const item=data[id];
    if(!item || typeof item!=='object')throw new Error('Wrong security');
    const raw=Array.isArray(item.qfqday)?item.qfqday:Array.isArray(item.day)?item.day:[];
    const basis=Array.isArray(item.qfqday)?'前复权':'未复权';
    const bars=raw.map(row=>({date:String(row[0]),open:number(row[1]),close:number(row[2]),high:number(row[3]),low:number(row[4]),volume:number(row[5])}));
    const tomorrow=new Date(Date.now()+DAY).toISOString().slice(0,10);
    if(!bars.length || bars.some((b,i)=>!dateValid(b.date) || b.date>tomorrow || [b.open,b.close,b.high,b.low].some(v=>v===null||v<=0) || b.volume===null || b.volume<0 || b.high<Math.max(b.open,b.close,b.low)-.01 || b.low>Math.min(b.open,b.close,b.high)+.01 || i>0&&b.date<=bars[i-1].date))throw new Error('Invalid prices');
    // Old unsupported symbols can return one ancient bar and today's quote.
    let gap=-1;
    for(let i=1;i<bars.length;i++)if(Date.parse(bars[i].date)-Date.parse(bars[i-1].date)>60*DAY)gap=i;
    const history=bars.slice(Math.max(0,gap));
    const q=item.qt?.[id];
    let quote=null;
    if(Array.isArray(q) && q.length>32){
      const expected=stock.market==='US'?id.slice(2):stock.code;
      if(String(q[2]).toUpperCase()!==expected.toUpperCase())throw new Error('Quote security mismatch');
      let time=String(q[30]||'').replace(/\//g,'-');
      if(/^\d{14}$/.test(time))time=time.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,'$1-$2-$3 $4:$5:$6');
      if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time) && finite(q[3]) && +q[3]>0)quote={price:+q[3],change:number(q[32]),time,delayed:stock.market==='US'||q[0]==='delay'};
    }
    const last=history.at(-1),closeTime=stock.market==='CN'?'15:00':stock.market==='HK'?'16:10':'16:00';
    const partial=!quote || (quote.time.slice(0,10)===last.date && quote.time.slice(11,16)<closeTime);
    return {symbol:id,bars:history,basis,quote,partial,currency:{CN:'人民币',HK:'港元',US:'美元'}[stock.market],timezone:stock.market==='US'?'美东时间':'北京时间'};
  }
  function link(value){
    try {const u=new URL(value);return u.protocol==='https:' && /(^|\.)qq\.com$/.test(u.hostname) && !u.username && !u.password ? u.href:'';}catch{return '';}
  }
  function parseNews(data,id,industry=false){
    const raw=industry?data.news:data.data;
    if(!Array.isArray(raw))throw new Error('Invalid news');
    const seen=new Set(),items=[];
    for(const row of raw){
      if(!industry && row.symbol && row.symbol.toUpperCase()!==id.toUpperCase())continue;
      if(+row.private>0 || +row.needKey>0)continue;
      const title=clean(row.title),time=clean(row.time||row.pub_time),url=link(row.url);
      if(!title || !/^\d{4}-\d{2}-\d{2}/.test(time) || !dateValid(time.slice(0,10)) || seen.has(title))continue;
      if(Date.parse(time.slice(0,10))>Date.now()+DAY)continue;
      seen.add(title);items.push({title:title.slice(0,220),time,url,source:clean(row.src).slice(0,80),id:clean(row.id).slice(0,100)});
    }
    return {items:items.sort((a,b)=>b.time.localeCompare(a.time)).slice(0,12),plateCode:industry?clean(data.ptCode):''};
  }
  function parseProfile(data,stock){
    let industries=[],business='',reportDate='',revenue=[],financial=null;
    if(stock.market==='CN'){
      if(!data.gsjj)throw new Error('Profile unavailable');
      industries=(data.gsjj.plate||[]).map(p=>({name:clean(p.name),id:clean(p.id)}));
      business=clean(data.gsjj.yw);
      const latest=data.zysr?.[0];reportDate=clean(latest?.date);
      const parts=latest?.detail?.find(x=>x.type==='sector') || latest?.detail?.find(x=>x.type==='product');
      revenue=(parts?.detail||[]).map(x=>({name:clean(x.name),share:number(x.zb)}));
      const f=data.zyzb?.detail;
      if(f)financial={date:clean(data.zyzb.date),revenue:clean(f.yyzsr),profit:clean(f.jlr),revenueGrowth:number(clean(f.zsrzzl).replace('%','')),profitGrowth:number(clean(f.jlrzzl).replace('%',''))};
    }else if(stock.market==='HK'){
      if(!data.basic)throw new Error('Profile unavailable');
      industries=(data.basic.plate||[]).map(p=>({name:clean(p.name),id:clean(p.id)}));business=clean(data.basic.Business);
      const latest=data.zysr?.[0];reportDate=clean(latest?.date);
      const parts=latest?.detail?.find(x=>x.type==='sector') || latest?.detail?.find(x=>x.type==='product');
      revenue=(parts?.detail||[]).map(x=>({name:clean(x.ItemsName),share:number(x.SubsectionIncomeRatio)}));
    }else{
      if(!data.jbxx)throw new Error('Profile unavailable');
      industries=data.jbxx.industry?[{name:clean(data.jbxx.industry.name),id:clean(data.jbxx.industry.code)}]:[];
      business=clean(data.jbxx.jianjie);
      const latest=data.srgc?.[0];reportDate=clean(latest?.date);
      revenue=(latest?.detail||[]).map(x=>({name:clean(x.label),share:number(clean(x.zb).replace('%',''))}));
    }
    revenue=revenue.filter(x=>x.name && x.share!==null && x.share>=0 && x.share<=100).sort((a,b)=>b.share-a.share);
    if(revenue.reduce((sum,x)=>sum+x.share,0)>101)revenue=[];
    return {industries:industries.filter(x=>x.name).slice(0,5),business:business.slice(0,1500),reportDate,revenue:revenue.slice(0,12),financial};
  }
  function configs(stock){
    const id=symbol(stock);
    if(!id)return {};
    const param=encodeURIComponent(id);
    const profileURL=stock.market==='CN'?`${PROXY}appstock/app/stockinfo/jiankuang?code=${param}&app=official_website`:stock.market==='HK'?`${PROXY}appstock/app/hkStockinfo/jiankuang?code=${param}`:`${PROXY}appstock/us/introduce/brief?symbol=${param}`;
    const newsValid=d=>d && Array.isArray(d.items) && d.items.length<=12 && d.items.every(n=>n && typeof n.title==='string' && typeof n.time==='string' && dateValid(n.time.slice(0,10)) && typeof n.source==='string' && typeof n.url==='string' && (!n.url || link(n.url)===n.url));
    return {
      market:{schema:1,ttl:5*60000,maxAge:7*DAY,validate:d=>d?.symbol===id && Array.isArray(d.bars) && d.bars.length>0 && d.bars.length<=250 && d.bars.every((b,i)=>b && [b.open,b.close,b.high,b.low,b.volume].every(Number.isFinite) && b.close>0 && b.volume>=0 && dateValid(b.date) && (!i || b.date>d.bars[i-1].date)) && ['前复权','未复权'].includes(d.basis) && typeof d.currency==='string' && (!d.quote || Number.isFinite(d.quote.price) && typeof d.quote.time==='string' && (d.quote.change===null || Number.isFinite(d.quote.change))),fetcher:async()=>parseMarket(await json(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${param},day,,,180,qfq`),id,stock)},
      profile:{schema:1,ttl:DAY,maxAge:30*DAY,validate:d=>d && Array.isArray(d.industries) && d.industries.every(i=>i && typeof i.name==='string' && typeof i.id==='string') && Array.isArray(d.revenue) && d.revenue.every(p=>p && typeof p.name==='string' && Number.isFinite(p.share) && p.share>=0 && p.share<=100) && typeof d.business==='string' && typeof d.reportDate==='string',fetcher:async()=>parseProfile(await json(profileURL),stock)},
      news:{schema:1,ttl:15*60000,maxAge:7*DAY,validate:newsValid,fetcher:async()=>parseNews(await json(`${PROXY}appstock/news/info/search?page=1&symbol=${param}&n=12&type=2`),id)},
      ...(stock.market==='CN'?{industryNews:{schema:1,ttl:15*60000,maxAge:7*DAY,validate:newsValid,fetcher:async()=>parseNews(await json(`${PROXY}appstock/news/HyNews/getBySymbol?symbol=${param}`),id,true)}}:{})
    };
  }
  function key(stock,kind){return `${stock.market}:${stock.code}:${kind}`;}
  function peek(stock){
    const report={stock,source:'腾讯自选股',symbol:symbol(stock),sections:{}};
    for(const [kind,config] of Object.entries(configs(stock)))report.sections[kind]=window.NiulaiCache.peek(key(stock,kind),config);
    return report;
  }
  async function load(stock,options={}){
    const report={stock,source:'腾讯自选股',symbol:symbol(stock),sections:{}};
    await Promise.all(Object.entries(configs(stock)).map(async([kind,config])=>{report.sections[kind]=await window.NiulaiCache.get(key(stock,kind),config,options);}));
    return report;
  }
  function calculate(market){
    const bars=market?.bars||[],closes=bars.map(b=>b.close);
    const ma=closes.map((_,i)=>i>=19?average(closes.slice(i-19,i+1)):null);
    const change=closes.length>=20?(closes.at(-1)/closes.at(-20)-1)*100:null;
    const distance=ma.at(-1)?(closes.at(-1)/ma.at(-1)-1)*100:null;
    const completed=market?.partial?bars.slice(0,-1):bars, end=completed.at(-1);
    const base=completed.length>=6?average(completed.slice(-6,-1).map(b=>b.volume)):null;
    const volumeRatio=base>0?end.volume/base:null;
    const ema=(values,period)=>{let prev=values[0];return values.map(v=>prev=v*2/(period+1)+prev*(1-2/(period+1)));};
    const fast=ema(closes,12),slow=ema(closes,26),dif=fast.map((v,i)=>v-slow[i]),dea=ema(dif,9),macd=dif.map((v,i)=>(v-dea[i])*2);
    const rsi=closes.map((_,i)=>{if(i<14)return null;const changes=closes.slice(i-14,i+1).slice(1).map((v,j)=>v-closes[i-14+j]);const gain=average(changes.map(v=>Math.max(v,0))),loss=average(changes.map(v=>Math.max(-v,0)));return gain+loss?gain/(gain+loss)*100:50;});
    return {ma,change,distance,volumeRatio,volumeDate:end?.date,dif,dea,macd,rsi};
  }
  window.NiulaiData=Object.freeze({load,peek,symbol,calculate,sourceURL:stock=>{const id=symbol(stock);return id?`https://gu.qq.com/${encodeURIComponent(id)}/gp`:'https://gu.qq.com/';}});
})();
