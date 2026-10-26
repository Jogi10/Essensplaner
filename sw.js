/* Familienplaner — Service Worker
   Hält die App-Dateien lokal vor, damit sie auch ohne Netz startet.
   Die eigentlichen Daten kommen weiterhin von Firebase; der letzte
   Stand liegt zusätzlich im Browserspeicher der App. */

const CACHE = 'familienplaner-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Schriften und das Firebase-SDK liegen auf fremden Servern.
// Beides wird beim ersten Besuch mitgespeichert, sonst fehlt offline das Layout.
const EXTERNAL = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Datenbankverkehr niemals zwischenspeichern — der muss immer live sein.
  if (url.hostname.endsWith('firebasedatabase.app') ||
      url.hostname.endsWith('firebaseio.com') ||
      url.hostname.endsWith('googleapis.com') && url.pathname.includes('identitytoolkit')) {
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || EXTERNAL.includes(url.hostname);
  if (!cacheable) return;

  // Erst das Netz fragen, bei Fehlschlag den gespeicherten Stand nehmen.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      }))
  );
});
