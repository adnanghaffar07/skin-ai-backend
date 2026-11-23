/**
 * The privacy policy and terms of service, as served at /api/v1/legal/privacy and /api/v1/legal/terms. The app links to
 * both, and the App Store and Google Play listings need the privacy policy's address.
 *
 * Written from what the app and this API actually do (see docs/END_TO_END_DATA_FLOW.md). DRAFT FOR LEGAL REVIEW: the
 * owner of the policy should check it before launch, and update it (and LAST_UPDATED) whenever data handling changes.
 */

export const LAST_UPDATED = '23 November 2026';
export const COMPANY = 'CodeAutomation.ai LLC';

type Section = { heading: string; paragraphs: string[] };

export const PRIVACY: Section[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      `Clara Skin AI ("Clara", "we") is an app made by ${COMPANY}. This policy explains what information Clara collects, why, who helps us handle it, and the choices you have. Clara gives cosmetic skincare guidance. It is not a medical service and does not diagnose or treat any condition.`,
    ],
  },
  {
    heading: 'What we collect',
    paragraphs: [
      'Account details: your name, email address and password (the password goes to our sign-in provider and never to Clara\'s own servers), and, if you add them, your date of birth, state or province and profile photo. If you sign in with Google or Apple, we receive your name and email address from them.',
      'Your skin questionnaire: answers such as your age range, skin type, concerns, sensitivities, past reactions to products, your current routine and your monthly budget.',
      'Face scans: a face scan is analysed on your phone. The photo does not leave your phone unless you choose to let Clara keep it (see below). What the analysis found, such as levels of redness, shine, dark circles and blemishes, is sent to us so your recommendations can take it into account.',
      'Skin diary: the entries you write, such as how your skin feels, which routine steps you did, new products and any reactions.',
      'Routine progress: which routine steps you marked as done, and on which day.',
      'Orders: the products you buy, and the name, email address, phone number and delivery address you give for an order. Card details are entered on Stripe\'s secure payment page and never reach Clara.',
      'Privacy choices: a record of each permission you give or withdraw, with the date and the version of this policy.',
      'App usage: a small set of events, such as starting the questionnaire, finishing a scan or placing an order, with a random app ID, your phone\'s platform and system version, the app version and language. We use them to understand where people get stuck. We do not use advertising IDs or third-party analytics or advertising tools.',
      'Technical logs: our servers keep short records of requests (time, address called, result) to keep the service secure and working. They do not contain your answers, photos or diary.',
    ],
  },
  {
    heading: 'Photos kept to improve Clara',
    paragraphs: [
      'On the scan consent screen you can choose to let Clara keep your clear scan photos to improve its skin analysis. This is off unless you tick it. Kept photos are stored privately, are only used to develop and check Clara\'s skin analysis, and are never sold or used for advertising.',
      'You can turn this off at any time in Profile, Privacy & permissions; Clara then stops keeping new photos. Deleting a scan in the app deletes its kept photo, and deleting your account deletes all of them.',
    ],
  },
  {
    heading: 'How we use your information',
    paragraphs: [
      'To create and run your account; to suggest a skincare routine and products that suit your answers, your scan and your budget; to keep your routine, diary and orders; to process and deliver orders and send order emails; to answer you when you contact us; to keep the service secure; and to improve Clara. We do not sell your personal information and we do not use it for targeted advertising.',
    ],
  },
  {
    heading: 'Who helps us',
    paragraphs: [
      'We use a small number of service providers, each only for the job described, under agreements that require them to protect your information:',
      'Supabase (database, sign-in and private photo storage); Vercel (runs Clara\'s servers); our AI recommendation service (receives your questionnaire answers and scan findings, never your photos, and returns product suggestions); Stripe (payments); Resend (sends account and order emails); Google and Apple (only if you choose to sign in with them).',
      'We may also share information if the law requires it, to protect people\'s safety, or as part of a sale or reorganisation of the business, in which case this policy continues to apply.',
    ],
  },
  {
    heading: 'Where your information is stored',
    paragraphs: [
      'Clara\'s database and servers are located in India (Mumbai). If you use Clara from another country, your information is transferred there and protected as this policy describes.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep your information while you have an account. When you delete your account, your profile, answers, scans, kept photos, diary, routine and privacy records are deleted. We keep order records for as long as tax and accounting law requires, and short-lived security logs for a limited time.',
    ],
  },
  {
    heading: 'Your choices and rights',
    paragraphs: [
      'In the app, under Profile, Privacy & permissions, you can: download a copy of your data; delete your account and everything in it; give or withdraw each permission, including camera use, face analysis and keeping photos; and change your details in Personal details.',
      'Depending on where you live (for example California and other US states), you may have rights to know, access, correct or delete your personal information, and not to be treated differently for using them. You can use the in-app tools above or contact us. We will not discriminate against you for exercising your rights.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'Clara is not meant for children under 13, and we do not knowingly collect information from them. Face scans are only available to people aged 18 or over. If you believe a child has given us information, contact us and we will delete it.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'Information travels over encrypted connections, photos are kept in private storage that only Clara\'s servers can open, and each person can only reach their own information. No system is perfectly secure, but we work to protect yours and will tell you if a breach affects you as the law requires.',
    ],
  },
  {
    heading: 'Changes and contact',
    paragraphs: [
      'If we change this policy, we will update the date at the top and, for important changes, tell you in the app before they apply.',
      `Questions or requests: contact ${COMPANY} through the Clara app (Profile, Privacy & permissions) or at the email address below.`,
    ],
  },
];

