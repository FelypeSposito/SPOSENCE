# Regras do Projeto Sposence

## Páginas HTML e Favicon
Sempre que for criar uma nova página HTML no projeto, é **obrigatório** incluir a tag de favicon na `<head>`:

```html
<link rel="shortcut icon" href="ID. VISUAL SPOSENCE/Imagens/LOGOS/Logo Secundária/Logo Secundária- SPOSENCE-15.png" type="image/x-icon" />
```

## Otimização de Imagens de Destaque
Para a página inicial (`index.html`), garanta sempre a tag `<link rel="preload" as="image" href="img/CremeCereja.jpg" fetchpriority="high" />` no `<head>` e as propriedades `fetchpriority="high" loading="eager" decoding="async"` na tag `<img>` principal do Creme de Cereja.
