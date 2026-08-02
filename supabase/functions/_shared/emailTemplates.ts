const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );

export type BrandedEmailInput = {
  preheader: string;
  eyebrow?: string;
  title: string;
  body: string;
  action?: { label: string; url: string };
  footer?: string;
};

/** Produces inbox-safe table markup with inline styles and a plaintext peer. */
export function brandedEmail(input: BrandedEmailInput): {
  html: string;
  text: string;
} {
  const preheader = escapeHtml(input.preheader);
  const eyebrow = input.eyebrow ? escapeHtml(input.eyebrow) : '';
  const title = escapeHtml(input.title);
  const body = escapeHtml(input.body);
  const footer = escapeHtml(
    input.footer ??
      'You received this transactional message because you have a Mintea account.',
  );
  const action = input.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px"><tr><td style="border-radius:999px;background:#148a68"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(input.action.label)}</a></td></tr></table>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f3f7f4;color:#14211d;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe8e1;border-radius:24px;overflow:hidden">
<tr><td style="height:7px;background:#20a77d"></td></tr>
<tr><td style="padding:34px 36px 38px">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#102b22">Mintea <span style="color:#20a77d">🍃</span></div>
${eyebrow ? `<div style="margin-top:32px;color:#148a68;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">${eyebrow}</div>` : ''}
<h1 style="margin:12px 0 14px;font-size:30px;line-height:1.18;letter-spacing:-0.8px;color:#14211d">${title}</h1>
<p style="margin:0;color:#53645e;font-size:16px;line-height:1.65">${body}</p>
${action}
</td></tr>
<tr><td style="padding:22px 36px;background:#f8faf9;border-top:1px solid #e5eee9;color:#788781;font-size:12px;line-height:1.55">${footer}</td></tr>
</table>
</td></tr></table></body></html>`;

  const text = [
    'Mintea',
    '',
    input.title,
    '',
    input.body,
    ...(input.action ? ['', `${input.action.label}: ${input.action.url}`] : []),
    '',
    input.footer ??
      'You received this transactional message because you have a Mintea account.',
  ].join('\n');

  return { html, text };
}
