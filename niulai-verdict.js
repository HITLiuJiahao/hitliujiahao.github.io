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
  window.NiulaiVerdict=Object.freeze({evaluate});
})();
