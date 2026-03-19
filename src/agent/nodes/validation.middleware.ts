import { BaseMessage } from '@langchain/core/messages';
import {
  validateAgentOutput,
  extractTripJson,
  extractBudgetJson,
  getLastAiMessage,
} from '../nodes/validation.node';
import { ValidationResult, PlannedDay } from '../state';

export interface ValidationMiddlewareConfig {
  maxRetries?: number;
  maxDistanceKm?: number;
}

export interface ValidationMiddlewareResult {
  content: string;
  validation: ValidationResult;
  wasFixed: boolean;
}

export class ValidationMiddleware {
  private maxRetries: number;
  private maxDistanceKm: number;

  constructor(config: ValidationMiddlewareConfig = {}) {
    this.maxRetries = config.maxRetries ?? 2;
    this.maxDistanceKm = config.maxDistanceKm ?? 150;
  }

  async validate(
    messages: BaseMessage[],
    agentType:
      | 'trip_planner'
      | 'budget'
      | 'event'
      | 'recommend'
      | 'route'
      | 'unknown',
    validPlaceIds: Set<number>,
    validEventIds: Set<number>,
  ): Promise<ValidationMiddlewareResult> {
    const lastAiContent = getLastAiMessage(messages);

    if (!lastAiContent) {
      return {
        content: '',
        validation: { valid: true, errors: [] },
        wasFixed: false,
      };
    }

    const validation = validateAgentOutput(
      lastAiContent,
      agentType === 'unknown' ? 'recommend' : agentType,
      validPlaceIds,
      validEventIds,
    );

    if (validation.valid) {
      return {
        content: lastAiContent,
        validation,
        wasFixed: false,
      };
    }

    const fixedContent = this.fixContent(lastAiContent, validation.errors);

    return {
      content: fixedContent,
      validation,
      wasFixed: fixedContent !== lastAiContent,
    };
  }

  private fixContent(
    content: string,
    errors: ValidationResult['errors'],
  ): string {
    let fixedContent = content;

    for (const error of errors) {
      if (
        error.type === 'distant_place' ||
        error.type === 'invalid_thumbnail'
      ) {
        fixedContent = this.removeInvalidItems(fixedContent, error);
      }
    }

    return fixedContent;
  }

  private removeInvalidItems(
    content: string,
    error: ValidationResult['errors'][0],
  ): string {
    if (error.type === 'invalid_thumbnail' && error.value) {
      const invalidUrl = error.value as string;
      return content.replace(new RegExp(this.escapeRegex(invalidUrl), 'g'), '');
    }

    return content;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  detectAgentType(
    messages: BaseMessage[],
  ): 'trip_planner' | 'budget' | 'event' | 'recommend' | 'route' | 'unknown' {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      if (msg.getType() === 'ai') {
        const content = typeof msg.content === 'string' ? msg.content : '';

        if (content.includes('```json') && content.includes('"days"')) {
          return 'trip_planner';
        }

        if (
          content.includes('"categories"') &&
          content.includes('"allocated"')
        ) {
          return 'budget';
        }

        if (content.includes('"event_id"')) {
          return 'event';
        }

        if (content.includes('route') || content.includes('distance')) {
          return 'route';
        }

        return 'recommend';
      }
    }

    return 'unknown';
  }
}

export function createValidationMiddleware(
  config?: ValidationMiddlewareConfig,
): ValidationMiddleware {
  return new ValidationMiddleware(config);
}
