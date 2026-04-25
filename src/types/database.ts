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

// ==========================================
// Cases system types
// ==========================================

export type CaseStatus = 'draft' | 'analyzing' | 'needs_info' | 'ready' | 'completed';
export type CaseType = 'objection' | 'claim';
export type CaseStage = 'pre_court' | 'after_filing' | 'after_acceptance' | 'appeal' | 'cassation';
export type CaseStrategy = 'facts' | 'law' | 'procedural' | 'combined';
export type CaseDocumentType = 'pdf' | 'docx' | 'image' | 'text';
export type CaseMessageRole = 'user' | 'assistant' | 'system';
export type CaseMessageType = 'message' | 'clarification' | 'analysis' | 'document_upload' | 'document_generated' | 'quality_gate';
export type GeneratedDocumentType = 'objection_facts' | 'objection_law' | 'objection_procedural' | 'objection_combined';

export interface CaseAnalysis {
  qualification?: string;
  risks?: string[];
  strengths?: string[];
  weaknesses?: string[];
  recommended_strategy?: CaseStrategy;
  summary?: string;
  legal_basis?: string[];
}

export interface CaseEntities {
  plaintiff?: {
    name?: string;
    type?: PersonType;
    address?: string;
    inn?: string;
    ogrn?: string;
  };
  defendant?: {
    name?: string;
    type?: PersonType;
    address?: string;
    inn?: string;
    ogrn?: string;
  };
  court?: {
    name?: string;
    address?: string;
    case_number?: string;
  };
  claim_amount?: number;
  subject?: string;
  dates?: {
    claim_received?: string;
    hearing_date?: string;
    deadline?: string;
    incident_date?: string;
  };
}

export interface CaseMissingInfo {
  field: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CaseProbability {
  percentage?: number;
  level?: string;
  positive_factors?: string[];
  negative_factors?: string[];
}

export interface Case {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: CaseStatus;
  case_type: CaseType;
  stage?: CaseStage;
  strategy?: CaseStrategy;
  analysis: CaseAnalysis;
  entities: CaseEntities;
  missing_info: CaseMissingInfo[];
  similar_cases: CourtCase[];
  probability: CaseProbability;
  source_chat_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  user_id: string;
  file_name: string;
  file_type: CaseDocumentType;
  file_path: string;
  file_size: number;
  mime_type?: string;
  extracted_text?: string;
  analysis: {
    document_type?: string;
    key_facts?: string[];
    relevance_explanation?: string;
    dates_found?: string[];
    amounts_found?: string[];
  };
  is_relevant: boolean;
  created_at: string;
}

export interface CaseMessage {
  id: string;
  case_id: string;
  user_id: string;
  role: CaseMessageRole;
  content: string;
  message_type: CaseMessageType;
  attached_documents: string[];
  created_at: string;
}

export interface CaseGeneratedDocument {
  id: string;
  case_id: string;
  user_id?: string;
  document_type: GeneratedDocumentType;
  version: number;
  title: string;
  content: string;
  metadata: {
    legal_references?: string[];
    grounds?: string[];
    attachments_checklist?: string[];
    strategy_used?: CaseStrategy;
  };
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
      cases: {
        Row: Case;
        Insert: Omit<Case, 'id' | 'created_at' | 'updated_at' | 'analysis' | 'entities' | 'missing_info' | 'similar_cases' | 'probability'> & {
          analysis?: CaseAnalysis;
          entities?: CaseEntities;
          missing_info?: CaseMissingInfo[];
          similar_cases?: CourtCase[];
          probability?: CaseProbability;
        };
        Update: Partial<Omit<Case, 'id'>>;
      };
      case_documents: {
        Row: CaseDocument;
        Insert: Omit<CaseDocument, 'id' | 'created_at'>;
        Update: Partial<Omit<CaseDocument, 'id'>>;
      };
      case_messages: {
        Row: CaseMessage;
        Insert: Omit<CaseMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<CaseMessage, 'id'>>;
      };
      case_generated_documents: {
        Row: CaseGeneratedDocument;
        Insert: Omit<CaseGeneratedDocument, 'id' | 'created_at'>;
        Update: Partial<Omit<CaseGeneratedDocument, 'id'>>;
      };
    };
  };
};

