/**
 * 所有音效都是用 Web Audio 即時合成的，不需要音檔。
 * 瀏覽器規定要使用者點過畫面才能出聲，所以第一次點擊時呼叫 unlockAudio()。
 */

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;
let muted = readMuted();

const VOLUME = 0.7;

function readMuted() {
  try {
    return localStorage.getItem('crazyuno:muted') === '1';
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('crazyuno:muted', m ? '1' : '0');
  } catch {
    // 無痕模式之類的存不了，沒關係
  }
  if (ctx) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.02);
}

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    // 壓縮器讓很多聲音疊在一起時不會爆音
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(comp).connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function ready(): AudioContext | null {
  return ctx && ctx.state === 'running' && !muted ? ctx : null;
}

// ---------- 基本積木 ----------

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** 結束時的頻率（滑音） */
  to?: number;
  dur: number;
  vol?: number;
  at?: number;
  attack?: number;
  /** 顫音 */
  vibrato?: { rate: number; depth: number };
  filter?: number;
}

function tone(o: ToneOpts) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);

  if (o.vibrato) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.value = o.vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + o.dur + 0.05);
  }

  const g = envelope(c, t0, o.dur, o.vol ?? 0.3, o.attack ?? 0.005);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    node = node.connect(f);
  }
  node.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  at?: number;
  attack?: number;
  type?: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
}

function noise(o: NoiseOpts) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = envelope(c, t0, o.dur, o.vol ?? 0.3, o.attack ?? 0.002);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + o.dur + 0.05);
}

function envelope(c: AudioContext, t0: number, dur: number, vol: number, attack: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(attack, dur * 0.9));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  return g;
}

// ---------- 遊戲音效 ----------

/** 出牌：咻一聲飛出去 */
export function whoosh(dur = 0.3, at = 0) {
  noise({ type: 'bandpass', freq: 500, to: 3500, q: 1.2, dur, vol: 0.35, attack: dur * 0.7, at });
}

/** 牌拍在桌上 */
export function slap(at = 0) {
  noise({ type: 'bandpass', freq: 1600, q: 0.7, dur: 0.12, vol: 0.7, at });
  tone({ freq: 150, to: 50, dur: 0.14, vol: 0.6, at });
}

/** 抽一張牌的「刷」 */
export function flick(at = 0) {
  noise({ type: 'highpass', freq: 2500, dur: 0.05, vol: 0.28, at });
  tone({ type: 'triangle', freq: 1800, to: 900, dur: 0.04, vol: 0.05, at });
}

/** 一次抽很多張：刷刷刷刷，太多張就加一個低沉的轟隆聲 */
export function drawCards(n: number) {
  const shown = Math.min(n, 30);
  const gap = n > 10 ? 0.035 : 0.08;
  for (let i = 0; i < shown; i++) flick(i * gap);
  if (n >= 10) noise({ type: 'lowpass', freq: 300, to: 80, dur: shown * gap + 0.4, vol: 0.4, attack: 0.1 });
}

/** 洗牌 + 發牌 */
export function shuffle() {
  for (let i = 0; i < 14; i++) noise({ type: 'highpass', freq: 3000 + Math.random() * 2000, dur: 0.04, vol: 0.2, at: i * 0.035 });
  for (let i = 0; i < 8; i++) flick(0.6 + i * 0.08);
}

/** 輪到你了 */
export function chime() {
  tone({ type: 'triangle', freq: 880, dur: 0.3, vol: 0.18 });
  tone({ type: 'triangle', freq: 1320, dur: 0.45, vol: 0.18, at: 0.1 });
  tone({ type: 'sine', freq: 2640, dur: 0.4, vol: 0.05, at: 0.1 });
}

/** 疊加抽牌：數字越大音越高越兇 */
export function stack(total: number) {
  const base = 160 * Math.pow(2, Math.min(total, 60) / 24);
  tone({ type: 'sawtooth', freq: base, to: base * 2, dur: 0.35, vol: 0.14, filter: 3000 });
  tone({ type: 'square', freq: base * 1.5, to: base * 3, dur: 0.35, vol: 0.07, filter: 3000 });
  tone({ freq: 90, to: 40, dur: 0.3, vol: 0.5 });
}

