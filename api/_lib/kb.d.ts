export interface KbEntry {
  id: string;
  category: string;
  href: string;
  title: {
    en: string;
    ar: string;
  };
  summary: {
    en: string;
    ar: string;
  };
  keywords: string[];
}

export const KNOWLEDGE_BASE: KbEntry[];
export function searchKnowledgeBase(query: string, limit?: number): KbEntry[];
