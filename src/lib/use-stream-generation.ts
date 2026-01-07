'use client';

import { useState, useCallback } from 'react';

interface StreamState {
  status: string;
  courtCases: any[] | null;
  shortAnswer: any | null;
  legalAnalysis: any | null;
  practiceAnalysis: any | null;
  probability: any | null;
  recommendations: string[] | null;
  generationId: string | null;
  error: string | null;
  isComplete: boolean;
}

const initialState: StreamState = {
  status: '',
  courtCases: null,
  shortAnswer: null,
  legalAnalysis: null,
  practiceAnalysis: null,
  probability: null,
  recommendations: null,
  generationId: null,
  error: null,
  isComplete: false,
};

export function useStreamGeneration() {
  const [state, setState] = useState<StreamState>(initialState);
  const [isLoading, setIsLoading] = useState(false);

  const generate = useCallback(async (query: string) => {
    setIsLoading(true);
    setState(initialState);

    try {
      const response = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error('Ошибка запроса');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Нет данных');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (currentEvent) {
                case 'status':
                  setState(s => ({ ...s, status: data.message }));
                  break;
                case 'courtCases':
                  setState(s => ({ ...s, courtCases: data.cases }));
                  break;
                case 'shortAnswer':
                  setState(s => ({ ...s, shortAnswer: data }));
                  break;
                case 'legalAnalysis':
                  setState(s => ({ ...s, legalAnalysis: data }));
                  break;
                case 'practiceAnalysis':
                  setState(s => ({ ...s, practiceAnalysis: data }));
                  break;
                case 'probability':
                  setState(s => ({ ...s, probability: data }));
                  break;
                case 'recommendations':
                  setState(s => ({ ...s, recommendations: data }));
                  break;
                case 'complete':
                  setState(s => ({ ...s, generationId: data.id, isComplete: true }));
                  break;
                case 'error':
                  setState(s => ({ ...s, error: data.message }));
                  break;
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
            currentEvent = '';
          }
        }
      }

    } catch (error) {
      setState(s => ({ 
        ...s, 
        error: error instanceof Error ? error.message : 'Произошла ошибка' 
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
    setIsLoading(false);
  }, []);

  return {
    ...state,
    isLoading,
    generate,
    reset,
  };
}

