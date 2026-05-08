# Cómo añadir un post nuevo (bilingüe)

Cada post existe en dos idiomas. Si publicas uno solo, el toggle queda inerte. Sigue esta lista cada vez.

## Checklist (ES + EN)

1. **Decidir slugs**
   - ES: `mi-titulo-en-espanol`
   - EN: `my-title-in-english`
   - Sin acentos, sin mayúsculas, guiones simples.

2. **Crear archivo ES** en `/blog/<slug-es>.html`
   - Copiar la estructura de cualquier post existente como template.
   - Dentro de `<head>` añadir:
     ```html
     <link rel="alternate" hreflang="es" href="https://jeisonxm.github.io/blog/<slug-es>.html">
     <link rel="alternate" hreflang="en" href="https://jeisonxm.github.io/en/blog/<slug-en>.html">
     <link rel="alternate" hreflang="x-default" href="https://jeisonxm.github.io/blog/<slug-es>.html">
     <script src="/src/lang.js"></script>
     ```
   - En el header del post, dentro del `<div class="blog-header-right">`:
     ```html
     <a href="/en/blog/<slug-en>.html" class="lang-toggle" aria-label="Switch to English">
       <span class="lang-active">ES</span>
       <span class="lang-sep">|</span>
       <span>EN</span>
     </a>
     ```

3. **Crear archivo EN** en `/en/blog/<slug-en>.html`
   - Copiar la estructura de cualquier post EN existente.
   - Cargar `obsidiana.css` además de `blog.css`:
     ```html
     <link rel="stylesheet" href="/blog/blog.css">
     <link rel="stylesheet" href="/src/styles/obsidiana.css">
     ```
   - Hreflang invertidos (ES y EN apuntan a sus URLs absolutas, x-default al ES).
   - Toggle apunta a `/blog/<slug-es>.html`, con `lang-active` sobre `EN`.
   - Back link va a `/en/blog/`.
   - Imágenes en rutas absolutas (`/blog/images/...`) para que resuelvan desde `/en/blog/`.

4. **Card en `/blog/index.html`**
   - Añadir un `<article class="blog-entry">` arriba (orden cronológico inverso).
   - Tag, título, deck (1-2 líneas), fecha + duración estimada de lectura.

5. **Card en `/en/blog/index.html`**
   - Mismo card en inglés, mismo orden cronológico.

6. **Actualizar `/src/i18n/slug-map.json`**
   - Añadir `"<slug-es>": "<slug-en>"` en orden alfabético.

7. **Actualizar `/sitemap.xml`**
   - Dos `<url>` nuevos (uno ES, uno EN), cada uno con sus tres `<xhtml:link rel="alternate">` para es/en/x-default.

## Voz de Jeison en inglés

Pilots aprobados como referencia (mantener este tono):
- `/en/blog/playing-clever-is-not-control.html` — filosofía/largo
- `/en/blog/writing-without-seeing.html` — reflexivo/medio
- `/en/blog/three-banks-one-report.html` — técnico/innovación

Reglas:
- Primera persona declarativa. Frases cortas. Sin "passionate about".
- Italics para conceptos en español sin equivalente directo (`*juega vivo*`), con glosa la primera vez y luego repetir natural.
- Citas (Aurelio, Epicteto, etc.) en traducción canónica al inglés con cita del libro/sección.
- Tono contemplativo, no corporativo.

## Verificación rápida

Antes de hacer commit:

```bash
# Ambos archivos existen
ls blog/<slug-es>.html en/blog/<slug-en>.html

# Round-trip de hreflang correcto
grep -o 'hreflang="en" href="[^"]*"' blog/<slug-es>.html
grep -o 'hreflang="es" href="[^"]*"' en/blog/<slug-en>.html

# Slug map y sitemap sincronizados
grep "<slug-es>" src/i18n/slug-map.json sitemap.xml
```

## Si solo tienes la versión ES lista

Publica solo después de tener ambas versiones. Un toggle a una página inexistente rompe la confianza del visitante. Si hay urgencia, sube primero la ES sin los hreflang ni el toggle (header con solo el back link), y completa la EN antes de la próxima sesión.
