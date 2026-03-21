import { Module, forwardRef } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolsModule } from '../tools/tools.module';
import { PlacesModule } from '../places/places.module';
import { ChatModule } from '../chat/chat.module';
import { HotelsModule } from '../hotels/hotels.module';
import { RoutePlannerModule } from '../route-planner/route-planner.module';

@Module({
  imports: [
    ToolsModule,
    PlacesModule,
    HotelsModule,
    RoutePlannerModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
