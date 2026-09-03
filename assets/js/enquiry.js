/**
 * Enquiry form submission.
 *
 * Posts JSON to /api/enquiries and renders per-field errors returned by the
 * server. The form keeps its native action/method, so if this script fails to
 * load the browser still submits it the normal way.
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

    const payload = {};
    for (const name of FIELDS) {
      payload[name] = form.elements[name]?.value ?? '';
    }
    // Carry the honeypot through so the server can spot bots.
    payload.company_website = form.elements.company_website?.value ?? '';

    busy(true);

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      // A non-JSON body means something upstream broke; don't blow up parsing.
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        form.reset();
        const ref = data.reference ? ` Reference ${data.reference}.` : '';
        setStatus(`${data.message ?? 'Thanks - your enquiry has been sent.'}${ref}`, 'ok');
        return;
      }

      if (response.status === 400 && data.fields) {
        showErrors(data.fields);
        setStatus('Please check the highlighted fields.', 'error');
        return;
      }

      if (response.status === 429) {
        setStatus(data.message ?? 'Too many attempts. Please wait a moment.', 'error');
        return;
      }

      setStatus('Something went wrong sending that. Please call us instead.', 'error');
    } catch {
      // Offline, DNS failure, server down.
      setStatus('Could not reach the server. Please check your connection or call us.', 'error');
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
