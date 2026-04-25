import type { CaseAnalysis, CaseEntities, CaseMissingInfo } from '@/types/database';

export interface QualityGateResult {
  passed: boolean;
  gates: QualityGate[];
  critical_failures: string[];
}

export interface QualityGate {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  severity: 'critical' | 'warning' | 'info';
  message?: string;
}

export function checkQualityGates(params: {
  analysis: CaseAnalysis;
  entities: CaseEntities;
  missingInfo: CaseMissingInfo[];
  documentsCount: number;
  extractedTextsAvailable: boolean;
}): QualityGateResult {
  const gates: QualityGate[] = [];

  gates.push(checkSubjectOfClaim(params.entities));
  gates.push(checkDocumentBasis(params.documentsCount, params.extractedTextsAvailable));
  gates.push(checkJurisdictionConflict(params.analysis, params.entities));
  gates.push(checkStatuteOfLimitations(params.analysis));
  gates.push(checkDebtAdmission(params.analysis));
  gates.push(checkContradictions(params.analysis));
  gates.push(checkMinimalData(params.entities, params.missingInfo));
  gates.push(checkClaimantEvidence(params.analysis));
  gates.push(checkClaimAmountCalculation(params.analysis));

  const criticalFailures = gates
    .filter(g => !g.passed && g.severity === 'critical')
    .map(g => g.message || g.description);

  return {
    passed: criticalFailures.length === 0,
    gates,
    critical_failures: criticalFailures,
  };
}

function checkSubjectOfClaim(entities: CaseEntities): QualityGate {
  const hasSubject = !!entities.subject && entities.subject.trim().length > 0;

  return {
    id: 'subject_of_claim',
    name: 'Предмет требований',
    description: 'Проверка наличия предмета исковых требований',
    passed: hasSubject,
    severity: 'critical',
    message: hasSubject
      ? undefined
      : 'Не определен предмет исковых требований. Загрузите исковое заявление или опишите, чего требует истец.',
  };
}

function checkDocumentBasis(documentsCount: number, textsAvailable: boolean): QualityGate {
  const hasBasis = documentsCount > 0 && textsAvailable;

  return {
    id: 'document_basis',
    name: 'Документы-основания',
    description: 'Проверка наличия документов, обосновывающих позицию',
    passed: hasBasis,
    severity: 'critical',
    message: hasBasis
      ? undefined
      : 'Не загружены документы-основания. Для подготовки возражения необходимо как минимум исковое заявление.',
  };
}

function checkJurisdictionConflict(analysis: CaseAnalysis, entities: CaseEntities): QualityGate {
  const hasConflict = analysis.risks?.some(r =>
    r.toLowerCase().includes('подсудност') || r.toLowerCase().includes('юрисдикц')
  );
  const courtKnown = !!entities.court?.name;

  return {
    id: 'jurisdiction',
    name: 'Подсудность',
    description: 'Проверка отсутствия конфликта подсудности',
    passed: !hasConflict,
    severity: hasConflict ? 'warning' : 'info',
    message: hasConflict
      ? `Обнаружен возможный конфликт подсудности.${courtKnown ? ` Указан суд: ${entities.court!.name}.` : ''} Проверьте правильность определения суда.`
      : undefined,
  };
}

function checkStatuteOfLimitations(analysis: CaseAnalysis): QualityGate {
  const hasRisk = analysis.risks?.some(r =>
    r.toLowerCase().includes('срок') && (r.toLowerCase().includes('пропуск') || r.toLowerCase().includes('истек') || r.toLowerCase().includes('давност'))
  );

  return {
    id: 'statute_of_limitations',
    name: 'Сроки',
    description: 'Проверка возможного пропуска срока',
    passed: !hasRisk,
    severity: 'warning',
    message: hasRisk
      ? 'Обнаружен возможный пропуск срока исковой давности или процессуального срока. Уточните даты.'
      : undefined,
  };
}

function checkDebtAdmission(analysis: CaseAnalysis): QualityGate {
  const hasRisk = analysis.risks?.some(r =>
    r.toLowerCase().includes('признани') && (r.toLowerCase().includes('долг') || r.toLowerCase().includes('вин'))
  );

  return {
    id: 'debt_admission',
    name: 'Признание долга/вины',
    description: 'Проверка отсутствия непреднамеренного признания долга или вины',
    passed: !hasRisk,
    severity: 'critical',
    message: hasRisk
      ? 'Обнаружены признаки возможного признания долга/вины без явного подтверждения пользователя. Это может ослабить позицию.'
      : undefined,
  };
}

function checkContradictions(analysis: CaseAnalysis): QualityGate {
  const hasContradictions = analysis.risks?.some(r =>
    r.toLowerCase().includes('противореч')
  );

  return {
    id: 'contradictions',
    name: 'Внутренние противоречия',
    description: 'Проверка отсутствия противоречий в позиции',
    passed: !hasContradictions,
    severity: 'critical',
    message: hasContradictions
      ? 'Обнаружены внутренние противоречия в позиции. Необходимо устранить перед генерацией документа.'
      : undefined,
  };
}

function checkMinimalData(entities: CaseEntities, missingInfo: CaseMissingInfo[]): QualityGate {
  const criticalMissing = missingInfo.filter(m => m.priority === 'high');
  const hasPlaintiff = !!entities.plaintiff?.name;
  const hasDefendant = !!entities.defendant?.name;

  const passed = hasPlaintiff && hasDefendant && criticalMissing.length === 0;

  return {
    id: 'minimal_data',
    name: 'Минимальный набор данных',
    description: 'Проверка наличия минимально необходимых данных',
    passed,
    severity: 'critical',
    message: passed
      ? undefined
      : `Не хватает критически важных данных: ${[
        !hasPlaintiff && 'данные истца',
        !hasDefendant && 'данные ответчика',
        ...criticalMissing.map(m => m.description),
      ].filter(Boolean).join(', ')}.`,
  };
}

function checkClaimantEvidence(analysis: CaseAnalysis): QualityGate {
  const risks = analysis.risks || [];
  const strengths = analysis.strengths || [];
  const text = [...risks, ...strengths].join(' ').toLowerCase();
  const hasTopic =
    text.includes('доказательств') &&
    (text.includes('истец') || text.includes('истца') || text.includes('недостаточ') || text.includes('отсутств'));

  return {
    id: 'claimant_evidence',
    name: 'Доказательства истца',
    description: 'Недостаточность доказательств истца — возможное основание для возражения',
    passed: true,
    severity: 'info',
    message: hasTopic
      ? 'Выявлена слабость позиции истца по доказательствам — можно использовать в возражении.'
      : undefined,
  };
}

function checkClaimAmountCalculation(analysis: CaseAnalysis): QualityGate {
  const risks = analysis.risks || [];
  const strengths = analysis.strengths || [];
  const text = [...risks, ...strengths].join(' ').toLowerCase();
  const hasTopic =
    (text.includes('цен') && text.includes('иск')) ||
    (text.includes('расчет') && text.includes('иск')) ||
    (text.includes('сумм') && (text.includes('необоснован') || text.includes('неправиль') || text.includes('ошибк')));

  return {
    id: 'claim_amount',
    name: 'Расчёт цены иска',
    description: 'Необоснованный расчёт цены иска — возможное основание для возражения (ст. 91 ГПК РФ)',
    passed: true,
    severity: 'info',
    message: hasTopic
      ? 'Выявлены сомнения в расчёте цены иска — можно оспорить в возражении.'
      : undefined,
  };
}
