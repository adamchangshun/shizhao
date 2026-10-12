// poster layout. heroLayout picks one of three first-screen compositions.
export const styles = `
.poster .p-hero{position:relative;overflow:hidden}
.poster .p-hero-img{width:100%;aspect-ratio:4/5;object-fit:cover;background:var(--surface)}
.poster .p-hero-text{padding:20px 20px 8px}
.poster .p-shop{font-size:15px;letter-spacing:.12em;opacity:.8;margin-bottom:6px}
.poster .p-headline{font-size:clamp(32px,10vw,46px);letter-spacing:.02em}
.poster .p-subhead{margin-top:10px;font-size:17px;opacity:.85}
.poster.hero-full-bleed .p-hero-text{position:absolute;left:0;right:0;bottom:0;padding:72px 20px 22px;color:#ffffff;
background:linear-gradient(to top,rgba(0,0,0,.72),rgba(0,0,0,0))}
.poster.hero-full-bleed.no-img .p-hero-text,.poster.no-img .p-hero-text{position:static;color:var(--on-primary);background:var(--primary);padding:56px 20px 32px}
.poster.hero-split .p-hero{display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:0;background:var(--surface)}
.poster.hero-split .p-hero-img{aspect-ratio:3/5;order:2}
.poster.hero-split .p-hero-text{padding:24px 14px}
.poster.hero-split .p-headline{font-size:clamp(26px,8vw,36px)}
.poster.hero-split.no-img .p-hero{display:block}
.poster.hero-stacked .p-hero{padding:16px 16px 0}
.poster.hero-stacked .p-hero-img{aspect-ratio:1/1;border-radius:20px}
.poster.hero-stacked .p-hero-text{padding:20px 4px 4px}
.poster .p-feature{margin:20px 16px 0;padding:20px;border-radius:18px;background:var(--surface);
box-shadow:0 10px 30px -18px color-mix(in srgb,var(--text) 45%,transparent)}
.poster .p-feature-name{font-size:24px}
.poster .p-feature-price{display:inline-block;margin-top:6px;font-size:30px;font-weight:700;color:var(--primary)}
.poster .p-spec{margin-top:4px;font-size:15px;opacity:.75}
.poster .p-desc{margin-top:10px}
.poster .p-blurb{margin-top:12px;padding-left:12px;border-left:3px solid var(--accent);font-size:15px}
.poster .p-claims{margin:20px 16px 0}
.poster .p-more{margin:32px 16px 0}
.poster .p-more-title{font-size:20px;margin-bottom:12px}
.poster .p-more-list{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.poster .p-more-item{display:flex;gap:12px;padding:12px;border-radius:14px;background:var(--surface)}
.poster .p-more-img{flex:0 0 88px;width:88px;height:88px;object-fit:cover;border-radius:10px}
.poster .p-more-body{min-width:0;flex:1}
.poster .p-more-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.poster .p-more-name{font-size:17px}
.poster .p-more-price{font-weight:700;color:var(--primary)}
`
