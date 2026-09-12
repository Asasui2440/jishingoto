"use client";

/**
 * 地震のゴォという低い音を Web Audio API で合成する。
 * 音源ファイルを持たなくていいので、読み込み待ちなしで鳴らせる。
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  // iOS はユーザー操作のあとでないと resume できない
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** ホワイトノイズを低く絞った「地鳴り」。停止用の関数を返す。 */
export function playRumble(seconds = 6): () => void {
  const ac = context();
  if (!ac) return () => {};

  const frames = ac.sampleRate * seconds;
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  // ブラウンノイズ（低域が強いノイズ）を作る
  let last = 0;
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 220;

  const gain = ac.createGain();
  const now = ac.currentTime;
  const fadeIn = Math.min(0.6, seconds * 0.2);
  const fadeOut = Math.min(1.2, seconds * 0.4);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.55, now + fadeIn); // 短い揺れでも音量変化を時間内に収める
  gain.gain.setValueAtTime(0.55, now + seconds - fadeOut);
  gain.gain.linearRampToValueAtTime(0, now + seconds);

  source.connect(filter).connect(gain).connect(ac.destination);
  source.start();

  return () => {
    try {
      gain.gain.cancelScheduledValues(ac.currentTime);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.25);
      source.stop(ac.currentTime + 0.3);
    } catch {
      // すでに止まっていれば何もしなくていい
    }
  };
}

/** ボタンを押したときの小さなクリック音 */
export function playTick(frequency = 660) {
  const ac = context();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = frequency;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.16);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.18);
}
