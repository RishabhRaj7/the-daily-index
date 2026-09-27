// A small particle engine for the masthead and the edition-prep screen.
//
// Every particle has a home. Text (or any shape) is rasterised off-screen,
// sampled on a grid, and each lit sample becomes a home. Particles spring
// towards their homes, get pushed aside by the pointer, and light up in the
// accent colour while they are moving — so a disturbance reads as a flash of
// signal that settles back into ink. Changing the shape just hands out new
// homes; spare particles drift as dust.
//
// Pure canvas 2D, no dependencies. Rendering stops when the canvas is off
// screen or the tab is hidden, and reduced-motion readers get one static frame.

export interface ShapeSpec {
  /** One string per line. */
  lines: string[];
  /** CSS font-family stack to draw with. */
  family: string;
  weight?: number;
  /** Fraction of the canvas width the widest line should fill. */
  fill?: number;
  /** Line height as a multiple of the font size. */
  leading?: number;
  align?: "left" | "center";
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  /** Has a home in the current shape (false = dust). */
  bound: boolean;
  /** 0..1 — delay before this particle starts heading home. */
  delay: number;
  seed: number;
  /** A few particles are permanently accent-coloured. */
  accent: boolean;
}

export type SwarmMode = "form" | "swarm";

export interface FieldOptions {
  /** Grid step in CSS px when sampling shapes. Smaller = denser. */
  gap?: number;
  /** Dot size in CSS px. */
  dot?: number;
  /** Pointer influence radius in CSS px. */
  radius?: number;
  /** Where particles begin: scattered randomly or collapsed on a line. */
  intro?: "scatter" | "line" | "none";
  /** Share of particles that are always accent-coloured. */
  accentShare?: number;
  onFirstForm?: () => void;
}

const SPRING = 0.055;
const DAMPING = 0.84;

