/* All market values below are fixed demonstration data, not live quotes. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const icon = (name, className = '') => `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const stocks = [
    {name:'长电科技',code:'600584',price:'42.31',change:'+8.71%',heat:'2.93万',streak:'首板',inflow:'8.62亿',news:'拟定增45亿扩产先进封装'},
    {name:'中芯国际',code:'688981',price:'103.28',change:'+5.26%',heat:'2.68万',streak:'首板',inflow:'12.86亿',news:'半导体板块热度持续上升'},
    {name:'润和软件',code:'300339',price:'56.80',change:'+6.32%',heat:'2.51万',streak:'首板',inflow:'6.35亿',news:'软件服务板块获得市场关注'},
    {name:'华胜天成',code:'600410',price:'15.63',change:'+9.99%',heat:'2.16万',streak:'3连板',inflow:'4.23亿',news:'数字经济相关概念活跃'},
    {name:'拓维信息',code:'002261',price:'31.46',change:'+10.00%',heat:'1.98万',streak:'2连板',inflow:'5.18亿',news:'算力产业链关注度提升'}
  ];
  const rankings = {hot:[0,1,2,3,4],streak:[3,4],inflow:[1,0,2,4,3]};
  const titles = {hot:'微信热搜',streak:'连续涨停',inflow:'主力净流入'};
  const favorites = new Set();
  let selectedRanking = 'hot';
  let selectedView = 'discover';
  let toastTimer;
  const dialog = $('#detail-dialog');
  const scroll = $('#main-scroll');
  const sparkTemplate = $('.sparkline').outerHTML;

  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2200);
  }

  function showDialog(title, content) {
    $('#dialog-title').textContent = title;
    $('#dialog-content').innerHTML = content;
    if (!dialog.open) dialog.showModal();
    updateFavoriteButtons();
  }

  function syncScrollRail() {
    const rail = $('.scroll-rail');
    const thumb = $('.scroll-thumb');
    const max = scroll.scrollHeight - scroll.clientHeight;
    thumb.style.opacity = max > 0 ? '1' : '0';
    thumb.style.transform = `translateY(${max > 0 ? (scroll.scrollTop / max) * Math.max(0, rail.clientHeight - thumb.clientHeight - 6) : 0}px)`;
  }

  function favoriteButton(stock, extraClass = '') {
    const saved = favorites.has(stock.name);
    return `<button type="button" class="favorite-button ${extraClass} ${saved ? 'saved' : ''}" data-favorite="${stock.name}" aria-label="${saved ? '将' : '添加'}${stock.name}${saved ? '移出自选' : '到自选'}" aria-pressed="${saved}">${icon(saved ? 'check' : 'heart')}</button>`;
  }

  function stockCard(stock, index, ranking = selectedRanking) {
    const metric = ranking === 'hot' ? stock.heat : ranking === 'streak' ? stock.streak : stock.inflow;
    const metricLabel = ranking === 'hot' ? '搜索热度' : ranking === 'streak' ? '连续涨停' : '主力净流入';
    const spark = sparkTemplate.replaceAll('spark-fill', `spark-fill-${ranking}-${index}`).replace('长电科技走势', `${stock.name}演示走势`);
    return `<article class="stock-item"><div class="stock-summary">${spark}<button class="stock-name" type="button" data-stock="${stock.name}"><span class="rank-number">${index + 1}</span><span>${stock.name}</span></button><div class="stock-metrics"><div class="heat-metric"><strong>${ranking === 'hot' ? icon('fire') : ''}${metric}</strong><span>${metricLabel}</span></div><div class="change-metric"><strong class="red">${stock.change}</strong><span>今日涨跌</span></div></div>${favoriteButton(stock)}</div><button class="stock-news" type="button" data-stock="${stock.name}"><span>▤</span><strong>公司大事</strong><span>${stock.news}</span>${icon('chevron','chevron')}</button></article>`;
  }

  function renderRanking() {
    $('#stock-list').innerHTML = rankings[selectedRanking].map((id, i) => stockCard(stocks[id], i)).join('');
    $('#stock-list').setAttribute('aria-labelledby', `tab-${selectedRanking}`);
    $$('.ranking-tab').forEach(button => {
      const active = button.dataset.ranking === selectedRanking;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    syncScrollRail();
  }

  function updateFavoriteButtons() {
    $$('[data-favorite]').forEach(button => {
      const name = button.dataset.favorite;
      const saved = favorites.has(name);
      button.classList.toggle('saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? '将' : '添加'}${name}${saved ? '移出自选' : '到自选'}`);
      button.innerHTML = button.classList.contains('text-favorite') ? (saved ? '已添加自选' : '添加自选') : icon(saved ? 'check' : 'heart');
    });
    $('#intelligence-caption').textContent = favorites.size ? `已关注 ${favorites.size} 只自选股` : '添加自选开启异动追踪';
    const addButton = $('.intelligence-card .outline-button');
    addButton.textContent = favorites.size ? '查看自选' : '立即添加';
    addButton.dataset.action = favorites.size ? 'watchlist' : 'add-stock';
  }

  function toggleFavorite(name) {
    if (!stocks.some(stock => stock.name === name)) return;
    const wasSaved = favorites.has(name);
    wasSaved ? favorites.delete(name) : favorites.add(name);
    updateFavoriteButtons();
    if (selectedView === 'watchlist') renderWatchlist();
    toast(wasSaved ? `已将${name}移出自选` : `已添加${name}到自选`);
  }

  function simpleStockList(list) {
    return list.map(stock => `<div class="simple-stock"><button type="button" class="simple-stock-title" data-stock="${stock.name}"><strong>${stock.name}</strong><small>${stock.code}</small></button><span class="red">${stock.change}</span>${favoriteButton(stock,'inline-favorite')}</div>`).join('');
  }

  function renderWatchlist() {
    const selected = stocks.filter(stock => favorites.has(stock.name));
    $('#watchlist-view').innerHTML = `<div class="secondary-heading"><h2>我的自选</h2><button class="outline-button" type="button" data-action="add-stock">添加自选</button></div>${selected.length ? `<div class="secondary-card">${simpleStockList(selected)}</div><p class="data-note">当前页面内的自选列表 · 演示行情</p>` : `<div class="empty-state">${icon('chart')}<h3>关注你感兴趣的股票</h3><p>添加自选，随时查看股票动态</p><button type="button" class="primary-button" data-action="add-stock">添加第一只自选</button></div>`}`;
    syncScrollRail();
  }

  function switchView(view) {
    if (!['discover','watchlist','markets','trade'].includes(view)) return;
    selectedView = view;
    $$('.view').forEach(section => { section.hidden = section.id !== `${view}-view`; });
    $$('.nav-item').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      active ? button.setAttribute('aria-current','page') : button.removeAttribute('aria-current');
    });
    if (view === 'watchlist') renderWatchlist();
    if (view === 'markets') $('#markets-view').innerHTML = `<div class="secondary-heading"><h2>市场行情</h2><span class="demo-tag">演示</span></div><div class="secondary-card market-summary"><h3>热门板块</h3>${[['词元概念','+1.50%'],['半导体','+3.26%'],['人工智能','+2.18%']].map(([name,value]) => `<button class="sector-row" type="button" data-action="sector-detail"><span>${name}</span><strong class="red">${value}</strong>${icon('chevron','chevron')}</button>`).join('')}</div><div class="secondary-heading"><h2>热门股票</h2></div><div class="secondary-card">${simpleStockList(stocks)}</div><p class="data-note">以上为固定演示数据</p>`;
    if (view === 'trade') $('#trade-view').innerHTML = `<div class="secondary-heading"><h2>交易</h2><span class="demo-tag">演示</span></div><div class="empty-state">${icon('trade')}<h3>开启你的投资之旅</h3><p>了解新客开户流程与专享福利</p><button class="primary-button" type="button" data-action="account">立即开户</button><p class="dialog-note">仅展示交互，不执行真实交易</p></div>`;
    scroll.scrollTop = 0;
    syncScrollRail();
  }

  function openSearch(adding = false) {
    showDialog(adding ? '添加自选' : '搜索股票', `<label class="dialog-search">${icon('search')}<input id="stock-search" type="search" placeholder="输入股票名称或代码" aria-label="股票名称或代码" autocomplete="off" autofocus></label><p class="small-heading">热门搜索</p><div id="search-results">${simpleStockList(stocks)}</div><p class="dialog-note">以下为演示股票，可添加至当前页面的自选列表。</p>`);
    $('#stock-search').focus();
  }

  function openStock(name) {
    const stock = stocks.find(item => item.name === name);
    if (!stock) return;
    showDialog(stock.name, `<div class="stock-detail-code">${stock.code}<span class="demo-tag">演示行情</span></div><div class="detail-quote"><strong>${stock.price}</strong><span>${stock.change}</span></div><div class="detail-chart">${sparkTemplate.replaceAll('spark-fill','detail-spark-fill')}</div><p class="dialog-copy">${stock.news}</p><button type="button" class="primary-button dialog-button text-favorite" data-favorite="${stock.name}">添加自选</button><p class="dialog-note">固定展示数据，不代表当前市场行情。</p>`);
  }

  const actions = {
    'close-dialog': () => dialog.close(),
    search: () => openSearch(),
    'add-stock': () => openSearch(true),
    watchlist: () => {dialog.close(); switchView('watchlist');},
    intelligence: () => favorites.size ? switchView('watchlist') : openSearch(true),
    account: () => showDialog('新客开户福利', `<div class="account-benefit"><span>新客理财专享</span><strong>8.88<small>%</small></strong><p>截图福利展示</p></div><ol class="account-steps"><li><span>1</span>了解开户流程</li><li><span>2</span>准备开户所需资料</li><li><span>3</span>前往官方服务办理</li></ol><p class="dialog-note">这是前端交互演示，不会开通账户、收集个人资料或提交任何申请。实际活动以官方规则为准。</p><button class="primary-button dialog-button" type="button" data-action="close-dialog">我知道了</button>`),
    news: () => showDialog('市场快讯', `<span class="demo-tag">截图资讯</span><h3 class="article-title">全国首个海洋智能要素平台落地青岛</h3><p class="dialog-copy">海洋产业数智化提速</p><div class="article-separator"></div><p class="dialog-copy">这里呈现参考截图中的资讯标题与摘要，可返回首页继续查看热股榜。</p><button class="outline-button dialog-button" type="button" data-action="sector-detail">查看相关板块：词元概念 +1.50%</button>`),
    'sector-detail': () => showDialog('板块行情', `<p class="dialog-copy">热门板块展示</p><div class="sector-row"><strong>词元概念</strong><strong class="red">+1.50%</strong></div><div class="sector-row"><strong>半导体</strong><strong class="red">+3.26%</strong></div><div class="sector-row"><strong>人工智能</strong><strong class="red">+2.18%</strong></div><p class="dialog-note">以上为演示数据。</p>`),
    sectors: () => actions['sector-detail'](),
    ipo: () => showDialog('打新日历', `<div class="calendar-header"><span>新股申购</span><span class="demo-tag">演示</span></div><div class="calendar-week">${['一','二','三','四','五','六','日'].map((day,i) => `<span class="${i === 4 ? 'today' : ''}">${day}<b>${14+i}</b></span>`).join('')}</div><p class="calendar-empty">本演示暂无新股申购安排</p><p class="dialog-note">接入行情后可在这里查看申购日历。</p>`),
    fund: () => showDialog('买基金', `<div class="service-symbol">${icon('fund')}</div><p class="dialog-copy">基金入口已就绪，可在这里展示基金分类、行情和产品详情。</p><p class="dialog-note">当前为页面演示，未接入基金产品和购买服务。</p><button type="button" class="primary-button dialog-button" data-action="close-dialog">返回首页</button>`),
    etf: () => showDialog('热门 ETF', `<p class="dialog-copy">热门 ETF 分类</p>${['宽基 ETF','科技 ETF','行业 ETF'].map(name => `<div class="sector-row"><span>${name}</span><span class="demo-tag">演示</span></div>`).join('')}<p class="dialog-note">当前未接入实时基金行情。</p>`),
    services: () => showDialog('微信理财', `<p class="dialog-copy">理财服务入口的交互展示。</p><p class="dialog-note">当前未接入真实理财业务。</p>`),
    profile: () => { $('.unread-dot').hidden = true; showDialog('个人中心', `<div class="profile-demo">${icon('user')}<h3>欢迎来到微证券</h3><p>探索行情，关注你的自选</p></div><button type="button" class="dialog-menu-row" data-action="watchlist">我的自选 <span>${favorites.size} 只</span>${icon('chevron','chevron')}</button><button type="button" class="dialog-menu-row" data-action="about">关于此页面${icon('chevron','chevron')}</button>`); },
    yuanbao: () => showDialog('问元宝', `<p class="yuanbao-greeting">投资问题，有问有答</p><p class="dialog-copy">可以试着输入一个问题，体验提问交互。</p><form id="yuanbao-form" class="yuanbao-form"><label for="yuanbao-question" class="small-heading">你的问题</label><input id="yuanbao-question" required maxlength="200" placeholder="例如：如何添加自选股？" autocomplete="off"><button class="primary-button" type="submit">发送</button></form><div id="yuanbao-answer" class="yuanbao-answer" role="status" hidden></div><p class="dialog-note">演示回答，未连接智能问答服务。</p>`),
    'more-stocks': () => showDialog(titles[selectedRanking], `<div class="expanded-stocks">${simpleStockList(rankings[selectedRanking].map(id => stocks[id]))}</div><p class="dialog-note">榜单为演示数据。</p>`),
    menu: () => showDialog('更多选项', `<button type="button" class="dialog-menu-row" data-action="top">回到首页顶部${icon('chevron','chevron')}</button><button type="button" class="dialog-menu-row" data-action="about">关于此页面${icon('chevron','chevron')}</button>`),
    top: () => { dialog.close(); switchView('discover'); },
    minimize: () => { switchView('discover'); toast('已回到首页顶部'); },
    about: () => showDialog('关于此页面', `<p class="dialog-copy">根据提供的腾讯微证券截图制作的前端复刻页面。</p><p class="dialog-copy">支持榜单切换、搜索股票、添加与移除自选，以及主要入口的演示交互。</p><p class="dialog-note">这是独立演示页面，并非腾讯官方服务；行情为示例，不支持真实开户与交易。</p>`)
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.ranking) {selectedRanking = button.dataset.ranking;renderRanking();}
    else if (button.dataset.favorite) toggleFavorite(button.dataset.favorite);
    else if (button.dataset.stock) openStock(button.dataset.stock);
    else if (button.dataset.view) switchView(button.dataset.view);
    else if (button.dataset.action) actions[button.dataset.action]?.();
  });

  $('.ranking-tabs').addEventListener('keydown', event => {
    const tabs = $$('.ranking-tab');
    let index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[index].focus();
    selectedRanking = tabs[index].dataset.ranking;
    renderRanking();
  });

  document.addEventListener('input', event => {
    if (event.target.id !== 'stock-search') return;
    const query = event.target.value.trim().toLowerCase();
    const matches = stocks.filter(stock => stock.name.toLowerCase().includes(query) || stock.code.includes(query));
    $('#search-results').innerHTML = matches.length ? simpleStockList(matches) : '<p class="search-empty">未找到匹配的演示股票，试试“长电”或“600584”。</p>';
  });

  document.addEventListener('submit', event => {
    if (event.target.id !== 'yuanbao-form') return;
    event.preventDefault();
    const question = $('#yuanbao-question').value.trim();
    if (!question) return;
    const answer = $('#yuanbao-answer');
    answer.hidden = false;
    const text = /自选|添加|关注/.test(question) ? '在首页点击“立即添加”，或点击股票右侧的爱心按钮，即可添加自选。点击底部“自选”可以查看已关注的股票。' : '已收到你的问题。这是问元宝的交互演示，目前仅能回答本页面的使用问题，例如“如何添加自选股？”';
    answer.innerHTML = `<p class="submitted-question">${escapeHTML(question)}</p><p>${text}</p>`;
  });

  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  scroll.addEventListener('scroll', syncScrollRail, {passive:true});
  window.addEventListener('resize', syncScrollRail, {passive:true});
  renderRanking();
})();
