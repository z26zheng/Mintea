import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const indexPath = path.resolve(process.cwd(), 'dist/index.html');
const title = 'Mintea — Your financial life, steeped in clarity';
const description =
  'Connect every account and let Mintea turn cash flow, net worth, assets, and debt into one calm, private picture.';
const siteUrl = 'https://mintea-seven.vercel.app/';
const socialImage = `${siteUrl}og.png`;

const metadata = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Mintea" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${siteUrl}" />
    <meta property="og:image" content="${socialImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Mintea — Your whole financial life, in focus." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${socialImage}" />`;

let html = await readFile(indexPath, 'utf8');
html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
html = html.replace(
  /<meta name="description" content="[^"]*"\s*\/?>/,
  `<meta name="description" content="${description}" />`,
);

if (!html.includes('property="og:title"')) {
  html = html.replace('</head>', `${metadata}\n  </head>`);
}

await writeFile(indexPath, html);
