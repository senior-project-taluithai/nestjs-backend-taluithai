import { Controller, Post, Body, Res, UseGuards, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const { access_token } = await this.authService.login(user);
    
    response.cookie('Authentication', access_token, {
      httpOnly: true,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
    });

    return { message: 'Login successful', user };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('Authentication');
    return { message: 'Logout successful' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getProfile(@Req() req) {
    return req.user;
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: any) { // Using any for body to avoid import issues temporarily, ideally use correct DTO
    // We need to inject MailService to send the email.
    // For now, let's just call auth service and later we will integrate MailService properly
    // in the auth service or here. Ideally AuthService handles logic.
    const token = await this.authService.forgotPassword(body.email);
    if (token) {
        // Send email here via MailService (need to inject it)
        // For strict separation, AuthService should call MailService. 
        // Let's refactor AuthService to call MailService.
    }
    return { message: 'If user exists, email sent' };
  }

  @Post('reset-password')
  async resetPassword(@Body() body: any) { // Ideally use ResetPasswordDto
    await this.authService.resetPassword(body.token, body.newPassword);
    return { message: 'Password has been reset' };
  }
}
