import { Module, forwardRef } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolsModule } from '../tools/tools.module';
import { PlacesModule } from '../places/places.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ToolsModule, PlacesModule, forwardRef(() => ChatModule)],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
