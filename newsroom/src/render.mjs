// Static site generator for /blog: index, categories, posts, feeds, sitemaps, and the home page's latest-posts strip.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Marked } from "marked";
import { SITE, CATEGORIES, CATEGORY_INFO } from "./config.mjs";
import { esc, slugify, clip, log, unescapeText } from "./util.mjs";

const PER_PAGE = 24;
// The site's two typefaces, served with Fraunces' softness fixed so the file stays small.
export const FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,400..600,40;1,9..144,400..600,40&family=Schibsted+Grotesk:ital,wght@0,400..600;1,400..600&display=swap";
const B = SITE.base; // "/blog"
const abs = (p) => SITE.origin + p;
const catSlug = (c) => slugify(c.replace("&", "and"));
// Search results cut titles around 60 characters: keep the brand suffix only when it fits.
const withBrand = (t, brand = "rkj dev") => (`${t} | ${brand}`.length <= 62 ? `${t} | ${brand}` : t);
// Meta descriptions: about 150-160 characters, falling back to the standfirst when the writer's is too thin.
const metaDescription = (p) => clip((p.description || "").length >= 70 ? p.description : [p.description, p.dek].filter(Boolean).join(" "), 160);
const PUBLISHER = { "@type": "Organization", "@id": `${SITE.origin}/#labs`, name: "RKJDEV Labs", url: `${SITE.origin}/`, logo: { "@type": "ImageObject", url: `${SITE.origin}/apple-touch-icon.png`, width: 180, height: 180 } };
const WEBSITE = { "@type": "WebSite", "@id": `${SITE.origin}/#website`, name: "rkj dev", alternateName: ["rkjdev", "RKJDEV Labs"], url: `${SITE.origin}/`, inLanguage: "en", publisher: { "@id": `${SITE.origin}/#labs` } };

const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtFull = (t) => new Date(t).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC";
const iso = (t) => new Date(t).toISOString();
const time = (t, cls = "") => `<time datetime="${iso(t)}"${cls ? ` class="${cls}"` : ""} data-rel>${fmtDate(t)}</time>`;

// Slugs of duplicate posts and the post each one redirects to, so internal links skip the redirect.
let redirects = new Map();
const resolveLink = (href) => href.replace(/^((?:https:\/\/www\.rkjdev\.com)?\/blog\/)([a-z0-9-]+)(?=\/|$)/, (m, base, slug) => redirects.has(slug) ? base + redirects.get(slug) : m);

function readingTime(md) {
  return Math.max(2, Math.round(md.split(/\s+/).length / 230));
}

async function assetVersion(file) {
  try { return crypto.createHash("md5").update(await fs.readFile(file)).digest("hex").slice(0, 8); } catch { return "0"; }
}

// Markdown with anchored headings (for the table of contents) and safe external links.
function renderMarkdown(md) {
  const toc = [];
  const used = new Set();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        let id = slugify(text.replace(/<[^>]+>/g, ""), 60) || "section";
        while (used.has(id)) id += "-x";
        used.add(id);
        if (depth === 2) toc.push({ id, text: text.replace(/<[^>]+>/g, "") });
        const level = Math.min(Math.max(depth, 2), 4);
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        href = resolveLink(href);
        const external = /^https?:\/\//.test(href) && !href.startsWith(SITE.origin);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ""}${external ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
      },
      image() { return ""; },
      html() { return ""; },
    },
  });
  return { html: marked.parse(unescapeText(md)), toc };
}

