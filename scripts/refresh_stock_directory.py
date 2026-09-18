"""Build the static security directory from public exchange/disclosure files.

Run with Python 3 and openpyxl, pypinyin, opencc-python-reimplemented installed.
--offline reuses work/catalog-sources. Live refresh fails closed on missing files.
The files contain identifiers only; no prices, news or investment conclusions.
"""
import argparse
import concurrent.futures
import csv
import datetime as dt
import json
from pathlib import Path
import re
import unicodedata
import urllib.parse
import urllib.request

import openpyxl
from opencc import OpenCC
from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'work/catalog-sources'
DIST = ROOT / 'dist' if (ROOT / 'dist').exists() else ROOT
SIMPLE = OpenCC('t2s')
TODAY = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()


def sse_url(board):
    params = {'STOCK_TYPE': board, 'REG_PROVINCE': '', 'CSRC_CODE': '', 'STOCK_CODE': '',
              'sqlId': 'COMMON_SSE_CP_GPJCTPZ_GPLB_GP_L', 'COMPANY_STATUS': '2,4,5,7,8',
              'type': 'inParams', 'isPagination': 'true', 'pageHelp.cacheSize': 1,
              'pageHelp.beginPage': 1, 'pageHelp.pageSize': 10000, 'pageHelp.pageNo': 1,
              'pageHelp.endPage': 1}
    return 'https://query.sse.com.cn/sseQuery/commonQuery.do?' + urllib.parse.urlencode(params)


URLS = {
    'sse-main.json': sse_url(1), 'sse-star.json': sse_url(8),
    'szse.xlsx': 'https://www.szse.cn/api/report/ShowReport?SHOWTYPE=xlsx&CATALOGID=1110&TABKEY=tab1',
    'cninfo-szse.json': 'https://www.cninfo.com.cn/new/data/szse_stock.json',
    'hkex.xlsx': 'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx',
    'hkex-cn.xlsx': 'https://www.hkex.com.hk/chi/services/trading/securities/securitieslists/ListOfSecurities_c.xlsx',
    'nasdaqlisted.txt': 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',
    'otherlisted.txt': 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',
}


def download(item):
    filename, url = item
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.sse.com.cn/assortment/stock/list/share/' if filename.startswith('sse-') else url})
    with urllib.request.urlopen(req, timeout=35) as response:
        body = response.read()
    (CACHE / filename).write_bytes(body)


def rows_xlsx(filename):
    book = openpyxl.load_workbook(CACHE / filename, read_only=True, data_only=True)
    sheet = book.active
    sheet.reset_dimensions()  # SZSE reports an incorrect A1:A1 sheet dimension.
    rows = list(sheet.values)
    book.close()
    return rows


def clean(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(value or ''))).strip()


