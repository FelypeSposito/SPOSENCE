# Regras do Projeto Sposence

## Páginas HTML e Favicon
Sempre que for criar uma nova página HTML no projeto, é **obrigatório** incluir a tag de favicon na `<head>`:

```html
<link rel="shortcut icon" href="ID. VISUAL SPOSENCE/Imagens/LOGOS/Logo Secundária/Logo Secundária- SPOSENCE-15.png" type="image/x-icon" />
```

## Otimização de Imagens de Destaque
Para a página inicial (`index.html`), o hero usa as versões otimizadas em `img/hero/` (AVIF/WebP em 640–1600w e JPG de fallback) dentro de um `<picture>`. Garanta sempre o `<link rel="preload" as="image" type="image/avif" imagesrcset="..." imagesizes="..." fetchpriority="high" />` no `<head>`, com o mesmo `srcset`/`sizes` do `<source>` AVIF, e as propriedades `fetchpriority="high" loading="eager" decoding="async"` na tag `<img>` principal do Creme de Cereja.
