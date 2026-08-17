// lib/pomodoro/white-noise.ts
// 用 Web Audio API 程序化合成白噪音，避免往仓库塞大音频文件。
// 支持多音轨叠加混音，每轨独立音量。

import type { WhiteNoiseId } from "./types";

type Voice = {
  nodes: AudioNode[];
  gain: GainNode;
};

/** 生成一段循环的白噪音 buffer */
function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** 棕色噪声（低频更重，像雨/海浪的底噪） */
function makeBrownNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export class WhiteNoiseEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<WhiteNoiseId, Voice>();

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** 构建单个音轨的音频节点链 */
  private buildVoice(id: WhiteNoiseId): Voice {
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);
    const nodes: AudioNode[] = [];

    const startLoop = (buffer: AudioBuffer): AudioBufferSourceNode => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start();
      nodes.push(src);
      return src;
    };

    switch (id) {
      case "rain": {
        const src = startLoop(makeNoiseBuffer(ctx));
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 900;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 6500;
        src.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        nodes.push(hp, lp);
        break;
      }
      case "heavyRain": {
        const src = startLoop(makeNoiseBuffer(ctx));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 4200;
        src.connect(lp);
        lp.connect(gain);
        nodes.push(lp);
        break;
      }
      case "ocean": {
        // 棕噪 + 缓慢的音量起伏模拟海浪
        const src = startLoop(makeBrownNoiseBuffer(ctx));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1100;
        const wave = ctx.createGain();
        wave.gain.value = 0.5;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.1;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.4;
        lfo.connect(lfoGain);
        lfoGain.connect(wave.gain);
        lfo.start();
        src.connect(lp);
        lp.connect(wave);
        wave.connect(gain);
        nodes.push(lp, wave, lfo, lfoGain);
        break;
      }
      case "fireplace": {
        // 低频棕噪 + 随机爆裂
        const src = startLoop(makeBrownNoiseBuffer(ctx));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 800;
        src.connect(lp);
        lp.connect(gain);
        nodes.push(lp);
        break;
      }
      case "cafe": {
        const src = startLoop(makeBrownNoiseBuffer(ctx));
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 500;
        bp.Q.value = 0.6;
        src.connect(bp);
        bp.connect(gain);
        nodes.push(bp);
        break;
      }
      case "forest": {
        const src = startLoop(makeNoiseBuffer(ctx));
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 2000;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 9000;
        src.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        nodes.push(hp, lp);
        break;
      }
      case "whiteNoise":
      default: {
        const src = startLoop(makeNoiseBuffer(ctx));
        src.connect(gain);
        break;
      }
    }

    return { nodes, gain };
  }

  /** 打开/更新某个音轨的音量（0 表示关闭） */
  setChannel(id: WhiteNoiseId, volume: number): void {
    if (typeof window === "undefined") return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") void ctx.resume();
    const clamped = Math.max(0, Math.min(1, volume));
    if (clamped <= 0) {
      this.stopChannel(id);
      return;
    }
    let voice = this.voices.get(id);
    if (!voice) {
      voice = this.buildVoice(id);
      this.voices.set(id, voice);
    }
    voice.gain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.15);
  }

  /** 在用户手势中解锁/恢复音频上下文（移动端 autoplay 限制必须在点击里同步调用） */
  resume(): void {
    if (typeof window === "undefined") return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") void ctx.resume();
  }

  /** 设置总音量 0-1（总开关关闭时可传 0 静音全部） */
  setMasterVolume(volume: number): void {
    if (typeof window === "undefined") return;
    const ctx = this.ensureContext();
    const clamped = Math.max(0, Math.min(1, volume));
    this.master?.gain.setTargetAtTime(clamped, ctx.currentTime, 0.1);
  }

  stopChannel(id: WhiteNoiseId): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    try {
      voice.gain.disconnect();
      for (const node of voice.nodes) {
        try {
          (node as OscillatorNode | AudioBufferSourceNode).stop?.();
        } catch {
          /* not a source node */
        }
        node.disconnect();
      }
    } catch {
      /* ignore */
    }
    this.voices.delete(id);
  }

  stopAll(): void {
    for (const id of Array.from(this.voices.keys())) {
      this.stopChannel(id);
    }
  }

  dispose(): void {
    this.stopAll();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
    }
  }
}
