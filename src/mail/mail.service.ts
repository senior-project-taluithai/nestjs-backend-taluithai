import { Injectable, Inject, ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);

  constructor(
    @Inject('MAIL_TRANSPORTER') private transporter: nodemailer.Transporter,
    private configService: ConfigService,
  ) {}

  async sendResetPasswordEmail(email: string, token: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    // Log for debugging
    this.logger.log(`Sending Reset Password Email to ${email}`);
    this.logger.log(`Reset Token: ${token}`);
    this.logger.log(`Reset Link: ${resetLink}`);

    await this.transporter.sendMail({
      from:
        this.configService.get<string>('MAIL_FROM') ||
        '"No Reply" <noreply@example.com>',
      to: email,
      subject: 'Password Reset Request',
      html: `
        <p>You requested a password reset</p>
        <p>Click details below to reset your password</p>
        <p>
            <a href="${resetLink}">Reset Password</a>
        </p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    });
  }
}
