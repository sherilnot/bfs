/**
 * Enquiry form submission.
 *
 * Posts to Web3Forms (https://web3forms.com) — a static-friendly form backend
 * that emails each submission to the address tied to the access key. No server
 * of our own is required, so the whole site can be hosted as static files.
 *
 * The form keeps its native action/method, so if this script fails to load the
 * browser still submits it the normal way (a full-page POST to Web3Forms).
 *
 * Because there is no longer a server validating input, this script does the
 * validation client-side before sending. That is a UX convenience, not a
 * security control — Web3Forms accepts whatever it is sent.
 */
(() => {
  'use strict';

  const form = document.querySelector('[data-enquiry-form]');
  if (!form) return;

  const submitBtn = form.querySelector('[data-enquiry-submit]');
  const statusEl = form.querySelector('[data-enquiry-status]');
  const errorEls = new Map(
    [...form.querySelectorAll('[data-error-for]')].map((el) => [el.dataset.errorFor, el]),
  );

  const FIELDS = ['name', 'email', 'phone', 'sector', 'message'];

  // Mirrors the old server-side rules so the experience is unchanged.
  const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

  const SECTORS = [
    'retail',
    'hospitality',
    'cafe-restaurant',
    'fast-food',
    'commercial-office',
    'sporting-venue',
    'other',
  ];

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('enquiry__status--ok', 'enquiry__status--error');
    if (kind) statusEl.classList.add(`enquiry__status--${kind}`);
    statusEl.classList.toggle('is-shown', Boolean(message));
  }

  function clearErrors() {
    for (const [name, el] of errorEls) {
      el.textContent = '';
      el.classList.remove('is-shown');
      const input = form.elements[name];
      if (input) input.removeAttribute('aria-invalid');
    }
  }

  function showErrors(fields) {
    let firstInvalid = null;
    for (const [name, message] of Object.entries(fields ?? {})) {
      const el = errorEls.get(name);
      if (el) {
        el.textContent = message;
        el.classList.add('is-shown');
      }
      const input = form.elements[name];
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        firstInvalid ??= input;
      }
    }
    // Move focus to the first problem so keyboard and screen reader users
    // land where the correction is needed.
    firstInvalid?.focus();
  }

  /** Client-side validation. Returns a { field: message } map (empty = valid). */
  function validate(values) {
    const errors = {};
    const name = values.name.trim();
    const email = values.email.trim();
    const phone = values.phone.trim();
    const sector = values.sector.trim();
    const message = values.message.trim();

    if (name.length < 2 || name.length > 80) {
      errors.name = 'Please enter your name (2–80 characters).';
    }
    if (!email) {
      errors.email = 'Please provide an email address.';
    } else if (email.length > 254 || !EMAIL_RE.test(email)) {
      errors.email = 'That email address does not look valid.';
    }
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 8 || phone.length > 30) {
        errors.phone = 'That phone number does not look valid.';
      }
    }
    if (sector && !SECTORS.includes(sector)) {
      errors.sector = 'Please choose a sector from the list.';
    }
    if (message.length < 10) {
      errors.message = 'Please tell us a little more (at least 10 characters).';
    } else if (message.length > 2000) {
      errors.message = 'That message is too long (2000 characters max).';
    }
    return errors;
  }

  function busy(isBusy) {
    if (!submitBtn) return;
    submitBtn.disabled = isBusy;
    const label = submitBtn.querySelector('span');
    if (label) label.textContent = isBusy ? 'Sending…' : 'Send Enquiry';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    setStatus('', null);

    // Bail out early if a bot filled the honeypot.
    if (form.elements.company_website?.value) {
      // Pretend success so the bot moves on.
      form.reset();
      setStatus('Thanks — your enquiry has been sent.', 'ok');
      return;
    }

    const values = {};
    for (const name of FIELDS) {
      values[name] = form.elements[name]?.value ?? '';
    }

    const errors = validate(values);
    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      setStatus('Please check the highlighted fields.', 'error');
      return;
    }

    // Web3Forms payload: the access key plus the field values. The hidden
    // subject/from_name inputs are read straight from the form.
    const payload = {
      access_key: form.elements.access_key?.value ?? '',
      subject: form.elements.subject?.value ?? 'New website enquiry',
      from_name: form.elements.from_name?.value ?? 'Website',
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || 'Not provided',
      sector: values.sector.trim() || 'Not specified',
      message: values.message.trim(),
    };

    busy(true);

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        form.reset();
        setStatus(
          "Thanks — we've got your enquiry and will be in touch within one business day.",
          'ok',
        );
        return;
      }

      setStatus(
        data.message || 'Something went wrong sending that. Please call or email us instead.',
        'error',
      );
    } catch {
      // Offline, DNS failure, service down.
      setStatus('Could not send that. Please check your connection or call us.', 'error');
    } finally {
      busy(false);
    }
  });

  // Clear a field's error as soon as the user starts fixing it.
  for (const name of FIELDS) {
    const input = form.elements[name];
    if (!input) continue;
    input.addEventListener('input', () => {
      if (!input.hasAttribute('aria-invalid')) return;
      input.removeAttribute('aria-invalid');
      const el = errorEls.get(name);
      if (el) {
        el.textContent = '';
        el.classList.remove('is-shown');
      }
    });
  }
})();
