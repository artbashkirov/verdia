import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export { openai };

export async function generateSearchQuery(userQuery: string): Promise<string> {
  const { SEARCH_QUERY_PROMPT } = await import('./prompts');
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SEARCH_QUERY_PROMPT },
      { role: 'user', content: userQuery }
    ],
    temperature: 0.3,
    max_tokens: 50,
  });

  return response.choices[0]?.message?.content?.trim() || userQuery;
}

export async function generateLegalResponse(
  userQuery: string, 
  courtCases: Array<{ 
    title: string; 
    url: string; 
    snippet: string; 
    court?: string;
    caseNumber?: string;
    isSearchLink?: boolean;
  }>
): Promise<string> {
  const { SYSTEM_PROMPT } = await import('./prompts');
  
  // Format court cases with all available info
  const courtCasesFormatted = courtCases.map((c, i) => ({
    id: i + 1,
    title: c.title,
    url: c.url,
    description: c.snippet,
    court: c.court || '',
    caseNumber: c.caseNumber || '',
    isSearchLink: c.isSearchLink ?? true,
  }));
  
  const hasRealCases = courtCases.some(c => !c.isSearchLink);
  
  const courtCasesContext = `
${hasRealCases ? 
`РЕАЛЬНЫЕ СУДЕБНЫЕ РЕШЕНИЯ по запросу (используй их для раздела courtCases):
Это конкретные судебные акты из базы sudact.ru, релевантные запросу пользователя.` : 
`ПОИСКОВЫЕ ССЫЛКИ (используй их для раздела courtCases):
Конкретные дела не найдены. Используй эти ссылки для раздела courtCases с isSearchLink: true.`}

${JSON.stringify(courtCasesFormatted, null, 2)}

Запрос пользователя: ${userQuery}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: courtCasesContext }
    ],
    temperature: 0.7,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  return response.choices[0]?.message?.content || '{}';
}
