import { Injectable, ConsoleLogger } from '@nestjs/common';
// import * as nodemailer from 'nodemailer'; // Commencted out for simplicity, using logger stub

@Injectable()
export class MailService {
  private readonly logger = new ConsoleLogger(MailService.name);

  async sendResetPasswordEmail(email: string, token: string) {
    // In a real app, use nodemailer here.
    // For now, we just log the token so we can use it manually.
    const resetLink = `http://localhost:3000/reset-password?token=${token}`;
    this.logger.log(`====================================================`);
    this.logger.log(`Sending Reset Password Email to ${email}`);
    this.logger.log(`Reset Token: ${token}`);
    this.logger.log(`Reset Link: ${resetLink}`);
    this.logger.log(`====================================================`);
  }
}
