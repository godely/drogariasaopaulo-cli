"""Refresh the optional public search centers used for branches with incomplete addresses."""
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ENDPOINT = 'https://geo.infrasa.gov.br/server/rest/services/Hosted/Sede_Municipal/FeatureServer/0/query'
DESTINATION = Path(__file__).resolve().parent.parent / 'data' / 'municipal-seats.tsv'


def query(**params):
    url = ENDPOINT + '?' + urlencode({'where': '1=1', 'f': 'json', **params})
    with urlopen(url, timeout=60) as response:
        return json.load(response)


def refresh():
    count = query(returnCountOnly='true')['count']
    rows = {}
    for offset in range(0, count, 1000):
        data = query(outFields='objectid,sede_municipal,uf', returnGeometry='true', outSR=4326,
                     orderByFields='objectid', resultOffset=offset, resultRecordCount=1000)
        for feature in data['features']:
            fields, geometry = feature['attributes'], feature['geometry']
            name, state = fields['sede_municipal'].strip(), fields['uf'].strip().upper()
            x, y = geometry['x'], geometry['y']
            if (not name or any(c in name for c in '\t\r\n') or len(state) != 2 or
                    not math.isfinite(x) or not math.isfinite(y) or abs(x) > 180 or abs(y) > 90):
                raise ValueError('Invalid municipal seat in upstream data')
            rows[fields['objectid']] = f'{name}\t{state}\t{x:.2f}\t{y:.2f}\n'
    if not count or len(rows) != count:
        raise ValueError('Incomplete upstream dataset')
    DESTINATION.write_text(''.join(sorted(rows.values())), encoding='utf-8')
    print(f'{count} public municipal search centers')


if __name__ == '__main__':
    refresh()
