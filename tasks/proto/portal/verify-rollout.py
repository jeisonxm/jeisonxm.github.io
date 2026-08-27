#!/usr/bin/env python3
"""
Verificador del despliegue del portal. SOLO LECTURA sobre el repo.

  python3 verify-rollout.py /home/archy/jeisonxm.github.io

Sale con codigo 0 si TODO pasa, 1 si algo falla. Cada linea dice
que se comprobo y con que numero, para que otra sesion no tenga que
razonar: corre esto y mira el codigo de salida.
"""
import sys, os, re, glob

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
INDEXES = ['index.html', 'en/index.html', 'blog/index.html', 'en/blog/index.html']
ok = True
def check(label, cond, detail=''):
    global ok
    if not cond: ok = False
    print(f"[{'PASS' if cond else 'FALLA'}] {label}{('  -> ' + detail) if detail else ''}")

def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f: return f.read()

# tasks/ NO es el sitio: ahi viven los prototipos del portal, que por definicion
# contienen portal.css y el boton. Incluirlos daba dos rojos falsos.
htmls = sorted(p for p in glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)
               if '/.git/' not in p and '/tasks/' not in p)
rel = [os.path.relpath(p, ROOT) for p in htmls]
posts = [r for r in rel if r.startswith(('blog/', 'en/blog/')) and not r.endswith('index.html')]

print(f"--- {len(rel)} html, {len(posts)} posts, {len(INDEXES)} indices ---")

# 1. portal.css SOLO en los 4 indices
linked = [r for r in rel if 'portal.css' in read(r)]
check('portal.css enlazado en exactamente los 4 indices',
      sorted(linked) == sorted(INDEXES), f'encontrado en {sorted(linked)}')

# 2. ningun post carga portal.css
bad = [p for p in posts if 'portal.css' in read(p)]
check('ningun post carga portal.css', not bad, f'{len(bad)} posts lo cargan: {bad[:3]}')

# 3. el opt-in vive SOLO en portal.css
for css in ['blog/blog.css', 'src/styles/style.css']:
    if os.path.exists(os.path.join(ROOT, css)):
        n = len(re.findall(r'@view-transition', read(css)))
        check(f'{css} ya no declara @view-transition', n == 0, f'{n} apariciones')
pc = 'src/styles/portal.css'
if os.path.exists(os.path.join(ROOT, pc)):
    body = read(pc)
    check('portal.css declara navigation:auto',
          re.search(r'@view-transition\s*\{[^}]*navigation:\s*auto', body) is not None)
    check('portal.css apaga la transicion con reduced-motion',
          re.search(r'prefers-reduced-motion:\s*reduce', body) is not None
          and re.search(r'navigation:\s*none', body) is not None)
    check('portal.css usa clip-path como base (no solo mask)',
          'clip-path: circle(' in body)
    check('portal.css registra --ap con @property',
          re.search(r'@property\s+--ap\b', body) is not None)
else:
    check('existe src/styles/portal.css', False, 'no existe')

# 4. el boton-portal SOLO en los 2 indices del blog
withbtn = [r for r in rel if 'portal-back' in read(r)]
check('boton-portal en exactamente los 2 indices del blog',
      sorted(withbtn) == ['blog/index.html', 'en/blog/index.html'],
      f'encontrado en {sorted(withbtn)}')

# 5. accesibilidad del boton en los 2 indices
for f in ['blog/index.html', 'en/blog/index.html']:
    if not os.path.exists(os.path.join(ROOT, f)): continue
    s = read(f)
    m = re.search(r'<a[^>]*class="[^"]*portal-back[^"]*"[^>]*>(.*?)</a>', s, re.S)
    if not m:
        check(f'{f}: boton-portal presente', False); continue
    inner = m.group(1)
    txt = re.sub(r'<[^>]+>', '', inner).strip()
    check(f'{f}: el boton tiene texto real (no solo icono)', len(txt) >= 4, repr(txt))
    check(f'{f}: el boton es un <a href> real',
          re.search(r'<a[^>]*href="[^"]+"[^>]*class="[^"]*portal-back', s) is not None
          or re.search(r'class="[^"]*portal-back[^"]*"[^>]*href="[^"]+"', s) is not None)

# 6. cero emojis en TODO el html (restriccion del proyecto)
EMOJI = re.compile('[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F0FF⬀-⯿️]')
withemoji = [r for r in rel if EMOJI.search(read(r))]
check('cero emojis en el html', not withemoji, f'{withemoji[:5]}')

# 7. cada post conserva su enlace de vuelta discreto
nolink = [p for p in posts if 'blog-header-back' not in read(p)]
check('todos los posts conservan el enlace de vuelta discreto',
      not nolink, f'{len(nolink)} sin enlace: {nolink[:3]}')

# 8. ningun post trae efectos de portal
leak = [p for p in posts if re.search(r'view-transition|portal-back|portal\.css', read(p))]
check('ningun post trae rastro del portal', not leak, f'{leak[:3]}')

print('\n=> ' + ('TODO PASA' if ok else 'HAY FALLOS'))
sys.exit(0 if ok else 1)
