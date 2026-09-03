# Building Future Solution

Single-page marketing site for Building Future Solution. Pure static files —
HTML, CSS, JS and images — with the enquiry form handled by
[Web3Forms](https://web3forms.com), so there is no backend or database to run.

## Layout

```
index.html            the single page
assets/css            styles, graphics, animations
assets/js             frontend behaviour (enquiry.js submits the form)
assets/frames         hero frame sequence
images                logo and photography
```

## Local preview

Any static file server works. A convenience script is included:

```bash
npm run dev           # serves at http://127.0.0.1:4123
```

Or open `index.html` directly, though the enquiry form's fetch call works best
when served over http rather than the `file://` protocol.

## Enquiry form (Web3Forms)

The contact form posts to Web3Forms, which emails each submission to the
address tied to your access key. To activate it:

1. Go to [web3forms.com](https://web3forms.com), enter the destination email,
   and copy the access key they send you.
2. In `index.html`, replace `YOUR_WEB3FORMS_ACCESS_KEY` with that key.
3. Submit the form once to confirm the email arrives.

Validation runs client-side in `assets/js/enquiry.js` (name, email, phone,
sector, message), with a honeypot to catch bots. The form keeps a native
`action`/`method`, so it still submits if JavaScript is unavailable.

## Deployment (Cloudflare Pages)

The site is static, so it deploys to any static host. Cloudflare Pages is a
good free option — it serves Australian visitors from Sydney/Melbourne edge
nodes and provisions HTTPS automatically.

1. Create a Pages project and connect this GitHub repository.
2. Build settings: **no build command**, output directory `/` (root).
3. Deploy — you get a free `*.pages.dev` URL.
4. Add the custom domain `buildingfuturesolution.com.au` under
   **Custom domains**, then point the domain's DNS at Cloudflare (moving the
   nameservers is simplest). HTTPS is issued automatically.

GitHub Pages and Netlify also work; Cloudflare is preferred here for its
Australian edge presence.
