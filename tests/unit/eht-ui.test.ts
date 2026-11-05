// The EHT-style view on the page (docs/DESIGN.md, section 16): its camera, labels, legend text,
// accessible name and file name. The labels say false colour and that the view is not a
// simulation of the EHT observation, wherever the image appears.
import { describe, expect, it } from 'vitest';
import { ehtBeamFwhmM, ehtFieldOfView, M87_SKY_ROLL_DEG } from '../../src/physics/index.ts';
import { sceneSummary } from '../../src/ui/describe.ts';
import {
  EHT_PRESET,
  EHT_PRESET_LABEL,
  beamMarker,
  EHT_RAMP_LABEL,
  ehtLegendLines,
  rampColours,
  wrapText,
} from '../../src/ui/eht-legend.ts';
import { initialOrbit, viewCamera } from '../../src/ui/orbit.ts';
import { screenshotName } from '../../src/ui/screenshot-name.ts';
import { legendEntries } from '../../src/ui/legend-entries.ts';
import { VIEW_MODES } from '../../src/ui/view-state.ts';

describe('EHT-style view: camera', () => {
  it('frames the ring and turns north up, at any distance and aspect', () => {
    for (const distance of [5, 30, 200]) {
      for (const aspect of [16 / 9, 9 / 16]) {
        const c = viewCamera({ ...initialOrbit, distance }, 'eht', aspect);
        expect(c.fovYDeg).toBe(ehtFieldOfView(distance, aspect));
        expect(c.rollDeg).toBe(M87_SKY_ROLL_DEG);
      }
    }
  });

  it('leaves the other views as they were (no roll, automatic field of view)', () => {
    for (const view of VIEW_MODES.filter((v) => v !== 'eht')) {
      expect(viewCamera(initialOrbit, view, 16 / 9)).toEqual(viewCamera(initialOrbit));
      expect(viewCamera(initialOrbit, view, 16 / 9).rollDeg).toBeUndefined();
    }
  });

  it('the preset is 200 M, 73 degrees below the disk (17 degrees from its axis), azimuth 0', () => {
    expect(EHT_PRESET).toEqual({ distance: 200, azimuthDeg: 0, elevationDeg: -73 });
    expect(EHT_PRESET_LABEL).toBe('Tilt 17°, as for M87*');
    expect(EHT_PRESET_LABEL).not.toMatch(/^M87\*$/);
  });
});

describe('EHT-style view: labels', () => {
  it('says false colour, the resolution it is blurred to, and that it is not a simulation', () => {
    const lines = ehtLegendLines({ distance: 200, disk: true });
    expect(EHT_RAMP_LABEL).toMatch(/False colour/);
    const text = lines.join(' ');
    expect(text).toContain('Not a simulation of the EHT observation');
    expect(text).toContain(`${ehtBeamFwhmM().toFixed(1)} M`);
    expect(text).toContain('north is up');
    expect(text).toMatch(/hot, tenuous gas/);
    // M87*'s gas is never called thin without saying how: it is a thick flow, the toy disk is thin.
    expect(text).not.toMatch(/\bthin gas\b/);
    expect(text).not.toContain('distant observer');
  });

  it('adds the distant-observer caveat below 100 M and a note when the disk is off', () => {
    expect(ehtLegendLines({ distance: 99, disk: true }).join(' ')).toContain('distant observer');
    expect(ehtLegendLines({ distance: 200, disk: false })[0]).toBe(
      'Disk off: nothing emits in this view.',
    );
  });

  it('wraps text for the saved image without losing or splitting words', () => {
    const text = 'Blurred to the 20 μas resolution of the 2019 M87* images, scaled to this hole.';
    const lines = wrapText(text, 30);
    expect(lines.join(' ')).toBe(text);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(30);
    expect(wrapText('short', 30)).toEqual(['short']);
    expect(wrapText('averyveryverylongwordthatcannotbreak here', 10)[0]).toBe(
      'averyveryverylongwordthatcannotbreak',
    );
  });

  it('the ramp runs from black through red, orange and yellow to white', () => {
    const c = rampColours(5);
    expect(c[0]).toBe('rgb(0, 0, 0)');
    expect(c[2]).toBe('rgb(255, 128, 0)');
    expect(c[4]).toBe('rgb(255, 255, 255)');
  });

  it('the saved image carries the ramp and every label line', () => {
    const entries = legendEntries([], 'eht', { distance: 200, disk: true });
    expect(entries[0]).toMatchObject({ kind: 'ramp', label: EHT_RAMP_LABEL });
    const text = entries
      .filter((e) => e.kind === 'text')
      .map((e) => e.label)
      .join(' ');
    for (const line of ehtLegendLines({ distance: 200, disk: true })) expect(text).toContain(line);
  });

  it('the accessible name keeps "Black hole" and says false colour', () => {
    const name = sceneSummary({
      distance: 200,
      azimuthDeg: 0,
      elevationDeg: -73,
      disk: true,
      view: 'eht',
      overlays: [],
    });
    expect(name).toMatch(/^Black hole/);
    expect(name).toContain('EHT-style view, false colour, blurred to the EHT resolution');
  });

  it('saved files end in -eht', () => {
    expect(screenshotName({ distance: 200, azimuthDeg: 0, elevationDeg: -73, view: 'eht' })).toBe(
      'photonring-r200-az0-el-73-eht.png',
    );
  });
});

describe('EHT-style view: beam marker', () => {
  it('sits at the upper left of the framing square, clear of the ring, when that is in the image', () => {
    const W = 1280;
    const H = 720;
    const fov = ehtFieldOfView(200, W / H);
    const b = beamMarker(200, W, H, Math.tan((fov * Math.PI) / 360))!;
    const s = H / 56; // the framing puts 28 M in the half-height
    expect(b.r).toBeCloseTo((ehtBeamFwhmM() * s) / 2, 6);
    expect(b.cx).toBeCloseTo(W / 2 - 21 * s, 6);
    expect(b.cy).toBeCloseTo(H / 2 - 21 * s, 6);
  });

  it('stays inside the image with its label when the camera is close or the screen is tall', () => {
    for (const [W, H] of [
      [1280, 720],
      [390, 844],
    ] as const) {
      for (const distance of [5, 8, 10, 14, 20, 25, 30, 60, 200]) {
        const fov = ehtFieldOfView(distance, W / H);
        const b = beamMarker(distance, W, H, Math.tan((fov * Math.PI) / 360));
        if (b === null) continue;
        expect(b.cx - b.r).toBeGreaterThan(0);
        expect(b.cy - b.r).toBeGreaterThan(0);
        expect(b.cx + b.r).toBeLessThan(W);
        // Room for the label under the circle.
        expect(b.cy + b.r + 0.04 * Math.min(W, H)).toBeLessThan(H);
      }
    }
  });

  it('is left out when the beam is wider than the image can show', () => {
    const fov = ehtFieldOfView(5, 16 / 9);
    expect(beamMarker(5, 1280, 720, Math.tan((fov * Math.PI) / 360))).toBeNull();
  });
});
