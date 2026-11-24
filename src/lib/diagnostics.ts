export type ReadinessProfile = 'voice' | 'video' | 'full';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckItem {
  id: string;
  category: 'browser' | 'device' | 'peripherals' | 'network';
  label: string;
  measured: string;
  measuredDetail?: string;
  threshold: string;
  status: CheckStatus;
  impactPoints: number;
  maxPoints: number;
  reason?: string;
}

export interface EnvironmentReport {
  browserName: string;
  browserVersion: string;
  engine: string;
  osName: string;
  platform: string;
  features: {
    webRtc: boolean;
    getUserMedia: boolean;
    audioContext: boolean;
    displayMedia: boolean;
    webSocket: boolean;
  };
  hardware: {
    cpuCores: number | null;
    deviceMemoryGb: number | null;
    gpuRenderer: string | null;
    batteryPct: number | null;
    batteryCharging: boolean | null;
  };
  display: {
    width: number;
    height: number;
    dpr: number;
    refreshHz: number | null;
  };
  storage: {
    quotaMb: number | null;
    usageMb: number | null;
  };
  codecs: {
    opus: boolean;
    vp8: boolean;
    vp9: boolean;
    av1: boolean;
    h264: boolean;
  };
  webrtc: {
    supported: boolean;
    iceCandidatesGathered: number;
    gatheringMs: number | null;
    candidateTypes: string[];
  };
  devices: {
    microphones: number;
    cameras: number;
    speakers: number;
  };
  measuredAt: string;
}

export interface NetworkReport {
  probesSent: number;
  probesSucceeded: number;
  medianMs: number | null;
  p95Ms: number | null;
  jitterMs: number | null;
  lossPct: number;
  downMbps: number | null;
  upMbps: number | null;
  dnsEstimateMs: number | null;
  measuredAt: string;
}

export interface PeripheralReport {
  micTested: boolean;
  micPermission: string;
  micRmsDb: number | null;
  micPeakPct: number;
  micClipping: boolean;
  micSampleRate: number | null;
  cameraTested: boolean;
  cameraPermission: string;
  cameraResolution: string | null;
  cameraFps: number | null;
  speakerConfirmed: boolean | null;
  screenShareSupported: boolean;
  screenShareTested: boolean;
}

export interface ReadinessScoreResult {
  profile: ReadinessProfile;
  score: number;
  verdict: CheckStatus;
  components: {
    device: { score: number; max: number };
    network: { score: number; max: number };
    browser: { score: number; max: number };
    peripherals: { score: number; max: number };
  };
  checks: CheckItem[];
  deductions: Array<{ label: string; points: number; reason: string }>;
  measuredAt: string;
}

export function parseUserAgent(ua: string) {
  let browserName = 'Unknown';
  let browserVersion = '—';
  let engine = 'Unknown';
  let osName = 'Unknown';

  if (/Edg\/([\d.]+)/.test(ua)) {
    browserName = 'Microsoft Edge';
    browserVersion = RegExp.$1;
    engine = 'Blink';
  } else if (/Chrome\/([\d.]+)/.test(ua) && !/Chromium/.test(ua)) {
    browserName = 'Google Chrome';
    browserVersion = RegExp.$1;
    engine = 'Blink';
  } else if (/Firefox\/([\d.]+)/.test(ua)) {
    browserName = 'Mozilla Firefox';
    browserVersion = RegExp.$1;
    engine = 'Gecko';
  } else if (/Version\/([\d.]+).*Safari/.test(ua)) {
    browserName = 'Safari';
    browserVersion = RegExp.$1;
    engine = 'WebKit';
  }

  if (/Windows NT 10\.0/.test(ua)) osName = 'Windows 10/11';
  else if (/Mac OS X ([\d_]+)/.test(ua)) osName = `macOS ${RegExp.$1.replace(/_/g, '.')}`;
  else if (/Android ([\d.]+)/.test(ua)) osName = `Android ${RegExp.$1}`;
  else if (/iPhone OS ([\d_]+)|iPad; CPU OS ([\d_]+)/.test(ua)) {
    osName = `iOS ${(RegExp.$1 || RegExp.$2).replace(/_/g, '.')}`;
  } else if (/Linux/.test(ua)) osName = 'Linux';

  return { browserName, browserVersion, engine, osName };
}

