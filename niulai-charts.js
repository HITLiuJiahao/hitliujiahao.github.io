/* Visual explanations from observed data only. No synthetic fallback or buy score. */
(() => {
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const red='#e57267',blue='#899dbc',green='#78a996';
  const number=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const signed=v=>Number.isFinite(v)?`${v>0?'+':''}${number(v)}%`:'—';
  const text=(x,y,label,extra='')=>`<text x="${x}" y="${y}" ${extra}>${escape(label)}</text>`;
  const svg=(label,body,height=164)=>`<svg xmlns="http://www.w3.org/2000/svg" class="nl-chart-svg" viewBox="0 0 320 ${height}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${body}</svg>`;
  const path=(values,x,y)=>{let started=false;return values.map((v,i)=>{if(!Number.isFinite(v)){started=false;return '';}const command=started?'L':'M';started=true;return `${command}${x(i).toFixed(2)},${y(v).toFixed(2)}`;}).join(' ');};
  const time=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  let report=null,view={days:20,point:19,indicator:'MACD'},metrics=null;
  const missing=message=>`<div class="nl-data-missing"><span>暂缺</span><p>${escape(message)}</p></div>`;
  const caption=(n,title,extra='')=>`<div class="nl-chart-heading"><h4><span>${n}</span>${title}</h4>${extra}</div>`;
  function currentQuote(){
    const candidates=[report.sections.quote?.data,report.sections.market?.data?.quote,report.sections.savedQuote?.data].filter(Boolean);
    return candidates.sort((a,b)=>b.time.localeCompare(a.time)||(a.delivery==='snapshot'?1:0)-(b.delivery==='snapshot'?1:0))[0]||null;
  }
  function compact(value,unit){
    if(!Number.isFinite(value))return '暂缺';
    return value>=1e8?number(value/1e8)+' 亿'+unit:value>=1e4?number(value/1e4)+' 万'+unit:number(value,unit==='股'?0:2)+' '+unit;
  }
  function quoteCard(){
    const q=currentQuote();
    if(!q)return missing('暂未取得有效报价，正在显示的其他资料不受影响。');
    const old=Date.now()-Date.parse(q.time.slice(0,10))>7*86400000;
    return `<div class="nl-live-quote"><strong>${number(q.price,q.decimals)}</strong><span class="${q.change>=0?'nl-positive':'nl-negative'}">${signed(q.change)}</span><small>${escape(q.currency)} · 可能延迟</small></div><div class="nl-quote-metrics"><div aria-label="成交量 ${number(q.volume,0)} 股"><span>成交股数</span><strong>${compact(q.volume,'股')}</strong></div><div aria-label="成交额 ${number(q.amount,2)} ${escape(q.currency)}"><span>成交金额</span><strong>${compact(q.amount,escape(q.currency))}</strong></div></div><p class="nl-data-stamp">${escape(q.time)} · ${escape(q.timezone)} · 该交易日累计</p>${q.delivery==='snapshot'?'<p class="nl-quote-backup">正在使用网站保存的真实报价，非实时；以显示的行情时间为准。</p>':''}${old?'<p class="nl-coverage-note">报价日期较早，可能处于停牌或来源尚未更新状态，请核对行情时间。</p>':''}`;
  }
  function stamp(section,label='腾讯自选股'){
    if(!section?.data)return '';
    return `<p class="nl-data-stamp">${escape(label)} · ${time(section.fetchedAt)} 获取${section.stale?' · 缓存已过期':''}${section.error?' · 更新未成功':''}</p>`;
  }
  function category(title){
    const rules=[
      [/财报|业绩|营收|净利|利润|季报|年报|半年报/,'公司业绩','看收入和利润是否一起改善'],
      [/回购|分红|派息|增持|减持/,'股东动作','看金额、实施时间和完成情况'],
      [/政策|监管|关税|制裁|禁令|法案|调查|诉讼/,'政策与风险','看适用范围，是否涉及这家公司'],
      [/订单|量产|产能|涨价|价格|芯片|AI|人工智能|需求|产品/,'生意与产品','看需求能否变成订单和收入'],
      [/股价|涨|跌|资金|指数|ETF|交易/,'市场动向','分清价格变化和实际经营变化']
    ];
    const rule=rules.find(([pattern])=>pattern.test(title));
    return rule?{name:rule[1],tip:rule[2]}:{name:'公司动态',tip:'原文事实与公司公告是否一致'};
  }
  function newsRows(items,industry=false){
    const render=item=>{
      const type=category(item.title);
      return `<li><div class="nl-news-meta"><span>${escape(industry?'行业资讯':type.name)}</span><time>${escape(item.time.slice(0,16))}</time></div>${item.url?`<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}<span aria-hidden="true"> ↗</span></a>`:`<strong>${escape(item.title)}</strong>`}<div class="nl-news-byline">${item.source?`原文来源：${escape(item.source)}`:'腾讯自选股收录'}</div>${industry?'':`<p class="nl-news-question">${escape(type.tip)}</p>`}</li>`;
    };
    return `<ol class="nl-news-timeline">${items.slice(0,3).map(render).join('')}</ol>${items.length>3?`<details class="nl-more-data"><summary>再看 ${items.length-3} 条相关报道</summary><ol class="nl-news-timeline">${items.slice(3).map(render).join('')}</ol></details>`:''}`;
  }
  function industry(){
    const section=report.sections.profile,p=section?.data,news=report.sections.industryNews;
    let content='';
    if(p){
      content+=`<div class="nl-industry-chips">${p.industries.map(i=>`<span>${escape(i.name)}</span>`).join('')||'<span>行业分类暂缺</span>'}</div>`;
      if(p.revenue.length){
        const translations={'Compute & Networking':'计算与网络','Graphics':'图形业务','Products':'产品','Services':'服务'};
        const parts=p.revenue.slice(0,5),largest=parts[0];
        content+=`<div class="nl-section-subhead"><strong>公司靠什么挣钱</strong><span>${escape(p.reportDate||'报告期未提供')}</span></div><p class="nl-reading-hint">收入中 ${number(largest.share,1)}% 来自${escape(translations[largest.name]||largest.name)}</p><div class="nl-revenue-bars" role="img" aria-label="${escape(p.reportDate)}收入构成：${escape(parts.map(x=>`${x.name} ${number(x.share,1)}%`).join('，'))}">${parts.map((part,i)=>`<div><div><span title="${escape(part.name)}">${escape(translations[part.name]||part.name)}</span><strong>${number(part.share,1)}%</strong></div><div class="nl-revenue-track"><i style="width:${part.share}%;background:${[red,blue,green,'#d5b181','#b6a0ba'][i]}"></i></div></div>`).join('')}</div><p class="nl-chart-footnote">收入占比，${p.revenue.length>5?'仅展示前 5 项；':''}不代表利润占比。</p>`;
      }else content+=missing('暂未取得公司的收入构成');
      if(p.financial?.date){
        const f=p.financial;
        content+=`<div class="nl-financial-pair"><div><span>收入比去年同期</span><strong class="${f.revenueGrowth>=0?'nl-positive':'nl-negative'}">${signed(f.revenueGrowth)}</strong></div><div><span>利润比去年同期</span><strong class="${f.profitGrowth>=0?'nl-positive':'nl-negative'}">${signed(f.profitGrowth)}</strong></div></div><p class="nl-chart-footnote">${escape(f.date)} · 公司数据，不能代替整个行业表现。</p>`;
      }
      if(p.business)content+=`<details class="nl-more-data"><summary>这家公司主要做什么</summary><p>${escape(p.business)}</p></details>`;
      content+=stamp(section,'腾讯自选股公司资料');
    }else content+=missing('暂未取得公司与行业资料');
    if(news?.data?.items.length){
      const name=p?.industries.find(i=>'pt'+i.id===news.data.plateCode)?.name;
      content+=`<div class="nl-section-subhead nl-industry-news-heading"><strong>${escape(name?name+'行业动态':'所属板块相关动态')}</strong><span>最新收录</span></div>${newsRows(news.data.items,true)}${stamp(news,'腾讯自选股行业资讯')}`;
    }else content+=`<p class="nl-coverage-note">${report.stock.market==='CN'?'暂未取得该股票的行业资讯，不代表行业没有新消息。':'暂未取得该市场的行业资讯列表；上方展示公司所属行业和业务资料。'}</p>`;
    return content;
  }
  function newsChart(){
    const section=report.sections.news,items=section?.data?.items||[];
    if(!items.length)return missing('暂未取得相关报道，不代表这家公司没有新闻。');
    const counts=new Map();items.forEach(item=>{const name=category(item.title).name;counts.set(name,(counts.get(name)||0)+1);});
    const groups=[...counts].sort((a,b)=>b[1]-a[1]);
    const chart=svg(`已取得的 ${items.length} 条报道，按标题关键词分类：${groups.map(([name,n])=>`${name}${n}条`).join('，')}。不是全网热度或利好利空统计。`,groups.map(([name,n],i)=>`${text(0,15+i*25,name)}<rect x="80" y="${4+i*25}" width="200" height="13" rx="3" fill="#f5f6fa"/><rect x="80" y="${4+i*25}" width="${n/items.length*200}" height="13" rx="3" fill="${i===0?red:blue}" opacity=".65"/>${text(315,15+i*25,n+'条','text-anchor="end"')}`).join(''),groups.length*25+2);
    return `<div class="nl-section-subhead"><strong>这些报道在关注什么</strong><span>已取得 ${items.length} 条</span></div>${chart}<p class="nl-chart-footnote">按标题关键词归类，仅帮助阅读；不代表新闻热度或利好、利空。</p>${newsRows(items)}${stamp(section,'腾讯自选股相关报道')}`;
  }
  function trend(){
    const market=report.sections.market?.data;
    if(!market)return missing(currentQuote()?'历史曲线暂未取得；上方价格、成交股数与成交额仍可查看。':'暂未取得历史曲线，不用模拟数值填充。');
    const all=market.bars,bars=all.slice(-view.days),n=bars.length;
    const precision=Math.min(6,Math.max(2,currentQuote()?.decimals||0)),currency=currentQuote()?.currency||market.currency;
    if(n<2)return missing(`仅取得 ${n} 个交易日的数据，暂时无法展示完整走势。`);
    const start=all.length-n,values=bars.map(b=>b.close),means=metrics.ma.slice(start);
    const candidates=[...values,...means.filter(Number.isFinite)],range=Math.max(...candidates)-Math.min(...candidates),padding=range*.15||values[0]*.02;
    const low=Math.min(...candidates)-padding,high=Math.max(...candidates)+padding;
    const x=i=>8+i/(n-1)*250,y=v=>15+(high-v)/(high-low)*108;
    const selected=Math.max(0,Math.min(view.point,n-1)),volumeMax=Math.max(...bars.map(b=>b.volume),1),idx=x(selected);
    const grid=[high,(high+low)/2,low].map(v=>`<path d="M8 ${y(v)}H267" class="nl-chart-grid"/>${text(317,y(v)+3,number(v,v>=10000?0:precision),'text-anchor="end"')}`).join('');
    const area=path(values,x,y)+` L${x(n-1)} 125 L8 125 Z`;
    const volume=bars.map((b,i)=>{const h=b.volume/volumeMax*30;const up=b.close>=(all[start+i-1]?.close||b.open);return `<rect x="${x(i)-1.5}" y="${169-h}" width="${Math.max(1.5,210/n)}" height="${h}" rx=".6" fill="${up?red:green}" opacity=".55"/>`;}).join('');
    const figure=svg(`${report.stock.name}最近 ${n} 个交易日价格走势，单位${currency}，${market.basis}；下方是相对成交量。`,
      `<defs><linearGradient id="nl-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${red}" stop-opacity=".17"/><stop offset="1" stop-color="${red}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#nl-trend-fill)"/><path d="${path(means,x,y)}" class="nl-line" stroke="${blue}" stroke-dasharray="4 4"/><path d="${path(values,x,y)}" class="nl-line" stroke="${red}"/>${volume}<path d="M${idx} 10V173" stroke="#cad0dc" stroke-dasharray="3 3"/><circle cx="${idx}" cy="${y(values[selected])}" r="3.4" fill="${red}" stroke="white" stroke-width="2"/>${text(8,188,bars[0].date.slice(5))}${text(260,188,bars.at(-1).date.slice(5),'text-anchor="end"')}${text(317,158,'成交量','text-anchor="end"')}`,197);
    const change=(values.at(-1)/values[0]-1)*100;
    return `<div class="nl-trend-summary"><div><span>${n} 个交易日首尾变化</span><strong class="${change>=0?'nl-positive':'nl-negative'}">${signed(change)}</strong></div><div class="nl-chart-legend"><span><i style="background:${red}"></i>每日价格</span><span><i style="background:${blue}"></i>近 20 日均价</span></div></div>${figure}<div class="nl-point-readout" aria-live="polite"><span>${escape(bars[selected].date)}</span><strong>${number(values[selected],precision)}</strong><span>均价 <b>${number(means[selected],precision)}</b></span></div><label class="nl-chart-scrubber"><span>滑动查看</span><input data-trend-cursor type="range" min="0" max="${n-1}" value="${selected}" aria-label="查看不同交易日的价格" aria-valuetext="${escape(bars[selected].date)}，价格${number(values[selected],precision)}${currency}"></label><p class="nl-chart-footnote">${escape(currency)} · ${escape(market.basis)} · 成交量采用相对刻度${market.partial?' · 末日可能尚未收盘':''}${market.basis==='未复权'?'；分红、拆股可能影响曲线':''}</p>`;
  }
  function signals(){
    const m=report.sections.market?.data;if(!m)return '';
    const distance=metrics.distance,ratio=metrics.volumeRatio;
    return `<div class="nl-signal-cards"><div><span>价格与近期平均水平</span><strong>${distance===null?'数据不足':`${distance>=0?'高':'低'} ${number(Math.abs(distance))}%`}</strong><p>${distance===null?'需要至少 20 个交易日':distance>=0?'高于过去 20 个交易日的平均价格':'低于过去 20 个交易日的平均价格'}</p></div><div><span>成交比平常活跃吗</span><strong>${ratio===null?'数据不足':number(ratio)+' 倍'}</strong><p>${ratio===null?'需要至少 6 个完整交易日':`${escape(metrics.volumeDate)}成交量 ÷ 此前 5 日平均成交量`}</p></div></div><p class="nl-reading-hint">价格和成交量只反映交易变化，不能单独判断公司值不值得买。</p>`;
  }
  function technical(){
    const market=report.sections.market?.data,bars=market?.bars||[];
    if(bars.length<35)return missing('交易日数据不足，暂不计算这组指标。');
    const n=Math.min(30,bars.length-26),x=i=>8+i/(n-1)*264;
    if(view.indicator==='RSI'){
      const values=metrics.rsi.slice(-n),y=v=>15+(100-v)/100*95;
      return `<p class="nl-reading-hint">最近的上涨和下跌，哪边力量更大？</p>${svg('RSI14 涨跌强弱图。30和70为参考线，不是买卖指令。',[30,70].map(v=>`<path d="M8 ${y(v)}H280" stroke="#dfe3ed" stroke-dasharray="3 3"/>${text(316,y(v)+3,v,'text-anchor="end"')}`).join('')+`<path d="${path(values,x,y)}" class="nl-line" stroke="${red}"/>${text(8,134,`RSI14：${number(values.at(-1),1)}`)}`,143)}<p class="nl-chart-footnote">近 14 日涨跌额简单平均口径，非 Wilder 平滑算法；数值高不等于该买，数值低也不等于便宜。</p>`;
    }
    const dif=metrics.dif.slice(-n),dea=metrics.dea.slice(-n),hist=metrics.macd.slice(-n),max=Math.max(...dif,...dea,...hist,.01),min=Math.min(...dif,...dea,...hist,-.01),y=v=>15+(max-v)/(max-min)*95;
    return `<p class="nl-reading-hint">最近价格变化，是在加速还是放缓？</p>${svg('MACD价格变化图，包含快慢均线差DIF、其平滑值DEA与两者差的两倍柱状值。',`<path d="M8 ${y(0)}H280" class="nl-chart-grid"/>${hist.map((v,i)=>`<rect x="${x(i)-2}" y="${Math.min(y(v),y(0))}" width="4" height="${Math.max(.2,Math.abs(y(v)-y(0)))}" fill="${v>=0?red:green}" opacity=".6"/>`).join('')}<path d="${path(dif,x,y)}" class="nl-line" stroke="${red}"/><path d="${path(dea,x,y)}" class="nl-line" stroke="${blue}"/>${text(316,y(0)+3,'0','text-anchor="end"')}${text(8,134,'MACD（12、26、9）')}`,143)}<p class="nl-chart-footnote">红线 DIF · 蓝线 DEA；柱子反映两线差距。由已有日线计算，起始点会影响结果，不能预测未来涨跌。</p>`;
  }
  function cachePanel(updating){
    const sections=report.sections,available=Object.entries(sections).filter(([key,s])=>key!=='savedQuote' && s?.data).map(([,s])=>s),stale=available.some(s=>s.stale||s.error);
    const title=updating?'先看可用资料，继续补充中':!available.length?(currentQuote()?'已读取网站备用报价':'资料暂未取到'):stale?'部分资料尚未更新':available.every(s=>s.via==='cache')?'已读取保存的数据':'数据已整理';
    return `<div class="nl-cache-toolbar"><span class="${stale?'is-stale':''}"><i></i>${title}</span><button type="button" id="refresh-data" ${updating?'disabled':''}>${updating?'更新中…':'刷新数据'}</button></div><details class="nl-cache-details"><summary>数据时间与缓存说明</summary><p>当前浏览器保存最近查看过的数据。量价 5 分钟、新闻 15 分钟、公司资料 24 小时内优先复用；过期后查看时更新。手动刷新间隔至少 30 秒。</p>${Object.entries({quote:'最新报价',market:'历史走势',profile:'公司资料',news:'个股新闻',industryNews:'行业资讯'}).filter(([key])=>key in sections).map(([key,label])=>{const s=sections[key];return `<div><span>${label}</span><span>${s?.data?`${time(s.fetchedAt)} 获取${s.stale?' · 已过期':s.via==='cache'?' · 已缓存':' · 新获取'}`:'暂缺'}${s?.error?' · 更新未成功':''}</span></div>`;}).join('')}<p>获取时间为北京时间；不代表平台内容刚刚更新。本地缓存清理后会移除。网站还保存了一份带时间的公共备用报价，所有访问者可以共用。${window.NiulaiCache.info().persistent?'':'当前浏览器无法持久保存，仅在本次打开期间复用。'}</p></details>`;
  }
  function render(stock,marketLabel,data,{updating=false}={}){
    const sameStock=report?.stock.id===stock.id;report=data;metrics=window.NiulaiData.calculate(report.sections.market?.data);if(!sameStock)view={days:20,point:19,indicator:'MACD'};
    const m=report.sections.market?.data;
    const headline=metrics.distance===null?'先把这家公司看明白':`价格${metrics.distance>=0?'高于':'低于'}近期平均水平`;
    const quote=quoteCard();
    const old=m && Date.now()-Date.parse(m.bars.at(-1).date)>10*86400000;
    return `<article class="nl-report nl-visual-report"><div class="nl-report-stock"><h3>${escape(stock.name)}</h3>${marketLabel}<span class="nl-report-code">${escape(stock.code)}</span></div>${quote}${cachePanel(updating)}${old?'<p class="nl-coverage-note">行情日期较早，请核对是否停牌或来源尚未更新。</p>':''}${!data.symbol?'<p class="nl-coverage-note">该证券的历史行情代码尚未验证；可用报价会单独展示。</p>':''}<div class="nl-visual-verdict"><div><span>牛来帮你读数据 · 规则解读</span><h4>${headline}</h4><p>看生意 · 读消息 · 看交易变化</p></div><img src="assets/niulai.jpg" alt="" width="1254" height="1254"></div><section class="nl-chart-panel">${caption('01','行业和生意怎么样')} ${industry()}</section><section class="nl-chart-panel">${caption('02','最近发生了什么')}<div id="nl-news-chart">${newsChart()}</div></section><section class="nl-chart-panel">${caption('03','价格和成交量怎么变',`<div class="nl-chart-tabs" role="group" aria-label="走势时间范围"><button type="button" data-trend-days="20" class="${view.days===20?'is-active':''}" aria-pressed="${view.days===20}">20 日</button><button type="button" data-trend-days="60" class="${view.days===60?'is-active':''}" aria-pressed="${view.days===60}">60 日</button></div>`)}<div id="nl-trend-chart">${trend()}</div>${signals()}${m?`<details class="nl-more-data nl-technical-details"><summary>再看看技术指标</summary><div class="nl-indicator-tabs" role="group" aria-label="切换技术指标"><button type="button" data-indicator="MACD" class="${view.indicator==='MACD'?'is-active':''}" aria-pressed="${view.indicator==='MACD'}">涨跌速度 · MACD</button><button type="button" data-indicator="RSI" class="${view.indicator==='RSI'?'is-active':''}" aria-pressed="${view.indicator==='RSI'}">涨跌强弱 · RSI</button></div><div id="nl-technical-chart">${technical()}</div></details>`:''}${stamp(report.sections.market,'腾讯行情 · 图表及指标由本站计算')}</section><div class="nl-report-source"><a href="${escape(window.NiulaiData.sourceURL(stock))}" target="_blank" rel="noopener noreferrer">在腾讯自选股核对资料 ↗</a><span>公开来源可能延迟或缺失</span></div><div class="nl-report-actions"><button type="button" id="ask-another">换一只股票问问</button></div></article>`;
  }
  document.addEventListener('click',event=>{
    const days=event.target.closest('[data-trend-days]'),indicator=event.target.closest('[data-indicator]');
    if(!report)return;
    if(days){view.days=Number(days.dataset.trendDays);view.point=view.days-1;document.querySelectorAll('[data-trend-days]').forEach(b=>{b.classList.toggle('is-active',b===days);b.setAttribute('aria-pressed',String(b===days));});document.querySelector('#nl-trend-chart').innerHTML=trend();}
    if(indicator){view.indicator=indicator.dataset.indicator;document.querySelectorAll('[data-indicator]').forEach(b=>{b.classList.toggle('is-active',b===indicator);b.setAttribute('aria-pressed',String(b===indicator));});document.querySelector('#nl-technical-chart').innerHTML=technical();}
  });
  document.addEventListener('input',event=>{
    if(!event.target.matches('[data-trend-cursor]')||!report)return;
    view.point=Number(event.target.value);
    const temporary=document.createElement('div');temporary.innerHTML=trend();
    const root=document.querySelector('#nl-trend-chart');
    root.querySelector('.nl-chart-svg').replaceWith(temporary.querySelector('.nl-chart-svg'));
    root.querySelector('.nl-point-readout').replaceWith(temporary.querySelector('.nl-point-readout'));
    event.target.setAttribute('aria-valuetext',temporary.querySelector('input').getAttribute('aria-valuetext'));
  });
  window.NiulaiCharts=Object.freeze({render});
})();
