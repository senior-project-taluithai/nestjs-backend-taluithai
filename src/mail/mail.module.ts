import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import * as nodemailer from 'nodemailer';

@Module({
  imports: [ConfigModule],
  providers: [
    MailService,
    {
      provide: 'MAIL_TRANSPORTER',
      useFactory: async (configService: ConfigService) => {
        return nodemailer.createTransport({
          host: configService.get<string>('MAIL_HOST'),
          port: configService.get<number>('MAIL_PORT'),
          secure: false, // true for 465, false for other ports
          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASS'),
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [MailService],
})
export class MailModule {}
