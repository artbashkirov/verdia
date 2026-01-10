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
    probability?: {
      percentage: number;
      level: string;
      casesWithResult?: number;
      totalCases?: number;
      satisfied?: number;
      partial?: number;
      rejected?: number;
      unknown?: number;
    };
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
    percentage?: number;
    level: string;
    factors?: string[];
    positiveFactors?: string[];
    negativeFactors?: string[];
    casesWithResult?: number;
    totalCases?: number;
    satisfied?: number;
    partial?: number;
    rejected?: number;
    unknown?: number;
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
  generation_id?: string | null;
  created_at: string;
}

// User profile (plaintiff data)
export type PersonType = 'individual' | 'entrepreneur' | 'legal_entity';

export interface UserProfile {
  id: string;
  user_id: string;
  person_type: PersonType;
  // Для физлица
  full_name?: string;
  passport_series?: string;
  passport_number?: string;
  passport_issued_by?: string;
  passport_issue_date?: string;
  birth_date?: string;
  // Для ИП
  ogrnip?: string;
  inn_individual?: string;
  // Для юрлица
  company_name?: string;
  company_form?: string;
  ogrn?: string;
  inn_legal?: string;
  kpp?: string;
  // Адреса
  registration_address?: string;
  registration_city?: string;
  registration_region?: string;
  actual_address?: string;
  // Контакты
  phone?: string;
  email_contact?: string;
  // Банковские реквизиты
  bank_name?: string;
  bank_bik?: string;
  bank_account?: string;
  bank_corr_account?: string;
  // Метаданные
  created_at: string;
  updated_at: string;
}

// Saved defendant
export interface SavedDefendant {
  id: string;
  user_id: string;
  defendant_type: PersonType;
  name: string;
  inn?: string;
  ogrn?: string;
  registration_address?: string;
  registration_city?: string;
  registration_region?: string;
  court_cases_count?: number;
  cases_lost_count?: number;
  last_search_at?: string;
  search_results?: DefendantSearchResults;
  created_at: string;
  updated_at: string;
}

export interface DefendantSearchResults {
  cases: Array<{
    title: string;
    url: string;
    court?: string;
    date?: string;
    result?: string;
  }>;
  total_cases: number;
  satisfaction_rate: number;
  last_updated: string;
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
        Insert: Omit<ChatHistoryItem, 'id' | 'created_at'> & { generation_id?: string | null };
        Update: Partial<Omit<ChatHistoryItem, 'id'>>;
      };
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserProfile, 'id'>>;
      };
      saved_defendants: {
        Row: SavedDefendant;
        Insert: Omit<SavedDefendant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SavedDefendant, 'id'>>;
      };
    };
  };
};

