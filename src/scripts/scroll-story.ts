/**
 * Scroll-Choreografie: Reveals, Parallax, Melis Kartenflug,
 * Vignetten-Animationen und die mitfliegende Begleit-Meli.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reduced) {
  document.documentElement.classList.add('reduced-motion');
} else {
  gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
  initReveals();
  initParallax();
  initMapBee();
  initVignettes();
  initCompanion();

  // Positionen nachziehen, sobald Fonts geladen sind (Layout-Shift)
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

function initReveals() {
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.fromTo(
      el,
      { y: 44, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      }
    );
  });
}

function initParallax() {
  gsap.utils.toArray<SVGGElement>('.hero-scene .par').forEach((layer) => {
    const depth = parseFloat(layer.dataset.depth ?? '0');
    gsap.to(layer, {
      yPercent: depth * 90,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6,
      },
    });
  });
}

/**
 * Meli fliegt die Finca-Route ab. Der Flug ist an die sichtbare
 * Karte gebunden (nicht an die ganze Sektion), damit Scroll- und
 * Fluggeschwindigkeit zusammenpassen, auch am Handy.
 */
function initMapBee() {
  const path = document.getElementById('finca-path');
  const bee = document.getElementById('map-bee');
  const stage = document.querySelector<HTMLElement>('.map-stage');
  if (!path || !bee || !stage) return;

  gsap.set(bee, { xPercent: 0, transformOrigin: '50% 50%' });
  gsap.to(bee, {
    motionPath: {
      path: '#finca-path',
      align: '#finca-path',
      alignOrigin: [0.5, 0.5],
      autoRotate: true,
    },
    ease: 'none',
    scrollTrigger: {
      trigger: stage,
      start: 'top 70%',
      end: 'bottom 30%',
      scrub: 0.8,
    },
  });
}

/** Kleine Wachstums-Momente in den Timeline-Vignetten. */
function initVignettes() {
  const trig = (id: string) => ({
    trigger: `#${id}`,
    start: 'top 82%',
    once: true,
  });

  if (document.getElementById('vig-suelo')) {
    gsap.from('#vig-suelo .v-sprout', {
      scaleY: 0,
      transformOrigin: '50% 100%',
      duration: 1.1,
      ease: 'back.out(2)',
      scrollTrigger: trig('vig-suelo'),
    });
  }

  if (document.getElementById('vig-plantacion')) {
    gsap.from('#vig-plantacion .v-tree', {
      y: 26,
      autoAlpha: 0,
      duration: 0.7,
      stagger: 0.14,
      ease: 'back.out(1.8)',
      scrollTrigger: trig('vig-plantacion'),
    });
  }

  if (document.getElementById('vig-crecer')) {
    gsap.from('#vig-crecer .v-lav-stem', {
      scaleY: 0,
      transformOrigin: '50% 100%',
      duration: 0.8,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: trig('vig-crecer'),
    });
    gsap.from('#vig-crecer .v-hive, #vig-crecer .v-casa', {
      y: 20,
      autoAlpha: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out',
      scrollTrigger: trig('vig-crecer'),
    });
    gsap.to('#vig-crecer .v-mini-bees circle', {
      y: -6,
      duration: 1.4,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      stagger: 0.3,
    });
  }

  if (document.getElementById('vig-cosecha')) {
    gsap.from('#vig-cosecha .v-fruit', {
      scale: 0,
      transformOrigin: '50% 50%',
      duration: 0.6,
      stagger: 0.1,
      ease: 'back.out(2.4)',
      scrollTrigger: trig('vig-cosecha'),
    });
  }
}

/**
 * Begleit-Meli: eine fixe Biene, die dem Scroll folgt und an den
 * [data-meli-perch]-Ankern der jeweils sichtbaren [data-meli-zone]
 * landet. Ohne Anker rastet sie oben in der Sektion. So unterstützt
 * ihr Flug die Erzählung, statt frei durch den Raum zu schwirren.
 */
