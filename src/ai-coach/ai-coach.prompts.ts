import type { HealthStatus } from '../common/utils/system-health.utils';

export type UserContext = {
  userName: string;
  systems: Array<{
    id: string;
    name: string;
    icon: string;
    areas: Array<{
      name: string;
      bundles: Array<{
        bundleTitle: string | null;
        baseline: string;
        normal: string;
        stretch: string;
      }>;
    }>;
  }>;
  streak: number;
  weeklyMomentum: number;
  systemHealth: Array<{
    systemName: string;
    status: HealthStatus;
    daysSinceLastCheckin: number | null;
  }>;
  recentCheckins: Array<{
    date: string;
    systemName: string;
    actionTitle: string;
    effortLevel: string;
  }>;
};

export function buildSystemPrompt(userData: UserContext): string {
  return `You are a consistency coach inside an app that helps people maintain life systems.

DOMAIN MODEL:
- A "System" is a life domain (e.g., Fitness, Learning, Business)
- Each System has "Areas" (sub-categories, e.g., "Cardio" under Fitness)
- Each Area has "Action Bundles" — three escalating effort levels:
  - Baseline: The minimum viable action on a bad day ("just show up")
  - Normal: A regular day's work
  - Stretch: Full energy, maximum effort
- Users check in daily by completing actions at their chosen energy level
- Momentum points: baseline=1, normal=3, stretch=5
- The goal is NEVER ZERO — even bad days get a baseline check-in

USER'S CURRENT STATE:
- Name: ${userData.userName}
- Systems: ${JSON.stringify(userData.systems)}
- Current streak: ${userData.streak} days
- Weekly momentum: ${userData.weeklyMomentum} points
- System health: ${JSON.stringify(userData.systemHealth)}
- Recent activity (last 14 days): ${JSON.stringify(userData.recentCheckins)}

GUIDELINES:
- Be encouraging but honest
- Focus on behavior, not outcomes
- Emphasize that baseline days protect streaks
- When suggesting systems/actions, make baselines genuinely easy (2-5 min max)
- When analyzing patterns, look for neglected systems and inconsistencies
- Never suggest more than 3-5 systems total to avoid overwhelm
- Keep responses concise and actionable`;
}

const VALID_ANCHORS = ['morning', 'midday', 'afternoon', 'evening', 'anytime'];

export function buildSuggestSystemsPrompt(
  goals: string,
  userData: UserContext,
): string {
  return `${buildSystemPrompt(userData)}

The user wants help building new systems. Based on their goals below, suggest 1-3 new life systems.

USER'S GOALS:
${goals}

Respond with ONLY valid JSON matching this schema (no markdown, no explanation outside JSON):
{
  "suggestions": [
    {
      "name": "string (1-100 chars)",
      "icon": "string (one of: fitness, writing, learning, business, health, music, coding, camera, creative, world, energy, focus, coffee, fire, star, launch, sun, book, house, bed, brain, leaf, meal, sprint, mail, phone, laptop, graduate, wallet, chart, calendar, clock, moon, cloud, umbrella, car, plane, train, ship, bicycle, dog, cat, baby, spa, tooth, physician, newspaper, film, gamepad, chess, brush, hammer, wrench, tree, mountain, water, snowflake, handshake, church, landmark, building, store, gift, creditcard, piggybank, scale, key, fingerprint, microphone, headphones, bookmark, map, compass, route, basketball, football, medal, crown, guitar, drum)",
      "replacedHabit": "string or omit",
      "areas": [
        {
          "name": "string (1-100 chars)",
          "bundles": [
            {
              "bundleTitle": "string (max 200 chars)",
              "baseline": { "title": "string (1-200 chars, genuinely easy 2-5 min)", "anchor": "${VALID_ANCHORS.join(' | ')}" },
              "normal":   { "title": "string (1-200 chars)", "anchor": "${VALID_ANCHORS.join(' | ')}" },
              "stretch":  { "title": "string (1-200 chars)", "anchor": "${VALID_ANCHORS.join(' | ')}" }
            }
          ]
        }
      ],
      "reasoning": "string explaining why this system fits the user"
    }
  ]
}`;
}

export function buildSuggestActionsPrompt(
  systemName: string,
  areas: string[],
  userData: UserContext,
  context?: string,
): string {
  return `${buildSystemPrompt(userData)}

The user wants new action bundles for their "${systemName}" system.
Current areas in this system: ${areas.join(', ')}
${context ? `Additional context from user: ${context}` : ''}

Suggest 1-3 new action bundles that fit naturally into the existing areas.

Respond with ONLY valid JSON matching this schema (no markdown, no explanation outside JSON):
{
  "suggestions": [
    {
      "bundleTitle": "string (max 200 chars)",
      "baseline": { "title": "string (1-200 chars, genuinely easy 2-5 min)", "anchor": "${VALID_ANCHORS.join(' | ')}" },
      "normal":   { "title": "string (1-200 chars)", "anchor": "${VALID_ANCHORS.join(' | ')}" },
      "stretch":  { "title": "string (1-200 chars)", "anchor": "${VALID_ANCHORS.join(' | ')}" },
      "reasoning": "string explaining why this bundle helps"
    }
  ]
}`;
}