export const TERMS: Section[] = [
  {
    heading: 'Agreement',
    paragraphs: [
      `These terms are an agreement between you and ${COMPANY} for your use of the Clara Skin AI app and services ("Clara"). By creating an account or using Clara you agree to them and to the Privacy Policy. If you do not agree, please do not use Clara.`,
    ],
  },
  {
    heading: 'Cosmetic guidance, not medical advice',
    paragraphs: [
      'Clara gives general, cosmetic skincare information and product suggestions based on your answers and on what a photo shows. It is not a medical device, does not diagnose, treat or prevent any condition, and does not replace a doctor, dermatologist or pharmacist. Results from a photo can be wrong, especially in poor light.',
      'Always read product labels and patch test new products. Stop using a product that irritates your skin. If you have a severe reaction, such as swelling, blistering, burning that does not ease or trouble breathing, get medical help straight away. See a doctor or dermatologist about any skin condition or concern.',
    ],
  },
  {
    heading: 'Who can use Clara',
    paragraphs: [
      'You must be at least 13 to use Clara, and at least 18 to use the face scan. If you are under 18, you may only use Clara with the permission of a parent or guardian, and you may not place orders.',
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'Give accurate information, keep your password private and tell us if you think someone else has used your account. You are responsible for what happens in your account. You can delete it at any time in the app.',
    ],
  },
  {
    heading: 'Products, prices and orders',
    paragraphs: [
      'Products shown in Clara are made by other companies; their descriptions and ingredients come from those companies and retailers. Prices are shown in US dollars and include Clara\'s service fee; delivery is shown at checkout. Payment is taken by Stripe on its secure page.',
      'An order is accepted when payment succeeds and you receive a confirmation. We may cancel an order (and refund it in full) if a product is unavailable or a price was clearly wrong. Delivery times are estimates. For problems with an order, including returns and refunds, contact us; your rights under consumer law are not affected.',
    ],
  },
  {
    heading: 'Features that are not available yet',
    paragraphs: [
      'Some parts of the app, such as booking a dermatologist, show what is planned and are marked as coming soon. They cannot be used to book or pay for anything until they are launched.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: [
      'Do not misuse Clara: do not upload photos of other people without their permission, try to get into other people\'s accounts or Clara\'s systems, copy or resell Clara\'s content, interfere with the service, or use it for anything unlawful.',
    ],
  },
  {
    heading: 'Clara\'s content',
    paragraphs: [
      `Clara, its design, text and software belong to ${COMPANY} or its licensors. You may use the app for your own personal, non-commercial use. Content you add, such as diary entries, stays yours; you let us use it only to run Clara for you and as the Privacy Policy describes.`,
    ],
  },
  {
    heading: 'Disclaimers and liability',
    paragraphs: [
      'Clara is provided "as is". To the extent the law allows, we do not promise that it will always be available, error-free, or that its suggestions will suit your skin, and we are not liable for indirect or consequential losses, or for products made by other companies. Nothing in these terms limits liability that cannot be limited by law.',
    ],
  },
  {
    heading: 'Changes, ending and contact',
    paragraphs: [
      'We may update Clara and these terms; for important changes we will tell you in the app before they apply. You may stop using Clara and delete your account at any time. We may suspend accounts that break these terms.',
      `These terms are governed by the laws of the United States and of the state in which ${COMPANY} is registered, without affecting rights you have under the law of where you live. Questions: contact us through the Clara app or at the email address below.`,
    ],
  },
];

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STYLE = `body{font-family:-apple-system,system-ui,sans-serif;background:#FDF4F2;color:#2B1F22;margin:0;padding:40px 20px 56px}
main{max-width:680px;margin:0 auto}h1{font-size:28px;margin:0 0 6px}h2{font-size:18px;margin:28px 0 8px}
p{font-size:16px;line-height:1.55;margin:0 0 12px}.date{color:#6E6164;font-size:14px;margin-bottom:24px}a{color:#9C6470}`;

/** A plain, readable page with no scripts. `contact` is the support email shown at the end, when one is configured. */
export function legalPage(title: string, sections: Section[], contact?: string): string {
  const body = sections
    .map(section => `<h2>${escape(section.heading)}</h2>${section.paragraphs.map(text => `<p>${escape(text)}</p>`).join('')}`)
    .join('');
  const email = contact ? `<p>Email: <a href="mailto:${escape(contact)}">${escape(contact)}</a></p>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} | Clara Skin AI</title><style>${STYLE}</style></head>
<body><main><h1>${escape(title)}</h1><p class="date">Last updated ${LAST_UPDATED}</p>${body}${email}</main></body></html>`;
}
