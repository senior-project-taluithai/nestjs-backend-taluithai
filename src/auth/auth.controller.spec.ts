import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    validateUser: jest.fn(),
    login: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should call authService.register', async () => {
      const dto = { email: 'test@example.com', password: 'password' };
      mockAuthService.register.mockResolvedValue({ id: '1', ...dto });
      
      const result = await controller.register(dto);
      expect(service.register).toHaveBeenCalledWith(dto);
      expect(result.id).toBe('1');
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);
      const res = { cookie: jest.fn() } as unknown as Response;
      
      await expect(controller.login({ email: 'test@example.com', password: 'password' }, res))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should set cookie and return success message for valid credentials', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockAuthService.validateUser.mockResolvedValue(user);
      mockAuthService.login.mockResolvedValue({ access_token: 'token' });
      const res = { cookie: jest.fn() } as unknown as Response;

      const result = await controller.login({ email: 'test@example.com', password: 'password' }, res);
      
      expect(res.cookie).toHaveBeenCalledWith('Authentication', 'token', expect.any(Object));
      expect(result).toEqual({ message: 'Login successful', user });
    });
  });

  describe('logout', () => {
    it('should clear authentication cookie', async () => {
      const res = { clearCookie: jest.fn() } as unknown as Response;
      const result = await controller.logout(res);
      
      expect(res.clearCookie).toHaveBeenCalledWith('Authentication');
      expect(result).toEqual({ message: 'Logout successful' });
    });
  });

  describe('getProfile', () => {
    it('should return user from request', () => {
      const req = { user: { id: '1', email: 'test@example.com' } };
      const result = controller.getProfile(req);
      expect(result).toEqual(req.user);
    });
  });

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword and return message', async () => {
      mockAuthService.forgotPassword.mockResolvedValue('token');
      const result = await controller.forgotPassword({ email: 'test@example.com' });
      
      expect(service.forgotPassword).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual({ message: 'If user exists, email sent' });
    });
  });

  describe('resetPassword', () => {
    it('should call authService.resetPassword and return message', async () => {
      const result = await controller.resetPassword({ token: 'token', newPassword: 'newPassword' });
      
      expect(service.resetPassword).toHaveBeenCalledWith('token', 'newPassword');
      expect(result).toEqual({ message: 'Password has been reset' });
    });
  });

  describe('changePassword', () => {
    it('should call authService.changePassword', async () => {
      const req = { user: { id: '1' } };
      const dto = { oldPassword: 'old', newPassword: 'new' };
      mockAuthService.changePassword.mockResolvedValue({ message: 'success' });
      
      const result = await controller.changePassword(req, dto);
      expect(service.changePassword).toHaveBeenCalledWith('1', 'old', 'new');
      expect(result).toEqual({ message: 'success' });
    });
  });
});
