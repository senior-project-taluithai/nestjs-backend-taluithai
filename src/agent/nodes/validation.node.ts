import { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  ALLOWED_THUMBNAIL_HOSTS,
  ValidationResult,
  ValidationError,
  PlannedDay,
  BudgetBreakdown,
} from '../state';

const MAX_DISTANCE_KM = 150;

export function validatePlaceIds(
  placeIds: number[],
  validPlaceIds: Set<number>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const id of placeIds) {
    if (!validPlaceIds.has(id)) {
      errors.push({
        type: 'invalid_place_id',
        message: `Place ID ${id} not found in database`,
        value: id,
      });
    }
  }

  return errors;
}

export function validateDistances(
  days: PlannedDay[],
  maxDistanceKm = MAX_DISTANCE_KM,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const day of days) {
    const coords: Array<{ lat: number; lng: number }> = [];

    for (const item of day.items || []) {
      if (item.latitude && item.longitude) {
        coords.push({ lat: item.latitude, lng: item.longitude });
      }
    }

    if (coords.length < 2) continue;

    const centroidLat =
      coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
    const centroidLng =
      coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;

    for (const item of day.items || []) {
      if (!item.latitude || !item.longitude) continue;

      const distance = haversineKm(
        centroidLat,
        centroidLng,
        item.latitude,
        item.longitude,
      );

      if (distance > maxDistanceKm) {
        errors.push({
          type: 'distant_place',
          message: `Place "${item.name}" is ${distance.toFixed(1)}km from centroid (max: ${maxDistanceKm}km)`,
          value: item.name,
        });
      }
    }
  }

  return errors;
}

export function validateThumbnailUrls(
  thumbnailUrls: string[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const url of thumbnailUrls) {
    if (!url) continue;

    try {
      const parsed = new URL(url);
      if (
        parsed.protocol === 'https:' &&
        !ALLOWED_THUMBNAIL_HOSTS.has(parsed.hostname)
      ) {
        errors.push({
          type: 'invalid_thumbnail',
          message: `Thumbnail URL from disallowed host: ${parsed.hostname}`,
          value: url,
        });
      }
    } catch {
      errors.push({
        type: 'invalid_thumbnail',
        message: `Invalid thumbnail URL: ${url}`,
        value: url,
      });
    }
  }

  return errors;
}

const BudgetBreakdownSchema = z.object({
  total: z.number().optional(),
  suggested_spent: z.number().optional(),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      allocated: z.number(),
      spent: z.number(),
    }),
  ),
  dailyBudgets: z
    .array(
      z.object({
        day: z.number(),
        allocated: z.number(),
        spent: z.number(),
      }),
    )
    .optional(),
  expenses: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        amount: z.number(),
        categoryId: z.string(),
        day: z.number(),
      }),
    )
    .optional(),
});

export function validateBudgetSchema(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  const result = BudgetBreakdownSchema.safeParse(data);

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        type: 'invalid_schema',
        message: `Budget validation error: ${issue.message} at ${issue.path.join('.')}`,
        field: issue.path.join('.'),
      });
    }
  }

  return errors;
}

export function validateEventIds(
  eventIds: number[],
  validEventIds: Set<number>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const id of eventIds) {
    if (!validEventIds.has(id)) {
      errors.push({
        type: 'invalid_event_id',
        message: `Event ID ${id} not found in database`,
        value: id,
      });
    }
  }

  return errors;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function extractTripJson(content: string): PlannedDay[] | null {
  const regex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed?.days)) {
        return parsed.days as PlannedDay[];
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return null;
}

export function extractBudgetJson(content: string): BudgetBreakdown | null {
  const regex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === 'object' && 'categories' in parsed) {
        return parsed as BudgetBreakdown;
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return null;
}

export function validateAgentOutput(
  content: string,
  agentType: 'trip_planner' | 'budget' | 'event' | 'recommend' | 'route',
  validPlaceIds: Set<number>,
  validEventIds: Set<number>,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (agentType === 'trip_planner' || agentType === 'route') {
    const tripDays = extractTripJson(content);

    if (tripDays) {
      const allPlaceIds: number[] = [];
      const allThumbnailUrls: string[] = [];

      for (const day of tripDays) {
        for (const item of day.items || []) {
          if (item.pg_place_id) {
            allPlaceIds.push(item.pg_place_id);
          }
          if (item.thumbnail_url) {
            allThumbnailUrls.push(item.thumbnail_url);
          }
        }
      }

      errors.push(...validatePlaceIds(allPlaceIds, validPlaceIds));
      errors.push(...validateDistances(tripDays));
      errors.push(...validateThumbnailUrls(allThumbnailUrls));
    }
  }

  if (agentType === 'budget') {
    const budget = extractBudgetJson(content);

    if (budget) {
      errors.push(...validateBudgetSchema(budget));
    }
  }

  if (agentType === 'event') {
    const tripDays = extractTripJson(content);

    if (tripDays) {
      const allEventIds: number[] = [];
      const allThumbnailUrls: string[] = [];

      for (const day of tripDays) {
        for (const item of day.items || []) {
          if (item.event_id) {
            allEventIds.push(item.event_id);
          }
          if (item.thumbnail_url) {
            allThumbnailUrls.push(item.thumbnail_url);
          }
        }
      }

      errors.push(...validateEventIds(allEventIds, validEventIds));
      errors.push(...validateThumbnailUrls(allThumbnailUrls));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getLastAiMessage(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.getType() === 'ai' && typeof msg.content === 'string') {
      return msg.content;
    }
  }
  return null;
}
