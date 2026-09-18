/* Public security directory and cached, source-labelled stock information. */
(() => {
  'use strict';
  const curated=window.NiulaiCatalog?.stocks || [];
  const curatedById=new Map(curated.map(stock=>[stock.id,stock]));
  const directory=window.NiulaiDirectory || {};
  const loadedMarkets=['CN','HK','US'].filter(market=>Array.isArray(directory[market]?.rows) && directory[market].rows.length===directory[market].total && Object.keys(directory[market].chunks).length===directory[market].parts);
  const stocks=['CN','HK','US'].flatMap(market=>{
    if(!loadedMarkets.includes(market))return curated.filter(stock=>stock.market===market);
    return directory[market].rows.map(([code,name,initials,pinyin,aliases,exchange])=>{
      const id=`${market}:${code}`,known=curatedById.get(id);
      return {id,market,code,name:market==='US'&&known?known.name:name,initials:known?.initials||initials,pinyin:known?.pinyin||pinyin,exchange,
        aliases:[...new Set([name,initials,pinyin,...aliases,...(known?[known.name,known.initials,known.pinyin,...known.aliases]:[])])].filter(Boolean)};
    });
  });
  const $ = selector => document.querySelector(selector);
  const input = $('#stock-query');
  const options = $('#stock-options');
  const suggestions = $('#suggestions');
  const advice = $('#advice-content');
  const emptyAdvice = advice.innerHTML;
  const marketNames = {CN:'A 股',HK:'港股',US:'美股'};
  const preferred = {all:['HK:00700','CN:600519','US:TSLA'],CN:['CN:600519','CN:300750','CN:600584'],HK:['HK:00700','HK:01810','HK:09988'],US:['US:NVDA','US:AAPL','US:TSLA']};
  const stockById = new Map(stocks.map(stock => [stock.id,stock]));
  const state = {market:'all',selected:null,matches:[],active:-1,composing:false,run:0,controller:null};
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

  // Normalize once on load rather than repeating it for 14,000+ records per key.
  const index=new Map(stocks.map(stock=>{
    const exchange=stock.market==='CN' ? (stock.exchange==='沪市'?'SH':stock.exchange==='深市'?'SZ':'BJ') : stock.market;
    const codeNames=[stock.code,`${exchange}${stock.code}`,`${stock.code}.${exchange}`];
    if(stock.market==='HK')codeNames.push(String(Number(stock.code)),`${Number(stock.code)}.HK`);
    if(stock.market==='US'&&stock.code.includes('.'))codeNames.push(stock.code.replace('.','-'),stock.code.replace('.','/'));
    return [stock.id,{name:normalize(stock.name),codeNames,aliases:[stock.initials,stock.pinyin,...stock.aliases].filter(Boolean).map(normalize)}];
  }));
  const marketStocks={all:stocks,CN:stocks.filter(s=>s.market==='CN'),HK:stocks.filter(s=>s.market==='HK'),US:stocks.filter(s=>s.market==='US')};
  function scoreStock(stock,query) {
    const {name,codeNames,aliases}=index.get(stock.id),code=stock.code;
    if (codeNames.includes(query)) return {score:120,exact:true};
    if (name===query) return {score:115,exact:true};
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
    const available=marketStocks[state.market];
    if (!query) return preferred[state.market].filter(id=>stockById.has(id)).map(id=>({stock:stockById.get(id),score:0}));
    const matches=[];
    for(const stock of available){const result=scoreStock(stock,query);if(result)matches.push({stock,...result});}
    return matches.sort((a,b)=>b.score-a.score || Number(curatedById.has(b.stock.id))-Number(curatedById.has(a.stock.id)) || a.stock.code.localeCompare(b.stock.code));
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
    options.innerHTML=visible.map(({stock},index)=>`<button class="nl-option" id="stock-option-${index}" type="button" role="option" aria-selected="false" tabindex="-1" data-stock-id="${escapeHTML(stock.id)}" title="${escapeHTML(stock.name)} · ${escapeHTML(stock.code)}">${marketLabel(stock)}<span class="nl-option-main"><span class="nl-option-name">${highlighted(stock.name)}</span><span class="nl-option-code">${highlighted(stock.code)} · ${escapeHTML(stock.exchange)}</span></span>${chevron}</button>`).join('');
    $('#suggestion-caption').textContent=normalize(input.value) ? (visible[0]?.fuzzy ? '你是不是想找' : '猜你想找') : '可以从这些股票开始';
    $('#match-count').textContent=state.matches.length>8 ? `${state.matches.length} 只匹配 · 展示前 8 只` : `${state.matches.length} 只匹配`;
    $('#no-matches').hidden=Boolean(visible.length);
    $('#no-matches').textContent=state.market==='all' ? '当前目录没有匹配，请试试完整代码或英文名称；新上市股票可能尚未更新。' : `当前${marketNames[state.market]}目录没有匹配，可切换“全部”或使用完整代码。`;
    suggestions.hidden=false;
    input.setAttribute('aria-expanded','true');
    announce(visible.length ? `找到 ${state.matches.length} 只匹配股票，可用上下方向键选择。` : '当前股票目录没有匹配。');
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
    state.controller?.abort();
    state.controller=null;
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
    $('#quick-picks').innerHTML=preferred[state.market].filter(id=>stockById.has(id)).map(id=>{const stock=stockById.get(id);return `<button type="button" data-quick-stock="${id}">${escapeHTML(stock.name)}</button>`;}).join('');
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

  function renderReport(stock,data,{updating=false}={}) {
    advice.innerHTML=window.NiulaiCharts ? window.NiulaiCharts.render(stock,marketLabel(stock),data,{updating}) : '<p class="nl-noscript">图表未能载入，请刷新页面重试。</p>';
    if(updating)return;
    $('#advice-card').setAttribute('aria-busy','false');
    $('#ask-niulai').disabled=false;
    $('#ask-label').textContent='问牛来值不值得买';
    state.controller=null;
    announce(`${stock.name}的数据已整理，已标注来源与数据时间，暂缺资料不会用模拟内容填充。`);
  }

  async function startAdvice(stock,{force=false}={}) {
    selectStock(stock);
    const run=state.run;
    const controller=new AbortController();state.controller=controller;
    $('#advice-card').setAttribute('aria-busy','true');
    $('#ask-niulai').disabled=true;
    $('#ask-label').textContent='牛来整理中…';
    advice.innerHTML=`<div class="nl-loading"><div class="nl-loading-ring" aria-hidden="true"></div><h3>正在整理${escapeHTML(stock.name)}的资料</h3><div class="nl-loading-tracks"><span>价格与成交量</span><span>行业资讯</span><span>热点新闻</span></div></div>`;
    announce(`正在整理${stock.name}的资料。`);
    input.blur();
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if(!force)$('#advice-card').scrollIntoView({behavior:motion,block:'start'});
    try {
      if(!window.NiulaiData || !window.NiulaiCache)throw new Error('数据模块未能载入');
      const cached=window.NiulaiData.peek(stock);
      if(Object.values(cached.sections).some(section=>section?.data))renderReport(stock,cached,{updating:true});
      const data=await window.NiulaiData.load(stock,{signal:controller.signal,force,onUpdate:data=>{if(run===state.run && state.selected?.id===stock.id)renderReport(stock,data,{updating:true});}});
      if(run===state.run && state.selected?.id===stock.id)renderReport(stock,data);
    }catch(error){
      if(error.name==='AbortError' || run!==state.run)return;
      advice.innerHTML='<div class="nl-data-missing"><p>资料暂时无法整理，请点击重试。</p></div><button class="nl-example-button" id="refresh-data" type="button">重新获取资料</button>';
      $('#advice-card').setAttribute('aria-busy','false');$('#ask-niulai').disabled=false;$('#ask-label').textContent='问牛来值不值得买';state.controller=null;
      announce('资料暂时无法整理，可以重试。');
    }
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
    if (!matches.length) showError('当前目录未找到，请核对市场和代码；新上市股票可能尚未更新。');
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
    if (event.target.closest('#refresh-data') && state.selected && !state.controller)startAdvice(state.selected,{force:true});
    if (event.target.closest('#ask-another')) {
      input.value='';onInput();$('#niulai-main').scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});input.focus({preventScroll:true});
    }
  });
  window.addEventListener('pagehide',()=>{if(state.controller) resetAdvice();});
  const missing=['CN','HK','US'].filter(m=>!loadedMarkets.includes(m));
  $('#catalog-note').textContent=missing.length ? `${missing.map(m=>marketNames[m]).join('、')}完整目录加载失败，暂用常用股票` : `股票目录 · ${stocks.length.toLocaleString('zh-CN')} 只`;
  $('#catalog-coverage').innerHTML=['CN','HK','US'].map(m=>`<div><strong>${marketNames[m]}</strong><span>${marketStocks[m].length.toLocaleString('zh-CN')} 只</span><time>${loadedMarkets.includes(m)?escapeHTML(directory[m].date):'常用备用'}</time></div>`).join('')+(missing.length?'<button type="button" id="reload-directory">重新加载目录</button>':'');
  $('#reload-directory')?.addEventListener('click',()=>window.location.reload());
  renderQuickPicks();
})();
