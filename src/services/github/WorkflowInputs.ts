import { parse } from 'yaml';

export interface WorkflowInput {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'choice' | 'number' | 'environment';
  required: boolean;
  defaultValue: string;
  options: string[];
}

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

export function workflowInputValues(inputs: WorkflowInput[], values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(inputs.flatMap(input => {
    const value = Object.prototype.hasOwnProperty.call(values, input.name) ? values[input.name] : input.defaultValue;
    if (input.required && !value.trim()) throw new Error('dispatch.requiredInput');
    if (value && input.type === 'choice' && !input.options.includes(value)) throw new Error('dispatch.invalidInput');
    if (input.type === 'boolean' && !['true', 'false'].includes(value)) throw new Error('dispatch.invalidInput');
    if (value && input.type === 'number' && !Number.isFinite(Number(value))) throw new Error('dispatch.invalidInput');
    return value === '' ? [] : [[input.name, value]];
  }));
}

