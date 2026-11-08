// The page's fixed display settings, which a visitor cannot see or change: the exposure and tone
// curve of the colour view, and the disk (docs/DESIGN.md, sections 10 and 17). src/ui/app.ts
// renders with them; the README, docs/PHYSICS.md section 10 and the About dialog state them, and
// tests/unit/disclosures.test.ts checks that the texts follow these values. Pure.
import { DEFAULT_DISK, type DiskSettings } from '../physics/index.ts';

export const PAGE_SCENE: {
  readonly exposure: number;
  readonly toneMapping: boolean;
  readonly disk: DiskSettings;
} = {
  exposure: 1,
  toneMapping: true,
  disk: DEFAULT_DISK,
};
