/* Investor preferences stay on this browser; no network requests or default answers. */
(() => {
  'use strict';
  const KEY = 'niulai.investor-profile.v1';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#profile-dialog');
  if (!dialog) return;
  const questions = [
    { key:'holdingPeriod', name:'投资节奏', title:'买入后，通常打算拿多久？', subtitle:'', options:[
      {id:'under_1_month',title:'少于 1 个月',caption:'短期看看',label:'不到 1 个月'},
      {id:'months_1_6',title:'1 个月至不足半年',caption:'看一段走势',label:'1—6 个月'},
      {id:'months_6_12',title:'半年至不足 1 年',caption:'多点耐心',label:'6—12 个月'},
      {id:'year_plus',title:'1 年及以上',caption:'陪它走更久',label:'1 年以上'},
      {id:'unsure',title:'还没想好',caption:'',label:'暂不确定'}
    ]},
    { key:'volatilityAnxiety', name:'波动感受', title:'出现多大的波动时，您会感到焦虑？', subtitle:'按持有期间的价格涨跌幅选择', options:[
      {id:'small',title:'不到 5%',caption:'',label:'不到 5%'},
      {id:'pct_5',title:'5% 左右',caption:'',label:'约 5%'},
      {id:'pct_10',title:'10% 左右',caption:'',label:'约 10%'},
      {id:'pct_20',title:'20% 左右',caption:'',label:'约 20%'},
      {id:'over_20',title:'超过 20%',caption:'',label:'超过 20%'},
      {id:'unsure',title:'还拿不准',caption:'',label:'暂不确定'}
    ]},
    { key:'investmentBudget', name:'投资总预算', title:'你准备拿多少钱用于投资？', subtitle:'投资总预算 · 人民币', options:[
      {id:'under_10k',title:'不足 1 万元',caption:'',label:'不足 1 万'},
      {id:'10k_50k',title:'1 万—不足 5 万元',caption:'',label:'1 万—不足 5 万'},
      {id:'50k_200k',title:'5 万—不足 20 万元',caption:'',label:'5 万—不足 20 万'},
      {id:'200k_500k',title:'20 万—不足 50 万元',caption:'',label:'20 万—不足 50 万'},
      {id:'500k_plus',title:'50 万元及以上',caption:'',label:'50 万及以上'},
      {id:'private',title:'暂不透露',caption:'',label:'暂不透露'}
    ]}
  ];
  const legacyDrawdown={none:'不接受回落',pct_5:'最多回落 5%',pct_10:'最多回落 10%',pct_20:'最多回落 20%',over_20:'可接受 20% 以上',unsure:'暂不确定'};
  const companionLines=['先聊聊你的节奏','怎么舒服，怎么选','最后一题，马上出卡'];
  const emptyAnswers = () => Object.fromEntries(questions.map(question => [question.key,null]));
  const choice = (answers,index) => questions[index].options.find(option => option.id===answers[questions[index].key]);
  function validate(raw) {
    if (!raw || ![1,2].includes(raw.version) || raw.currency!=='CNY' || !Number.isFinite(Date.parse(raw.updatedAt))) return null;
    const fields=questions.filter(question=>raw.version===2 || question.key!=='volatilityAnxiety');
    if (fields.some(question => !question.options.some(option => option.id===raw[question.key]))) return null;
    if (raw.version===1 && !Object.hasOwn(legacyDrawdown,raw.drawdownTolerance)) return null;
    // Old drawdown answers are preserved with their original meaning, never inferred as anxiety.
    return {version:raw.version,currency:'CNY',...Object.fromEntries(fields.map(question=>[question.key,raw[question.key]])),...(raw.version===1?{drawdownTolerance:raw.drawdownTolerance}:{}),updatedAt:new Date(raw.updatedAt).toISOString()};
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
  const syncTitlePreview=setupTitlePreview();

  function setupTitlePreview() {
    const preview=$('#profile-title-previews'),scroller=$('#profile-title-scroll');
    if (!scroller || !window.requestAnimationFrame) return ()=>{};
    const list=scroller.querySelector('.nl-profile-title-set'),copy=list.cloneNode(true);
    copy.setAttribute('aria-hidden','true');
    scroller.querySelector('.nl-profile-title-track').append(copy);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame=null,lastTime=null,position=0,cycle=0,inView=true,hovered=false,dragging=false,focused=false;
    let holdUntil=window.performance.now()+1200;
    const canMove=()=>!preview.hidden && !document.hidden && !dialog.open && inView && !reduced?.matches && !hovered && !dragging && !focused && cycle>scroller.clientWidth+1;
    function stop() {
      if (frame!==null) window.cancelAnimationFrame(frame);
      frame=null;lastTime=null;
    }
    function tick(now) {
      frame=null;
      if (!canMove()) {lastTime=null;return;}
      if (lastTime!==null && now>=holdUntil) {
        // Retain fractional pixels and resume from the user's manually scrolled position.
        if (Math.abs(scroller.scrollLeft-position)>1) position=scroller.scrollLeft;
        position=(position+Math.min(now-lastTime,64)*.018)%cycle;
        scroller.scrollLeft=position;
      }
      lastTime=now;frame=window.requestAnimationFrame(tick);
    }
    function sync() {
      cycle=list.getBoundingClientRect().width;
      const automatic=cycle>scroller.clientWidth+1 && !reduced?.matches;
      copy.hidden=!automatic;
      if (!canMove()) {stop();return;}
      if (frame===null) {position=scroller.scrollLeft;frame=window.requestAnimationFrame(tick);}
    }
    function resumeSoon() {holdUntil=window.performance.now()+1800;sync();}
    scroller.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;sync();}});
    scroller.addEventListener('pointerleave',()=>{hovered=false;resumeSoon();});
    scroller.addEventListener('pointerdown',()=>{dragging=true;focused=false;sync();});
    const release=()=>{if(dragging){dragging=false;resumeSoon();}};
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    scroller.addEventListener('wheel',resumeSoon,{passive:true});
    scroller.addEventListener('focus',()=>{focused=!dragging;sync();});
    scroller.addEventListener('keydown',()=>{focused=true;sync();});
    scroller.addEventListener('blur',()=>{focused=false;resumeSoon();});
    document.addEventListener('visibilitychange',sync);
    reduced?.addEventListener?.('change',sync);
    if (window.ResizeObserver) {const observer=new ResizeObserver(sync);observer.observe(scroller);observer.observe(list);}
    else window.addEventListener('resize',sync);
    if (window.IntersectionObserver) new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();}).observe(preview);
    return sync;
  }

  function element(tag,text,className) {
    const node=document.createElement(tag);
    if (text!==undefined) node.textContent=text;
    if (className) node.className=className;
    return node;
  }
  function persona(answers) {
    // A playful description of stated preferences, never a budget-based risk score.
    const tolerance=answers.version===1?answers.drawdownTolerance:answers.volatilityAnxiety,holding=answers.holdingPeriod;
    if (tolerance==='none' || tolerance==='small') return '安心派';
    if (tolerance==='pct_5') return '稳稳党';
    if (tolerance==='unsure' || holding==='unsure') return '探索派';
    if (holding==='year_plus') return '长跑派';
    if (holding==='months_6_12') return '耐心派';
    if (tolerance==='pct_10') return '稳中有数派';
    if (holding==='under_1_month') return '灵活派';
    return '节奏派';
  }
  function svgNode(tag,attributes,text) {
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,String(value)));
    if (text!==undefined) node.textContent=text;
    return node;
  }
  function graphic(label,className) {
    const node=element('div',undefined,className);
    node.setAttribute('role','img');node.setAttribute('aria-label',label);
    return node;
  }
  function timeChart(answers) {
    const option=choice(answers,0),known=answers.holdingPeriod!=='unsure';
    const chart=graphic('计划持有：'+option.label,'nl-profile-time-chart');
    if (!known) chart.append(element('span','暂不确定','nl-profile-unknown'));
    const track=element('div',undefined,'nl-profile-time-track');
    const labels=['< 1 月','1—6 月','6—12 月','1 年+'];
    questions[0].options.slice(0,4).forEach((item,index)=>{
      const stop=element('div',undefined,'nl-profile-time-stop');
      const selected=item.id===answers.holdingPeriod;
      stop.classList.toggle('is-selected',selected);
      stop.append(element('i',selected?'✓':''),element('span',labels[index]));track.append(stop);
    });
    chart.append(track);return chart;
  }
  function volatilityChart(answers) {
    const legacy=answers.version===1;
    const selected=legacy?answers.drawdownTolerance:answers.volatilityAnxiety;
    const known=selected!=='unsure';
    const label=legacy?legacyDrawdown[selected]:choice(answers,1).label;
    const chart=graphic((legacy?'回落承受：':'波动到以下幅度时开始焦虑：')+label,'nl-profile-gauge');
    const svg=svgNode('svg',{viewBox:'0 0 136 94','aria-hidden':'true',focusable:'false'});
    const arc='M16 68 A52 52 0 0 1 120 68';
    svg.append(svgNode('path',{d:arc,class:'nl-profile-gauge-track'}));
    if (known) {
      const point={none:0,small:5,pct_5:5,pct_10:10,pct_20:20,over_20:20}[selected];
      svg.append(svgNode('path',{d:arc,pathLength:100,'stroke-dasharray':`${point*5} 100`,class:'nl-profile-gauge-fill'}));
      if (selected!=='small') {
        const angle=point/20*Math.PI;
        svg.append(svgNode('circle',{cx:68-52*Math.cos(angle),cy:68-52*Math.sin(angle),r:4,class:'nl-profile-gauge-dot'}));
      }
      if (selected==='over_20') svg.append(svgNode('path',{d:'m124 63 5 5-5 5',class:'nl-profile-gauge-more'}));
    }
    const values=legacy?{none:'0%',pct_5:'≤ 5%',pct_10:'≤ 10%',pct_20:'≤ 20%',over_20:'> 20%',unsure:'未定'}:{small:'< 5%',pct_5:'约 5%',pct_10:'约 10%',pct_20:'约 20%',over_20:'> 20%',unsure:'未定'};
    svg.append(svgNode('text',{x:68,y:57,class:'nl-profile-gauge-value','text-anchor':'middle'},values[selected]));
    svg.append(svgNode('text',{x:68,y:75,class:'nl-profile-gauge-caption','text-anchor':'middle'},known?(legacy?'回落底线':'开始焦虑'):'暂不确定'));
    svg.append(svgNode('text',{x:16,y:91,class:'nl-profile-gauge-tick','text-anchor':'middle'},'0%'),svgNode('text',{x:120,y:91,class:'nl-profile-gauge-tick','text-anchor':'middle'},'20%'));
    chart.append(svg);return chart;
  }
  function budgetChart(answers) {
    const option=choice(answers,2),known=answers.investmentBudget!=='private';
    const chart=graphic('投资总预算，人民币：'+option.label,'nl-profile-budget-chart');
    chart.append(element('strong',option.label,'nl-profile-budget-value'));
    if (known) {
      const track=element('div',undefined,'nl-profile-budget-track');
      questions[2].options.slice(0,5).forEach(item=>{
        const bar=element('span');
        if (item.id===answers.investmentBudget) {bar.className='is-selected';bar.textContent='•';}
        track.append(bar);
      });
      const ends=element('div',undefined,'nl-profile-budget-ends');ends.append(element('span','< 1 万'),element('span','50 万+'));
      chart.append(track,ends);
    } else {
      const lock=svgNode('svg',{viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false',class:'nl-profile-budget-private'});
      lock.append(svgNode('rect',{x:5,y:10,width:14,height:11,rx:3}),svgNode('path',{d:'M8 10V7a4 4 0 0 1 8 0v3m-4 5v2'}));chart.append(lock);
    }
    return chart;
  }
  function renderSummary(target,answers) {
    const entries=[['计划持有','time',timeChart(answers)],[answers.version===1?'回落承受':'波动感受','volatility',volatilityChart(answers)],['总预算（元）','budget',budgetChart(answers)]];
    target.replaceChildren(...entries.map(([label,type,chart])=>{
      const row=element('div',undefined,'nl-profile-metric nl-profile-metric-'+type),value=element('dd');
      value.append(chart);row.append(element('dt',label),value);return row;
    }));
  }
  function renderCard() {
    $('#profile-optional').hidden=Boolean(profile);
    $('#profile-heading-invitation').hidden=Boolean(profile);
    $('#profile-heading-saved').hidden=!profile;
    $('#profile-invite-mascot').hidden=Boolean(profile);
    $('#profile-title-previews').hidden=Boolean(profile);
    $('#profile-persona').hidden=!profile;
    $('#profile-card').classList.toggle('is-complete',Boolean(profile));
    $('#profile-open-label').textContent=profile ? '修改' : '去填写';
    $('#profile-saved').hidden=!profile;
    $('#profile-saved').replaceChildren();
    if (profile) {
      $('#profile-nickname').textContent=persona(profile);
      renderSummary($('#profile-saved'),profile);
    }
    $('#profile-storage-note').hidden=!(profile && memoryOnly);
    $('#profile-storage-note').textContent='本次可用，浏览器未能保存这次填写。';
    syncTitlePreview();
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
    dialog.dataset.question=isQuestion?question.key:'';
    $('#profile-confirm').hidden=isQuestion;
    $('#profile-auto-hint').hidden=!isQuestion;
    $('#profile-result-label').hidden=!isResult;
    $('#profile-result-mascot').hidden=!isResult;
    $('#profile-quiz-mascot').hidden=!isQuestion;
    $('#profile-companion-line').hidden=!isQuestion;
    $('#profile-subtitle').hidden=isResult || (isQuestion && !question.subtitle);
    notice();
    $('#profile-options').replaceChildren();
    if (isQuestion) {
      $('#profile-companion-line').textContent=companionLines[step];
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
      $('#profile-step-label').textContent='你的投资习惯卡';
      $('#profile-dialog-title').textContent=persona(draft);
      $('#profile-subtitle').textContent='';
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
    draft=profile ? Object.fromEntries(questions.map(question=>[question.key,profile[question.key]??null])) : emptyAnswers();
    step=0;screen='questions';saveAttempted=false;
    render();
    if (typeof dialog.showModal==='function') dialog.showModal();
    else {
      previousInert=$('.niulai-shell').inert;
      $('.niulai-shell').inert=true;fallbackInert=true;
      dialog.setAttribute('open','');dialog.setAttribute('aria-modal','true');
    }
    $('#profile-dialog-title').focus({preventScroll:true});
    syncTitlePreview();
  }
  function close(showSavedCard=false) {
    cancelAdvance();
    if (typeof dialog.close==='function') dialog.close(); else dialog.removeAttribute('open');
    if (fallbackInert) {$('.niulai-shell').inert=previousInert;fallbackInert=false;}
    if (showSavedCard) {
      // Keep the completed card in view. Focusing the search field hides it and opens the phone keyboard.
      $('#profile-card').focus({preventScroll:true});
      $('#profile-card').scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    } else $('#profile-open').focus({preventScroll:true});
    syncTitlePreview();
  }
  function save() {
    if (saveAttempted) {close(true);return;}
    const next=validate({version:2,currency:'CNY',...draft,updatedAt:new Date().toISOString()});
    if (!next) {screen='questions';render(true);return;}
    try {
      window.localStorage.setItem(KEY,JSON.stringify(next));
      memoryOnly=false;
    } catch {memoryOnly=true;}
    profile=next;renderCard();
    window.dispatchEvent(new Event('niulai:profilechange'));
    if (memoryOnly) {saveAttempted=true;render(true);return;}
    $('#niulai-status').textContent='投资习惯卡已保存，下方可以继续选股票。';
    close(true);
  }
  $('#profile-open').addEventListener('click',open);
  document.addEventListener('click',event=>{if(event.target.closest('[data-edit-profile]'))open();});
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
      window.dispatchEvent(new Event('niulai:profilechange'));
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
    window.dispatchEvent(new Event('niulai:profilechange'));
    if (dialog.open) $('#profile-clear').hidden=!profile || screen==='clear';
  });
  window.NiulaiProfile=Object.freeze({get:()=>profile?Object.freeze({...profile}):null});
  renderCard();
})();