function figureHtml(f, { hero = false, priority = false } = {}) {
  if (!f) return "";
  const src = `${B}/${f.src}`;
  const srcset = f.small ? ` srcset="${B}/${f.small} 640w, ${src} 1200w" sizes="(max-width: 760px) 100vw, 1200px"` : "";
  const credit = f.type === "real"
    ? `<span class="credit">Image: ${f.creditUrl ? `<a href="${esc(f.creditUrl)}" target="_blank" rel="noopener">${esc(f.credit)}</a>` : esc(f.credit)}</span>`
    : `<span class="credit ai">AI-generated illustration</span>`;
  return `<figure class="${hero ? "hero-fig" : "fig"}${f.type === "ai" ? " is-ai" : ""}">
  <div class="img"><img src="${src}"${srcset} width="${f.width}" height="${f.height}" alt="${esc(f.alt)}"${priority ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></div>
  <figcaption>${f.caption ? `<span>${esc(f.caption)}</span>` : ""}${credit}</figcaption>
</figure>`;
}

function head({ title, description, canonical, image, type = "website", extra = "", assets, robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#110b14">
<meta name="robots" content="${robots}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="${esc(image)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="alternate" type="application/rss+xml" title="${esc(SITE.name)}" href="${B}/feed.xml">
<link rel="alternate" type="application/feed+json" title="${esc(SITE.name)}" href="${B}/feed.json">
<link rel="icon" href="/favicon.svg?v=${assets.icon}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/site.css?v=${assets.site}">
<link rel="stylesheet" href="${B}/blog.css?v=${assets.css}">
${extra}
</head>`;
}

function header(current = "blog") {
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="mark" href="/">rkj dev</a>
    <nav aria-label="Site">
      <a href="/#work">Work</a>
      <a href="/#about">About</a>
      <a href="${B}/"${current === "blog" ? ' aria-current="page"' : ""}>Blog</a>
      <a href="/play/">Play</a>
      <a href="/#contact">Contact</a>
    </nav>
  </div>
</header>`;
}

function footer(js) {
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="biz">
      <p class="biz-name">RKJDEV Labs</p>
      <p>© ${new Date().getUTCFullYear()} RKJDEV Labs, Proprietor: Rajan Krishnan</p>
      <p>Udyam registered MSME, India, <span class="nowrap">UDYAM-BR-26-0254766</span></p>
      <p><a href="mailto:rajankrishnan909@gmail.com">rajankrishnan909@gmail.com</a></p>
    </div>
    <nav aria-label="Site">
      <a href="/">Home</a>
      <a href="${B}/">Blog</a>
      <a href="/play/">Play</a>
      <a href="/privacy/">Privacy</a>
      <a href="${B}/feed.xml">RSS</a>
    </nav>
    <p class="fine">Stories are researched from the linked sources, written with AI assistance and checked claim by claim against those sources before publishing. AI-generated illustrations are labeled.</p>
  </div>
</footer>
<script src="${B}/blog.js?v=${js}" defer></script>
</body>
</html>`;
}

// One story in the three shapes the pages use: lead (big feathered image), side and row (small thumbnail beside the text).
function card(p, { size = "row", priority = false } = {}) {
  const h = p.hero;
  const sizes = size === "lead" ? "(max-width: 900px) 100vw, 58vw" : "(max-width: 700px) 30vw, 160px";
  const img = h ? `<span class="pic"><img src="${B}/${h.small || h.src}" ${h.small ? `srcset="${B}/${h.small} 640w, ${B}/${h.src} 1200w" sizes="${sizes}"` : ""} width="640" height="360" alt="${esc(h.alt)}"${priority ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></span>` : "";
  return `<article class="story ${size}">
  <a class="story-link" href="${B}/${p.slug}/">
    ${img}
    <span class="story-body">
      <span class="meta"><span class="cat">${esc(p.category)}</span>${time(p.publishedAt)}</span>
      <h3>${esc(p.title)}</h3>
      ${size === "lead" || size === "row" ? `<span class="dek">${esc(p.dek)}</span>` : ""}
      ${size === "lead" ? `<span class="foot-meta">${p.readingTime} min read, ${p.sources.length} source${p.sources.length === 1 ? "" : "s"}</span>` : ""}
    </span>
  </a>
</article>`;
}

function chips(active) {
  return `<nav class="cats" aria-label="Categories">
  <a href="${B}/"${!active ? ' aria-current="page"' : ""}>All</a>
  ${CATEGORIES.map((c) => `<a href="${B}/category/${catSlug(c)}/"${active === c ? ' aria-current="page"' : ""}>${esc(c)}</a>`).join("\n  ")}
</nav>`;
}

function pager(page, pages, baseUrl) {
  if (pages <= 1) return "";
  const url = (n) => (n === 1 ? baseUrl : `${baseUrl}page/${n}/`);
  return `<nav class="pager" aria-label="Pages">
  ${page > 1 ? `<a rel="prev" href="${url(page - 1)}">Newer stories</a>` : "<span></span>"}
  <span class="where">Page ${page} of ${pages}</span>
  ${page < pages ? `<a rel="next" href="${url(page + 1)}">Older stories</a>` : "<span></span>"}
</nav>`;
}

function listingPage({ posts, page, pages, category, assets, updatedAt }) {
  const baseUrl = category ? `${B}/category/${catSlug(category)}/` : `${B}/`;
  const canonical = abs(page === 1 ? baseUrl : `${baseUrl}page/${page}/`);
  const title = category
    ? withBrand(`${category} news${page > 1 ? `, page ${page}` : ""}`, SITE.name)
    : page > 1 ? withBrand(`Latest AI and tech news, page ${page}`, SITE.name) : withBrand("AI news today: models, open source and breakthroughs");
  const intro = category ? CATEGORY_INFO[category] || `The latest ${category} news from ${SITE.name}, checked against the sources.` : SITE.description;
  const description = page > 1 ? clip(`Page ${page}. ${intro}`, 160) : intro;
  const [lead, second, third, ...rest] = page === 1 ? posts : [null, null, null, ...posts];
  const itemList = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, url: canonical, description, inLanguage: "en", isPartOf: { "@id": `${SITE.origin}/#website` },
    ...(category ? { breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blog", item: abs(`${B}/`) },
      { "@type": "ListItem", position: 2, name: category, item: abs(baseUrl) },
    ] } } : {}),
    mainEntity: { "@type": "ItemList", itemListElement: posts.slice(0, 20).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`${B}/${p.slug}/`) })) } };

  return `${head({ title, description, canonical, image: posts[0]?.hero ? abs(`${B}/${posts[0].og || posts[0].hero.src}`) : `${SITE.origin}/og.jpg`, assets,
    robots: posts.length ? undefined : "noindex, follow",
    extra: `<script type="application/ld+json">${JSON.stringify(category || page > 1 ? itemList : [itemList, { "@context": "https://schema.org", ...WEBSITE }, { "@context": "https://schema.org", ...PUBLISHER }]).replace(/</g, "\\u003c")}</script>${page > 1 ? `\n<link rel="prev" href="${abs(page === 2 ? baseUrl : `${baseUrl}page/${page - 1}/`)}">` : ""}${page < pages ? `\n<link rel="next" href="${abs(`${baseUrl}page/${page + 1}/`)}">` : ""}` })}
<body class="listing">
${header()}
<main id="main" class="wrap">
  <section class="masthead">
    ${category ? `<nav class="crumbs" aria-label="Breadcrumb"><a href="${B}/">Blog</a><span aria-hidden="true">/</span><span>${esc(category)}</span></nav>` : ""}
    <h1>${category ? esc(category) : "AI and emerging tech,<br> the day it happens."}</h1>
    <p class="intro">${category ? esc(intro) : "New models, open-source releases, audio and video AI, and the science and tech breakthroughs worth knowing about. Every story is researched from its sources and checked claim by claim."}</p>
    <p class="desk">Last story ${time(updatedAt)}. <span data-next-check>The desk checks the wires every half hour.</span></p>
    ${chips(category)}
  </section>
  ${!posts.length ? `<p class="empty">No stories here yet. The newsroom checks for news every 30 minutes.</p>` : ""}
  ${lead ? `<section class="top-stories" aria-labelledby="top-title">
    <h2 id="top-title" class="sr">Top stories</h2>
    ${card(lead, { size: "lead", priority: true })}
    <div class="side-col">${[second, third].filter(Boolean).map((p) => card(p, { size: "side" })).join("\n")}</div>
  </section>` : ""}
  ${rest.filter(Boolean).length ? `<section class="latest" aria-labelledby="latest-title">
    <h2 id="latest-title">${page === 1 ? "Latest" : `Page ${page}`}</h2>
    <div class="rows">${rest.filter(Boolean).map((p) => card(p)).join("\n")}</div>
  </section>` : ""}
  ${pager(page, pages, baseUrl)}
</main>
${footer(assets.js)}`;
}

