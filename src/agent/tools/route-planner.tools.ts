import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { RoutePlannerService } from '../../route-planner/route-planner.service';

export function createRoutePlannerTools(
  routePlannerService: RoutePlannerService,
): DynamicStructuredTool[] {
  const planRoute = new DynamicStructuredTool({
    name: 'planRoute',
    description:
      'Generate an optimized multi-day driving itinerary. Groups places into days ' +
      'using geographic clustering, optimizes visit order per day using OSRM TSP, ' +
      'and matches the closest hotel for each night. Returns per-day routes with ' +
      'distance/duration totals. Use after trip_planner has ' +
      'selected places and user has chosen hotels.',
    schema: z.object({
      user_location: z.object({
        latitude: z.number().describe('User latitude'),
        longitude: z.number().describe('User longitude'),
      }),
      destination_province: z
        .string()
        .describe('English name of destination province, e.g. "Trang"'),
      num_days: z
        .number()
        .int()
        .min(1)
        .max(14)
        .describe('Number of travel days'),
      places: z
        .array(
          z.object({
            name: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            pg_place_id: z.number().optional(),
            category: z.string().optional(),
          }),
        )
        .min(1)
        .describe('List of places from trip planner'),
      shortlisted_hotels: z
        .array(
          z.object({
            name: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            hotel_id: z.number().optional(),
            rating: z.number().optional(),
            price_range: z.string().optional(),
          }),
        )
        .min(1)
        .describe('List of shortlisted hotels'),
    }),
    func: async (input) => {
      try {
        const result = await routePlannerService.planRoute({
          user_location: input.user_location,
          destination_province: input.destination_province,
          num_days: input.num_days,
          places: input.places,
          shortlisted_hotels: input.shortlisted_hotels,
        });

        // Strip geometry to avoid token bloat — frontend gets it
        // via direct REST call to POST /route-planner/plan
        const lightweight = {
          itinerary: result.itinerary.map((day) => ({
            day: day.day,
            transit_advice: day.transit_advice,
            route: day.route,
            daily_distance_km: day.daily_distance_km,
            daily_duration_mins: day.daily_duration_mins,
          })),
          summary: result.summary,
        };

        return JSON.stringify(lightweight);
      } catch (error) {
        const err = error as Error;
        return JSON.stringify({
          error: `planRoute failed: ${err.message}`,
          details: err.stack,
        });
      }
    },
  });

  return [planRoute];
}
