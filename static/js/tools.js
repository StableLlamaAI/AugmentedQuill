// Tool definitions for AI assistant
// These tools enable the AI to interact with the story project,
// providing context-aware assistance by allowing access to chapter information and content.
// This makes the AI more helpful for writing and editing tasks.

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_project_overview',
      description: 'Get the project title and a list of chapters with id, filename, title, and summary.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_chapter_content',
      description: 'Get a slice of chapter content by id with start and max_chars bounds.',
      parameters: {
        type: 'object',
        properties: {
          chap_id: { type: 'integer', description: 'Chapter numeric id (defaults to active chapter if omitted).' },
          start: { type: 'integer', default: 0 },
          max_chars: { type: 'integer', default: 2000 }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_summary',
      description: 'Generate or update the summary for a chapter.',
      parameters: {
        type: 'object',
        properties: {
          chap_id: { type: 'integer' },
          mode: { type: 'string', enum: ['update', 'discard'], description: 'Discard existing and write new, or update.' }
        },
        required: ['chap_id'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_chapter',
      description: 'Write the full chapter content from its summary for the given chap_id.',
      parameters: { type: 'object', properties: { chap_id: { type: 'integer' } }, required: ['chap_id'], additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'continue_chapter',
      description: 'Continue the chapter content from its current text, guided by the summary.',
      parameters: { type: 'object', properties: { chap_id: { type: 'integer' } }, required: ['chap_id'], additionalProperties: false }
    }
  }
];