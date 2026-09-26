import { z } from 'zod';
const version = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u)
  .max(80);
export const updateValidators = {
  getUpdateState: z.tuple([]),
  checkForUpdates: z.tuple([]),
  downloadUpdate: z.tuple([version]),
  applyUpdate: z.tuple([version]),
};
