/* Frontend demo only: local matching and explicitly labelled educational templates. */
(() => {
  'use strict';
  const {stocks,sectors} = window.NiulaiCatalog;
  const $ = selector => document.querySelector(selector);
  const input = $('#stock-query');
  const options = $('#stock-options');
  const suggestions = $('#suggestions');
  const advice = $('#advice-content');
  const emptyAdvice = advice.innerHTML;
  const marketNames = {CN:'A 股',HK:'港股',US:'美股'};
  const preferred = {all:['HK:00700','CN:600519','US:NVDA'],CN:['CN:600519','CN:300750','CN:600584'],HK:['HK:00700','HK:01810','HK:09988'],US:['US:NVDA','US:AAPL','US:TSLA']};
  const stockById = new Map(stocks.map(stock => [stock.id,stock]));
  const state = {market:'all',selected:null,matches:[],active:-1,composing:false,run:0,timer:null};
  const normalize = value => String(value).normalize('NFKC').trim().toUpperCase().replace(/[\s·]/g,'');
  const escapeHTML = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const checkIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const chevron = '<svg class="icon nl-evidence-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  const announce = message => { $('#niulai-status').textContent = message; };

  function nearMatch(left,right) {
    if (Math.abs(left.length-right.length)>1) return false;
    let a=0,b=0,edits=0;
    while (a<left.length && b<right.length) {
      if (left[a]===right[b]) { a++; b++; continue; }
      if (++edits>1) return false;
      if (left.length>=right.length) a++;
      if (right.length>=left.length) b++;
    }
    return edits+(a<left.length || b<right.length ? 1 : 0)<=1;
  }

  function scoreStock(stock,query) {
    const name=normalize(stock.name), code=stock.code;
    const exchange=stock.market==='CN' ? (stock.exchange==='沪市'?'SH':stock.exchange==='深市'?'SZ':'BJ') : stock.market;
    const codeNames=[code,`${exchange}${code}`,`${code}.${exchange}`];
    if (stock.market==='HK' && /^\d{1,5}$/.test(query)) codeNames.push(String(Number(code)));
    if (codeNames.includes(query)) return {score:120,exact:true};
    if (name===query) return {score:115,exact:true};
    const aliases=[stock.initials,stock.pinyin,...stock.aliases].map(normalize);
    if (aliases.includes(query)) return {score:110,exact:true};
    if (code.startsWith(query)) return {score:90};
    if (name.startsWith(query)) return {score:85};
    if (name.includes(query)) return {score:80};
    if (aliases.some(alias=>alias.startsWith(query))) return {score:75};
    if (aliases.some(alias=>alias.includes(query))) return {score:65};
    if (/^[A-Z]{3,}$/.test(query) && [code,...aliases].some(alias=>/^[A-Z]+$/.test(alias) && nearMatch(alias,query))) return {score:35,fuzzy:true};
    return null;
  }

  function findMatches(value) {
    const query=normalize(value);
    const available=stocks.filter(stock=>state.market==='all' || stock.market===state.market);
    if (!query) return preferred[state.market].map(id=>({stock:stockById.get(id),score:0}));
    return available.map(stock=>({stock,...scoreStock(stock,query)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score || a.stock.name.localeCompare(b.stock.name,'zh-CN'));
  }

  function highlighted(text) {
    const query=input.value.trim();
    const start=text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    if (!query || start<0) return escapeHTML(text);
    return escapeHTML(text.slice(0,start))+'<mark>'+escapeHTML(text.slice(start,start+query.length))+'</mark>'+escapeHTML(text.slice(start+query.length));
  }

  function marketLabel(stock) {
    return `<span class="nl-market-label" data-market="${stock.market}">${marketNames[stock.market]}</span>`;
  }

  function closeSuggestions() {
    suggestions.hidden=true;
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
    state.active=-1;
  }

  function renderSuggestions() {
    state.matches=findMatches(input.value);
    state.active=-1;
    input.removeAttribute('aria-activedescendant');
    const visible=state.matches.slice(0,8);
    options.innerHTML=visible.map(({stock},index)=>`<button class="nl-option" id="stock-option-${index}" type="button" role="option" aria-selected="false" tabindex="-1" data-stock-id="${stock.id}">${marketLabel(stock)}<span class="nl-option-main"><span class="nl-option-name">${highlighted(stock.name)}</span><span class="nl-option-code">${highlighted(stock.code)} · ${escapeHTML(stock.exchange)}</span></span>${chevron}</button>`).join('');
    $('#suggestion-caption').textContent=normalize(input.value) ? (visible[0]?.fuzzy ? '你是不是想找' : '猜你想找') : '可以从这些股票开始';
    $('#match-count').textContent=state.matches.length>8 ? `${state.matches.length} 只匹配 · 展示前 8 只` : `${state.matches.length} 只匹配`;
    $('#no-matches').hidden=Boolean(visible.length);
    $('#no-matches').textContent=state.market==='all' ? '演示股票库暂未收录，可试试“腾讯”“茅台”或“AAPL”。' : `当前${marketNames[state.market]}演示库中没有匹配，可切换“全部”或更换关键词。`;
    suggestions.hidden=false;
    input.setAttribute('aria-expanded','true');
    announce(visible.length ? `找到 ${state.matches.length} 只匹配股票，可用上下方向键选择。` : '没有匹配的演示股票。');
  }

  function setActive(index) {
    const buttons=[...options.querySelectorAll('[role="option"]')];
    if (!buttons.length) return;
    state.active=(index+buttons.length)%buttons.length;
    buttons.forEach((button,i)=>{button.classList.toggle('is-highlighted',i===state.active);button.setAttribute('aria-selected',String(i===state.active));});
    const active=buttons[state.active];
    input.setAttribute('aria-activedescendant',active.id);
    active.scrollIntoView({block:'nearest'});
  }

  function clearError() {
    $('#search-error').hidden=true;
    $('#search-field').classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
  }

  function showError(message) {
    $('#search-error').textContent=message;
    $('#search-error').hidden=false;
    $('#search-field').classList.add('is-invalid');
    input.setAttribute('aria-invalid','true');
    input.focus({preventScroll:true});
    announce(message);
  }

  function resetAdvice() {
    clearTimeout(state.timer);
    state.timer=null;
    state.run++;
    advice.innerHTML=emptyAdvice;
    $('#advice-card').setAttribute('aria-busy','false');
    $('#ask-niulai').disabled=false;
    $('#ask-label').textContent='问牛来值不值得买';
  }

  function updateSelected() {
    const stock=state.selected;
    $('#selected-stock').hidden=!stock;
    $('#selected-stock').innerHTML=stock ? `${marketLabel(stock)}<strong>${escapeHTML(stock.name)}</strong><span>${escapeHTML(stock.code)}</span><span class="nl-selected-check">${checkIcon}已选中</span>` : '';
    $('#clear-query').hidden=!input.value;
    $('#search-help').hidden=Boolean(stock);
  }

  function selectStock(stock,{focus=false}={}) {
    if (!stock) return;
    resetAdvice();
    clearError();
    state.selected=stock;
    input.value=stock.name;
    updateSelected();
    if (focus) input.focus({preventScroll:true});
    closeSuggestions();
    announce(`已选择${marketNames[stock.market]} ${stock.name} ${stock.code}，可点击问牛来。`);
  }

  function renderQuickPicks() {
    $('#quick-picks').innerHTML=preferred[state.market].map(id=>{const stock=stockById.get(id);return `<button type="button" data-quick-stock="${id}">${escapeHTML(stock.name)}</button>`;}).join('');
  }

  function setMarket(market) {
    if (state.market===market) return;
    state.market=market;
    document.querySelectorAll('.nl-market-filters button').forEach(button=>{const active=button.dataset.market===market;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
    clearError();
    resetAdvice();
    if (state.selected && market!=='all' && state.selected.market!==market) state.selected=null;
    updateSelected();
    renderQuickPicks();
    if (input.value && !state.selected) renderSuggestions(); else closeSuggestions();
  }

  function evidence(number,title,text,tags,status) {
    return `<details open><summary><span class="nl-evidence-number">${number}</span><span>${title}</span><span class="nl-evidence-state">${status}</span>${chevron}</summary><div class="nl-evidence-copy"><p>${escapeHTML(text)}</p><div class="nl-evidence-chips">${tags.map(tag=>`<span>${escapeHTML(tag)}</span>`).join('')}</div></div></details>`;
  }

  function renderReport(stock) {
    const sector=sectors[stock.sector];
    advice.innerHTML=`<article class="nl-report"><div class="nl-report-stock"><h3>${escapeHTML(stock.name)}</h3>${marketLabel(stock)}<span class="nl-report-code">${escapeHTML(stock.code)}</span><span class="nl-report-context">${escapeHTML(sector.name)} · 以下为分析思路示例，非该股票的实时判断</span></div><div class="nl-verdict"><span class="nl-verdict-label">${checkIcon}牛来观点 · 示例</span><h4>先观察，等更多信号确认</h4><p>先核实基本面与消息，再看量价是否配合。若只有热点升温，缺少经营与技术信号的支持，就不宜据此作出买入判断。</p></div><div class="nl-evidence">${evidence('01','行业资讯',sector.industry,sector.tags,'看基本面')}${evidence('02','热点新闻',sector.news,['公司公告','信息来源','业绩影响'],'核实事件')}${evidence('03','技术指标异动','可观察价格与 MA20 的关系、成交量变化及 MACD 等信号是否相互印证。若放量却未能维持突破，或量价走势背离，需要进一步核实，单一指标不代表确定的买卖时机。',['MA20','成交量','MACD'],'等信号确认')}</div><div class="nl-next-step"><h4>接下来，重点看这两件事</h4><p>① 对照最新公告与财报，核实消息是否影响经营。</p><p>② 结合多个时段的量价表现，确认信号是否持续。</p></div><div class="nl-report-actions"><button type="button" id="ask-another">换一只股票问问</button></div></article>`;
    $('#advice-card').setAttribute('aria-busy','false');
    $('#ask-niulai').disabled=false;
    $('#ask-label').textContent='问牛来值不值得买';
    state.timer=null;
    announce(`${stock.name}的演示分析已展示，包含行业资讯、热点新闻和技术指标异动三个部分。`);
  }

  function startAdvice(stock) {
    selectStock(stock);
    const run=state.run;
    $('#advice-card').setAttribute('aria-busy','true');
    $('#ask-niulai').disabled=true;
    $('#ask-label').textContent='牛来整理中…';
    advice.innerHTML=`<div class="nl-loading"><div class="nl-loading-ring" aria-hidden="true"></div><h3>正在整理${escapeHTML(stock.name)}的演示分析</h3><p>把三个角度的思路放在一起</p><div class="nl-loading-tracks"><span>行业资讯</span><span>热点新闻</span><span>技术异动</span></div></div>`;
    announce(`正在整理${stock.name}的演示分析。`);
    state.timer=setTimeout(()=>{if(run===state.run && state.selected?.id===stock.id) renderReport(stock);},650);
    input.blur();
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    $('#advice-card').scrollIntoView({behavior:motion,block:'start'});
  }

  function submitQuery() {
    if (state.composing || $('#ask-niulai').disabled) return;
    clearError();
    if (state.selected) { startAdvice(state.selected); return; }
    const query=normalize(input.value);
    if (!query) { showError('先输入股票名称或代码，牛来才能帮你看。'); return; }
    const matches=findMatches(query);
    const exact=matches.filter(item=>item.exact);
    // The same company may trade on several markets: never silently pick one listing.
    if (exact.length===1) { startAdvice(exact[0].stock); return; }
    if (matches.length===1 && !matches[0].fuzzy) { startAdvice(matches[0].stock); return; }
    renderSuggestions();
    if (!matches.length) showError('演示股票库中未找到这只股票，请换个名称或代码。');
    else if (matches.every(item=>item.fuzzy)) showError('找到了相近名称，请点选确认你想问的股票。');
    else showError('有多只股票匹配，请点选一只，或补充股票代码。');
  }

  function onInput() {
    state.selected=null;
    clearError();
    resetAdvice();
    updateSelected();
    if (!state.composing) renderSuggestions();
  }

  input.addEventListener('input',onInput);
  input.addEventListener('compositionstart',()=>{state.composing=true;closeSuggestions();});
  input.addEventListener('compositionend',()=>{state.composing=false;onInput();});
  input.addEventListener('focus',()=>{if (!state.selected && !state.composing) renderSuggestions();});
  input.addEventListener('keydown',event=>{
    if (event.isComposing || state.composing || event.keyCode===229) return;
    if (event.key==='ArrowDown' || event.key==='ArrowUp') {
      event.preventDefault();
      if (suggestions.hidden) renderSuggestions();
      const count=options.querySelectorAll('[role="option"]').length;
      setActive(state.active<0 ? (event.key==='ArrowDown'?0:count-1) : state.active+(event.key==='ArrowDown'?1:-1));
    } else if (event.key==='Escape') { closeSuggestions(); }
    else if (event.key==='Enter' && !suggestions.hidden && state.active>=0) {
      event.preventDefault();selectStock(state.matches[state.active].stock,{focus:true});
    } else if (event.key==='Tab') closeSuggestions();
  });
  options.addEventListener('mousedown',event=>{if(event.target.closest('[data-stock-id]')) event.preventDefault();});
  options.addEventListener('click',event=>{const option=event.target.closest('[data-stock-id]');if(option) selectStock(stockById.get(option.dataset.stockId),{focus:true});});
  $('#clear-query').addEventListener('click',()=>{input.value='';onInput();input.focus({preventScroll:true});});
  $('.nl-market-filters').addEventListener('click',event=>{const button=event.target.closest('button[data-market]');if(button) setMarket(button.dataset.market);});
  $('#quick-picks').addEventListener('click',event=>{const button=event.target.closest('[data-quick-stock]');if(button) selectStock(stockById.get(button.dataset.quickStock));});
  $('#stock-form').addEventListener('submit',event=>{event.preventDefault();submitQuery();});
  document.addEventListener('pointerdown',event=>{if(!$('#search-wrap').contains(event.target)) closeSuggestions();});
  advice.addEventListener('click',event=>{
    if (event.target.closest('#show-example')) { const id=state.selected?.id || preferred[state.market][0];startAdvice(stockById.get(id)); }
    if (event.target.closest('#ask-another')) {
      input.value='';onInput();$('#niulai-main').scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});input.focus({preventScroll:true});
    }
  });
  window.addEventListener('pagehide',()=>{if(state.timer) resetAdvice();});
  $('#catalog-note').textContent=`演示股票库 ${stocks.length} 只 · 非全市场实时搜索`;
  renderQuickPicks();
})();
