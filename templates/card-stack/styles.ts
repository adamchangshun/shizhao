// card-stack layout: a colored header band, then full-width cards with overlapping index numbers.
export const styles = `
.card-stack .c-header{padding:36px 20px 28px;background:var(--primary);color:var(--on-primary);border-radius:0 0 28px 28px}
.card-stack .c-shop{font-size:18px;opacity:.9}
.card-stack .c-headline{margin-top:10px;font-size:clamp(28px,8.5vw,40px)}
.card-stack .c-subhead{margin-top:8px;font-size:16px;opacity:.9}
.card-stack .c-header .claims{margin-top:16px}
.card-stack .c-header .claim{border-color:currentColor}
.card-stack .c-list{list-style:none;margin:20px 0 0;padding:0 16px;display:grid;gap:18px}
.card-stack .c-card{position:relative;overflow:hidden;border-radius:20px;background:var(--surface);
box-shadow:0 1px 0 color-mix(in srgb,var(--text) 8%,transparent),0 14px 28px -20px color-mix(in srgb,var(--text) 60%,transparent)}
.card-stack .c-img{width:100%;aspect-ratio:3/2;object-fit:cover;background:var(--bg)}
.card-stack .c-body{position:relative;padding:18px 18px 20px}
.card-stack .c-index{position:absolute;top:-22px;right:16px;min-width:44px;height:44px;padding:0 8px;display:flex;align-items:center;justify-content:center;
border-radius:999px;background:var(--accent);color:var(--on-accent);font-size:15px;font-weight:700}
.card-stack .c-card-plain .c-index{position:static;display:inline-flex;margin-bottom:10px}
.card-stack .c-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px}
.card-stack .c-name{font-size:21px;min-width:0}
.card-stack .c-price{font-size:22px;font-weight:700;color:var(--primary)}
.card-stack .c-spec{margin-top:2px;font-size:15px;opacity:.7}
.card-stack .c-desc{margin-top:8px}
.card-stack .c-blurb{margin-top:10px;font-size:15px;color:color-mix(in srgb,var(--text) 80%,var(--primary))}
`
