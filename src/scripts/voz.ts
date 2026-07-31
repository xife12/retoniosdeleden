/**
 * Vorlesen.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *
 *  1. **Aufnahmen.** Liegt `/voz/manifest.json` vor, spielt der Lektor die
 *     vorbereiteten MP3s Satz für Satz ab. Die entstehen einmalig über
 *     `npm run voz` (siehe `scripts/generar-voz.mjs`) und klingen wie eine
 *     echte Erzählerin. Das ist der Normalfall.
 *
 *  2. **Browserstimme.** Fehlen die Aufnahmen, springt die Web Speech API
 *     ein. Sie klingt auf den meisten Geräten blechern — daran lässt sich
 *     von hier aus nichts ändern, die Stimme kommt vom Betriebssystem.
 *     Was hilft, tut dieses Modul trotzdem: die beste verfügbare spanische
 *     Stimme wählen, den Text in Sätze zerlegen und jeden Satz mit eigenem
 *     Tempo, eigener Tonhöhe und einer echten Atempause sprechen.
 *
 * Nach außen sieht beides gleich aus: `hablar(seite)`, plus Rückmeldungen
 * pro Satz und pro Wort, damit die Seite mitlesen kann.
 */

export interface VozOpciones {
  onSentence?: (index: number, text: string) => void;
  onWord?: (charIndex: number, length: number) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

export interface Lector {
  /** `texto` wird nur für die Browserstimme gebraucht. */
  hablar(pagina: number, texto: string, o?: VozOpciones): void;
  parar(): void;
  hablando(): boolean;
  /** True, sobald echte Aufnahmen benutzt werden. */
  grabado(): boolean;
  voces(): SpeechSynthesisVoice[];
  vozActual(): SpeechSynthesisVoice | null;
  elegirVoz(uri: string): void;
  listo(cb: () => void): void;
}

interface Frase {
  texto: string;
  archivo: string;
}

/* ============================================================
   Satzzerlegung
   ============================================================ */

const FIN = '.!?…';
const RESPIRO = ':;';

/**
 * Bewusst ein Zeichendurchlauf und keine Regex mit Lookbehind: Lookbehind
 * gibt es erst ab iOS 16.4, und ein Regex-Literal, das der Browser nicht
 * parsen kann, reißt beim Laden das ganze gebündelte Skript mit — samt
 * aller Spiele.
 */
export function partir(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  let actual = '';

  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];
    actual += c;

    const corte =
      (FIN.indexOf(c) >= 0 && limpio[i + 1] === ' ') ||
      (RESPIRO.indexOf(c) >= 0 && limpio[i + 1] === ' ' && actual.length > 90);

    if (corte) {
      const t = actual.trim();
      if (t) out.push(t);
      actual = '';
      i += 1;
    }
  }

  const resto = actual.trim();
  if (resto) out.push(resto);
  return out.length ? out : [limpio];
}

/* ============================================================
   Browserstimme: Auswahl und Prosodie
   ============================================================ */

/** Bewertet eine Stimme: höher ist besser. */
function puntuar(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase().replace('_', '-');
  if (!lang.startsWith('es')) return -1;

  let p = 0;
  const name = v.name.toLowerCase();

  if (lang.startsWith('es-ar') || lang.startsWith('es-uy')) p += 40;
  else if (lang.startsWith('es-mx') || lang.startsWith('es-cl') || lang.startsWith('es-co')) p += 28;
  else if (lang.startsWith('es-us') || lang.startsWith('es-419')) p += 22;
  else p += 10;

  if (name.includes('natural')) p += 45;
  if (name.includes('neural')) p += 40;
  if (name.includes('online')) p += 20;
  if (name.includes('google')) p += 30;
  if (name.includes('premium') || name.includes('enhanced')) p += 25;
  if (name.includes('siri')) p += 20;

  if (name.includes('espeak')) p -= 60;
  if (name.includes('compact')) p -= 25;

  return p;
}

