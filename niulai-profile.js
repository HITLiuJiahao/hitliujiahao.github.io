/* Investor preferences stay on this browser; no network requests or default answers. */
(() => {
  'use strict';
  const KEY = 'niulai.investor-profile.v1';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#profile-dialog');
  if (!dialog) return;
  const questions = [
    { key:'holdingPeriod', name:'投资节奏', title:'买入后，通常打算拿多久？', subtitle:'选一个最接近你的打算', options:[
      {id:'under_1_month',title:'短期看看',caption:'少于 1 个月',label:'不到 1 个月'},
      {id:'months_1_6',title:'看一段走势',caption:'1 个月至不足半年',label:'1—6 个月'},
      {id:'months_6_12',title:'多点耐心',caption:'半年至不足 1 年',label:'6—12 个月'},
      {id:'year_plus',title:'陪它走更久',caption:'1 年及以上',label:'1 年以上'},
      {id:'unsure',title:'还没想好',caption:'',label:'暂不确定'}
    ]},
    { key:'drawdownTolerance', name:'回落底线', title:'涨跌起伏，你能接受多少回落？', subtitle:'假设投资账户最高到过 1 万元', options:[
      {id:'none',title:'不接受回落',caption:'0% · 保持 10,000 元',label:'不接受回落'},
      {id:'pct_5',title:'最多回落 500 元',caption:'5% · 剩 9,500 元',label:'最多回落 5%'},
      {id:'pct_10',title:'最多回落 1,000 元',caption:'10% · 剩 9,000 元',label:'最多回落 10%'},
      {id:'pct_20',title:'最多回落 2,000 元',caption:'20% · 剩 8,000 元',label:'最多回落 20%'},
      {id:'over_20',title:'可以超过 2,000 元',caption:'20% 以上 · 上限未定',label:'可接受 20% 以上'},
      {id:'unsure',title:'还拿不准',caption:'先不设置底线',label:'暂不确定'}
    ]},
    { key:'investmentBudget', name:'投资总预算', title:'你准备拿多少钱用于投资？', subtitle:'只选总预算区间 · 按人民币折算', options:[
      {id:'under_10k',title:'不足 1 万元',caption:'',label:'不足 1 万'},
      {id:'10k_50k',title:'1 万—不足 5 万元',caption:'',label:'1 万—不足 5 万'},
      {id:'50k_200k',title:'5 万—不足 20 万元',caption:'',label:'5 万—不足 20 万'},
      {id:'200k_500k',title:'20 万—不足 50 万元',caption:'',label:'20 万—不足 50 万'},
      {id:'500k_plus',title:'50 万元及以上',caption:'',label:'50 万及以上'},
      {id:'private',title:'暂不透露',caption:'',label:'暂不透露'}
    ]}
  ];
  const fieldLabels = ['计划持有','回落承受','投资总预算（元）'];
  const emptyAnswers = () => Object.fromEntries(questions.map(question => [question.key,null]));
  const choice = (answers,index) => questions[index].options.find(option => option.id===answers[questions[index].key]);
  function validate(raw) {
    if (!raw || raw.version!==1 || raw.currency!=='CNY' || !Number.isFinite(Date.parse(raw.updatedAt))) return null;
    if (questions.some(question => !question.options.some(option => option.id===raw[question.key]))) return null;
    return {version:1,currency:'CNY',...Object.fromEntries(questions.map(question=>[question.key,raw[question.key]])),updatedAt:new Date(raw.updatedAt).toISOString()};
  }
  function readProfile() {
    try {
      const raw=window.localStorage.getItem(KEY);
      return raw && raw.length<2048 ? validate(JSON.parse(raw)) : null;
    } catch { return null; }
  }
  let profile=readProfile();
  let memoryOnly=false;
  let draft=emptyAnswers();
  let step=0;
  let screen='questions';
  let returnScreen='questions';
  let saveAttempted=false;
  let fallbackInert=false;
  let previousInert=false;
  let advanceTimer=null;

  function element(tag,text,className) {
    const node=document.createElement(tag);
    if (text!==undefined) node.textContent=text;
    if (className) node.className=className;
    return node;
  }
  function persona(answers) {
    // A playful description of stated preferences, never a budget-based risk score.
    const tolerance=answers.drawdownTolerance,holding=answers.holdingPeriod;
    if (tolerance==='none') return {name:'安心派',caption:'先把自己的回落底线放在心上'};
    if (tolerance==='pct_5') return {name:'稳稳党',caption:'波动小一点，心里更踏实'};
    if (tolerance==='unsure' || holding==='unsure') return {name:'探索派',caption:'慢慢摸索，找到舒服的投资节奏'};
    if (holding==='year_plus') return {name:'长跑派',caption:'愿意多陪一程，也接受沿途起伏'};
    if (holding==='months_6_12') return {name:'耐心派',caption:'不急着下结论，愿意多看一段'};
    if (tolerance==='pct_10') return {name:'稳中有数派',caption:'先划好回落底线，再观察走势'};
    if (holding==='under_1_month') return {name:'灵活派',caption:'喜欢短期观察，也接受些起伏'};
    return {name:'节奏派',caption:'先看一段走势，按自己的节奏来'};
  }
  function renderSummary(target,answers) {
    target.replaceChildren(...questions.map((question,index)=>{
      const row=element('div');
      row.append(element('dt',fieldLabels[index]),element('dd',choice(answers,index)?.label || '暂未填写'));
      return row;
    }));
  }
  function renderCard() {
    $('#profile-optional').hidden=Boolean(profile);
    $('#profile-intro').hidden=Boolean(profile);
    $('#profile-persona').hidden=!profile;
    $('#profile-card').classList.toggle('is-complete',Boolean(profile));
    $('#profile-open-label').textContent=profile ? '修改' : '去填写';
    $('#profile-saved').hidden=!profile;
    $('#profile-saved').replaceChildren();
    if (profile) {
      const title=persona(profile);
      $('#profile-nickname').textContent=title.name;
      $('#profile-persona-caption').textContent=title.caption;
      renderSummary($('#profile-saved'),profile);
    }
    $('#profile-storage-note').hidden=!(profile && memoryOnly);
    $('#profile-storage-note').textContent='本次可用，浏览器未能保存这次填写。';
  }
  function notice(text='') {
    $('#profile-dialog-notice').hidden=!text;
    $('#profile-dialog-notice').textContent=text;
  }
  function cancelAdvance() {
    if (advanceTimer!==null) window.clearTimeout(advanceTimer);
    advanceTimer=null;
  }
  function render(focusHeading=false) {
    cancelAdvance();
    const isQuestion=screen==='questions';
    const isResult=screen==='result';
    const question=questions[step];
    $('#profile-progress').hidden=!isQuestion;
    $('#profile-options').hidden=!isQuestion;
    $('#profile-result').hidden=!isResult;
    $('#profile-clear').hidden=!profile || screen==='clear';
    dialog.dataset.screen=screen;
    $('#profile-confirm').hidden=isQuestion;
    $('#profile-auto-hint').hidden=!isQuestion;
    $('#profile-result-label').hidden=!isResult;
    $('#profile-result-mascot').hidden=!isResult;
    notice();
    $('#profile-options').replaceChildren();
    if (isQuestion) {
      $('#profile-step-label').textContent=`${question.name} · ${step+1} / 3`;
      $('#profile-dialog-title').textContent=question.title;
      $('#profile-subtitle').textContent=question.subtitle;
      $('#profile-back').textContent=step===0 ? '稍后再说' : '上一步';
      $('#profile-auto-hint').textContent=step===2 ? '点选即可生成习惯卡' : '点选即可继续';
      $('#profile-progress').querySelectorAll('span').forEach((bar,index)=>bar.classList.toggle('is-complete',index<=step));
      question.options.forEach(option=>{
        const button=element('button',undefined,'nl-profile-option');
        button.type='button';button.dataset.profileOption=option.id;
        button.setAttribute('aria-pressed',String(draft[question.key]===option.id));
        button.append(element('strong',option.title));
        if (option.caption) button.append(element('span',option.caption));
        $('#profile-options').append(button);
      });
    } else if (isResult) {
      const title=persona(draft);
      $('#profile-step-label').textContent='你的投资习惯卡';
      $('#profile-dialog-title').textContent=title.name;
      $('#profile-subtitle').textContent=title.caption;
      renderSummary($('#profile-result'),draft);
      $('#profile-back').textContent='调整一下';
      $('#profile-confirm').textContent=saveAttempted ? '本次使用，去选股' : '保存，去选股票';
      if (saveAttempted) notice('浏览器未能保存，本次仍可使用；刷新后可能恢复此前设置。');
    } else {
      $('#profile-step-label').textContent='管理投资习惯卡';
      $('#profile-dialog-title').textContent='清除这张投资习惯卡？';
      $('#profile-subtitle').textContent='只清除本机保存的偏好，之后可以重新填写。';
      $('#profile-back').textContent='保留';
      $('#profile-confirm').textContent='确认清除';
    }
    if (focusHeading) {
      $('#profile-dialog-body').scrollTop=0;
      $('#profile-dialog-title').focus({preventScroll:true});
    }
  }
  function open() {
    if (dialog.open) return;
    draft=profile ? Object.fromEntries(questions.map(question=>[question.key,profile[question.key]])) : emptyAnswers();
    step=0;screen='questions';saveAttempted=false;
    render();
    if (typeof dialog.showModal==='function') dialog.showModal();
    else {
      previousInert=$('.niulai-shell').inert;
      $('.niulai-shell').inert=true;fallbackInert=true;
      dialog.setAttribute('open','');dialog.setAttribute('aria-modal','true');
    }
    $('#profile-dialog-title').focus({preventScroll:true});
  }
  function close(toSearch=false) {
    cancelAdvance();
    if (typeof dialog.close==='function') dialog.close(); else dialog.removeAttribute('open');
    if (fallbackInert) {$('.niulai-shell').inert=previousInert;fallbackInert=false;}
    if (toSearch) {
      $('.nl-search-card').scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      $('#stock-query').focus({preventScroll:true});
    } else $('#profile-open').focus({preventScroll:true});
  }
  function save() {
    if (saveAttempted) {close(true);return;}
    const next=validate({version:1,currency:'CNY',...draft,updatedAt:new Date().toISOString()});
    if (!next) {screen='questions';render(true);return;}
    try {
      window.localStorage.setItem(KEY,JSON.stringify(next));
      memoryOnly=false;
    } catch {memoryOnly=true;}
    profile=next;renderCard();
    if (memoryOnly) {saveAttempted=true;render(true);return;}
    $('#niulai-status').textContent='投资习惯已保存到当前浏览器。';
    close(true);
  }
  $('#profile-open').addEventListener('click',open);
  $('#profile-close').addEventListener('click',()=>close());
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('#profile-options').addEventListener('click',event=>{
    const button=event.target.closest('[data-profile-option]');
    if (!button || screen!=='questions' || advanceTimer!==null || event.detail>1) return;
    const selected=questions[step].options.find(option=>option.id===button.dataset.profileOption);
    if (!selected) return;
    draft[questions[step].key]=selected.id;saveAttempted=false;
    $('#profile-options').querySelectorAll('button').forEach(option=>{
      option.setAttribute('aria-pressed',String(option===button));
      option.disabled=true;
    });
    // Brief selection feedback also prevents a double tap from answering two questions.
    advanceTimer=window.setTimeout(()=>{
      advanceTimer=null;
      if (!dialog.open || screen!=='questions') return;
      if (step<questions.length-1) step++; else screen='result';
      render(true);
    },260);
  });
  $('#profile-back').addEventListener('click',()=>{
    if (screen==='clear') screen=returnScreen;
    else if (screen==='result') {screen='questions';step=0;saveAttempted=false;}
    else if (step>0) step--;
    else {close();return;}
    render(true);
  });
  $('#profile-confirm').addEventListener('click',()=>{
    if (screen==='clear') {
      try {window.localStorage.removeItem(KEY);} catch {notice('浏览器未能清除记录，请重试或清理此网站的浏览器数据。');return;}
      profile=null;memoryOnly=false;draft=emptyAnswers();renderCard();
      $('#niulai-status').textContent='已清除本机保存的投资习惯。';close();return;
    }
    if (screen==='result') {save();return;}
  });
  $('#profile-clear').addEventListener('click',()=>{returnScreen=screen;screen='clear';render(true);});
  dialog.addEventListener('keydown',event=>{
    if (event.repeat && (event.key==='Enter' || event.key===' ')) {event.preventDefault();return;}
    if (event.key!=='Tab') return;
    const available=[...dialog.querySelectorAll('button:not([disabled]),a[href]')].filter(node=>!node.closest('[hidden]'));
    const first=available[0],last=available[available.length-1];
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
    else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
  });
  window.addEventListener('storage',event=>{
    if (event.key!==KEY && event.key!==null) return;
    profile=readProfile();memoryOnly=false;renderCard();
    if (dialog.open) $('#profile-clear').hidden=!profile || screen==='clear';
  });
  renderCard();
})();
