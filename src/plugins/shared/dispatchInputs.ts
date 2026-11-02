import { parse } from 'yaml';
import type { WorkflowInput } from '@/services/collaboration/WorkflowInputs';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Parse YAML 1.2 so the Actions `on` key remains a string. */
export function parseWorkflowInputs(content: string): WorkflowInput[] {
  const workflow: unknown = parse(content, { maxAliasCount: 50 });
  if (!object(workflow)) throw new Error('dispatch.invalidDefinition');
  const on = workflow.on;
  if (on === 'workflow_dispatch' || (Array.isArray(on) && on.includes('workflow_dispatch'))) return [];
  if (!object(on) || !Object.prototype.hasOwnProperty.call(on, 'workflow_dispatch')) throw new Error('dispatch.notManual');
  const dispatch = on.workflow_dispatch;
  if (dispatch == null) return [];
  if (!object(dispatch)) throw new Error('dispatch.invalidDefinition');
  const inputs = dispatch.inputs;
  if (inputs == null) return [];
  if (!object(inputs)) throw new Error('dispatch.invalidDefinition');
  return Object.entries(inputs).map(([name, input]) => {
    if (!object(input)) throw new Error('dispatch.invalidDefinition');
    const type = input.type ?? 'string';
    if (!['string', 'boolean', 'choice', 'number', 'environment'].includes(String(type))) throw new Error('dispatch.invalidDefinition');
    const options = input.options;
    if (type === 'choice' && (!Array.isArray(options) || !options.length || !options.every(option => typeof option === 'string'))) throw new Error('dispatch.invalidDefinition');
    const defaultValue = input.default == null ? (type === 'boolean' ? 'false' : '') : String(input.default);
    if (type === 'choice' && defaultValue && !(options as string[]).includes(defaultValue)) throw new Error('dispatch.invalidDefinition');
    if (type === 'boolean' && !['true', 'false'].includes(defaultValue)) throw new Error('dispatch.invalidDefinition');
    if (type === 'number' && defaultValue && !Number.isFinite(Number(defaultValue))) throw new Error('dispatch.invalidDefinition');
    return { name, description: String(input.description ?? ''), type: type as WorkflowInput['type'], required: input.required === true,
      defaultValue, options: type === 'choice' ? options as string[] : [] };
  });
}

