// Cloudflare Pages Function: serves Firebase's sign-in helper (/__/auth/…, /__/firebase/…) from
// our own domain by passing the requests through to the Firebase project.
//
// Why: the site is hosted on Cloudflare Pages, not Firebase Hosting, and Firefox and Safari block
// the storage the sign-in popup needs when the helper lives on another site
// (limbussite.firebaseapp.com). With this proxy, and the app using our domain as its authDomain
// on gesellschaftmd.com (src/lib/cloud.ts, OWN_DOMAINS), the popup is same-site. This is "Option 3" in Firebase's docs:
// https://firebase.google.com/docs/auth/web/redirect-best-practices
// It has to be a real pass-through: a 302 redirect to firebaseapp.com would not work.
// Only these paths run the function, so normal page loads don't count against the free limit.

const FIREBASE_HOST = 'limbussite.firebaseapp.com'

export async function onRequest({ request }) {
  const url = new URL(request.url)
  url.protocol = 'https:'
  url.hostname = FIREBASE_HOST
  url.port = ''
  // Hand any redirects back to the browser instead of following them here.
  return fetch(new Request(url.toString(), request), { redirect: 'manual' })
}
