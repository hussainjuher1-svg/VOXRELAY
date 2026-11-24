import { describe, expect, it } from 'vitest';
import { parseUserAgent, scoreReadiness } from '../src/lib/diagnostics';

describe('Diagnostics & Readiness Scoring', () => {
  it('parses browser and OS user agents cleanly', () => {
    const res = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    expect(res.browserName).toBe('Google Chrome');
    expect(res.osName).toBe('Windows 10/11');
  });

  it('computes 100/100 pass for healthy Voice+Video environment and deducts points when network latency exceeds threshold', () => {
    const env = {
      browserName: 'Google Chrome',
      browserVersion: '131.0',
      engine: 'Blink',
      osName: 'Windows 10/11',
      platform: 'Win32',
      features: { webRtc: true, getUserMedia: true, audioContext: true, displayMedia: true, webSocket: true },
      hardware: { cpuCores: 8, deviceMemoryGb: 16, gpuRenderer: 'ANGLE', batteryPct: 90, batteryCharging: true },
      display: { width: 1920, height: 1080, dpr: 1, refreshHz: 60 },
      storage: { quotaMb: 4000, usageMb: 12 },
      codecs: { opus: true, vp8: true, vp9: true, av1: false, h264: true },
      webrtc: { supported: true, iceCandidatesGathered: 3, gatheringMs: 42, candidateTypes: ['host'] },
      devices: { microphones: 1, cameras: 1, speakers: 1 },
      measuredAt: new Date().toISOString(),
    };
    const periph = {
      micTested: true,
      micPermission: 'granted',
      micRmsDb: -22,
      micPeakPct: 44,
      micClipping: false,
      micSampleRate: 48000,
      cameraTested: true,
      cameraPermission: 'granted',
      cameraResolution: '1280×720',
      cameraFps: 30,
      speakerConfirmed: true,
      screenShareSupported: true,
      screenShareTested: false,
    };

    const goodNet = {
      probesSent: 12,
      probesSucceeded: 12,
      medianMs: 32,
      p95Ms: 48,
      jitterMs: 4,
      lossPct: 0,
      downMbps: 25,
      upMbps: 12,
      dnsEstimateMs: 5,
      measuredAt: new Date().toISOString(),
    };
    const passResult = scoreReadiness(env, goodNet, periph, 'video');
    expect(passResult.score).toBe(100);
    expect(passResult.verdict).toBe('pass');

    const badNet = { ...goodNet, medianMs: 280, lossPct: 5, downMbps: 0.4 };
    const failResult = scoreReadiness(env, badNet, periph, 'video');
    expect(failResult.score).toBeLessThan(80);
    expect(failResult.verdict).toBe('fail');
    expect(failResult.deductions.length).toBeGreaterThan(0);

    const deniedCam = scoreReadiness(
      env,
      goodNet,
      { ...periph, cameraPermission: 'denied', cameraResolution: 'Denied' },
      'video'
    );
    const avCheck = deniedCam.checks.find((c) => c.id === 'periph_av');
    expect(avCheck?.status).toBe('fail');
    expect(avCheck?.impactPoints).toBe(0);
  });
});
