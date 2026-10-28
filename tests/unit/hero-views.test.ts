// The views tools/render-hero.ts renders for the README image: each is a view the page can show,
// and the hash the script prints opens exactly that camera on the page.
import { describe, expect, it } from 'vitest';
import { viewCamera, ORBIT_LIMITS } from '../../src/ui/orbit.ts';
import { parseHash } from '../../src/ui/url-state.ts';
import { HERO, heroSettings, SOCIAL, viewHash, viewOrbit, VIEWS } from '../../tools/hero-views.ts';

describe('hero views', () => {
  const names = Object.keys(VIEWS) as (keyof typeof VIEWS)[];

  it.each(names)('%s: the printed hash opens the same camera on the page', (name) => {
    const parsed = parseHash(`#${viewHash(name)}`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.state.orbit).toEqual(viewOrbit(name));
    expect(heroSettings(name, HERO).camera).toEqual(viewCamera(parsed.state.orbit));
  });

  it.each(names)('%s: within the distances the page allows', (name) => {
    const { distance } = viewOrbit(name);
    expect(distance).toBeGreaterThanOrEqual(ORBIT_LIMITS.minDistance);
    expect(distance).toBeLessThanOrEqual(ORBIT_LIMITS.maxDistance);
  });

  it('renders the page scene: star sky, tone mapping, the default disk, 3 x 3 samples', () => {
    const s = heroSettings('default', HERO);
    expect([s.width, s.height, s.samplesPerAxis]).toEqual([1600, 900, 3]);
    expect([s.sky, s.mode, s.toneMapping, s.exposure, s.M]).toEqual([
      'stars',
      'colour',
      true,
      1,
      1,
    ]);
    expect(s.disk).not.toBeNull();
    expect([SOCIAL.width, SOCIAL.height]).toEqual([1280, 640]);
  });
});
