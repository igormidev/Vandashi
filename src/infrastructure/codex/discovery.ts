import { AppFault } from '../../domain/diagnostics';
import { z } from 'zod';
import type { AgentCapabilities, AgentStatus } from '../../domain/agent';
import type { ModelInfo } from '../../domain/models';
import type { RpcClient } from './transport';
import { array, modelInfo, modelPage, object, string } from './schemas';
import type { CodexModel } from './schemas';

export async function status(client: RpcClient, version: string): Promise<AgentStatus> {
  const response = object(await client.request('account/read', { refreshToken: false }));
  const account = object(response['account']);
  const authenticated = response['requiresOpenaiAuth'] !== true || typeof account['type'] === 'string';
  let usageAllowed: boolean | null = null;
  if (authenticated) {
    try {
      const limits = object(await client.request('account/rateLimits/read', {}));
      if (typeof limits['ordinaryUsageAllowed'] === 'boolean') usageAllowed = limits['ordinaryUsageAllowed'];
    } catch {
      /* Some API accounts do not expose subscription limits. */
    }
  }
  return {
    connected: true,
    authenticated,
    accountType: string(account['type']) || null,
    usageAllowed,
    version,
  };
}
export async function loadModels(client: RpcClient): Promise<{ models: ModelInfo[]; raw: CodexModel[] }> {
  const raw: CodexModel[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = modelPage.parse(
      await client.request('model/list', { limit: 100, includeHidden: false, cursor }),
    );
    raw.push(...page.data);
    cursor = page.nextCursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new AppFault({ id: 'codexModelCursorRepeated' });
      cursors.add(cursor);
    }
  } while (cursor);
  return { raw, models: raw.map(modelInfo) };
}
export async function loadCapabilities(client: RpcClient, cwd: string): Promise<AgentCapabilities> {
  const [skillsResponse, pluginsResponse] = await Promise.all([
    client.request('skills/list', { cwds: [cwd], forceReload: true }),
    client.request('plugin/installed', {}),
  ]);
  const skillSchema = z.object({
    name: z.string(),
    path: z.string(),
    description: z.string().default(''),
    enabled: z.boolean().optional(),
  });
  const skills = array(object(skillsResponse)['data'])
    .flatMap((entry) => array(object(entry)['skills']))
    .flatMap((entry) => {
      const skill = skillSchema.safeParse(entry);
      return skill.success && skill.data.enabled !== false ? [skill.data] : [];
    });
  const plugins = array(object(pluginsResponse)['marketplaces'])
    .flatMap((entry) => array(object(entry)['plugins']))
    .map((entry) => object(entry))
    .filter((entry) => entry['installed'] === true)
    .map((entry) => ({
      id: string(entry['id']),
      name: string(entry['name']),
      enabled: entry['enabled'] === true,
    }));
  let browserTools: string[] = [];
  try {
    browserTools = await browserCatalog(client);
  } catch {
    /* Missing or failed discovery must not be reported as browser readiness. */
  }
  return { skills, plugins, browserTools };
}
async function browserCatalog(client: RpcClient): Promise<string[]> {
  const tools: string[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = object(
      await client.request('mcpServerStatus/list', { cursor, limit: 100, detail: 'toolsAndAuthOnly' }),
    );
    for (const value of array(page['data'])) {
      const server = object(value);
      const name = string(server['name']);
      const names = Object.keys(object(server['tools']));
      if (server['toolsError'] || server['runtimeStatus'] === 'failed') continue;
      // Documentation servers and connector names alone do not prove browser control.
      const computer = name === 'cua_repl' && names.includes('js');
      const browser =
        names.includes('browser_navigate') &&
        names.includes('browser_snapshot') &&
        names.includes('browser_file_upload');
      if (computer || browser) tools.push(...names.map((tool) => `${name}.${tool}`));
    }
    cursor = string(page['nextCursor']) || null;
    if (cursor) {
      if (cursors.has(cursor)) throw new AppFault({ id: 'codexBrowserCursorRepeated' });
      cursors.add(cursor);
    }
  } while (cursor);
  return tools;
}
