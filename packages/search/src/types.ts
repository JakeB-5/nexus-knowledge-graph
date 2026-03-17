export interface IndexedDocument {
  id: string;
  title: string;
  content: string;
  type: string;
  embedding?: number[];
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  types?: string[];
  minScore?: number;
}

export interface SearchHit {
  id: string;
  score: number;
  highlights: string[];
}

export interface SearchIndex {
  add(doc: IndexedDocument): void;
  remove(id: string): void;
  search(query: string, options?: SearchOptions): SearchHit[];
  size: number;
  clear(): void;
}
