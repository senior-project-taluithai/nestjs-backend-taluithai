import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let mailService: MailService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findByResetToken: jest.fn(),
    findOne: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockMailService = {
    sendResetPasswordEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    mailService = module.get<MailService>(MailService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should throw BadRequestException if email is already in use', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
      });
      await expect(
        service.register({ email: 'test@example.com', password: 'password' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a new user if email is not in use', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockUsersService.create.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        password: 'hashedPassword',
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'password',
      });

      expect(result.email).toEqual('test@example.com');
      expect(result.password).toBeUndefined();
      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          password: 'hashedPassword',
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('should return user without password if credentials are valid', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        password: 'hashedPassword',
      };
      mockUsersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');
      expect(result).toEqual({ id: '1', email: 'test@example.com' });
    });

    it('should return null if credentials are invalid', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const result = await service.validateUser('test@example.com', 'password');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return an access token', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockJwtService.sign.mockReturnValue('token');

      const result = await service.login(user);
      expect(result).toEqual({ access_token: 'token' });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: user.email,
        sub: user.id,
      });
    });
  });

  describe('forgotPassword', () => {
    it('should generate a token and call mailService if user exists', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockUsersService.findByEmail.mockResolvedValue(user);

      const result = await service.forgotPassword('test@example.com');
      expect(result).toBeDefined();
      expect(mockUsersService.update).toHaveBeenCalled();
      expect(mockMailService.sendResetPasswordEmail).toHaveBeenCalledWith(
        'test@example.com',
        result,
      );
    });

    it('should return undefined if user does not exist', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const result = await service.forgotPassword('test@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException for invalid or expired token', async () => {
      mockUsersService.findByResetToken.mockResolvedValue(null);
      await expect(service.resetPassword('token', 'newPass')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update password for valid token', async () => {
      const expiration = new Date();
      expiration.setHours(expiration.getHours() + 1);
      const user = { id: '1', resetTokenExp: expiration };
      mockUsersService.findByResetToken.mockResolvedValue(user);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      await service.resetPassword('token', 'newPass');
      expect(mockUsersService.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          password: 'newHashedPassword',
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('should change password if old password is correct', async () => {
      const user = { id: '1', password: 'oldHashedPassword' };
      mockUsersService.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      const result = await service.changePassword('1', 'oldPass', 'newPass');
      expect(result.message).toBe('Password changed successfully');
      expect(mockUsersService.update).toHaveBeenCalledWith('1', {
        password: 'newHashedPassword',
      });
    });

    it('should throw BadRequestException if old password is incorrect', async () => {
      const user = { id: '1', password: 'oldHashedPassword' };
      mockUsersService.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('1', 'oldPass', 'newPass'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
