let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') void ac.resume(); return; }
  try {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}

export function setMuted(m: boolean) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }

function noise(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass', pan = 0) {
  if (!ac || !master || !noiseBuf || vol <= 0.002) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ac.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  src.connect(f).connect(g).connect(p).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0, delay = 0) {
  if (!ac || !master || vol <= 0.002) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  shot(kind: string, vol: number, pan: number) {
    if (kind === 'silencer') { noise(0.08, 2400, 1, 0.25 * vol, 'bandpass', pan); return; }
    if (kind === 'shotgun') { noise(0.35, 900, 0.7, 0.9 * vol, 'lowpass', pan); tone(90, 0.2, 0.4 * vol, 'sine', -50); return; }
    if (kind === 'rifle') { noise(0.28, 1600, 0.8, 0.8 * vol, 'lowpass', pan); tone(140, 0.15, 0.3 * vol, 'triangle', -80); return; }
    noise(0.11, 2000, 0.9, 0.55 * vol, 'lowpass', pan);
  },
  hit(vol = 1) { noise(0.06, 3500, 2, 0.25 * vol, 'bandpass'); tone(900, 0.05, 0.08 * vol, 'square', -400); },
  hurt() { noise(0.12, 600, 1, 0.5, 'lowpass'); tone(160, 0.12, 0.25, 'sawtooth', -60); },
  armorHit(vol = 1) { tone(1800, 0.06, 0.1 * vol, 'triangle', -600); },
  kill() { tone(660, 0.12, 0.25, 'square'); tone(990, 0.2, 0.25, 'square', 0, 0.09); },
  pickup() { tone(520, 0.08, 0.2, 'triangle', 300); tone(880, 0.12, 0.2, 'triangle', 300, 0.06); },
  reload() { noise(0.05, 4000, 3, 0.2, 'bandpass'); setTimeout(() => noise(0.05, 3000, 3, 0.2, 'bandpass'), 180); },
  empty() { tone(1200, 0.03, 0.08, 'square'); },
  ability() { tone(300, 0.35, 0.25, 'sawtooth', 600); },
  scan() { tone(1400, 0.6, 0.15, 'sine', -900); tone(700, 0.6, 0.1, 'sine', -300, 0.1); },
  zone() { noise(0.25, 300, 1, 0.25, 'lowpass'); },
  explode(vol = 1) { noise(0.5, 500, 0.6, 0.9 * vol, 'lowpass'); tone(70, 0.4, 0.5 * vol, 'sine', -40); },
  banner() { tone(440, 0.15, 0.2, 'square'); tone(660, 0.15, 0.2, 'square', 0, 0.1); tone(880, 0.3, 0.22, 'square', 0, 0.2); },
  step(vol: number, pan: number) { noise(0.04, 500, 1, 0.18 * vol, 'lowpass', pan); },
  victory() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 0.25, 'square', 0, i * 0.12)); },
  defeat() { [392, 330, 262].forEach((f, i) => tone(f, 0.5, 0.25, 'sawtooth', 0, i * 0.18)); },
};