export class ParticleField {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private running = false;
  private visible = true;
  private pointer = { x: -9999, y: -9999, active: false, down: false };
  private start = performance.now();
  private formedAt = 0;
  private mode: SwarmMode = "form";
  private shape: ShapeSpec | null = null;
  private colors = { ink: "#111", accent: "#5200ff", signal: "#3cffd0" };
  private reduced: boolean;
  private opts: Required<Omit<FieldOptions, "onFirstForm">> & Pick<FieldOptions, "onFirstForm">;
  private cleanup: Array<() => void> = [];
  private firstFormFired = false;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    options: FieldOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.opts = {
      gap: options.gap ?? 4,
      dot: options.dot ?? 2.2,
      radius: options.radius ?? 90,
      intro: options.intro ?? "scatter",
      accentShare: options.accentShare ?? 0.06,
      onFirstForm: options.onFirstForm,
    };
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.bindEvents();
  }

  // ---- public API --------------------------------------------------------

  setColors(colors: Partial<{ ink: string; accent: string; signal: string }>) {
    this.colors = { ...this.colors, ...colors };
    if (this.reduced || !this.running) this.draw(performance.now());
  }

  /** Resize to the canvas's CSS box and re-home particles on the current shape. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shape) this.applyShape(this.shape, false);
  }

  setShape(shape: ShapeSpec, burst = true) {
    this.shape = shape;
    this.mode = "form";
    this.applyShape(shape, burst);
    this.wake();
  }

  /** Swarm: particles orbit the centre, ignoring their homes. */
  setMode(mode: SwarmMode) {
    this.mode = mode;
    if (mode === "form") {
      this.formedAt = performance.now();
      for (const p of this.particles) p.delay = Math.random() * 0.35;
    }
    this.wake();
  }

  /** Throw every particle outwards; they spring back on their own. */
  burst(cx = this.width / 2, cy = this.height / 2, power = 14) {
    for (const p of this.particles) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const f = power * (0.4 + Math.random() * 0.9);
      p.vx += (dx / d) * f + (Math.random() - 0.5) * 4;
      p.vy += (dy / d) * f + (Math.random() - 0.5) * 4;
    }
    this.wake();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible) this.wake();
  }

  destroy() {
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
  }

  // ---- shape sampling ----------------------------------------------------

  private sample(shape: ShapeSpec): Array<[number, number]> {
    const w = this.width;
    const h = this.height;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const c = off.getContext("2d", { willReadFrequently: true });
    if (!c) return [];

    const weight = shape.weight ?? 800;
    const leading = shape.leading ?? 0.9;
    const fill = shape.fill ?? 0.98;
    // Fit the widest line to the width, and all lines to the height.
    c.font = `${weight} 100px ${shape.family}`;
    const widest = Math.max(...shape.lines.map((l) => c.measureText(l).width), 1);
    let size = (w * fill * 100) / widest;
    const maxByHeight = (h * 0.96) / (shape.lines.length * leading);
    size = Math.min(size, maxByHeight);

    c.font = `${weight} ${size}px ${shape.family}`;
    c.fillStyle = "#000";
    c.textBaseline = "alphabetic";
    const lineH = size * leading;
    const blockH = lineH * shape.lines.length;
    // Cap-height centring: Big Shoulders caps sit ~0.72em above the baseline.
    const top = (h - blockH) / 2;
    shape.lines.forEach((line, i) => {
      const lw = c.measureText(line).width;
      const x = shape.align === "left" ? 0 : (w - lw) / 2;
      const y = top + lineH * i + lineH * 0.5 + size * 0.36;
      c.fillText(line, x, y);
    });

    const data = c.getImageData(0, 0, w, h).data;
    const gap = this.opts.gap;
    const pts: Array<[number, number]> = [];
    for (let y = 0; y < h; y += gap) {
      for (let x = 0; x < w; x += gap) {
        if (data[(y * w + x) * 4 + 3] > 140) pts.push([x, y]);
      }
    }
    return pts;
  }

  private applyShape(shape: ShapeSpec, burst: boolean) {
    const pts = this.sample(shape);
    // Shuffle so re-homing mixes particles across the whole word, which is
    // what makes a morph look like liquid rather than a slide.
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    const dust = Math.round(pts.length * 0.05);
    const needed = pts.length + dust;
    const fresh = this.particles.length === 0;

    while (this.particles.length < needed) {
      const [sx, sy] = this.spawnPoint();
      this.particles.push({
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        hx: sx,
        hy: sy,
        bound: false,
        delay: 0,
        seed: Math.random() * 1000,
        accent: Math.random() < this.opts.accentShare,
      });
    }
    if (this.particles.length > needed) this.particles.length = needed;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (i < pts.length) {
        p.hx = pts[i][0];
        p.hy = pts[i][1];
        p.bound = true;
      } else {
        p.hx = Math.random() * this.width;
        p.hy = Math.random() * this.height;
        p.bound = false;
      }
      // Intro sweeps left to right; later morphs start together.
      p.delay = fresh && this.opts.intro !== "none" ? (p.hx / this.width) * 0.55 + Math.random() * 0.25 : Math.random() * 0.12;
    }

    if (fresh && this.opts.intro === "none") {
      for (const p of this.particles) {
        p.x = p.hx;
        p.y = p.hy;
      }
    }
    this.formedAt = performance.now();
    if (burst && !fresh) this.burst(this.width / 2, this.height / 2, 6);
    if (this.reduced) {
      for (const p of this.particles) {
        p.x = p.hx;
        p.y = p.hy;
      }
      this.draw(performance.now());
      this.fireFirstForm();
    }
  }

  private spawnPoint(): [number, number] {
    if (this.opts.intro === "line") {
      return [Math.random() * this.width, this.height / 2 + (Math.random() - 0.5) * 2];
    }
    // Scatter wide — some start outside the box and fly in.
    return [
      (Math.random() * 1.6 - 0.3) * this.width,
      (Math.random() * 2.2 - 0.6) * this.height,
    ];
  }

  // ---- loop --------------------------------------------------------------

  private wake() {
    if (this.destroyed || this.reduced || this.running || !this.visible || document.hidden) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    if (!this.visible || document.hidden) {
      this.running = false;
      return;
    }
    const moving = this.step(now);
    this.draw(now);
    // Keep a slow shimmer going while the pointer is over the field or
    // particles are still settling; otherwise idle at a low frame budget.
    if (moving || this.pointer.active || this.mode === "swarm") {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
      this.fireFirstForm();
      // Breathe: a gentle nudge every few seconds so the masthead never
      // looks frozen, without burning frames in between.
      window.setTimeout(() => {
        if (!this.running && this.visible) {
          this.breathe();
          this.wake();
        }
      }, 3800);
    }
  };

  private breathe() {
    // A soft wave travelling across the word.
    const band = Math.random() * this.width;
    for (const p of this.particles) {
      const d = Math.abs(p.hx - band);
      if (d < 60) p.vy += (Math.random() - 0.5) * 1.6 * (1 - d / 60);
    }
  }

  private fireFirstForm() {
    if (this.firstFormFired) return;
    this.firstFormFired = true;
    this.opts.onFirstForm?.();
  }

  private step(now: number): boolean {
    const t = (now - this.formedAt) / 1000;
    const { x: mx, y: my, active } = this.pointer;
    const R = this.opts.radius;
    const R2 = R * R;
    const cx = this.width / 2;
    const cy = this.height / 2;
    let energy = 0;

    for (const p of this.particles) {
      if (this.mode === "swarm") {
        // Orbit the centre on an ellipse with a little turbulence.
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const target = Math.min(this.width, this.height * 2.2) * (0.18 + (p.seed % 1) * 0.3);
        const pull = (d - target) * 0.004;
        p.vx += (-dy / d) * 0.32 - (dx / d) * pull + Math.sin(now * 0.001 + p.seed) * 0.05;
        p.vy += (dx / d) * 0.32 * 0.55 - (dy / d) * pull + Math.cos(now * 0.0012 + p.seed) * 0.05;
      } else if (t > p.delay) {
        const k = p.bound ? SPRING : SPRING * 0.05;
        p.vx += (p.hx - p.x) * k;
        p.vy += (p.hy - p.y) * k;
        if (!p.bound) {
          p.vx += Math.sin(now * 0.0006 + p.seed) * 0.02;
          p.vy += Math.cos(now * 0.0005 + p.seed) * 0.02;
        }
      }

      if (active) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) ** 2 * (this.pointer.down ? 9 : 4.2);
          // Push out, with a swirl so the hole looks like a vortex, not a dent.
          p.vx += (dx / d) * f + (-dy / d) * f * 0.45;
          p.vy += (dy / d) * f + (dx / d) * f * 0.45;
        }
      }

      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
      energy += Math.abs(p.vx) + Math.abs(p.vy) + (p.bound ? Math.abs(p.hx - p.x) + Math.abs(p.hy - p.y) : 0);
    }
    return energy / Math.max(1, this.particles.length) > 0.05;
  }

  private draw(now: number) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    const s = this.opts.dot;
    const half = s / 2;

    // Batch by colour: settled ink, dust, then the lit (moving) particles.
    ctx.fillStyle = this.colors.ink;
    ctx.beginPath();
    for (const p of this.particles) {
      if (!p.bound || p.accent) continue;
      if (Math.abs(p.vx) + Math.abs(p.vy) > 1.1) continue;
      ctx.rect(p.x - half, p.y - half, s, s);
    }
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    for (const p of this.particles) {
      if (p.bound) continue;
      const tw = 0.6 + 0.4 * Math.sin(now * 0.002 + p.seed);
      ctx.rect(p.x - half * tw, p.y - half * tw, s * tw, s * tw);
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.colors.accent;
    ctx.beginPath();
    for (const p of this.particles) {
      if (!p.bound) continue;
      const lit = Math.abs(p.vx) + Math.abs(p.vy) > 1.1;
      if (!lit && !p.accent) continue;
      ctx.rect(p.x - half, p.y - half, s, s);
    }
    ctx.fill();
  }

  // ---- input -------------------------------------------------------------

  private bindEvents() {
    const c = this.canvas;
    const toLocal = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
    };
    const move = (e: PointerEvent) => {
      toLocal(e);
      this.pointer.active = true;
      this.wake();
    };
    const leave = () => {
      this.pointer.active = false;
      this.pointer.down = false;
    };
    const down = (e: PointerEvent) => {
      toLocal(e);
      this.pointer.down = true;
      this.pointer.active = true;
      this.wake();
    };
    const up = (e: PointerEvent) => {
      this.pointer.down = false;
      // Touch has no hover: let go and the hole closes.
      if (e.pointerType !== "mouse") this.pointer.active = false;
    };
    const vis = () => {
      if (!document.hidden) this.wake();
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", leave);
    document.addEventListener("visibilitychange", vis);
    this.cleanup.push(() => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", leave);
      document.removeEventListener("visibilitychange", vis);
    });
  }
}

/** The resolved font stack of an element carrying `className`, for canvas. */
export function resolveFontFamily(className: string): string {
  const probe = document.createElement("span");
  probe.className = className;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family;
}

/** Current value of a CSS custom property on <html>. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
