# Building Future Solution

Single-page marketing site for Building Future Solution. Pure static files —
HTML, CSS, JS and images — with enquiries collected through a linked
[Google Form](https://docs.google.com/forms/d/e/1FAIpQLSfXN19ZIC-q3ExaTba0Xb_mxANYV5iUxJ2QD-YolHFC5VnLeA/viewform).
There is no backend or database to run.

## Layout

```
index.html            the single page
assets/css            styles, graphics, animations
assets/js             frontend behaviour (main, effects, hero frames)
assets/frames         hero frame sequence
images                logo and photography
```

## Local preview

Any static file server works. A convenience script is included:

```bash
npm run dev           # serves at http://127.0.0.1:4123
```

## Enquiries (Google Forms)

The contact section links out to a Google Form. Submissions land in the
form's linked Google Sheet — no third-party service or key required.

To change the form, edit the link in the enquiry section of `index.html`
(search for `docs.google.com/forms`). The form currently collects name,
email, phone and sector; add an "About your project" question in the Google
Forms editor if you want the enquiry brief captured too.

## Deployment (Cloudflare Pages)

The site is static, so it deploys to any static host. Cloudflare Pages is a
good free option — it serves Australian visitors from Sydney/Melbourne edge
nodes and provisions HTTPS automatically.

1. Create a Pages project and connect this GitHub repository.
2. Build settings: **no build command**, output directory `/` (root).
3. Deploy — you get a free `*.pages.dev` URL.
4. Add the custom domain `buildingfuturesolution.com.au` under
   **Custom domains**, then point the domain's DNS at Cloudflare. HTTPS is
   issued automatically.

GitHub Pages and Netlify also work; Cloudflare is preferred here for its
Australian edge presence.
