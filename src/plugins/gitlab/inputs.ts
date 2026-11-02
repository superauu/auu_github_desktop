import { parseAllDocuments } from 'yaml';
import type { WorkflowInput } from '@/services/collaboration/WorkflowInputs';
/** 解析 .gitlab-ci.yml 头部：typed inputs（spec.inputs）或旧式顶层 variables。 */
export function parsePipelineDefinition(content: string): { usesInputs: boolean; fields: WorkflowInput[] } {
  const documents = parseAllDocuments(content);
  if (documents.some(document => document.errors.length)) throw new Error('dispatch.invalidDefinition');
  const header = documents[0]?.toJS({ maxAliasCount: 50 }) ?? {};
  const usesInputs = !!header.spec?.inputs;
  const entries = header.spec?.inputs ?? header.variables ?? {};
  const fields = Object.entries(entries).flatMap(([name, value]) => {
    if (!value || typeof value !== 'object') return [];
    const input = value as Record<string, unknown>, options = Array.isArray(input.options) ? input.options.map(String) : [];
    const type: WorkflowInput['type'] = options.length ? 'choice' : input.type === 'boolean' ? 'boolean' : input.type === 'number' ? 'number' : 'string';
    return [{ name, description: String(input.description ?? ''), type, options,
      required: usesInputs && !Object.hasOwn(input, 'default'), defaultValue: String(input.default ?? input.value ?? (type === 'boolean' ? 'false' : '')) }];
  });
  return { usesInputs, fields };
}
export function parsePipelineInputs(content: string): WorkflowInput[] {
  return parsePipelineDefinition(content).fields;
}