function postPage(p, { assets, related, prev, next }) {
  const url = abs(`${B}/${p.slug}/`);
  const { html, toc } = renderMarkdown(p.body);
  const figures = Object.fromEntries(p.figures.map((f) => [f.marker, f]));
  let body = html.replace(/<p>\s*\[\[(FIG\d)\]\]\s*<\/p>/g, (_, m) => figureHtml(figures[m]) || "");
  body = body.replace(/\[\[(FIG\d)\]\]/g, "");
  // Any figure the writer forgot to place goes after the second section.
  const placed = new Set([...p.body.matchAll(/\[\[(FIG\d)\]\]/g)].map((m) => m[1]));
  const orphans = p.figures.filter((f) => !placed.has(f.marker)).map((f) => figureHtml(f)).join("\n");
  if (orphans) {
    const parts = body.split(/(?=<h2)/);
    parts.splice(Math.min(2, parts.length), 0, orphans);
    body = parts.join("");
  }

  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "NewsArticle",
      headline: clip(p.title, 110), description: metaDescription(p), url, mainEntityOfPage: { "@type": "WebPage", "@id": url }, inLanguage: "en", isAccessibleForFree: true,
      image: [abs(`${B}/${p.og || p.hero?.src}`), p.hero && abs(`${B}/${p.hero.src}`)].filter(Boolean),
      datePublished: iso(p.publishedAt), dateModified: iso(p.updatedAt || p.publishedAt),
      articleSection: p.category, keywords: p.tags.join(", "), wordCount: p.body.split(/\s+/).length,
      thumbnailUrl: p.hero ? abs(`${B}/${p.hero.small || p.hero.src}`) : undefined,
      author: { "@type": "Organization", name: "rkj dev newsroom", url: abs(`${B}/`) },
      publisher: PUBLISHER, isPartOf: { "@id": `${SITE.origin}/#website` },
      isBasedOn: p.sources.map((s) => s.url),
    },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blog", item: abs(`${B}/`) },
      { "@type": "ListItem", position: 2, name: p.category, item: abs(`${B}/category/${catSlug(p.category)}/`) },
      { "@type": "ListItem", position: 3, name: p.title, item: url },
    ] },
    p.faq?.length && { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ].filter(Boolean);

  const share = encodeURIComponent(url);
  const shareText = encodeURIComponent(p.title);
  return `${head({ title: withBrand(p.seoTitle || p.title), description: metaDescription(p), canonical: url, image: abs(`${B}/${p.og || p.hero?.src}`), type: "article", assets,
    extra: `<meta property="article:published_time" content="${iso(p.publishedAt)}">
