// Minimaler Service Worker NUR für /chat (PLAN-CHAT.md Abschnitt 5.3).
//
// Zweck ist ausschließlich das Installierbar-Sein: Android/Chrome zeigt den
// automatischen Install-Vorschlag erst, wenn ein Service Worker mit einem
// fetch-Handler registriert ist. Bewusst KEINE Offline-Ablage, kein
// Konfliktmanagement -- der Chat braucht ohnehin eine Netzverbindung zu
// Supabase, ein ambitionierter Offline-Modus wäre Aufwand ohne echten Nutzen.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // leer reicht als Installierbarkeits-Signal
