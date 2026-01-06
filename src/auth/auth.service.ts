import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async register(registerDto: RegisterDto): Promise<User> {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    // Don't return password
    user.password = undefined;
    return user;
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      return;
    }

    const token =
      Math.random().toString(36).substring(2) + Date.now().toString(36);
    // Set token expiration to 1 hour (use proper date handling in production)
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await this.usersService.update(user.id, {
      resetToken: token,
      resetTokenExp: expires,
    });

    await this.mailService.sendResetPasswordEmail(email, token);
    return token;
  }

  async resetPassword(token: string, newPass: string) {
    // This is a simplified check. In production, use a more robust way to find user by token.
    // Ideally user service should have findByResetToken, but we can do a query here if we inject repo,
    // or just scan (inefficient). For now, let's assume we implement findByResetToken in UsersService.
    const user = await this.usersService.findByResetToken(token);

    if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }

    const hashedPassword = await bcrypt.hash(newPass, 10);
    await this.usersService.update(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExp: null,
    });
  }

  async changePassword(userId: string, oldPass: string, newPass: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.password) {
      throw new BadRequestException('User does not have a password set');
    }
    const isMatch = await bcrypt.compare(oldPass, user.password);
    if (!isMatch) {
      throw new BadRequestException('Incorrect old password');
    }

    const hashedPassword = await bcrypt.hash(newPass, 10);
    await this.usersService.update(userId, {
      password: hashedPassword,
    });

    return { message: 'Password changed successfully' };
  }
}