export async function measureDisplayRefreshHz(): Promise<number | null> {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return null;
  return new Promise((resolve) => {
    const stamps: number[] = [];
    const step = (ts: number) => {
      stamps.push(ts);
      if (stamps.length < 18) {
        requestAnimationFrame(step);
      } else {
        const deltas: number[] = [];
        for (let i = 1; i < stamps.length; i += 1) {
          const d = stamps[i] - stamps[i - 1];
          if (d > 2 && d < 100) deltas.push(d);
        }
        if (deltas.length === 0) return resolve(null);
        deltas.sort((a, b) => a - b);
        const medianDelta = deltas[Math.floor(deltas.length / 2)];
        resolve(Math.round(1000 / medianDelta));
      }
    };
    requestAnimationFrame(step);
  });
}

export function getWebGlGpuRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    const webgl = gl as WebGLRenderingContext;
    const ext = webgl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      return String(webgl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    }
    return String(webgl.getParameter(webgl.RENDERER) || '');
  } catch {
    return null;
  }
}

export function probeCodecs() {
  const audioCodecs =
    typeof RTCRtpReceiver !== 'undefined' && typeof RTCRtpReceiver.getCapabilities === 'function'
      ? RTCRtpReceiver.getCapabilities('audio')?.codecs || []
      : [];
  const videoCodecs =
    typeof RTCRtpReceiver !== 'undefined' && typeof RTCRtpReceiver.getCapabilities === 'function'
      ? RTCRtpReceiver.getCapabilities('video')?.codecs || []
      : [];

  const hasAudio = (mime: string) => audioCodecs.some((c) => c.mimeType.toLowerCase().includes(mime));
  const hasVideo = (mime: string) => videoCodecs.some((c) => c.mimeType.toLowerCase().includes(mime));

  return {
    opus: hasAudio('opus') || (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')),
    vp8: hasVideo('vp8') || (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('video/webm;codecs=vp8')),
    vp9: hasVideo('vp9') || (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9')),
    av1: hasVideo('av1'),
    h264: hasVideo('h264') || (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('video/mp4;codecs=avc1')),
  };
}

export async function probeWebRtcStack(): Promise<EnvironmentReport['webrtc']> {
  if (typeof RTCPeerConnection === 'undefined') {
    return { supported: false, iceCandidatesGathered: 0, gatheringMs: null, candidateTypes: [] };
  }
  const t0 = performance.now();
  const types = new Set<string>();
  let count = 0;
  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('voxrelay-probe');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 1200);
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) {
          window.clearTimeout(timer);
          resolve();
          return;
        }
        count += 1;
        const m = /typ (\w+)/.exec(ev.candidate.candidate);
        if (m) types.add(m[1]);
      };
    });
    pc.close();
    return {
      supported: true,
      iceCandidatesGathered: count,
      gatheringMs: Math.round(performance.now() - t0),
      candidateTypes: Array.from(types),
    };
  } catch {
    return { supported: true, iceCandidatesGathered: count, gatheringMs: null, candidateTypes: Array.from(types) };
  }
}

export async function detectEnvironment(): Promise<EnvironmentReport> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const parsed = parseUserAgent(ua);
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };

  let batteryPct: number | null = null;
  let batteryCharging: boolean | null = null;
  if (typeof nav.getBattery === 'function') {
    try {
      const b = await nav.getBattery();
      batteryPct = Math.round(b.level * 100);
      batteryCharging = Boolean(b.charging);
    } catch {
      // Optional API
    }
  }

  let quotaMb: number | null = null;
  let usageMb: number | null = null;
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number') quotaMb = Math.round(est.quota / (1024 * 1024));
      if (typeof est.usage === 'number') usageMb = Math.round((est.usage / (1024 * 1024)) * 10) / 10;
    } catch {
      // Optional API
    }
  }

  let microphones = 0;
  let cameras = 0;
  let speakers = 0;
  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      microphones = list.filter((d) => d.kind === 'audioinput').length;
      cameras = list.filter((d) => d.kind === 'videoinput').length;
      speakers = list.filter((d) => d.kind === 'audiooutput').length;
    } catch {
      // Optional API
    }
  }

  const [refreshHz, webrtc] = await Promise.all([measureDisplayRefreshHz(), probeWebRtcStack()]);

  return {
    browserName: parsed.browserName,
    browserVersion: parsed.browserVersion,
    engine: parsed.engine,
    osName: parsed.osName,
    platform: navigator.platform || '—',
    features: {
      webRtc: typeof RTCPeerConnection !== 'undefined',
      getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
      audioContext: typeof AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined',
      displayMedia: Boolean(navigator.mediaDevices?.getDisplayMedia),
      webSocket: typeof WebSocket !== 'undefined',
    },
    hardware: {
      cpuCores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
      deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      gpuRenderer: getWebGlGpuRenderer(),
      batteryPct,
      batteryCharging,
    },
    display: {
      width: window.screen?.width || window.innerWidth,
      height: window.screen?.height || window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      refreshHz,
    },
    storage: { quotaMb, usageMb },
    codecs: probeCodecs(),
    webrtc,
    devices: { microphones, cameras, speakers },
    measuredAt: new Date().toISOString(),
  };
}