/** 爆炸 */
export function explosion(at = 0) {
  tone({ freq: 120, to: 25, dur: 1.4, vol: 0.9, at });
  noise({ type: 'lowpass', freq: 3000, to: 60, dur: 1.6, vol: 0.9, at });
  for (let i = 0; i < 10; i++) noise({ type: 'highpass', freq: 4000, dur: 0.03, vol: 0.2, at: at + 0.1 + Math.random() * 0.7 });
}

/** 防空警報 */
export function siren(at = 0, cycles = 3) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(500, t0);
  for (let i = 0; i < cycles; i++) {
    osc.frequency.linearRampToValueAtTime(1100, t0 + i * 0.7 + 0.35);
    osc.frequency.linearRampToValueAtTime(500, t0 + i * 0.7 + 0.7);
  }
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2200;
  const g = envelope(c, t0, cycles * 0.7, 0.16, 0.05);
  osc.connect(f).connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + cycles * 0.7 + 0.05);
}

/** +99：全部一起來 */
export function plus99() {
  tone({ type: 'sawtooth', freq: 55, dur: 2, vol: 0.25, filter: 400, attack: 0.02 });
  tone({ type: 'sawtooth', freq: 82.4, dur: 2, vol: 0.2, filter: 400, attack: 0.02 });
  noise({ type: 'highpass', freq: 5000, dur: 0.6, vol: 0.4 });
  explosion(0.05);
  siren(0.3, 3);
}

/** 骰子在桌上滾 */
export function dice() {
  let t = 0;
  for (let i = 0; i < 9; i++) {
    t += 0.03 + Math.random() * 0.07;
    noise({ type: 'bandpass', freq: 2200 + Math.random() * 1500, q: 3, dur: 0.035, vol: 0.4, at: t });
  }
  tone({ freq: 200, to: 90, dur: 0.12, vol: 0.4, at: t + 0.05 });
}

/** 鏡子：閃閃發亮的玻璃聲 */
export function shimmer() {
  for (let i = 0; i < 8; i++) {
    tone({ freq: 1400 + Math.random() * 2400, dur: 0.7, vol: 0.05, at: i * 0.04, attack: 0.01 });
  }
  noise({ type: 'bandpass', freq: 6000, to: 800, q: 2, dur: 0.5, vol: 0.2, attack: 0.3 });
  tone({ type: 'triangle', freq: 300, to: 1200, dur: 0.4, vol: 0.12 });
}

/** 迴轉：音高上去再下來 */
export function reverse() {
  tone({ type: 'triangle', freq: 300, to: 1000, dur: 0.18, vol: 0.2 });
  tone({ type: 'triangle', freq: 1000, to: 300, dur: 0.22, vol: 0.2, at: 0.18 });
  whoosh(0.4);
}

/** 禁止：錯誤蜂鳴 */
export function buzzer() {
  tone({ type: 'square', freq: 110, dur: 0.4, vol: 0.12, filter: 1500 });
  tone({ type: 'square', freq: 117, dur: 0.4, vol: 0.12, filter: 1500 });
}

/** 換顏色 */
export function colorWave() {
  tone({ freq: 400, to: 1800, dur: 0.5, vol: 0.14 });
  tone({ type: 'triangle', freq: 600, to: 2400, dur: 0.5, vol: 0.06, at: 0.05 });
  whoosh(0.5);
}

/** 大風吹：龍捲風 */
export function tornado() {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime;
  const dur = 2;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 4;
  f.frequency.setValueAtTime(300, t0);
  for (let i = 1; i <= 8; i++) f.frequency.linearRampToValueAtTime(i % 2 ? 2000 : 400, t0 + (i * dur) / 8);
  const g = envelope(c, t0, dur, 0.6, 0.3);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  tone({ freq: 60, dur, vol: 0.3, attack: 0.3, vibrato: { rate: 6, depth: 15 } });
}

/** 見者有份：拆禮物的叮叮噹噹，再一陣發牌聲 */
export function gift() {
  [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.3, vol: 0.14, at: i * 0.07 }));
  tone({ freq: 3136, dur: 0.5, vol: 0.04, at: 0.28 });
  for (let i = 0; i < 8; i++) flick(0.35 + i * 0.045);
}

