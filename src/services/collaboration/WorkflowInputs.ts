
export interface WorkflowInput {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'choice' | 'number' | 'environment';
  required: boolean;
  defaultValue: string;
  options: string[];
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

