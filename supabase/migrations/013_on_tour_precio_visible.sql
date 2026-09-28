-- ============================================================================
-- 013 -- On Tour: den Preis eines Seminars auf der Website ausblenden
--
-- Gewuenscht am 28. September 2026: im Panel je Seminar einstellen koennen,
-- ob der Preis auf der Website steht. Ausgeblendet zeigt die Karte „Precio
-- a consultar", und die Schaetzung im Anfragedialog entfaellt, solange das
-- Seminar gewaehlt ist (src/components/OnTour.astro).
--
--  1. Neue Spalte precio_visible (Vorgabe true -- bestehende Seminare
--     bleiben, wie sie sind). content_snapshot() (001) nimmt sie ohne
--     weiteres Zutun in den veroeffentlichten Schnappschuss auf; sie wirkt
--     also erst nach "Publicar", wie jede andere Aenderung.
--  2. on_tour_seminarios_public bekommt die Spalte ans Ende und gibt den
--     Preis selbst NICHT mehr heraus, wenn er ausgeblendet ist. Sonst
--     stuende er weiter oeffentlich lesbar in der REST-Schnittstelle --
--     der anon-Schluessel steckt in jeder ausgelieferten Seite.
--
-- `create or replace view` statt drop/create: so bleiben die Rechte (anon
-- darf SELECT) erhalten. Das geht nur, weil die bestehenden Spalten in
-- Reihenfolge und Typ gleich bleiben und die neue hinten angehaengt wird.
--
-- Idempotent.
-- ============================================================================

alter table public.on_tour_seminarios
  add column if not exists precio_visible boolean not null default true;

comment on column public.on_tour_seminarios.precio_visible is
  'Preis auf der Website zeigen. false = "Precio a consultar"; die View '
  'on_tour_seminarios_public liefert precio dann als NULL.';

create or replace view public.on_tour_seminarios_public as
select
  (s.published_payload ->> 'slug')                             as slug,
  (s.published_payload ->> 'numero')::integer                  as numero,
  (s.published_payload ->> 'pigmento')                         as pigmento,
  case
    when coalesce((s.published_payload ->> 'precio_visible')::boolean, true)
      then (s.published_payload ->> 'precio')::numeric
  end                                                          as precio,
  (s.published_payload ->> 'precio_tipo')                      as precio_tipo,
  (s.published_payload ->> 'currency')                         as currency,
  (s.published_payload ->> 'duracion')::integer                as duracion,
  (s.published_payload ->> 'min_personas')::integer            as min_personas,
  (s.published_payload ->> 'max_personas')::integer            as max_personas,
  (s.published_payload ->> 'activo')::boolean                  as activo,
  coalesce(s.published_payload -> 'translations', '{}'::jsonb) as translations,
  s.sort_order,
  s.published_at,
  coalesce((s.published_payload ->> 'precio_visible')::boolean, true)
                                                               as precio_visible
from public.on_tour_seminarios s
where s.status = 'published'
  and s.published_payload is not null
  and s.deleted_at is null;


-- ----------------------------------------------------------------------------
-- Kontrolle
--
--   select slug, precio, precio_visible from public.on_tour_seminarios_public;
-- ----------------------------------------------------------------------------
