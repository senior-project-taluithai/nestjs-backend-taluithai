import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { TravelPreferencesModule } from './travel-preferences/travel-preferences.module';
import { ProvincesModule } from './provinces/provinces.module';
import { CategoriesModule } from './categories/categories.module';
import { PlacesModule } from './places/places.module';
import { EventsModule } from './events/events.module';
import { FavoritesModule } from './favorites/favorites.module';
import { TripsModule } from './trips/trips.module';
import { MongoModule } from './mongo/mongo.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { ToolsModule } from './tools/tools.module';
import { AgentModule } from './agent/agent.module';
import { InteractionsModule } from './interactions/interactions.module';
import { ChatModule } from './chat/chat.module';
import { RoutePlannerModule } from './route-planner/route-planner.module';
import { HotelsModule } from './hotels/hotels.module';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        autoLoadEntities: true,
        synchronize: true,
        timezone: 'Asia/Bangkok',
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AuthModule,
    MailModule,
    TravelPreferencesModule,
    ProvincesModule,
    CategoriesModule,
    PlacesModule,
    EventsModule,
    FavoritesModule,
    HotelsModule,
    TripsModule,
    MongoModule,
    EmbeddingModule,
    ToolsModule,
    AgentModule,
    InteractionsModule,
    ChatModule,
    RoutePlannerModule,
    CacheModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
