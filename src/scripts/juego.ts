/**
 * Kleine gemeinsame Werkzeuge für die Mitmach-Momente im Buch.
 * Jedes Spiel meldet seine Erkenntnisse an das Sammelheft, statt sie
 * selbst zu verwalten — so bleibt der Fortschritt an einer Stelle.
 */

export interface LogroDetalle {
  id: string;
  texto: string;
  tipo: 'juego' | 'carta';
}

/** Meldet eine bestandene Probe oder eine gefundene Karte. */
export function logro(id: string, texto: string, tipo: LogroDetalle['tipo'] = 'juego') {
  document.dispatchEvent(
    new CustomEvent<LogroDetalle>('libro:logro', { detail: { id, texto, tipo } })
  );
}

/** Meli sagt etwas. Der Text wird ausgetauscht und pulst einmal kurz. */
export function decir(el: Element | null, texto: string) {
  if (!(el instanceof HTMLElement)) return;
  el.textContent = texto;
  el.classList.remove('is-nuevo');
  void el.offsetWidth;
  el.classList.add('is-nuevo');
}

export const quieto = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Liest ein JSON-Datenattribut. */
export function datos<T>(el: Element | null, attr: string, fallback: T): T {
  const raw = el instanceof HTMLElement ? el.dataset[attr] : undefined;
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Ein kurzer, erzeugter Ton. Keine Audiodateien, kein Autoplay:
 * der AudioContext entsteht erst beim ersten Antippen des Kindes.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

/** Ein Summen, dessen Tonhöhe der Flügelfrequenz folgt. */
export function crearZumbido() {
  const ac = audio();
  if (!ac) return null;

  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;

  return {
    empezar() {
      if (osc) return;
      void ac.resume();
      osc = ac.createOscillator();
      gain = ac.createGain();
      const filtro = ac.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 900;
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      gain.gain.value = 0;
      osc.connect(filtro).connect(gain).connect(ac.destination);
      osc.start();
      gain.gain.linearRampToValueAtTime(0.055, ac.currentTime + 0.15);
    },
    frecuencia(hz: number) {
      if (!osc) return;
      osc.frequency.setTargetAtTime(Math.max(35, Math.min(340, hz)), ac.currentTime, 0.06);
    },
    parar() {
      if (!osc || !gain) return;
      const o = osc;
      const g = gain;
      osc = null;
      gain = null;
      g.gain.setTargetAtTime(0, ac.currentTime, 0.08);
      setTimeout(() => {
        try {
          o.stop();
        } catch {
          /* egal */
        }
      }, 420);
    },
  };
}

/** Ein weicher Bestätigungston (Glockenspiel), wenn etwas gelingt. */
export function tin(alto = 1) {
  const ac = audio();
  if (!ac) return;
  void ac.resume();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = 660 * alto;
  g.gain.value = 0.0001;
  o.connect(g).connect(ac.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.09, ac.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);
  o.stop(ac.currentTime + 0.55);
}
