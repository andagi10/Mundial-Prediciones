// sw.js — Service Worker para Mundial 2026 PWA
// Estrategia: Network First para la app, Cache First para assets estáticos

const VERSION = 'mw2026-v1';
const CACHE_STATIC = VERSION + '-static';
const CACHE_RUNTIME = VERSION + '-runtime';

// Assets que se cachean en el install (shell de la app)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: cachear el shell ─────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        // Si algún asset falla (ej: iconos), no bloqueamos la instalación
        console.warn('SW: Some assets failed to cache:', err);
      });
    })
  );
  // No esperamos: el nuevo SW se activa en la próxima carga
  // (o cuando el usuario pulsa "Actualizar" en el toast)
});

// ── Activate: limpiar caches viejos ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_RUNTIME)
          .map(key => {
            console.log('SW: Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network First con fallback a cache ────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase API calls: siempre red (nunca cachear datos dinámicos)
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('football-data.org')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para el resto (shell HTML, manifest, iconos): Network First
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si la red responde OK, actualizar cache y devolver
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_RUNTIME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Sin red: intentar servir desde cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback para navegación: servir index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503 });
        });
      })
  );
});

// ── Mensaje para forzar activación del nuevo SW ───────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
