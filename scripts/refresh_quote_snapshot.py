#!/usr/bin/env python3
"""Refresh public Tencent quote snapshots for the existing stock directory.

Manual refresh only. Uses bounded batches and atomically publishes validated
shards after collection; raw scripts are parsed as text and never executed.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent.parent
SITE=ROOT/'dist' if (ROOT/'dist').is_dir() else ROOT
SHARDS=16

def bucket(key):
    h=0
    for c in key:h=(h*31+ord(c)) & 0xffffffff
    return h % SHARDS

def numeric(value):
    try:
        n=float(value)
        return n if math.isfinite(n) and str(value).strip() else None
    except (ValueError,TypeError):return None

def quote_symbol(stock):
    if stock['market']=='CN':return {'沪市':'sh','深市':'sz','北交所':'bj'}[stock['exchange']]+stock['code']
    return stock['market'].lower()+stock['code']

def normalize(fields,stock):
    if len(fields)<38:return None
    code=stock['code'];market=stock['market'];returned=fields[2].upper()
    if market=='US':
        if returned!=code and not re.fullmatch(re.escape(code)+r'\.(?:OQ|N|AM|P|Z|OB|PK)',returned):return None
    elif returned!=code:return None
    price=numeric(fields[3]);volume=numeric(fields[6]);amount=numeric(fields[37])
    if price is None or price<=0:return None
    stamp=fields[30].replace('/','-')
    if re.fullmatch(r'\d{14}',stamp):stamp=datetime.strptime(stamp,'%Y%m%d%H%M%S').strftime('%Y-%m-%d %H:%M:%S')
    try:datetime.strptime(stamp,'%Y-%m-%d %H:%M:%S')
    except ValueError:return None
    if volume is not None:volume=round(volume*(100 if market=='CN' else 1)) if volume>=0 else None
    if amount is not None:amount=amount*(10000 if market=='CN' else 1) if amount>=0 else None
    if market=='CN':
        raw=fields[35].split('/')
        if len(raw)==3 and numeric(raw[2]) is not None:amount=numeric(raw[2])
    currency=next((x for x in fields[30:] if x in ['CNY','HKD','USD']),None)
    currency=currency or ('CNY' if market=='CN' else 'USD' if market=='US' else None)
    return {'p':price,'c':numeric(fields[32]),'v':volume,'a':amount,'t':stamp,'u':currency,
            'd':min(6,max(2,len(fields[3].split('.')[1]) if '.' in fields[3] else 0)),
            's':'us'+returned if market=='US' else quote_symbol(stock)}

def stock_list():
    # Directory files assign a chunks[n] array. Parse only that JSON array.
    stocks=[]
    for p in sorted(SITE.glob('stock-directory-*.js')):
        text=p.read_text()
        match=re.search(r'chunks\[(\d+)\]\s*=\s*(\[.*?\]);',text,re.S)
        market=re.search(r'NiulaiDirectory\.([A-Z]+)',text)
        if not match or not market:raise ValueError('Unrecognized directory format: '+str(p))
        for code,name,initials,pinyin,aliases,exchange in json.loads(match.group(2)):
            stocks.append({'market':market.group(1),'code':code,'name':name,'exchange':exchange})
    return stocks

def fetch(batch):
    codes=','.join(quote_symbol(s) for s in batch)
    expected={quote_symbol(s):s for s in batch}
    records={}
    last_error=''
    for host in ['qt.gtimg.cn','sqt.gtimg.cn']:
        try:
            url='https://'+host+'/q='+quote(codes,safe=',.-')
            with urlopen(Request(url,headers={'User-Agent':'Niulai-Public-Quote-Refresh/1.0'}),timeout=15) as response:
                text=response.read().decode('gb18030')
            for symbol,raw in re.findall(r'v_([A-Za-z0-9_.$-]+)="([^"\r\n]*)";',text):
                stock=expected.get(symbol)
                if stock:
                    parsed=normalize(raw.split('~'),stock)
                    if parsed:records[stock['market']+':'+stock['code']]=parsed
            return records,[]
        except Exception as exc:last_error=type(exc).__name__
    return {},[{'symbols':list(expected),'error':last_error}]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--stocks',type=Path);args=parser.parse_args()
    stocks=json.loads(args.stocks.read_text()) if args.stocks else stock_list()
    if len(stocks)<10000:raise ValueError('Refusing an incomplete directory')
    batches=[stocks[i:i+150] for i in range(0,len(stocks),150)]
    records={};errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for index,(rows,failures) in enumerate(pool.map(fetch,batches),1):
            records.update(rows);errors.extend(failures)
            if index%20==0:print(f'Checked {index}/{len(batches)} batches; {len(records)} quotes.',flush=True)
    if errors or len(records)<len(stocks)*.85:raise RuntimeError(f'Incomplete fetch: {len(records)}/{len(stocks)}, failed batches {len(errors)}; existing snapshots unchanged')
    generated=datetime.now(timezone.utc).isoformat(timespec='seconds')
    missing=[{'id':s['market']+':'+s['code'],'name':s['name']} for s in stocks if s['market']+':'+s['code'] not in records]
    output=SITE/'data'/'quotes';output.mkdir(parents=True,exist_ok=True)
    shards=[{} for _ in range(SHARDS)]
    for key,value in records.items():shards[bucket(key)][key]=value
    for i,rows in enumerate(shards):
        target=output/f'{i}.json';temporary=target.with_suffix('.tmp')
        temporary.write_text(json.dumps({'version':1,'generatedAt':generated,'records':rows},ensure_ascii=False,separators=(',',':'))+'\n');temporary.replace(target)
    mapping={}
    for s in stocks:
        key=s['market']+':'+s['code'];row=records.get(key)
        if s['market']=='US' and row:
            expected='us'+s['code']+'.'+{'Nasdaq':'OQ','NYSE':'N','NYSE American':'AM'}.get(s['exchange'],'UNKNOWN')
            if row['s']!=expected:mapping[key]=row['s']
    (SITE/'stock-market-map.js').write_text('/* Verified Tencent quote identifiers; generated from public quote responses. */\nwindow.NiulaiMarketMap=Object.freeze('+json.dumps(mapping,ensure_ascii=False,separators=(',',':'))+');\n')
    metadata={'version':1,'generatedAt':generated,'directoryCount':len(stocks),'available':len(records),'withVolume':sum(r['v'] is not None for r in records.values()),'withAmount':sum(r['a'] is not None for r in records.values()),'byMarket':{m:sum(k.startswith(m+':') for k in records) for m in ['CN','HK','US']},'missing':missing,'shards':SHARDS,'source':'https://qt.gtimg.cn/','refresh':'Manual; no scheduled task configured'}
    (output/'meta.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in metadata.items() if k!='missing'},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
