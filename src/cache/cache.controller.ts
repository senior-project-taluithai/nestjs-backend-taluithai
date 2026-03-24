import { Controller, Post, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { clearCacheByPattern } from '../agent/utils/redis-cache';

@ApiTags('Cache')
@Controller('cache')
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  @Post('clear/osrm')
  @ApiOperation({
    summary: 'Clear OSRM route cache (admin endpoint)',
  })
  @ApiResponse({
    status: 200,
    description: 'OSRM cache cleared successfully',
  })
  async clearOsrmCache(): Promise<{
    cleared: boolean;
    keysDeleted: number;
    message: string;
  }> {
    this.logger.log('Clearing OSRM route cache...');
    const result = await clearCacheByPattern('osrm:*');
    this.logger.log(`OSRM cache clear result: ${result.message}`);
    return result;
  }

  @Post('clear/all')
  @ApiOperation({
    summary: 'Clear all cache (admin endpoint)',
  })
  @ApiResponse({
    status: 200,
    description: 'All cache cleared successfully',
  })
  async clearAllCache(): Promise<{
    cleared: boolean;
    keysDeleted: number;
    message: string;
  }> {
    this.logger.log('Clearing ALL cache...');
    const result = await clearCacheByPattern('*');
    this.logger.log(`All cache clear result: ${result.message}`);
    return result;
  }
}
