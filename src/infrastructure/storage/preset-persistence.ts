import { AppFault } from '../../domain/diagnostics';
import type { PresetSave, Scope, Workspace } from '../../domain/models';
import type { GitPort } from '../../domain/storage';
import type { Registry } from './registry';
import type { ManualMutation } from './manual-mutation';
import type { SerialQueue } from './files';
import { ensurePresetRepository, savePreset } from './presets';
export class PresetPersistence {
  constructor(
    private readonly registry: Registry,
    private readonly git: GitPort,
    private readonly manual: ManualMutation,
    private readonly writes: SerialQueue,
    private readonly hydrate: (scope: Scope) => Promise<Workspace>,
  ) {}
  prepare = (scope: Scope): Promise<void> =>
    this.writes.run(async () => {
      const brand = (await this.registry.state()).brands.find((entry) => entry.id === scope.brandId);
      if (!brand) throw new AppFault({ id: 'storageBrandMissing' });
      await ensurePresetRepository(brand.path, brand.id, this.git, this.manual);
    });
  ensure = async (scope: Scope): Promise<Workspace> => {
    await this.prepare(scope);
    return this.hydrate(scope);
  };
  save = (input: PresetSave): Promise<Workspace> =>
    this.writes.run(async () => {
      const brand = (await this.registry.state()).brands.find((entry) => entry.id === input.scope.brandId);
      if (!brand) throw new AppFault({ id: 'storageBrandMissing' });
      await savePreset(brand.path, brand.id, this.git, this.manual, input);
      return this.hydrate(input.scope);
    });
}
