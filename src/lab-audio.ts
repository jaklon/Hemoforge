import type { LabSnapshot } from "./lab-session.ts"
import { alarmPresentation } from "./lab-alerts.ts"

export type BeepMode = "silent" | "normal" | "warning" | "critical"
export const BEEP_INTERVAL: Record<BeepMode, number> = {
  silent: Infinity,
  normal: 4,
  warning: 0.5,
  critical: 0.3,
}

export function labSoundState(
  snapshot: LabSnapshot | null,
  connected: boolean,
  visible: boolean,
  enabled: boolean,
  volume: number,
) {
  const audible = enabled && connected && visible && !!snapshot
  const running = audible && !!snapshot?.running
  const motor = snapshot?.controller?.outputs.stirrer_rpm ?? 0
  const alarms = alarmPresentation(snapshot, connected)
  const beep: BeepMode = !audible
    ? "silent"
    : alarms.current.some(
          (a) => a.status === "active" && a.severity === "critical",
        )
      ? "critical"
      : alarms.current.length || snapshot?.sensor_faults?.length
        ? "warning"
        : running && alarms.dataReady
          ? "normal"
          : "silent"
  return {
    audible,
    beep,
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(0.6, volume)) : 0,
    motor:
      running && Number.isFinite(motor)
        ? Math.max(0, Math.min(220, motor)) / 220
        : 0,
    gas: running
      ? Number.isFinite(snapshot?.process_disturbance?.aeration_capacity)
        ? Math.max(
            0.01,
            Math.min(1, snapshot!.process_disturbance!.aeration_capacity!),
          )
        : snapshot?.process_disturbance?.aeration_restricted
          ? 0.12
          : 1
      : 0,
    pump:
      running &&
      (snapshot?.active_intervention?.status === "executing" ||
        (snapshot?.controller?.outputs.base_output_percent ?? 0) > 1)
        ? 1
        : 0,
  }
}

/** Original synthesized room tone; no remote audio, microphone or media request. */
export class LabAudioEngine {
  context: AudioContext
  private master: GainNode
  private motor: GainNode
  private gas: GainNode
  private motorOsc: OscillatorNode
  private meter: AnalyserNode
  private samples = new Float32Array(256)
  private sources: (AudioBufferSourceNode | OscillatorNode)[] = []
  private beepMode: BeepMode = "silent"
  private nextBeep = 0
  private timer: ReturnType<typeof setInterval>
  constructor() {
    this.context = new AudioContext({ latencyHint: "playback" })
    const c = this.context
    this.master = c.createGain()
    this.master.gain.value = 0
    this.meter = c.createAnalyser()
    this.meter.fftSize = 256
    this.master.connect(this.meter)
    this.meter.connect(c.destination)
    const noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate),
      data = noise.getChannelData(0)
    let seed = 31
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      data[i] = (seed >>> 0) / 2147483648 - 1
    }
    const source = c.createBufferSource()
    source.buffer = noise
    source.loop = true
    const fan = c.createBiquadFilter()
    fan.type = "lowpass"
    fan.frequency.value = 650
    fan.Q.value = 0.4
    const fanGain = c.createGain()
    fanGain.gain.value = 0.027
    source.connect(fan)
    fan.connect(fanGain)
    fanGain.connect(this.master)
    const bubble = c.createBiquadFilter()
    bubble.type = "bandpass"
    bubble.frequency.value = 1400
    bubble.Q.value = 0.6
    this.gas = c.createGain()
    this.gas.gain.value = 0
    source.connect(bubble)
    bubble.connect(this.gas)
    this.gas.connect(this.master)
    source.start()
    this.sources.push(source)
    const hum = c.createOscillator(),
      humGain = c.createGain()
    hum.type = "sine"
    hum.frequency.value = 50
    humGain.gain.value = 0.009
    hum.connect(humGain)
    humGain.connect(this.master)
    hum.start()
    this.sources.push(hum)
    this.motorOsc = c.createOscillator()
    this.motorOsc.type = "triangle"
    this.motorOsc.frequency.value = 90
    this.motor = c.createGain()
    this.motor.gain.value = 0
    this.motorOsc.connect(this.motor)
    this.motor.connect(this.master)
    this.motorOsc.start()
    this.sources.push(this.motorOsc)
    this.timer = setInterval(() => {
      if (this.context.state !== "running" || this.beepMode === "silent") return
      if (this.context.currentTime >= this.nextBeep) {
        this.chime(this.beepMode === "critical")
        this.nextBeep = this.context.currentTime + BEEP_INTERVAL[this.beepMode]
      }
    }, 100)
  }
  /** Call directly from a click: browsers may reject resume outside a user gesture. */
  unlock() {
    return this.context.resume()
  }
  signalLevel() {
    this.meter.getFloatTimeDomainData(this.samples)
    return Math.sqrt(
      this.samples.reduce((sum, v) => sum + v * v, 0) / this.samples.length,
    )
  }
  async set(state: ReturnType<typeof labSoundState>) {
    const c = this.context
    if (c.state === "closed") return
    if (!state.audible) {
      this.beepMode = "silent"
      await c.suspend()
      return
    }
    await c.resume()
    if (c.state !== "running") throw new Error("Audio is suspended")
    if (this.beepMode !== state.beep) {
      this.beepMode = state.beep
      this.nextBeep = c.currentTime + 0.1
    }
    this.master.gain.setTargetAtTime(state.volume * 0.8, c.currentTime, 0.03)
    this.motor.gain.setTargetAtTime(
      0.008 * state.motor + 0.004 * state.pump,
      c.currentTime,
      0.2,
    )
    this.motorOsc.frequency.setTargetAtTime(
      75 + state.motor * 35,
      c.currentTime,
      0.2,
    )
    this.gas.gain.setTargetAtTime(0.008 * state.gas, c.currentTime, 0.2)
  }
  chime(critical: boolean) {
    const c = this.context
    if (c.state !== "running") return
    const tone = c.createOscillator(),
      gain = c.createGain(),
      now = c.currentTime
    tone.type = "sine"
    tone.frequency.setValueAtTime(critical ? 1040 : 760, now)
    tone.frequency.setValueAtTime(critical ? 1120 : 820, now + 0.15)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
    gain.gain.setValueAtTime(0.0001, now + 0.15)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.162)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
    tone.connect(gain)
    gain.connect(this.master)
    tone.start(now)
    tone.stop(now + 0.28)
    tone.onended = () => {
      tone.disconnect()
      gain.disconnect()
    }
  }
  dispose() {
    clearInterval(this.timer)
    for (const s of this.sources) s.stop()
    void this.context.close()
  }
}
