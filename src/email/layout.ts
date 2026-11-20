/**
 * Clara's email design: one centred card, brand colours, inline styles only (email apps ignore style sheets).
 * Every value that comes from a person or the catalogue goes through escapeHtml.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailParts {
  subject: string;
  /** Grey line many inboxes show next to the subject. */
  preheader: string;
  heading: string;
  /** Plain sentences; escaped here. */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Already-escaped HTML block (e.g. the order table) and its plain-text version. */
  block?: { html: string; text: string };
  /** Small print under the card. */
  footnote?: string;
}

const COLORS = { page: '#FDF5F2', card: '#FFFFFF', text: '#2B1F22', muted: '#71636A', brand: '#9C6470', line: '#EADCDA' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Only https links go into an email button. */
export function safeUrl(url: string): string {
  return /^https:\/\/[^\s"'<>]+$/.test(url) ? url : '#';
}

export function renderEmail(parts: EmailParts): RenderedEmail {
  const paragraphs = parts.paragraphs
    .map((text) => `<p style="margin:0 0 14px;font-size:15px;line-height:22px;color:${COLORS.text}">${escapeHtml(text)}</p>`)
    .join('');
  const button = parts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="border-radius:24px;background:${COLORS.brand}">
<a href="${escapeHtml(safeUrl(parts.button.url))}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:24px">${escapeHtml(parts.button.label)}</a>
</td></tr></table>`
    : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(parts.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(parts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:1px;color:${COLORS.brand}">Clara</td></tr>
<tr><td style="background:${COLORS.card};border-radius:16px;padding:28px 26px">
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:30px;font-weight:normal;color:${COLORS.text}">${escapeHtml(parts.heading)}</h1>
${paragraphs}${button}${parts.block?.html ?? ''}
</td></tr>
<tr><td style="padding:18px 6px 0;font-size:12px;line-height:18px;color:${COLORS.muted}">${escapeHtml(
    parts.footnote ?? 'You are receiving this email because of your Clara account.',
  )}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    parts.heading,
    '',
    ...parts.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(parts.button ? [`${parts.button.label}: ${safeUrl(parts.button.url)}`, ''] : []),
    ...(parts.block ? [parts.block.text, ''] : []),
    parts.footnote ?? 'You are receiving this email because of your Clara account.',
  ].join('\n');
  return { subject: parts.subject, html, text };
}

export const EMAIL_COLORS = COLORS;
