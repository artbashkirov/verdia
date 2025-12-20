// Supabase Database Types
// Таблица пользователей и генераций

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  plan: 'free' | 'pro';
  created_at: string;
  updated_at: string;
}

export interface Generation {
  id: string;
  user_id: string;
  query: string;
  response: GenerationResponse;
  created_at: string;
}

export interface GenerationResponse {
  courtCases: CourtCase[];
  shortAnswer: {
    title: string;
    content: string;
  };
  legalAnalysis: {
    title: string;
    intro: string;
    points: string[];
    bases: string[];
  };
  practiceAnalysis: {
    intro: string;
    satisfied: {
      title: string;
      points: string[];
    };
    rejected: {
      title: string;
      points: string[];
    };
  };
  probability: {
    level: string;
    factors: string[];
  };
  recommendations: string[];
  documents: Document[];
}

export interface CourtCase {
  id: number;
  title: string;
  url: string;
}

export interface Document {
  id: number;
  title: string;
  description: string;
  format: string;
  fileUrl?: string;
}

// Chat history item
export interface ChatHistoryItem {
  id: string;
  title: string;
  user_id: string;
  created_at: string;
}

// Database schema for Supabase
export type Database = {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id'>>;
      };
      generations: {
        Row: Generation;
        Insert: Omit<Generation, 'id' | 'created_at'>;
        Update: Partial<Omit<Generation, 'id'>>;
      };
      chat_history: {
        Row: ChatHistoryItem;
        Insert: Omit<ChatHistoryItem, 'id' | 'created_at'>;
        Update: Partial<Omit<ChatHistoryItem, 'id'>>;
      };
    };
  };
};

