// The Cloudflare Worker in front of the site (wrangler.jsonc). The site itself is static files
// (dist/) that Cloudflare serves directly; this script only runs for /__/* (run_worker_first).
//
// /__/auth/* and /__/firebase/*: Firebase's sign-in helper, passed through to the Firebase project
// so it is served from our own domain. Firefox and Safari block the storage the sign-in popup
// needs when the helper lives on another site (limbussite.firebaseapp.com); with this pass-through,
// and the app using our domain as its authDomain on gesellschaftmd.com (src/lib/cloud.ts,
// OWN_DOMAINS), the popup is same-site. This is "Option 3" in Firebase's docs:
// https://firebase.google.com/docs/auth/web/redirect-best-practices
// It has to be a real pass-through: a 302 redirect to firebaseapp.com would not work.

const FIREBASE_HOST = 'limbussite.firebaseapp.com'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/__/')) return env.ASSETS.fetch(request)
    url.protocol = 'https:'
    url.hostname = FIREBASE_HOST
    url.port = ''
    // Hand any redirects back to the browser instead of following them here.
    return fetch(new Request(url.toString(), request), { redirect: 'manual' })
  },
}
