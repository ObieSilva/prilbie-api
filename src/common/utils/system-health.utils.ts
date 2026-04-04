export type HealthStatus = 'maintained' | 'healthy' | 'attention' | 'neglected';

const HEALTH_LABELS: Record<HealthStatus, string> = {
  maintained: 'Maintained',
  healthy: 'Healthy',
  attention: 'Needs attention',
  neglected: 'Neglected',
};

export function computeHealth(
  lastCheckinDate: string | undefined,
  today: string,
): { healthStatus: HealthStatus; healthLabel: string } {
  let status: HealthStatus = 'healthy';

  if (lastCheckinDate) {
    const diffMs =
      new Date(today).getTime() - new Date(lastCheckinDate).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (days <= 0) status = 'maintained';
    else if (days <= 2) status = 'healthy';
    else if (days <= 5) status = 'attention';
    else status = 'neglected';
  }

  return { healthStatus: status, healthLabel: HEALTH_LABELS[status] };
}
