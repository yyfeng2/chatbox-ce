import { t } from 'i18next'

export function getToolName(toolName: string, input?: unknown): string {
  // Use translation keys that i18next cli can detect
  const toolNames: Record<string, string> = {
    query_knowledge_base: t('Query Knowledge Base'),
    get_files_meta: t('Get Files Meta'),
    read_file_chunks: t('Read File Chunks'),
    list_files: t('List Files'),
    web_search: t('Web Search'),
    file_search: t('File Search'),
    code_search: t('Code Search'),
    terminal: t('Terminal'),
    create_file: t('Create File'),
    edit_file: t('Edit File'),
    delete_file: t('Delete File'),
    read_file: t('Read File'),
    write_file: t('Write File'),
    search_files: t('Search Files'),
    parse_link: t('Parse Link'),
    code_execution: t('Code Execution'),
    create_download: t('Create Download'),
    search_file_content: t('Search File Content'),
    sandbox_bash: t('Terminal'),
    sandbox_read: t('Read File'),
    sandbox_write: t('Write File'),
    sandbox_edit: t('Edit File'),
    sandbox_grep: t('Search File Content'),
    sandbox_ls: t('List Directory'),
    sandbox_find: t('Find Files'),
    load_skill: t('Load Skill'),
    install_skill: t('Install Skill'),
    user_exec: t('Run Command'),
    parse_file: t('Parse File'),
  }

  return toolNames[toolName] || toolName
}
