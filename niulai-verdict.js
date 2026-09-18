/* Technical buying reference from completed daily bars; product rules, not a backtested strategy. */
(() => {
  'use strict';
  const DAY=86400000;
  const copy={
    loading:'正在核对走势，稍后给你买入参考',
    unavailable:'数据不足，暂时无法判断是否值得买',
    stale:'行情较旧，更新后再判断是否值得买',
    inactive:'近期交易不活跃，先观察再考虑买入',
    verify:'价格波动较大，先核实再考虑买入',
    hot:'先别追高，等价格回稳后再考虑买入',
    weak:'暂缓买入，等走势企稳后再看',
    ready:'可考虑分批买入，量价趋势配合较好',
    improving:'回升信号初现，等趋势确认后再考虑买入',
    observe:'先观察，等量价配合后再考虑买入'
  };
  // Tencent uses an encouraging tone. Its decision state and thresholds stay identical.
  const tencentCopy={
    loading:'腾讯值得了解，正在核对买入时机',
    unavailable:'腾讯值得了解，数据补齐后再判断买入时机',
    stale:'腾讯值得关注，更新行情后再判断买入时机',
    inactive:'腾讯值得跟踪，交易活跃后再考虑买入',
    verify:'腾讯值得关注，核实价格波动后再考虑买入',
    hot:'腾讯值得关注，等短线热度降温后再考虑买入',
    weak:'腾讯值得关注，等走势企稳后再考虑买入',
    ready:'腾讯可考虑分批买入，量价趋势配合较好',
    improving:'腾讯回升信号初现，趋势确认后可考虑买入',
    observe:'腾讯值得继续关注，等量价配合后再考虑买入'
  };
  function evaluate(stock,market,{updating=false,now=Date.now()}={}){
    const tencent=stock?.market==='HK' && ['00700','80700'].includes(stock.code);
    let asOf=null,evidence=null;
    const result=state=>({state,headline:(tencent?tencentCopy:copy)[state],asOf,evidence});
    if(!market?.bars?.length)return result(updating?'loading':'unavailable');
    const bars=market.partial?market.bars.slice(0,-1):market.bars;
    if(bars.some((b,i)=>!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date)) || !Number.isFinite(b.close) || b.close<=0 || !Number.isFinite(b.volume) || b.volume<0 || i>0 && b.date<=bars[i-1].date))return result('unavailable');
    asOf=bars.at(-1)?.date||null;
    if(asOf && (Date.parse(asOf)>now+DAY || now-Date.parse(asOf)>7*DAY))return result('stale');
    if(bars.length<35 || !window.NiulaiData?.calculate)return result('unavailable');
    const m=window.NiulaiData.calculate({...market,bars,partial:false});
    const distance=m.distance,slope=(m.ma.at(-1)/m.ma.at(-6)-1)*100;
    const dif=m.dif.at(-1),dea=m.dea.at(-1),rsi=m.rsi.at(-1),volume=m.volumeRatio;
    if(![distance,slope,dif,dea,rsi].every(Number.isFinite))return result('unavailable');
    if(!Number.isFinite(volume) || volume<=0 || bars.at(-1).volume===0)return result('inactive');
    evidence={distance,slope,dif,dea,rsi,volume,partialExcluded:!!market.partial};
    // Large discontinuities in unadjusted prices may be splits, not trading signals.
    if(market.basis==='未复权' && bars.slice(-35).some((b,i,a)=>i>0 && Math.abs(b.close/a[i-1].close-1)>=.35))return result('verify');
    const change=(bars.at(-1).close/bars.at(-2).close-1)*100;
    if(rsi>=70 || distance>=8 || volume>=3 && change>=5)return result('hot');
    if(rsi<=30 || distance<0 && (slope<=0 || dif<dea) || change<=-5 && volume>=1.3)return result('weak');
    if(distance>0 && slope>0 && dif>dea && dif>0 && rsi>=45 && volume>=1.1)return result('ready');
    if(distance>=0 && dif>dea)return result('improving');
    return result('observe');
  }
  const holdingChoices={
    under_1_month:['不到 1 个月','短期走势难预测，先看回落风险'],
    months_1_6:['1—6 个月','关注后续业绩与走势变化'],
    months_6_12:['6—12 个月','多看业绩，少被单日涨跌带走'],
    year_plus:['1 年以上','多看盈利和估值，少看短线热度'],
    unsure:['暂不确定','先想好持有多久，再考虑买入']
  };
  const budgetChoices={
    under_10k:['不足 1 万元','先核对起买金额和交易费用'],
    '10k_50k':['1 万—不足 5 万元','留好备用金，别集中在一只股票'],
    '50k_200k':['5 万—不足 20 万元','分散安排，留好备用金'],
    '200k_500k':['20 万—不足 50 万元','分散到不同资产，定期检查'],
    '500k_plus':['50 万元及以上','总预算不等于单只股票投入'],
    private:['暂不透露','不估算你的投入金额']
  };
  const anxietyChoices={small:'不到 5%',pct_5:'约 5%',pct_10:'约 10%',pct_20:'约 20%',over_20:'超过 20%',unsure:'暂不确定'};
  const drawdownChoices={none:'不接受回落',pct_5:'最多回落 5%',pct_10:'最多回落 10%',pct_20:'最多回落 20%',over_20:'可接受 20% 以上',unsure:'暂不确定'};
  function personalize(stock,market,base,profile) {
    // Stated preferences qualify the reference; they cannot improve the underlying market signal.
    if (!profile || ![1,2].includes(profile.version) || profile.currency!=='CNY' || !Number.isFinite(Date.parse(profile.updatedAt)) ||
      !Object.hasOwn(holdingChoices,profile.holdingPeriod) || !Object.hasOwn(budgetChoices,profile.investmentBudget)) return null;
    const legacy=profile.version===1,key=legacy?profile.drawdownTolerance:profile.volatilityAnxiety;
    const choices=legacy?drawdownChoices:anxietyChoices;
    if (!Object.hasOwn(choices,key)) return null;
    const usable=['ready','improving','observe','hot','weak'].includes(base.state);
    const bars=(market?.partial?market.bars?.slice(0,-1):market?.bars)?.slice(-20)||[];
    let swing=null;
    if (usable && bars.length===20 && bars.every((bar,index)=>Number.isFinite(bar?.close) && bar.close>0 && (!index || bar.date>bars[index-1].date))) {
      const closes=bars.map(bar=>bar.close);
      let peak=closes[0],drawdown=0;
      for (const close of closes) {peak=Math.max(peak,close);drawdown=Math.max(drawdown,(peak-close)/peak*100);}
      const value=legacy?drawdown:(Math.max(...closes)/Math.min(...closes)-1)*100;
      if (Number.isFinite(value)) swing={value,asOf:bars.at(-1).date,kind:legacy?'近 20 日最大回落':'近 20 日价格起伏'};
    }
    const threshold={none:0,pct_5:5,pct_10:10,pct_20:20}[key]??null;
    // Open-ended answers are not converted to an exact threshold.
    const exceeds=!!swing && (key==='small'?swing.value>=5:key==='none'?swing.value>0:threshold!==null && swing.value>=threshold);
    const volatilityText=!swing?'走势数据暂不足，暂不对照':key==='unsure'?'先确认自己的波动感受':exceeds?
      (legacy?'近期回落已触及你的承受范围':'这段起伏可能让你感到焦虑'):key==='small'?'小幅波动也值得提前想好':key==='over_20'?'较大起伏也要留意回落':
      (legacy?'历史回落低于所选范围':'这段起伏低于你的参考幅度');
    let headline=base.headline,state=base.state;
    if (usable && ['ready','improving','observe'].includes(base.state)) {
      if (exceeds || key==='small' || key==='none') {
        state='preference-caution';
        headline=exceeds?(legacy?'近期回落触及你的承受范围，先观察再考虑买入':'这段起伏可能让你焦虑，先观察再考虑买入'):'你更在意平稳，先观察再考虑买入';
      } else if (base.state==='ready') {
        if (key==='unsure') {state='preference-unknown';headline='先确认能接受的波动，再考虑是否买入';}
        else if (profile.holdingPeriod==='under_1_month') {state='horizon-caution';headline='你计划短期持有，先观察，别急着买入';}
        else if (profile.holdingPeriod==='year_plus' || profile.holdingPeriod==='months_6_12') {state='long-horizon';headline='按你的持有计划，先核对业绩和估值再考虑买入';}
        else if (profile.holdingPeriod==='unsure') {state='preference-unknown';headline='先想好持有多久，再考虑是否买入';}
      }
    }
    if (headline!==base.headline && stock?.market==='HK' && ['00700','80700'].includes(stock.code)) headline='腾讯值得关注，'+headline;
    return {state,headline,baseState:base.state,legacy,swing,threshold,exceeds,
      rows:[
        {key:'holding',label:'计划持有',value:holdingChoices[profile.holdingPeriod][0],text:holdingChoices[profile.holdingPeriod][1]},
        {key:'volatility',label:legacy?'回落承受':'开始焦虑的波动',value:choices[key],text:volatilityText},
        {key:'budget',label:'投资总预算 · 人民币',value:budgetChoices[profile.investmentBudget][0],text:budgetChoices[profile.investmentBudget][1]}
      ]};
  }
  window.NiulaiVerdict=Object.freeze({evaluate,personalize});
})();