export async function probeNetworkDiagnostics(sampleCount = 12): Promise<NetworkReport> {
  const rtts: number[] = [];
  let succeeded = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const t0 = performance.now();
    try {
      const res = await fetch(`/api/health?seq=${i}&t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        await res.text();
        rtts.push(Math.max(1, Math.round((performance.now() - t0) * 10) / 10));
        succeeded += 1;
      }
    } catch {
      // Counted as packet/probe loss
    }
  }

  const sorted = [...rtts].sort((a, b) => a - b);
  const medianMs = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
  const p95Ms = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;

  let jitterMs: number | null = null;
  if (rtts.length >= 2) {
    let diffSum = 0;
    for (let i = 1; i < rtts.length; i += 1) diffSum += Math.abs(rtts[i] - rtts[i - 1]);
    jitterMs = Math.round((diffSum / (rtts.length - 1)) * 10) / 10;
  }

  const lossPct = Math.round(((sampleCount - succeeded) / sampleCount) * 1000) / 10;

  // Real payload transfer throughput (3 runs, 96 KB payload)
  const downRates: number[] = [];
  const upRates: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    try {
      const tDown = performance.now();
      const dRes = await fetch(`/api/ops?resource=network_probe&bytes=98304&r=${i}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (dRes.ok) {
        const text = await dRes.text();
        const sec = Math.max(0.002, (performance.now() - tDown) / 1000);
        downRates.push(Math.round(((text.length * 8) / sec / 1_000_000) * 10) / 10);
      }
    } catch {
      // Optional
    }
    try {
      const payload = 'x'.repeat(65536);
      const tUp = performance.now();
      const uRes = await fetch('/api/ops?resource=network_probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ payload }),
      });
      if (uRes.ok) {
        const sec = Math.max(0.002, (performance.now() - tUp) / 1000);
        upRates.push(Math.round(((payload.length * 8) / sec / 1_000_000) * 10) / 10);
      }
    } catch {
      // Optional
    }
  }

  const medianOf = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  let dnsEstimateMs: number | null = null;
  try {
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entries[0]) {
      const dns = entries[0].domainLookupEnd - entries[0].domainLookupStart;
      if (dns >= 0) dnsEstimateMs = Math.round(dns * 10) / 10;
    }
  } catch {
    // Optional
  }

  return {
    probesSent: sampleCount,
    probesSucceeded: succeeded,
    medianMs,
    p95Ms,
    jitterMs,
    lossPct,
    downMbps: medianOf(downRates),
    upMbps: medianOf(upRates),
    dnsEstimateMs,
    measuredAt: new Date().toISOString(),
  };
}