function initCompanion() {
  const el = document.getElementById('meli-companion');
  const inner = el?.firstElementChild as HTMLElement | null;
  if (!el || !inner) return;

  const zones = gsap.utils.toArray<HTMLElement>('[data-meli-zone]');
  if (zones.length === 0) return;

  const active = new Set<HTMLElement>();

  zones.forEach((zone) => {
    ScrollTrigger.create({
      trigger: zone,
      start: 'top 62%',
      end: 'bottom 38%',
      onToggle: (self) => {
        if (self.isActive) active.add(zone);
        else active.delete(zone);
      },
    });
  });

  // weiche Verfolgung: sie gleitet dem Ziel hinterher wie im Flug
  const quickX = gsap.quickTo(el, 'x', { duration: 0.7, ease: 'power3.out' });
  const quickY = gsap.quickTo(el, 'y', { duration: 0.7, ease: 'power3.out' });

  // sanftes Auf und Ab plus Blickrichtung liegen auf dem inneren Element
  gsap.to(inner, { y: -7, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  let facing = 1;
  gsap.set(inner, { scaleX: 1, transformOrigin: '50% 50%' });

  let shown = false;
  let curX = window.innerWidth * 0.5;
  let curY = window.innerHeight * 0.5;
  gsap.set(el, { x: curX, y: curY });

  const pickZone = (): HTMLElement | null => {
    if (active.size === 0) return null;
    const mid = window.innerHeight / 2;
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    active.forEach((zone) => {
      const r = zone.getBoundingClientRect();
      const dist = Math.abs((r.top + r.bottom) / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = zone;
      }
    });
    return best;
  };

  const follow = () => {
    const zone = pickZone();

    if (!zone) {
      if (shown) {
        shown = false;
        gsap.to(el, { autoAlpha: 0, duration: 0.4, ease: 'power2.out' });
      }
      return;
    }

    const bw = el.offsetWidth || 62;
    const bh = el.offsetHeight || 48;
    let tx: number;
    let ty: number;

    const perch = zone.querySelector<HTMLElement>('[data-meli-perch]');
    if (perch && perch.offsetParent !== null) {
      const r = perch.getBoundingClientRect();
      tx = r.left + r.width / 2 - bw / 2;
      ty = r.top + r.height / 2 - bh * 0.62; // knapp über dem Landepunkt schweben
    } else {
      // ohne Anker: dezent oben in der Sektion rasten
      const r = zone.getBoundingClientRect();
      tx = Math.min(window.innerWidth - bw - 16, r.right - bw - 20);
      ty = Math.min(Math.max(r.top + 72, 84), window.innerHeight * 0.42);
    }

    tx = Math.max(8, Math.min(window.innerWidth - bw - 8, tx));

    if (!shown) {
      shown = true;
      gsap.to(el, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' });
    }

    // Blickrichtung nach Flugrichtung (mit kleiner Totzone)
    if (tx < curX - 6 && facing !== -1) {
      facing = -1;
      gsap.to(inner, { scaleX: -1, duration: 0.3, ease: 'power1.inOut' });
    } else if (tx > curX + 6 && facing !== 1) {
      facing = 1;
      gsap.to(inner, { scaleX: 1, duration: 0.3, ease: 'power1.inOut' });
    }

    curX = tx;
    curY = ty;
    quickX(tx);
    quickY(ty);
  };

  gsap.ticker.add(follow);

  // Delight beim Antippen: Looping + Pollenstaub
  let busy = false;
  inner.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    gsap
      .timeline({ onComplete: () => (busy = false) })
      .to(inner, { rotation: `+=${facing * 360}`, duration: 0.6, ease: 'power2.out' })
      .set(inner, { rotation: 0 });

    const colors = ['#e8a13d', '#f3c87f', '#9b8ec4', '#c1714f'];
    for (let i = 0; i < 8; i++) {
      const dot = document.createElement('i');
      dot.style.cssText = `position:absolute; left:50%; top:55%; width:6px; height:6px;
        border-radius:50% 42% 55% 48%; background:${colors[i % colors.length]};
        pointer-events:none; z-index:3;`;
      inner.appendChild(dot);
      const angle = (i / 8) * Math.PI * 2;
      gsap.to(dot, {
        x: Math.cos(angle) * (34 + Math.random() * 22),
        y: Math.sin(angle) * (28 + Math.random() * 18),
        opacity: 0,
        scale: 0.4,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: () => dot.remove(),
      });
    }
  });
}
