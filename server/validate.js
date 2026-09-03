/**
 * Input validation for the enquiry form.
 *
 * Hand-rolled rather than pulling in a schema library: the shape is small,
 * and it keeps the dependency surface to Express alone.
 *
 * Everything is validated server-side. The matching HTML attributes on the
 * form are a convenience for users, not a security control - a client can
 * post whatever it likes, so these checks are the real gate.
 */

export const SECTORS = [
  'retail',
  'hospitality',
  'cafe-restaurant',
  'fast-food',
  'commercial-office',
  'sporting-venue',
  'other',
];

const LIMITS = {
  name: { min: 2, max: 80 },
  email: { max: 254 },
  phone: { max: 30 },
  message: { min: 10, max: 2000 },
};

// Deliberately permissive but structural: exactly one @, a dot in the domain,
// no whitespace. Full RFC 5322 matching in regex is a known footgun.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// Digits plus the punctuation people actually type in AU numbers.
const PHONE_RE = /^[+()\-.\s\d]+$/;

function asString(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Strips control characters and collapses whitespace runs.
 * Note this is normalisation, not HTML escaping - output escaping happens at
 * render time, which is the correct place for it.
 */
function tidy(value) {
  return asString(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * @returns {{ ok: true, data: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateEnquiry(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: { _: 'Expected a JSON object.' } };
  }

  const errors = {};

  const name = tidy(body.name);
  if (!name) {
    errors.name = 'Please tell us your name.';
  } else if (name.length < LIMITS.name.min) {
    errors.name = `Name must be at least ${LIMITS.name.min} characters.`;
  } else if (name.length > LIMITS.name.max) {
    errors.name = `Name must be ${LIMITS.name.max} characters or fewer.`;
  }

  const email = tidy(body.email).toLowerCase();
  if (!email) {
    errors.email = 'Please provide an email address.';
  } else if (email.length > LIMITS.email.max || !EMAIL_RE.test(email)) {
    errors.email = 'That email address does not look valid.';
  }

  // Optional field: only validated when the user actually filled it in.
  const phone = tidy(body.phone);
  if (phone) {
    const digitCount = (phone.match(/\d/g) ?? []).length;
    if (phone.length > LIMITS.phone.max || !PHONE_RE.test(phone) || digitCount < 8) {
      errors.phone = 'That phone number does not look valid.';
    }
  }

  const sector = tidy(body.sector).toLowerCase();
  if (sector && !SECTORS.includes(sector)) {
    errors.sector = 'Please choose one of the listed sectors.';
  }

  // Newlines are meaningful here, so only trim the ends.
  const message = asString(body.message)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!message) {
    errors.message = 'Please tell us about your project.';
  } else if (message.length < LIMITS.message.min) {
    errors.message = `Please give us at least ${LIMITS.message.min} characters.`;
  } else if (message.length > LIMITS.message.max) {
    errors.message = `Please keep it under ${LIMITS.message.max} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: { name, email, phone: phone || null, sector: sector || null, message },
  };
}

/**
 * Hidden field that real users never see and therefore never fill in.
 * Anything in it means a bot walked the form.
 */
export function looksLikeBot(body) {
  return Boolean(tidy(body?.company_website));
}