/** 清倉：一疊牌啪啪啪甩出去 */
export function sweep(n = 3) {
  const shown = Math.min(n + 1, 12);
  for (let i = 0; i < shown; i++) {
    noise({ type: 'bandpass', freq: 1400 + i * 120, q: 0.8, dur: 0.07, vol: 0.45, at: i * 0.055 });
    flick(i * 0.055 + 0.02);
  }
  whoosh(0.35 + shown * 0.05);
  tone({ freq: 140, to: 45, dur: 0.2, vol: 0.5, at: shown * 0.055 });
}

/** 質疑：法槌敲兩下 */
export function gavel() {
  for (const at of [0, 0.2]) {
    tone({ freq: 200, to: 70, dur: 0.14, vol: 0.7, at });
    noise({ type: 'bandpass', freq: 1100, q: 2, dur: 0.06, vol: 0.5, at });
  }
}

/** UNO! */
export function unoShout() {
  for (const [f, at] of [
    [523, 0],
    [659, 0],
    [784, 0],
    [1047, 0.12],
    [1319, 0.12],
    [1568, 0.12],
  ]) {
    tone({ type: 'sawtooth', freq: f, dur: 0.3, vol: 0.07, at, filter: 4000 });
  }
  tone({ freq: 200, to: 800, dur: 0.15, vol: 0.3 });
}

/** 抓到沒喊 UNO：哨子 */
export function whistle() {
  tone({ freq: 2600, dur: 0.25, vol: 0.18, vibrato: { rate: 28, depth: 250 } });
  tone({ freq: 2600, dur: 0.5, vol: 0.18, at: 0.3, vibrato: { rate: 28, depth: 250 } });
}

/** 時間到：鈴聲 */
export function alarm() {
  for (const at of [0, 0.25]) {
    tone({ freq: 1318, dur: 0.6, vol: 0.12, at });
    tone({ freq: 1760, dur: 0.6, vol: 0.08, at });
  }
}

/** 贏了 */
export function fanfare() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    tone({ type: 'triangle', freq: f, dur: last ? 1.2 : 0.2, vol: 0.25, at: i * 0.13 });
    tone({ type: 'square', freq: f / 2, dur: last ? 1.2 : 0.2, vol: 0.05, at: i * 0.13, filter: 2000 });
  });
  for (let i = 0; i < 12; i++) noise({ type: 'highpass', freq: 3000, dur: 0.05, vol: 0.2, at: 0.6 + Math.random() * 1.2 });
}

/** 輸了：悲傷長號 */
export function sadTrombone(at = 0) {
  const notes = [392, 370, 349, 330];
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    tone({
      type: 'sawtooth',
      freq: f,
      dur: last ? 1.1 : 0.4,
      vol: 0.13,
      at: at + i * 0.42,
      attack: 0.04,
      filter: 1100,
      vibrato: last ? { rate: 5, depth: 8 } : undefined,
    });
  });
}

/** 斷線：機器人開機的嗶嗶聲，音越來越低 */
export function powerDown() {
  tone({ type: 'square', freq: 880, to: 110, dur: 0.6, vol: 0.08, filter: 2000 });
  tone({ type: 'square', freq: 660, dur: 0.08, vol: 0.06, at: 0.65, filter: 2500 });
  tone({ type: 'square', freq: 990, dur: 0.08, vol: 0.06, at: 0.78, filter: 2500 });
}

/** 回來了：往上的三個音 */
export function powerUp() {
  [523, 784, 1047].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.25, vol: 0.18, at: i * 0.09 }));
}

/** 倒數最後幾秒 */
export function tick(urgent: boolean) {
  tone({ freq: urgent ? 1400 : 1000, dur: 0.06, vol: 0.12 });
}

/** 伺服器說不行 */
export function error() {
  tone({ type: 'square', freq: 220, to: 140, dur: 0.18, vol: 0.08, filter: 1200 });
}

/** 滑過手牌 */
export function hover() {
  tone({ freq: 2200, dur: 0.03, vol: 0.025 });
}
