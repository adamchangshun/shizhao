// menu-board layout: framed board, dotted leaders between name and price, photo strip below.
export const styles = `
.menu-board{padding:16px 16px 0}
.menu-board .m-hero{margin:0 0 -28px;padding:0 12px}
.menu-board .m-hero-img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:14px;border:4px solid var(--surface);transform:rotate(-1.2deg)}
.menu-board .m-board{position:relative;padding:40px 18px 22px;border-radius:18px;background:var(--surface);
border:2px solid color-mix(in srgb,var(--primary) 55%,transparent);box-shadow:inset 0 0 0 6px var(--surface),inset 0 0 0 7px color-mix(in srgb,var(--primary) 35%,transparent)}
.menu-board .m-header{text-align:center}
.menu-board .m-shop{font-size:clamp(26px,8vw,36px);color:var(--primary);letter-spacing:.06em}
.menu-board .m-headline{margin-top:6px;font-size:20px}
.menu-board .m-subhead{margin-top:4px;font-size:15px;opacity:.8}
.menu-board .deco-rule{margin:16px 0 0}
.menu-board .m-list{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:14px}
.menu-board .m-line{display:flex;align-items:baseline;gap:8px}
.menu-board .m-name{flex:0 1 auto;min-width:0;font-size:18px}
.menu-board .m-leader{flex:1 1 24px;min-width:24px;border-bottom:2px dotted color-mix(in srgb,var(--text) 45%,transparent);transform:translateY(-4px)}
.menu-board .m-price{flex:0 0 auto;font-size:18px;font-weight:700;color:var(--primary)}
.menu-board .m-detail{margin-top:2px;font-size:15px;opacity:.85}
.menu-board .m-spec{opacity:.8}
.menu-board .m-blurb{margin-top:4px;color:var(--accent)}
.menu-board .m-claims{margin-top:20px;display:flex;justify-content:center}
.menu-board .m-claims .claims{justify-content:center}
.menu-board .m-strip{list-style:none;margin:16px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.menu-board .m-thumb{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px}
`