<meta property="article:modified_time" content="${iso(p.updatedAt || p.publishedAt)}">
<meta property="article:section" content="${esc(p.category)}">
${p.tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`).join("\n")}
${p.hero ? `<link rel="preload" as="image" href="${B}/${p.hero.src}" imagesrcset="${p.hero.small ? `${B}/${p.hero.small} 640w, ` : ""}${B}/${p.hero.src} 1200w" imagesizes="(max-width: 760px) 100vw, 1200px">` : ""}
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` })}
<body class="post">
<div class="progress" aria-hidden="true"><span></span></div>
${header()}
<main id="main">
  <article class="article">
    <header class="post-head wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="${B}/">Blog</a><span aria-hidden="true">/</span><a href="${B}/category/${catSlug(p.category)}/">${esc(p.category)}</a></nav>
      <h1>${esc(p.title)}</h1>
      <p class="standfirst">${esc(p.dek)}</p>
      <div class="byline">
        <span class="by">rkj dev newsroom</span>
        <span>${time(p.publishedAt, "abs")}</span>
        <span>${p.readingTime} min read</span>
        <a href="#sources">${p.sources.length} source${p.sources.length === 1 ? "" : "s"}, fact-checked</a>
      </div>
    </header>
    <div class="hero-wrap wrap">${figureHtml(p.hero, { hero: true, priority: true })}</div>
    <div class="layout wrap">
      <aside class="rail" aria-label="On this page">
        ${toc.length > 2 ? `<nav class="toc"><p>Contents</p><ol>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ol></nav>` : ""}
        <div class="share">
          <p>Share</p>
          <a href="https://x.com/intent/post?url=${share}&text=${shareText}" target="_blank" rel="noopener">X</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://wa.me/?text=${shareText}%20${share}" target="_blank" rel="noopener">WhatsApp</a>
          <button type="button" data-copy="${esc(url)}">Copy link</button>
        </div>
      </aside>
      <div class="prose">
        <section class="inshort" aria-labelledby="tk">
          <h2 id="tk">In short</h2>
          <ul>${p.keyTakeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </section>
        ${body}
        ${p.faq?.length ? `<section class="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Questions people ask</h2>
          ${p.faq.map((f, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n")}
        </section>` : ""}
        <section class="sources" id="sources" aria-labelledby="src-title">
          <h2 id="src-title">Sources</h2>
          <ol>${p.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.site)}</a><span>${esc(s.site)}${s.published ? `, ${fmtDate(s.published)}` : ""}${s.official ? ', <b class="official">official source</b>' : ""}</span></li>`).join("")}</ol>
          <p class="method">How this story was made: the newsroom picked it up from ${esc(p.foundVia || "news feeds")}, gathered the full text of the sources above, and drafted it with AI assistance. Every factual claim was then checked against those sources before publishing${p.check ? ` (${p.check.claims} claims checked)` : ""}. Illustrations marked as AI-generated are not photographs. Spotted an error? <a href="mailto:rajankrishnan909@gmail.com?subject=${encodeURIComponent("Correction: " + p.title)}">Tell us</a>.</p>
        </section>
        <p class="tags">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join(" ")}</p>
        <p class="stamp">Published ${fmtFull(p.publishedAt)}${p.updatedAt && p.updatedAt !== p.publishedAt ? `, updated ${fmtFull(p.updatedAt)}` : ""}</p>
      </div>
    </div>
  </article>
  ${related.length ? `<section class="related wrap" aria-labelledby="rel-title">
    <h2 id="rel-title">Keep reading</h2>
    <div class="rows">${related.map((r) => card(r)).join("\n")}</div>
  </section>` : ""}
  <nav class="prevnext wrap" aria-label="More stories">
    ${prev ? `<a href="${B}/${prev.slug}/"><span>Newer</span>${esc(prev.title)}</a>` : "<span></span>"}
    ${next ? `<a class="next" href="${B}/${next.slug}/"><span>Older</span>${esc(next.title)}</a>` : "<span></span>"}
  </nav>
</main>
${footer(assets.js)}`;
}