/** Tempo, Tonhöhe und Nachlauf-Pause je nach Satzart. */
function prosodia(frase: string, i: number) {
  const esPregunta = frase.includes('¿') || frase.endsWith('?');
  const esExclama = frase.includes('¡') || frase.endsWith('!');
  const esDialogo = /^[—–-]/.test(frase) || /,\s*(dijo|zumbó|explicó|preguntó|exclamó)/i.test(frase);
  const suspensivo = /…|\.\.\.$/.test(frase);

  const vaiven = Math.sin(i * 1.7) * 0.025;
  let rate = 0.94 + vaiven;
  let pitch = 1 + vaiven * 2;
  let pausa = 340;

  if (esPregunta) {
    rate -= 0.05;
    pitch += 0.14;
    pausa = 460;
  }
  if (esExclama) {
    rate += 0.06;
    pitch += 0.1;
    pausa = 420;
  }
  if (esDialogo) pitch += 0.05;
  if (suspensivo) {
    rate -= 0.07;
    pausa = 620;
  }

  return {
    rate: Math.max(0.7, Math.min(1.15, rate)),
    pitch: Math.max(0.7, Math.min(1.6, pitch)),
    pausa,
  };
}

/* ============================================================
   Der Lektor
   ============================================================ */

export function crearLector(): Lector | null {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const puedeGrabado = typeof Audio !== 'undefined';
  if (!synth && !puedeGrabado) return null;

  /* ---------- Aufnahmen ---------- */

  let manifiesto: Record<string, Frase[]> | null = null;
  let manifiestoListo = false;
  const esperandoManifiesto: (() => void)[] = [];

  // `no-cache`, nicht `force-cache`: Force-Cache übernimmt eine einmal
  // gespeicherte Antwort auf Dauer, auch wenn es ein 404 war. Genau das
  // passierte live — wer die Seite vor den ersten Aufnahmen besucht hatte,
  // blieb danach für immer auf der Browserstimme hängen, weil der Browser
  // das alte „nicht gefunden" nie neu abfragte. `no-cache` fragt bei jedem
  // Laden beim Server nach (billig: eine bedingte Anfrage, meist 304 ohne
  // Datenübertragung), sperrt sich also nie gegen neu erzeugte Aufnahmen.
  fetch('/voz/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && d.paginas) manifiesto = d.paginas;
    })
    .catch(() => {
      /* Keine Aufnahmen — die Browserstimme übernimmt. */
    })
    .finally(() => {
      manifiestoListo = true;
      esperandoManifiesto.splice(0).forEach((cb) => cb());
    });

  /* ---------- Browserstimmen ---------- */

  let todas: SpeechSynthesisVoice[] = [];
  let elegida: SpeechSynthesisVoice | null = null;
  let elegidaPorMano = false;
  let vocesListas = false;
  const esperandoVoces: (() => void)[] = [];

  const cargar = () => {
    if (!synth) return;
    const v = synth.getVoices();
    if (!v.length) return;
    todas = v.filter((x) => puntuar(x) >= 0).sort((a, b) => puntuar(b) - puntuar(a));
    if (!elegidaPorMano) elegida = todas[0] ?? null;
    if (!vocesListas) {
      vocesListas = true;
      esperandoVoces.splice(0).forEach((cb) => cb());
    }
  };

  if (synth) {
    cargar();
    synth.addEventListener?.('voiceschanged', cargar);
    if (!vocesListas) {
      let intentos = 0;
      const t = setInterval(() => {
        cargar();
        if (vocesListas || ++intentos > 20) clearInterval(t);
      }, 250);
    }
  }

  /* ---------- gemeinsamer Ablauf ---------- */

  let activo = false;
  let usandoGrabado = false;
  let cola: string[] = [];
  let pistas: Frase[] = [];
  let idx = 0;
  let opciones: VozOpciones = {};
  let timer: number | undefined;
  let audio: HTMLAudioElement | null = null;
  let reloj = 0;

  // Chrome pausiert die Sprachausgabe nach ~15 s von selbst.
  let latido: number | undefined;
  const empezarLatido = () => {
    clearInterval(latido);
    latido = window.setInterval(() => {
      if (!activo || !synth || usandoGrabado) return;
      if (synth.speaking && !synth.paused) {
        synth.pause();
        synth.resume();
      }
    }, 9000);
  };

  const limpiar = () => {
    clearTimeout(timer);
    clearInterval(latido);
    cancelAnimationFrame(reloj);
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio = null;
    }
    try {
      synth?.cancel();
    } catch {
      /* egal */
    }
  };

  const terminar = () => {
    activo = false;
    limpiar();
    opciones.onEnd?.();
  };

  /* --- Weg 1: Aufnahmen --- */

  const siguienteGrabado = () => {
    if (!activo) return;
    if (idx >= pistas.length) {
      terminar();
      return;
    }
    const pista = pistas[idx];
    opciones.onSentence?.(idx, pista.texto);

    const a = new Audio(pista.archivo);
    audio = a;
    a.preload = 'auto';

    // Wortmarkierung ohne Zeitstempel: die Dauer der Aufnahme wird
    // proportional zur Wortlänge verteilt. Das genügt fürs Mitlesen und
    // spart eine zweite API-Runde für Timings.
    const palabras: { i: number; len: number }[] = [];
    {
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(pista.texto))) palabras.push({ i: m.index, len: m[0].length });
    }
    const letras = palabras.reduce((s, p) => s + p.len, 0) || 1;

    const seguir = () => {
      if (!activo || audio !== a) return;
      const d = a.duration;
      if (d && isFinite(d) && opciones.onWord) {
        const p = Math.min(1, a.currentTime / d);
        let acc = 0;
        for (const w of palabras) {
          acc += w.len;
          if (acc / letras >= p) {
            opciones.onWord(w.i, w.len);
            break;
          }
        }
      }
      reloj = requestAnimationFrame(seguir);
    };

    a.onended = () => {
      if (!activo) return;
      idx += 1;
      timer = window.setTimeout(siguienteGrabado, 260);
    };
    a.onerror = () => {
      // Eine fehlende Datei soll die Erzählung nicht abbrechen.
      if (!activo) return;
      idx += 1;
      timer = window.setTimeout(siguienteGrabado, 60);
    };

    void a.play().catch(() => {
      if (!activo) return;
      idx += 1;
      timer = window.setTimeout(siguienteGrabado, 60);
    });
    reloj = requestAnimationFrame(seguir);
  };

  /* --- Weg 2: Browserstimme --- */

  const siguienteSintetico = () => {
    if (!activo || !synth) return;
    if (idx >= cola.length) {
      terminar();
      return;
    }
    const frase = cola[idx];
    const { rate, pitch, pausa } = prosodia(frase, idx);

    const u = new SpeechSynthesisUtterance(frase);
    u.lang = elegida?.lang ?? 'es-AR';
    if (elegida) u.voice = elegida;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;

    opciones.onSentence?.(idx, frase);
    u.onboundary = (e) => opciones.onWord?.(e.charIndex ?? 0, e.charLength ?? 0);

    const avanzar = () => {
      if (!activo) return;
      idx += 1;
      timer = window.setTimeout(siguienteSintetico, pausa);
    };

    u.onend = avanzar;
    u.onerror = (e) => {
      // „interrupted" und „canceled" kommen vom eigenen Stop.
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      avanzar();
    };

    synth.speak(u);
  };

  return {
    hablar(pagina, texto, o = {}) {
      this.parar();
      opciones = o;
      idx = 0;
      activo = true;
      opciones.onStart?.();

      const arrancar = () => {
        if (!activo) return;
        pistas = manifiesto?.[String(pagina)] ?? [];
        usandoGrabado = pistas.length > 0;

        if (usandoGrabado) {
          siguienteGrabado();
          return;
        }
        if (!synth) {
          terminar();
          return;
        }
        cola = partir(texto);
        empezarLatido();
        // Ein Tick Verzögerung: manche Browser verschlucken sonst den
        // ersten Satz direkt nach einem cancel().
        timer = window.setTimeout(siguienteSintetico, 60);
      };

      if (manifiestoListo) arrancar();
      else esperandoManifiesto.push(arrancar);
    },

    parar() {
      activo = false;
      limpiar();
    },

    hablando: () => activo,
    grabado: () => Boolean(manifiesto && Object.keys(manifiesto).length),
    voces: () => todas,
    vozActual: () => elegida,

    elegirVoz(uri) {
      const v = todas.find((x) => x.voiceURI === uri);
      if (v) {
        elegida = v;
        elegidaPorMano = true;
      }
    },

    listo(cb) {
      const intentar = () => {
        if (manifiestoListo && (vocesListas || !synth)) cb();
      };
      if (manifiestoListo && (vocesListas || !synth)) {
        cb();
        return;
      }
      esperandoManifiesto.push(intentar);
      esperandoVoces.push(intentar);
    },
  };
}
