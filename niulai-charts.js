/* Deterministic, synthetic samples only. Never sourced from the selected stock. */
(() => {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const red = '#e96a60', blue = '#8d9fbd', green = '#75ad9b';
  const closes = Array.from({length:140}, (_,i) => 100+i*.095+Math.sin(i*.29)*2.3+Math.sin(i*.83)*.7+(i>117?(i-117)*.045:0));
  const volumes = closes.map((_,i) => 58+Math.sin(i*.76)*17+Math.cos(i*.22)*12+(i%9===0?19:0));
  const average = values => values.reduce((a,b)=>a+b,0)/values.length;
  const ma20 = closes.map((_,i) => average(closes.slice(Math.max(0,i-19),i+1)));
  const ema = (values,period) => {let previous=values[0];return values.map(value => previous=value*2/(period+1)+previous*(1-2/(period+1)));};
  const fast=ema(closes,12),slow=ema(closes,26),dif=fast.map((v,i)=>v-slow[i]),dea=ema(dif,9),macd=dif.map((v,i)=>(v-dea[i])*2);
  const rsi = closes.map((_,i) => {
    const changes=closes.slice(Math.max(0,i-14),i+1).slice(1).map((v,j)=>v-closes[Math.max(0,i-14)+j]);
    const gain=average(changes.map(v=>Math.max(v,0)))||0,loss=average(changes.map(v=>Math.max(-v,0)))||0;
    return gain+loss ? gain/(gain+loss)*100 : 50;
  });
  const signalColors=[red,blue,green];
  const news=[{name:'利好',value:12},{name:'中性',value:7},{name:'利空',value:5}];
  let view={days:20,point:19,indicator:'MACD',news:0};

  function line(values,x,y){return values.map((value,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(value).toFixed(2)}`).join(' ');}
  function svg(label,body,height=164){return `<svg class="nl-chart-svg" viewBox="0 0 320 ${height}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${body}</svg>`;}
  function text(x,y,label,extra=''){return `<text x="${x}" y="${y}" ${extra}>${escape(label)}</text>`;}
  function tag(label){return `<span class="nl-chart-demo">${label||'模拟'}</span>`;}
  function caption(number,title,controls=''){return `<div class="nl-chart-heading"><h4><span>${number}</span>${title}</h4>${controls||tag()}</div>`;}
  function pill(value,label){return `<div><strong>${value}</strong><span>${label}</span></div>`;}

  function trend(){
    const start=closes.length-view.days,base=closes[start];
    const prices=closes.slice(start).map(v=>v/base*100),means=ma20.slice(start).map(v=>v/base*100),volume=volumes.slice(start);
    const lo=Math.floor(Math.min(...prices,...means)-1),hi=Math.ceil(Math.max(...prices,...means)+1);
    const x=i=>8+i/(prices.length-1)*266,y=v=>16+(hi-v)/(hi-lo)*108;
    const selected=Math.min(view.point,prices.length-1),idx=x(selected),price=prices[selected],mean=means[selected];
    const area=line(prices,x,y)+` L${x(prices.length-1)},128 L${x(0)},128 Z`;
    const grid=[hi,(hi+lo)/2,lo].map(v=>`<path d="M8 ${y(v)}H281" class="nl-chart-grid"/>${text(314,y(v)+3,v.toFixed(1),'text-anchor="end"')}`).join('');
    const bars=volume.map((v,i)=>{const height=v/Math.max(...volume)*30;return `<rect x="${x(i)-1.6}" y="${170-height}" width="${Math.max(1.8,220/view.days)}" height="${height}" rx="1" fill="${i && prices[i]<prices[i-1]?green:red}" opacity=".48"/>`;}).join('');
    const figure=svg(`模拟近 ${view.days} 日走势，起点为100。第 ${selected+1} 日收盘指数 ${price.toFixed(2)}，MA20 ${mean.toFixed(2)}，与真实行情无关。`,
      `<defs><linearGradient id="nl-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${red}" stop-opacity=".2"/><stop offset="1" stop-color="${red}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#nl-trend-fill)"/><path d="${line(means,x,y)}" class="nl-line" stroke="${blue}" stroke-dasharray="4 4"/><path d="${line(prices,x,y)}" class="nl-line" stroke="${red}"/>${bars}<path d="M${idx} 10V172" stroke="#c5cbd8" stroke-dasharray="3 3"/><circle cx="${idx}" cy="${y(price)}" r="3.6" fill="${red}" stroke="white" stroke-width="2"/>${text(8,188,'第 1 日')}${text(274,188,`第 ${view.days} 日`,'text-anchor="end"')}${text(314,156,'量能','text-anchor="end"')}`,196);
    const delta=(prices.at(-1)-100).toFixed(2);
    return `<div class="nl-trend-summary"><div><span>区间变化 · 模拟</span><strong class="${Number(delta)>=0?'nl-positive':'nl-negative'}">${Number(delta)>0?'+':''}${delta}<small>%</small></strong></div><div class="nl-chart-legend"><span><i style="background:${red}"></i>收盘走势</span><span><i style="background:${blue}"></i>MA20</span></div></div>${figure}<div class="nl-point-readout" aria-live="polite"><span>第 ${selected+1} 日</span><strong>${price.toFixed(2)}</strong><span>MA20 <b>${mean.toFixed(2)}</b></span></div><label class="nl-chart-scrubber"><span>滑动查看</span><input data-trend-cursor type="range" min="0" max="${view.days-1}" value="${selected}" aria-label="查看模拟走势的不同交易日" aria-valuetext="第 ${selected+1} 日，收盘指数 ${price.toFixed(2)}"></label><p class="nl-chart-footnote">起点归一为 100 · 下方为模拟量能</p>`;
  }

  function industry(){
    const values=[72,64,76,58,68],labels=['需求','盈利','订单','成本控制','政策环境'];
    const cx=95,cy=85,r=54;
    const point=(i,scale)=>[cx+Math.cos(-Math.PI/2+i*Math.PI*2/5)*r*scale,cy+Math.sin(-Math.PI/2+i*Math.PI*2/5)*r*scale];
    const polygon=scale=>values.map((_,i)=>point(i,scale).join(',')).join(' ');
    const rings=[.25,.5,.75,1].map(scale=>`<polygon points="${polygon(scale)}" fill="${scale===1?'#fafafd':'none'}" stroke="#edf0f5"/>`).reverse().join('');
    const rays=values.map((_,i)=>{const p=point(i,1);return `<path d="M${cx} ${cy}L${p}" stroke="#edf0f5"/>`;}).join('');
    const shape=values.map((v,i)=>point(i,v/100).join(',')).join(' ');
    const dots=values.map((v,i)=>{const p=point(i,v/100);return `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${red}"/>`;}).join('');
    const axes=labels.map((label,i)=>{const p=point(i,1.28);return text(p[0],p[1]+3,label,'text-anchor="middle"');}).join('');
    const chart=svg('行业五维模拟评分：需求72、盈利64、订单76、成本控制58、政策环境68，满分100，仅作图形示例。',`${rings}${rays}<polygon points="${shape}" fill="#eb7b7028" stroke="${red}" stroke-width="1.7"/>${dots}${axes}`,165).replace('0 0 320 165','0 0 190 165');
    return `<div class="nl-industry-layout"><div>${chart}</div><div class="nl-radar-side"><span>行业观察</span><strong>多维对照</strong><div><i></i>机会与风险一起看</div><small>0–100 示例评分<br>不代表投资评级</small></div></div><div class="nl-metric-strip">${pill('72','需求热度')}${pill('76','订单表现')}${pill('58','成本控制')}</div>`;
  }

  function newsChart(){
    let offset=0;
    const circumference=2*Math.PI*39;
    const rings=news.map((item,i)=>{const length=item.value/24*circumference;const circle=`<circle cx="61" cy="59" r="39" fill="none" stroke="${signalColors[i]}" stroke-width="12" stroke-dasharray="${length-1.8} ${circumference-length+1.8}" stroke-dashoffset="${-offset}" transform="rotate(-90 61 59)"/>`;offset+=length;return circle;}).join('');
    const donut=svg('模拟新闻共24条，其中利好12条、中性7条、利空5条。',`${rings}${text(61,59,'24','text-anchor="middle" class="nl-donut-value"')}${text(61,77,'条模拟新闻','text-anchor="middle"')}`,120).replace('0 0 320 120','0 0 122 120');
    const heat=[32,46,39,54,68,59,78],hx=i=>6+i*44,hy=v=>43-(v-25)/60*34;
    const mini=svg('模拟7日关注热度：32、46、39、54、68、59、78，相对指数。',`<path d="M6 46H272" class="nl-chart-grid"/><path d="${line(heat,hx,hy)}" class="nl-line" stroke="${red}"/>${heat.map((v,i)=>`<circle cx="${hx(i)}" cy="${hy(v)}" r="2.6" fill="${red}"/>`).join('')}${text(6,63,'第 1 日')}${text(272,63,'第 7 日','text-anchor="end"')}`,70);
    return `<div class="nl-news-layout"><div class="nl-donut">${donut}</div><div class="nl-news-legend">${news.map((item,i)=>`<button type="button" data-news-kind="${i}" aria-pressed="${view.news===i}" class="${view.news===i?'is-active':''}"><i style="background:${signalColors[i]}"></i><span>${item.name}</span><strong>${item.value} 条</strong><small>${Math.round(item.value/24*100)}%</small></button>`).join('')}</div></div><p id="nl-news-readout" class="nl-news-readout" aria-live="polite">${news[view.news].name} ${news[view.news].value} 条 · 占示例样本 ${Math.round(news[view.news].value/24*100)}%</p><div class="nl-heat-caption"><span>7 日关注热度</span><strong>78 <small>/ 100</small></strong></div>${mini}<p class="nl-chart-footnote">模拟情绪与热度，未读取真实新闻</p>`;
  }

  function technical(){
    const size=30,start=closes.length-size,x=i=>8+i/(size-1)*266;
    let figure,legend,readout,footnote;
    if(view.indicator==='MACD'){
      const d=dif.slice(start),s=dea.slice(start),hist=macd.slice(start);
      const max=Math.max(...d,...s,...hist,1)*1.12,min=Math.min(...d,...s,...hist,-.5)*1.12,y=v=>15+(max-v)/(max-min)*103;
      const bars=hist.map((v,i)=>`<rect x="${x(i)-2.3}" y="${Math.min(y(v),y(0))}" width="4.6" height="${Math.max(.5,Math.abs(y(v)-y(0)))}" fill="${v>=0?red:green}" opacity=".55"/>`).join('');
      figure=svg('由模拟收盘序列计算的 MACD，参数12、26、9，包含DIF线、DEA线和柱状值。',`<path d="M8 ${y(0)}H281" class="nl-chart-grid"/>${bars}<path d="${line(d,x,y)}" class="nl-line" stroke="${red}"/><path d="${line(s,x,y)}" class="nl-line" stroke="${blue}"/>${text(315,y(0)+3,'0','text-anchor="end"')}${text(8,139,'30 个模拟交易日')}`,148);
      legend=`<span><i style="background:${red}"></i>DIF ${dif.at(-1).toFixed(2)}</span><span><i style="background:${blue}"></i>DEA ${dea.at(-1).toFixed(2)}</span>`;
      readout=`柱状值 ${macd.at(-1).toFixed(2)}`;
      footnote='MACD (12,26,9) · 由同一模拟价格序列计算';
    }else if(view.indicator==='RSI'){
      const values=rsi.slice(start),y=v=>15+(100-v)/100*103;
      figure=svg(`模拟 RSI 为 ${rsi.at(-1).toFixed(1)}，参考线为30和70。`,[30,70].map(v=>`<path d="M8 ${y(v)}H281" stroke="#dce2ec" stroke-dasharray="3 3"/>${text(315,y(v)+3,v,'text-anchor="end"')}`).join('')+`<path d="${line(values,x,y)}" class="nl-line" stroke="${red}"/>${text(8,139,'30 个模拟交易日')}`,148);
      legend='<span>0–100 相对强弱指标</span>';readout=`RSI14 ${rsi.at(-1).toFixed(1)}`;footnote='RSI14 · 近 14 日涨跌幅简单平均口径，非 Wilder 平滑';
    }else{
      const values=volumes.slice(start),max=Math.max(...values)*1.1,y=v=>118-v/max*103;
      figure=svg('模拟30日成交活跃度柱状图，数值归一化，不代表实际成交股数。',`<path d="M8 118H281" class="nl-chart-grid"/>${values.map((v,i)=>`<rect x="${x(i)-2.5}" y="${y(v)}" width="5" height="${118-y(v)}" rx="1" fill="${i&&closes[start+i]<closes[start+i-1]?green:red}" opacity=".72"/>`).join('')}${text(8,139,'30 个模拟交易日')}`,148);
      const ratio=volumes.at(-1)/average(volumes.slice(-6,-1));
      legend='<span>相对活跃度 · 归一化</span>';readout=`前 5 日均量比 ${ratio.toFixed(2)}×`;footnote='末日模拟量 / 前 5 日平均模拟量；非盘中量比';
    }
    return `<div class="nl-indicator-readout"><span class="nl-chart-legend">${legend}</span><strong>${readout}</strong></div>${figure}<p class="nl-chart-footnote">${footnote}</p>`;
  }

  function render(stock,marketLabel){
    view={days:20,point:19,indicator:'MACD',news:0};
    return `<article class="nl-report nl-visual-report"><div class="nl-report-stock"><h3>${escape(stock.name)}</h3>${marketLabel}<span class="nl-report-code">${escape(stock.code)}</span></div><p class="nl-sample-notice">以下图表使用统一模拟样本，与所选股票的真实表现无关。</p><div class="nl-visual-verdict"><div><span>牛来观点 · 演示</span><h4>先观察，交叉验证</h4><p>看趋势 · 看行业 · 看信号</p></div><img src="assets/niulai.jpg" alt="" width="1254" height="1254"></div><section class="nl-chart-panel">${caption('01','量价走势',`<div class="nl-chart-tabs" role="group" aria-label="模拟走势时间范围"><button type="button" data-trend-days="20" class="is-active" aria-pressed="true">20 日</button><button type="button" data-trend-days="60" aria-pressed="false">60 日</button></div>`)}<div id="nl-trend-chart">${trend()}</div></section><section class="nl-chart-panel">${caption('02','行业观察雷达')} ${industry()}</section><section class="nl-chart-panel">${caption('03','热点新闻分布')}<div id="nl-news-chart">${newsChart()}</div></section><section class="nl-chart-panel">${caption('04','技术指标信号')}<div class="nl-indicator-tabs" role="group" aria-label="切换模拟技术指标">${['MACD','RSI','成交量'].map((name,i)=>`<button type="button" data-indicator="${name}" class="${i===0?'is-active':''}" aria-pressed="${i===0}">${name}</button>`).join('')}</div><div id="nl-technical-chart">${technical()}</div></section><div class="nl-report-actions"><button type="button" id="ask-another">换一只股票问问</button></div></article>`;
  }

  document.addEventListener('click',event=>{
    const days=event.target.closest('[data-trend-days]'),indicator=event.target.closest('[data-indicator]'),kind=event.target.closest('[data-news-kind]');
    if(days){
      view.days=Number(days.dataset.trendDays);view.point=view.days-1;
      document.querySelectorAll('[data-trend-days]').forEach(button=>{const active=button===days;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',active);});
      document.querySelector('#nl-trend-chart').innerHTML=trend();
    }
    if(indicator){
      view.indicator=indicator.dataset.indicator;
      document.querySelectorAll('[data-indicator]').forEach(button=>{const active=button===indicator;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',active);});
      document.querySelector('#nl-technical-chart').innerHTML=technical();
    }
    if(kind){
      view.news=Number(kind.dataset.newsKind);
      document.querySelectorAll('[data-news-kind]').forEach(button=>{const active=button===kind;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',active);});
      document.querySelector('#nl-news-readout').textContent=`${news[view.news].name} ${news[view.news].value} 条 · 占示例样本 ${Math.round(news[view.news].value/24*100)}%`;
    }
  });
  document.addEventListener('input',event=>{
    if(!event.target.matches('[data-trend-cursor]'))return;
    view.point=Number(event.target.value);
    // Preserve the native range element during dragging and keyboard input.
    const temporary=document.createElement('div');temporary.innerHTML=trend();
    const root=document.querySelector('#nl-trend-chart');
    root.querySelector('.nl-chart-svg').replaceWith(temporary.querySelector('.nl-chart-svg'));
    root.querySelector('.nl-point-readout').replaceWith(temporary.querySelector('.nl-point-readout'));
    event.target.setAttribute('aria-valuetext',temporary.querySelector('input').getAttribute('aria-valuetext'));
  });
  window.NiulaiCharts=Object.freeze({render});
})();