// A story we published twice: its old URL stays alive as an instant redirect to the copy we keep,
// which search engines treat as a permanent move, so links and rankings consolidate on one page.
function redirectPage(p, target) {
  const to = `${B}/${target.slug}/`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(target.title)}</title>
<link rel="canonical" href="${abs(to)}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)} + location.hash)</script>
</head>
<body>
<p>This story has moved: <a href="${to}">${esc(target.title)}</a></p>
</body>
</html>
`;
}

function related(p, posts) {
  const tags = new Set(p.tags.map((t) => t.toLowerCase()));
  return posts.filter((x) => x.slug !== p.slug)
    .map((x) => ({ x, s: (x.category === p.category ? 2 : 0) + x.tags.filter((t) => tags.has(t.toLowerCase())).length * 3 - (Date.now() - x.publishedAt) / 864e5 / 7 }))
    .sort((a, b) => b.s - a.s).slice(0, 3).map((r) => r.x);
}

function rss(posts) {
  const items = posts.slice(0, 50).map((p) => `<item>
<title>${esc(p.title)}</title>
<link>${abs(`${B}/${p.slug}/`)}</link>
<guid isPermaLink="true">${abs(`${B}/${p.slug}/`)}</guid>
<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
<category>${esc(p.category)}</category>
<description>${esc(p.description)}</description>
${p.hero ? `<media:content url="${abs(`${B}/${p.og || p.hero.src}`)}" medium="image" width="1200" height="630"/>` : ""}
</item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${esc(SITE.name)}</title>
<link>${abs(`${B}/`)}</link>
<description>${esc(SITE.description)}</description>
<language>en</language>
<lastBuildDate>${new Date(Math.max(0, ...posts.map((p) => p.updatedAt || p.publishedAt))).toUTCString()}</lastBuildDate>
<atom:link href="${abs(`${B}/feed.xml`)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`;
}