export function scoreReadiness(
  env: EnvironmentReport | null,
  net: NetworkReport | null,
  periph: PeripheralReport,
  profile: ReadinessProfile
): ReadinessScoreResult {
  const thresholds = {
    voice: { maxMedianMs: 220, maxJitterMs: 50, maxLossPct: 2, minDownMbps: 0.5, needCamera: false, needScreen: false },
    video: { maxMedianMs: 150, maxJitterMs: 30, maxLossPct: 1, minDownMbps: 2.0, needCamera: true, needScreen: false },
    full: { maxMedianMs: 120, maxJitterMs: 25, maxLossPct: 0.5, minDownMbps: 5.0, needCamera: true, needScreen: true },
  }[profile];

  const checks: CheckItem[] = [];

  // 1. Browser (max 15)
  const webRtcOk = Boolean(env?.features.webRtc && env?.codecs.opus);
  checks.push({
    id: 'browser_webrtc',
    category: 'browser',
    label: 'WebRTC & Opus codec',
    measured: env ? `${env.browserName} (${env.codecs.opus ? 'Opus OK' : 'No Opus'})` : 'Not probed',
    threshold: 'WebRTC + Opus required',
    status: !env ? 'warn' : webRtcOk ? 'pass' : 'fail',
    impactPoints: !env ? 8 : webRtcOk ? 15 : 0,
    maxPoints: 15,
    reason: !env ? 'Run environment scan' : webRtcOk ? undefined : 'Browser lacks WebRTC or Opus codec support.',
  });

  // 2. Device (max 30)
  const cores = env?.hardware.cpuCores ?? null;
  const coresStatus: CheckStatus = cores === null ? 'warn' : cores >= 4 ? 'pass' : cores >= 2 ? 'warn' : 'fail';
  checks.push({
    id: 'device_cpu',
    category: 'device',
    label: 'CPU logical cores',
    measured: cores !== null ? `${cores} cores` : 'Unavailable',
    threshold: '≥ 4 cores recommended',
    status: coresStatus,
    impactPoints: coresStatus === 'pass' ? 15 : coresStatus === 'warn' ? 10 : 4,
    maxPoints: 15,
    reason: coresStatus === 'pass' ? undefined : 'Fewer than 4 CPU cores may impact video encoding.',
  });

  const quota = env?.storage.quotaMb ?? null;
  const storageStatus: CheckStatus = quota === null ? 'warn' : quota >= 500 ? 'pass' : 'warn';
  checks.push({
    id: 'device_storage',
    category: 'device',
    label: 'Browser storage & display',
    measured: env ? `${env.display.width}×${env.display.height}${env.display.refreshHz ? ` · ${env.display.refreshHz} Hz` : ''}` : 'Not probed',
    threshold: '≥ 500 MB quota',
    status: storageStatus,
    impactPoints: storageStatus === 'pass' ? 15 : 10,
    maxPoints: 15,
  });

  // 3. Network (max 35)
  const rtt = net?.medianMs ?? null;
  const rttStatus: CheckStatus =
    rtt === null ? 'warn' : rtt <= thresholds.maxMedianMs ? 'pass' : rtt <= thresholds.maxMedianMs * 1.5 ? 'warn' : 'fail';
  checks.push({
    id: 'net_latency',
    category: 'network',
    label: 'Median RTT & jitter',
    measured: net && rtt !== null ? `${rtt} ms` : 'Not probed',
    measuredDetail: net && rtt !== null ? `Jitter ${net.jitterMs ?? '—'} ms` : undefined,
    threshold: `≤ ${thresholds.maxMedianMs} ms / jitter ≤ ${thresholds.maxJitterMs} ms`,
    status: rttStatus,
    impactPoints: rtt === null ? 0 : rttStatus === 'pass' ? 20 : rttStatus === 'warn' ? 12 : 4,
    maxPoints: 20,
    reason: rtt === null ? 'Run network diagnostics' : rttStatus === 'pass' ? undefined : `Latency ${rtt} ms exceeds ${thresholds.maxMedianMs} ms target.`,
  });

  const loss = net?.lossPct ?? null;
  const down = net?.downMbps ?? null;
  const netThroughputStatus: CheckStatus =
    !net
      ? 'warn'
      : loss !== null && loss > thresholds.maxLossPct
        ? 'fail'
        : down !== null && down < thresholds.minDownMbps
          ? 'warn'
          : 'pass';
  checks.push({
    id: 'net_loss_bw',
    category: 'network',
    label: 'Packet loss & throughput',
    measured: net ? `${net.lossPct}% loss · ${down ?? '—'} Mbps` : 'Not probed',
    threshold: `≤ ${thresholds.maxLossPct}% loss · ≥ ${thresholds.minDownMbps} Mbps`,
    status: netThroughputStatus,
    impactPoints: !net ? 0 : netThroughputStatus === 'pass' ? 15 : netThroughputStatus === 'warn' ? 8 : 2,
    maxPoints: 15,
    reason: !net ? 'Run network diagnostics' : netThroughputStatus === 'pass' ? undefined : 'Packet loss or throughput below profile bar.',
  });

  // 4. Peripherals (max 20)
  const micDeniedOrBlocked =
    periph.micPermission === 'denied' || periph.micPermission === 'unavailable' || periph.micPermission === 'unsupported';
  const micStatus: CheckStatus = !periph.micTested
    ? 'warn'
    : micDeniedOrBlocked
      ? 'fail'
      : periph.micClipping
        ? 'warn'
        : 'pass';
  checks.push({
    id: 'periph_mic',
    category: 'peripherals',
    label: 'Microphone signal & clipping',
    measured: !periph.micTested
      ? 'Not tested'
      : micDeniedOrBlocked
        ? periph.micPermission === 'denied'
          ? 'Permission denied'
          : 'No microphone'
        : `${periph.micRmsDb ?? '—'} dBFS · peak ${periph.micPeakPct}%`,
    measuredDetail: periph.micTested && !micDeniedOrBlocked && periph.micClipping ? 'Clipping detected' : undefined,
    threshold: 'Active mic, no clipping',
    status: micStatus,
    impactPoints: !periph.micTested ? 0 : micStatus === 'pass' ? 10 : micStatus === 'warn' ? 6 : 0,
    maxPoints: 10,
    reason: !periph.micTested
      ? 'Run live microphone check'
      : micDeniedOrBlocked
        ? 'Microphone permission denied or device unavailable.'
        : micStatus === 'pass'
          ? undefined
          : 'Microphone clipping detected.',
  });

  const cameraDenied =
    periph.cameraPermission === 'denied' || periph.cameraPermission === 'unavailable' || periph.cameraPermission === 'unsupported';
  const extraNeedMet =
    (!thresholds.needCamera || (periph.cameraTested && periph.cameraPermission === 'granted')) &&
    (!thresholds.needScreen || periph.screenShareSupported);
  const extraStatus: CheckStatus =
    !thresholds.needCamera && !thresholds.needScreen
      ? periph.speakerConfirmed === false
        ? 'fail'
        : 'pass'
      : (thresholds.needCamera && cameraDenied) || periph.speakerConfirmed === false
        ? 'fail'
        : extraNeedMet
          ? 'pass'
          : 'warn';
  const avMeasured = thresholds.needCamera
    ? periph.cameraPermission === 'denied'
      ? 'Camera denied'
      : periph.cameraPermission === 'unavailable'
        ? 'No camera found'
        : periph.cameraResolution || 'Camera not tested'
    : periph.speakerConfirmed === true
      ? 'Audible confirmed'
      : periph.speakerConfirmed === false
        ? 'Not audible'
        : 'Tone not confirmed';
  const avDetail = thresholds.needCamera
    ? [
        periph.speakerConfirmed === true ? 'Speaker OK' : null,
        thresholds.needScreen ? `Screen ${periph.screenShareTested ? 'OK' : periph.screenShareSupported ? 'Ready' : 'Blocked'}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined
    : undefined;
  checks.push({
    id: 'periph_av',
    category: 'peripherals',
    label: thresholds.needScreen ? 'Camera + screen share + speaker' : thresholds.needCamera ? 'Camera + speaker' : 'Speaker confirmation',
    measured: avMeasured,
    measuredDetail: avDetail,
    threshold: thresholds.needScreen ? 'Camera + DisplayMedia' : thresholds.needCamera ? 'Camera active' : 'Speaker audible',
    status: extraStatus,
    impactPoints: extraStatus === 'pass' ? 10 : extraStatus === 'warn' ? 5 : 0,
    maxPoints: 10,
    reason:
      extraStatus === 'pass'
        ? undefined
        : cameraDenied
          ? 'Camera permission denied or no camera available.'
          : 'Complete camera / speaker verification for this profile.',
  });

  const sumBy = (cat: CheckItem['category']) => {
    const items = checks.filter((c) => c.category === cat);
    return {
      score: items.reduce((a, b) => a + b.impactPoints, 0),
      max: items.reduce((a, b) => a + b.maxPoints, 0),
    };
  };

  const components = {
    device: sumBy('device'),
    network: sumBy('network'),
    browser: sumBy('browser'),
    peripherals: sumBy('peripherals'),
  };

  const score = checks.reduce((a, b) => a + b.impactPoints, 0);
  const hasFail = checks.some((c) => c.status === 'fail');
  const verdict: CheckStatus = hasFail || score < 60 ? 'fail' : score >= 85 ? 'pass' : 'warn';

  const deductions = checks
    .filter((c) => c.impactPoints < c.maxPoints && c.reason)
    .map((c) => ({
      label: c.label,
      points: c.maxPoints - c.impactPoints,
      reason: c.reason as string,
    }));

  return {
    profile,
    score,
    verdict,
    components,
    checks,
    deductions,
    measuredAt: new Date().toISOString(),
  };
}
