import type { AgentThreadOptions } from '../../domain/agent';
import type { RpcClient } from './transport';
import { array, object, string } from './schemas';

/** Disable external tool integrations in read mode; OS file sandbox alone does not constrain MCP. */
export async function threadConfiguration(
  client: RpcClient,
  options: AgentThreadOptions,
): Promise<Record<string, unknown>> {
  const config: Record<string, unknown> = { 'features.multi_agent': false, 'features.multi_agent_v2': false };
  if (options.mode === 'read') {
    const [settings, installed] = await Promise.all([
      client.request('config/read', { cwd: options.cwd, includeLayers: false }),
      client.request('plugin/installed', {}),
    ]);
    const effective = object(object(settings)['config']);
    config['mcp_servers'] = Object.fromEntries(
      Object.entries(object(effective['mcp_servers'])).map(([name, settings]) => [
        name,
        {
          ...Object.fromEntries(Object.entries(object(settings)).filter(([, value]) => value !== null)),
          enabled: false,
        },
      ]),
    );
    const plugins = array(object(installed)['marketplaces']).flatMap((entry) =>
      array(object(entry)['plugins']),
    );
    config['plugins'] = Object.fromEntries(
      plugins.map((plugin) => [string(object(plugin)['id']), { enabled: false }]),
    );
    config['features.apps'] = false;
    config['apps'] = Object.fromEntries(
      ['_default', ...Object.keys(object(effective['apps']))].map((name) => [name, { enabled: false }]),
    );
    config['browser_use.enabled'] = false;
    config['computer_use.enabled'] = false;
  }
  return {
    cwd: options.cwd,
    model: options.selection.model,
    serviceTier: options.selection.fast ? 'priority' : null,
    runtimeWorkspaceRoots: options.writableRoots.length ? options.writableRoots : [options.cwd],
    sandbox: options.mode === 'read' ? 'read-only' : 'workspace-write',
    approvalPolicy: 'never',
    config,
  };
}
