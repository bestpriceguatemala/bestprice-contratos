"""Lee un PDF de Excel/Quartz y saca cada texto con su recorte (la celda), su posición y su fuente."""
import re, sys, zlib, json

def cargar(path):
    data = open(path, 'rb').read()
    objs = {}
    for m in re.finditer(rb'(\d+) 0 obj(.*?)endobj', data, re.S):
        objs[int(m.group(1))] = m.group(2)
    return objs

def stream(o):
    m = re.search(rb'stream\r?\n(.*?)\r?\nendstream', o, re.S)
    if not m: return None
    raw = m.group(1)
    head = o.split(b'stream')[0]
    return zlib.decompress(raw) if b'FlateDecode' in head else raw

def cmap(objs, num):
    s = stream(objs[num]).decode('latin1')
    mp = {}
    for blk in re.findall(r'beginbfchar(.*?)endbfchar', s, re.S):
        for a, b in re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk):
            mp[int(a, 16)] = bytes.fromhex(b).decode('utf-16-be')
    for blk in re.findall(r'beginbfrange(.*?)endbfrange', s, re.S):
        for a, b, c in re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk):
            a, b = int(a, 16), int(b, 16); base = int(c, 16)
            for i in range(a, b + 1): mp[i] = chr(base + i - a)
    return mp

def fuentes(objs, res_obj):
    r = objs[res_obj].decode('latin1')
    out = {}
    fm = re.search(r'/Font\s*<<(.*?)>>', r, re.S)
    for name, num in re.findall(r'/(\w+)\s+(\d+)\s+0\s+R', fm.group(1)):
        fo = objs[int(num)].decode('latin1')
        base = re.search(r'/BaseFont\s*/(\S+)', fo).group(1)
        tu = re.search(r'/ToUnicode\s+(\d+)', fo)
        out[name] = {'base': base.split('+')[-1], 'cmap': cmap(objs, int(tu.group(1))) if tu else None}
    return out

def decodificar(bs, fuente):
    if fuente['cmap']:
        return ''.join(fuente['cmap'].get(b, '?') for b in bs)
    return bs.decode('mac_roman')

def paginas(objs):
    pages = [(n, o.decode('latin1')) for n, o in sorted(objs.items()) if b'/Type /Page ' in o]
    res = []
    for n, o in pages:
        c = int(re.search(r'/Contents\s+(\d+)', o).group(1))
        r = int(re.search(r'/Resources\s+(\d+)', o).group(1))
        res.append((n, c, r))
    return res

def unescape(s):
    out = bytearray(); i = 0
    while i < len(s):
        ch = s[i]
        if ch == '\\':
            i += 1; n = s[i]
            if n in 'nrtbf': out.append({'n':10,'r':13,'t':9,'b':8,'f':12}[n])
            elif n.isdigit():
                j = i
                while j < len(s) and j < i + 3 and s[j].isdigit(): j += 1
                out.append(int(s[i:j], 8)); i = j - 1
            else: out.append(ord(n))
        else: out.append(ord(ch))
        i += 1
    return bytes(out)

def leer_pagina(objs, cont, res):
    fs = fuentes(objs, res)
    s = stream(objs[cont]).decode('latin1')
    toks = re.findall(r'\((?:\\.|[^\\)])*\)|\[|\]|<<|>>|/\w+|[-+]?\d*\.?\d+|[A-Za-z\*\'"]+', s)
    stack = []; clip = None; mat = [1, 0, 0, 1, 0, 0]; color = '0 0 0'
    st = []  # saved states
    nums = []; out = []
    tm = None; font = None; size = None; tc = 0.0; texto = ''; arr = []
    inarr = False
    i = 0
    while i < len(toks):
        t = toks[i]
        if t == '[': inarr = True; arr = []
        elif t == ']': inarr = False
        elif inarr:
            if t.startswith('('): arr.append(unescape(t[1:-1].replace('\\)', ')')) if False else unescape(t[1:-1]))
        elif re.fullmatch(r'[-+]?\d*\.?\d+', t): nums.append(float(t))
        elif t.startswith('/'): nums.append(t)
        elif t.startswith('('): nums.append(unescape(t[1:-1]))
        else:
            op = t
            if op == 'q': st.append((clip, list(mat), color))
            elif op == 'Q':
                if st: clip, mat, color = st.pop()
            elif op == 're':
                x, y, w, h = nums[-4:]; rect = (x, y, w, h)
            elif op == 'W': clip = rect
            elif op == 'cm': mat = nums[-6:]
            elif op == 'sc': color = ' '.join(str(int(n)) if n == int(n) else str(n) for n in nums[-3:])
            elif op == 'Tf': font = nums[-2]; size = nums[-1]
            elif op == 'Tc': tc = nums[-1]
            elif op == 'Tm': tm = nums[-6:]
            elif op in ('Tj', 'TJ'):
                if op == 'Tj': bs = nums[-1]
                else: bs = b''.join(arr)
                f = fs[font[1:]]
                out.append({'texto': decodificar(bs, f), 'fuente': f['base'], 'pt': tm[0] * mat[0], 'tmx': tm[4], 'tmy': tm[5],
                            'mat': list(mat), 'clip': clip, 'color': color, 'tc': tc})
            if op not in ('re',): 
                if op not in ('Tj','TJ'): pass
            nums = []
            if op in ('ET', 'BT'): tc = 0.0
        i += 1
    return out

if __name__ == '__main__':
    objs = cargar(sys.argv[1])
    todo = []
    for n, (pg, c, r) in enumerate(paginas(objs)):
        for t in leer_pagina(objs, c, r):
            t['pagina'] = n + 1
            todo.append(t)
    json.dump(todo, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
    for t in todo:
        m = t['mat']; cl = t['clip']
        px = m[0] * t['tmx'] + m[4]; py = m[3] * t['tmy'] + m[5]
        print(f"p{t['pagina']} {t['texto']!r:34} {t['fuente']:12} {t['pt']*1:5.2f}pt color={t['color']:7} base=({px:7.2f},{py:7.2f}) clip={tuple(round(v,2) for v in cl) if cl else None}")