def build():
    collected = (CACHE / 'collected-at.txt').read_text().strip()
    dt.date.fromisoformat(collected)
    stocks = {'CN': {}, 'HK': {}, 'US': {}}

    def add(market, code, name, exchange, aliases=()):
        name = clean(name)
        if not code or not name:
            raise ValueError('Missing identifier or name')
        alternatives = list(dict.fromkeys(clean(a) for a in aliases if a and clean(a) != name))
        pinyin = ''.join(lazy_pinyin(name)).replace(' ', '') if re.search('[\u3400-\u9fff]', name) else ''
        initials = ''.join(lazy_pinyin(name, style=Style.FIRST_LETTER)).replace(' ', '') if pinyin else ''
        stocks[market][code] = [code, name, initials, pinyin, alternatives, exchange]

    cninfo = json.loads((CACHE / 'cninfo-szse.json').read_text())['stockList']
    cn_aliases = {r['code']: [r['zwjc'], r['pinyin']] for r in cninfo}
    for filename in ('sse-main.json', 'sse-star.json'):
        result = json.loads((CACHE / filename).read_text())
        rows = result['result']
        if len(rows) != result['pageHelp']['total']:
            raise ValueError('Incomplete SSE pagination')
        for row in rows:
            code = row['A_STOCK_CODE']
            # Company abbreviation survives temporary XD/XR/N prefixes in the security name.
            add('CN', code, row['SEC_NAME_CN'], '沪市', [row['COMPANY_ABBR'], row['FULL_NAME'], *cn_aliases.get(code, [])])
    for row in rows_xlsx('szse.xlsx')[1:]:
        code = clean(row[4])
        if not re.fullmatch(r'\d{6}', code):
            continue  # A-share column only; B-share-only companies have no A code.
        add('CN', code, clean(row[5]).replace(' ', ''), '深市', [row[1], *cn_aliases.get(code, [])])

    # CNINFO also retains delisted securities and pre-listing identifiers. A valid
    # Tencent quote record confirms the Beijing identifier has begun trading.
    # Absence is recorded as unverified, never silently promoted to a listed stock.
    quote_text = (CACHE / 'bse-quote-validation.txt').read_text()
    bj_quotes = {code: body.split('~') for code, body in re.findall(r'v_bj(\d+)="([^"]*)"', quote_text)}
    bj_unverified = []
    for row in cninfo:
        if not row['code'].startswith('92') or '退' in row['zwjc']:
            continue
        quote = bj_quotes.get(row['code'], [])
        if len(quote) < 31 or not quote[30]:
            bj_unverified.append({'code': row['code'], 'name': row['zwjc']})
            continue
        add('CN', row['code'], row['zwjc'], '北交所', [row['pinyin']])

    hk_en, hk_cn = rows_xlsx('hkex.xlsx'), rows_xlsx('hkex-cn.xlsx')
    if hk_en[1][0].split()[-1] != hk_cn[1][0].split()[-1]:
        raise ValueError('HKEX English/Chinese snapshots differ')
    hk_names = {str(row[0]): row[1] for row in hk_cn[3:] if row[0]}
    for row in hk_en[3:]:
        if row[2] not in ('Equity', 'Real Estate Investment Trusts'):
            continue
        code = str(row[0]).zfill(5)
        traditional = clean(hk_names.get(code, row[1]))
        name = SIMPLE.convert(traditional)
        add('HK', code, name, '港交所', [traditional, row[1], re.sub(r'-(?:W|SW|S|B|R|WR|SWR|SS|P)$', '', name)])

    excluded_us = []
    us_dates = []
    # Keep common/ordinary shares, ADRs and REIT/partnership equity. Remove
    # test instruments, ETF/ETN, debt, preferred, rights, warrants, SPAC units,
    # and closed-end funds. The raw name remains searchable.
    exclude = re.compile(r'\bwarrants?\b|\brights\b|\b(?:notes?|bonds?|debentures|preferred|preference|fund|ETF|ETN)\b|\bunits?\b.*(?:consist|compris|each unit)', re.I)
    exchanges = {'N': 'NYSE', 'A': 'NYSE American', 'P': 'NYSE Arca', 'Z': 'Cboe', 'V': 'IEX', 'Q': 'Nasdaq'}
    for filename in ('nasdaqlisted.txt', 'otherlisted.txt'):
        lines = (CACHE / filename).read_text().splitlines()
        stamp = re.search(r'File Creation Time:\s*(\d{8})', lines[-1])
        if not stamp:
            raise ValueError('Nasdaq creation date is missing')
        us_dates.append(dt.datetime.strptime(stamp.group(1), '%m%d%Y').date().isoformat())
        for row in csv.DictReader(lines, delimiter='|'):
            if row.get('Test Issue') != 'N' or row.get('ETF') != 'N':
                continue
            code = row.get('Symbol') or row.get('ACT Symbol')
            name = clean(row['Security Name'])
            if exclude.search(name) or re.search(r' - Units?$', name, re.I):
                excluded_us.append(code)
                continue
            # ACT uses BRK.B; the exchange CQS/Nasdaq variants remain aliases.
            aliases = [row.get('CQS Symbol'), row.get('Nasdaq Symbol'), name]
            display = re.split(r' - (?:Class |Common |Ordinary |American |ADS|Depositary |Shares)', name)[0]
            display = re.sub(r'\s+(?:Class [A-Z] )?(?:Common Stock|Common Shares|Ordinary Shares).*$', '', display, flags=re.I)
            add('US', code, display, exchanges.get(row.get('Exchange'), 'Nasdaq'), aliases)

    minimums = {'CN': 5000, 'HK': 2500, 'US': 4500}
    for market, minimum in minimums.items():
        if len(stocks[market]) < minimum:
            raise ValueError(f'{market} directory unexpectedly small: {len(stocks[market])}')
    if len(stocks['CN']) != len(set(stocks['CN'])):
        raise ValueError('Duplicate CN codes')
    metadata = {
        'collectedAt': collected,
        'dates': {'CN': collected, 'HK': dt.datetime.strptime(hk_en[1][0].split()[-1], '%d/%m/%Y').date().isoformat(), 'US': min(us_dates)},
        'counts': {m: len(rows) for m, rows in stocks.items()},
        'beijingUnverified': bj_unverified,
        'scope': '沪深北 A 股、港交所股本证券与 REIT、美股交易所普通股/ADR/REIT 等权益证券；不含全球其他市场、OTC、ETF、优先股、债券、权证及退市证券。目录为快照，新上市或更名需刷新。',
        'sources': [
            {'name': '上海证券交易所', 'url': 'https://www.sse.com.cn/assortment/stock/list/share/'},
            {'name': '深圳证券交易所', 'url': 'https://www.szse.cn/market/stock/company/'},
            {'name': '巨潮资讯（北交所代码）', 'url': 'https://www.cninfo.com.cn/'},
            {'name': '腾讯行情（北交所代码核验）', 'url': 'https://gu.qq.com/'},
            {'name': '香港交易所', 'url': 'https://www.hkex.com.hk/Services/Trading/Securities/Securities-Lists?sc_lang=zh-HK'},
            {'name': 'Nasdaq Trader（含其他美股交易所）', 'url': 'https://www.nasdaqtrader.com/Trader.aspx?id=SymbolDirDefs'},
        ],
        'usExcludedCount': len(excluded_us),
    }
    # Validate everything before replacing the previous deployable snapshot.
    generated_scripts = []
    for market, rows in stocks.items():
        ordered = sorted(rows.values(), key=lambda row: row[0])
        # Small, independently reviewable files also cap each download/parse unit.
        chunks = [ordered[i:i + 2000] for i in range(0, len(ordered), 2000)]
        for part, chunk in enumerate(chunks, 1):
            suffix = '' if part == 1 else f'-{part}'
            filename = f'stock-directory-{market.lower()}{suffix}.js'
            generated_scripts.append(filename)
            body = json.dumps(chunk, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
            header = json.dumps({'date': metadata['dates'][market], 'total': len(ordered), 'parts': len(chunks), 'chunks': {}}, separators=(',', ':'))
            (DIST / filename).write_text(
                '/* Public security identifiers; generated by scripts/refresh_stock_directory.py. */\n'
                '(() => {\nwindow.NiulaiDirectory = window.NiulaiDirectory || {};\n'
                f'const directory = window.NiulaiDirectory.{market} = window.NiulaiDirectory.{market} || {header};\n'
                f'directory.chunks[{part}] = {body};\n'
                'directory.rows = Object.values(directory.chunks).flat();\n})();\n')
    page = DIST / 'niulai.html'
    if page.exists():
        html = page.read_text()
        tags = ''.join(f'  <script src="{name}?v=3" defer></script>\n' for name in generated_scripts)
        updated, replacements = re.subn(r'(?:  <script src="stock-directory-[^\"]+" defer></script>\n)+', lambda _: tags, html)
        if replacements != 1:
            raise ValueError('Cannot locate the directory script block in niulai.html')
        page.write_text(updated)
    (DIST / 'stock-directory-meta.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'counts': metadata['counts'], 'dates': metadata['dates'], 'beijingUnverified': bj_unverified}, ensure_ascii=False))


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--offline', action='store_true')
    offline = args.parse_args().offline
    CACHE.mkdir(parents=True, exist_ok=True)
    if not offline:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(download, URLS.items()))
        cninfo = json.loads((CACHE / 'cninfo-szse.json').read_text())['stockList']
        codes = [r['code'] for r in cninfo if r['code'].startswith('92') and '退' not in r['zwjc']]
        parts = []
        for start in range(0, len(codes), 90):
            url = 'https://qt.gtimg.cn/q=' + ','.join('bj' + code for code in codes[start:start + 90])
            with urllib.request.urlopen(url, timeout=30) as response:
                parts.append(response.read().decode('gb18030'))
        (CACHE / 'bse-quote-validation.txt').write_text('\n'.join(parts))
        (CACHE / 'collected-at.txt').write_text(TODAY)
    elif not (CACHE / 'collected-at.txt').exists():
        raise ValueError('Cache collection date missing; run a live refresh first')
    build()


if __name__ == '__main__':
    main()
