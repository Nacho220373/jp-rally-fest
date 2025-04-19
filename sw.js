// Nombre de la caché (cámbialo si haces cambios grandes para forzar actualización)
const CACHE_NAME = 'jp-fest-cache-v1';

// Lista de archivos esenciales para que la app funcione offline
// Asegúrate que las rutas sean correctas desde la raíz donde alojarás la PWA
const urlsToCache = [
  './', // La página principal (index.html) - './' es más seguro que '/'
  './index.html', // Añadir explícitamente por si acaso
  './manifest.json', // El manifest
  // Añade aquí rutas a tus iconos si los tienes localmente, ej: './icons/icon-192.png'
  // Recursos de CDNs se cachearán dinámicamente al ser solicitados la primera vez
];

// Evento 'install': Se dispara cuando el SW se instala por primera vez.
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  // Espera hasta que la promesa se resuelva
  event.waitUntil(
    // Abre (o crea) la caché con el nombre definido
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache abierto, añadiendo archivos principales:', urlsToCache);
        // Añade todos los archivos esenciales a la caché
        // 'addAll' es atómico: si uno falla, ninguno se añade.
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Archivos principales cacheados con éxito.');
        // Forza al SW instalado a activarse inmediatamente
        return self.skipWaiting();
      })
      .catch(error => {
        // Loguear error si falla el cacheo inicial
        console.error('Service Worker: Falló el cacheo inicial de archivos.', error);
      })
  );
});

// Evento 'activate': Se dispara cuando el SW se activa (después de 'install' o al actualizar).
// Útil para limpiar caches antiguas.
self.addEventListener('activate', event => {
  console.log('Service Worker: Activado.');
  // Lista blanca de nombres de caché que queremos mantener
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    // Obtiene todos los nombres de caché existentes
    caches.keys().then(cacheNames => {
      return Promise.all(
        // Mapea sobre todos los nombres de caché
        cacheNames.map(cacheName => {
          // Si un caché no está en la lista blanca, eliminarlo
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Caches antiguos limpiados.');
        // Hace que el SW tome control de las páginas abiertas inmediatamente
        return self.clients.claim();
    })
  );
});

// Evento 'fetch': Se dispara cada vez que la página (controlada por el SW)
// solicita un recurso (HTML, CSS, JS, imagen, API, etc.).
self.addEventListener('fetch', event => {
  // Estrategia: Cache First (con fallback a Network y cacheo dinámico)
  // Ideal para assets estáticos y recursos de CDN.

  // Ignorar peticiones que no son GET (ej. POST a Supabase)
  if (event.request.method !== 'GET') {
    // Dejar que el navegador maneje estas peticiones normalmente
    return;
  }

  // Ignorar peticiones a chrome-extension:// (común en desarrollo)
   if (!event.request.url.startsWith('http')) {
       return;
   }

  event.respondWith(
    // 1. Intenta encontrar el recurso en la caché
    caches.match(event.request)
      .then(cachedResponse => {
        // Si se encuentra en caché, devolverlo
        if (cachedResponse) {
          // console.log('Service Worker: Recurso encontrado en cache:', event.request.url);
          return cachedResponse;
        }

        // 2. Si no está en caché, ir a la red
        // console.log('Service Worker: Recurso no en cache, buscando en red:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // Si la respuesta de red es válida (status 200)
            if (networkResponse && networkResponse.status === 200) {
              // Clonar la respuesta porque es un stream y solo se puede consumir una vez
              const responseToCache = networkResponse.clone();

              // Abrir la caché y guardar la respuesta de red para futuras peticiones
              caches.open(CACHE_NAME)
                .then(cache => {
                  // console.log('Service Worker: Cacheando nuevo recurso de red:', event.request.url);
                  cache.put(event.request, responseToCache);
                });
            }
            // Devolver la respuesta original de la red (incluso si no es 200, para que el navegador la maneje)
            return networkResponse;
          }
        ).catch(error => {
          // Si falla la red Y no está en caché, aquí podrías devolver una página offline genérica
          console.error('Service Worker: Error al buscar en red y no está en cache:', error);
          // Ejemplo: return caches.match('./offline.html');
          // (Necesitarías crear y cachear 'offline.html' durante la instalación)
        });
      })
  );
});
