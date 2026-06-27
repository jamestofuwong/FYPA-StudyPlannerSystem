export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface RiskFactor {
  id: string;
  severity: RiskSeverity;
  title: string;
  description: string;
  affectedUnits?: string[];
  data?: Record<string, unknown>;
}

export interface AtRiskReport {
  level: RiskSeverity;
  studentYear: number;
  factors: RiskFactor[];
  recommendedActions: string[];
  estimatedGraduationDeficit?: number;
}