function jsonFeed(posts) {
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1", title: SITE.name, home_page_url: abs(`${B}/`), feed_url: abs(`${B}/feed.json`), description: SITE.description,
    items: posts.slice(0, 50).map((p) => ({
      id: abs(`${B}/${p.slug}/`), url: abs(`${B}/${p.slug}/`), title: p.title, summary: p.dek, date_published: iso(p.publishedAt),
      image: p.hero ? abs(`${B}/${p.hero.src}`) : undefined, tags: [p.category, ...p.tags],
    })),
  }, null, 1);
}

function sitemaps(posts, categories, pagesCount) {
  const newest = (list) => list.length ? Math.max(...list.map((p) => p.updatedAt || p.publishedAt)) : null;
  const urls = [
    { loc: abs(`${B}/`), lastmod: newest(posts) },
    ...Array.from({ length: Math.max(0, pagesCount - 1) }, (_, i) => ({ loc: abs(`${B}/page/${i + 2}/`), lastmod: newest(posts.slice((i + 1) * PER_PAGE, (i + 2) * PER_PAGE)) })),
    // Empty categories are noindex, so they stay out of the sitemap.
    ...categories.map((c) => ({ c, list: posts.filter((p) => p.category === c) })).filter((x) => x.list.length)
      .map(({ c, list }) => ({ loc: abs(`${B}/category/${catSlug(c)}/`), lastmod: newest(list) })),
    ...posts.map((p) => ({ loc: abs(`${B}/${p.slug}/`), lastmod: p.updatedAt || p.publishedAt, image: p.hero && abs(`${B}/${p.hero.src}`) })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${iso(u.lastmod)}</lastmod>` : ""}${u.image ? `<image:image><image:loc>${esc(u.image)}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>`;
  const recent = posts.filter((p) => Date.now() - p.publishedAt < 2 * 864e5);
  const news = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${recent.map((p) => `<url><loc>${abs(`${B}/${p.slug}/`)}</loc><news:news><news:publication><news:name>rkj dev</news:name><news:language>en</news:language></news:publication><news:publication_date>${iso(p.publishedAt)}</news:publication_date><news:title>${esc(p.title)}</news:title></news:news></url>`).join("\n")}
</urlset>`;
  return { sitemap, news };
}

// The home page shows the three newest stories between these markers: one with its picture, two as text.
async function updateHome(root, posts) {
  const file = path.join(root, "index.html");
  let html;
  try { html = await fs.readFile(file, "utf8"); } catch { return; }
  const start = "<!-- blog:latest -->", end = "<!-- /blog:latest -->";
  if (!html.includes(start)) return;
  const cards = posts.slice(0, 3).map((p, i) => `<a class="story${i === 0 ? " lead" : ""}" href="${B}/${p.slug}/">
            ${i === 0 && p.hero ? `<span class="pic"><img src="${B}/${p.hero.small || p.hero.src}" width="640" height="360" alt="${esc(p.hero.alt)}" loading="lazy" decoding="async"></span>` : ""}
            <span class="story-body">
              <span class="meta"><span class="cat">${esc(p.category)}</span><time datetime="${iso(p.publishedAt)}">${fmtDate(p.publishedAt)}</time></span>
              <span class="title">${esc(p.title)}</span>
              ${i === 0 ? `<span class="dek">${esc(p.dek)}</span>` : ""}
            </span>
          </a>`).join("\n          ");
  const block = posts.length ? `${start}
          ${cards}
          ${end}` : `${start}\n          <p class="post-empty">The first stories are on their way.</p>\n          ${end}`;
  const next = html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block);
  if (next !== html) await fs.writeFile(file, next);
}

export async function renderSite({ root, posts }) {
  const out = path.join(root, "blog");
  posts = posts.filter((p) => !p.hidden).sort((a, b) => b.publishedAt - a.publishedAt);
  // Duplicates of a story we kept become redirects and leave every listing, feed and sitemap.
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const keep = (p) => !(p.duplicateOf && bySlug.has(p.duplicateOf) && !bySlug.get(p.duplicateOf).duplicateOf);
  const duplicates = posts.filter((p) => !keep(p));
  posts = posts.filter(keep);
  redirects = new Map(duplicates.map((p) => [p.slug, p.duplicateOf]));
  for (const p of posts) p.readingTime = readingTime(p.body);
  const assets = {
    css: await assetVersion(path.join(out, "blog.css")), js: await assetVersion(path.join(out, "blog.js")),
    site: await assetVersion(path.join(root, "site.css")), icon: await assetVersion(path.join(root, "favicon.svg")),
  };
  const updatedAt = posts[0]?.publishedAt || Date.now(); // stable output: pages only change when posts do

  // Regenerate listing trees from scratch so removed posts and old pages disappear.
  await fs.rm(path.join(out, "page"), { recursive: true, force: true });
  await fs.rm(path.join(out, "category"), { recursive: true, force: true });
  const write = async (rel, content) => {
    const file = path.join(out, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };

  const pages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  for (let page = 1; page <= pages; page++) {
    const html = listingPage({ posts: posts.slice((page - 1) * PER_PAGE, page * PER_PAGE), page, pages, assets, updatedAt });
    await write(page === 1 ? "index.html" : `page/${page}/index.html`, html);
  }
  const usedCats = CATEGORIES;
  for (const c of usedCats) {
    const list = posts.filter((p) => p.category === c);
    const cp = Math.max(1, Math.ceil(list.length / PER_PAGE));
    for (let page = 1; page <= cp; page++) {
      await write(`category/${catSlug(c)}/${page === 1 ? "" : `page/${page}/`}index.html`, listingPage({ posts: list.slice((page - 1) * PER_PAGE, page * PER_PAGE), page, pages: cp, category: c, assets, updatedAt }));
    }
  }
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    await write(`${p.slug}/index.html`, postPage(p, { assets, related: related(p, posts), prev: posts[i - 1], next: posts[i + 1] }));
  }
  for (const p of duplicates) await write(`${p.slug}/index.html`, redirectPage(p, bySlug.get(p.duplicateOf)));
  const { sitemap, news } = sitemaps(posts, usedCats, pages);
  await write("feed.xml", rss(posts));
  await write("feed.json", jsonFeed(posts));
  await write("sitemap.xml", sitemap);
  await write("news-sitemap.xml", news);
  await updateHome(root, posts);
  log(`render: ${posts.length} posts, ${pages} index pages`);
}
